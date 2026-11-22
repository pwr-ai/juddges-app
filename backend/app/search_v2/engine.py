"""Hybrid chunk search over the Weaviate v2 corpus, aggregated to judgments.

The recipe follows the JuDDGES embedding evaluation (``juddges/data/weaviate_v2/
search.py``): hybrid on ``JudgmentChunks`` (``alpha`` 0.25, relative-score
fusion, 100 chunks), then each judgment is scored by its best chunk (MaxP).

The corpus is embedded with ``sdadas/mmlw-retrieval-e5-large``, not the app's
bge-m3, so queries go to the v2 stack's own TEI server and never through
``app.embedding_providers``. The model expects queries as ``"query: " + text``;
the BM25 side of the hybrid query receives the raw text.

Both clients here are synchronous; the router runs :meth:`WeaviateV2Engine.search`
and :meth:`WeaviateV2Engine.get_judgment` in a worker thread.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING, Any, Protocol

import httpx
import weaviate
from loguru import logger
from weaviate.classes.init import AdditionalConfig, Auth, Timeout
from weaviate.classes.query import Filter, HybridFusion, MetadataQuery
from weaviate.util import generate_uuid5

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Sequence

    from app.search_v2.config import WeaviateV2Settings

QUERY_PREFIX = "query: "
CHUNKS_COLLECTION = "JudgmentChunks"
JUDGMENTS_COLLECTION = "Judgments"
CHUNK_LIMIT = 100
TARGET_VECTOR = "default"
TEI_RETRY_STATUSES = frozenset({429, 503})
TEI_RETRY_DELAYS_S = (0.1, 0.2, 0.4, 0.8)
# Never the full text: a judgment can be hundreds of kilobytes.
JUDGMENT_PROPERTIES = [
    "judgment_id",
    "document_number",
    "court_name",
    "date_issued",
    "thesis",
    "source",
    "source_id",
]
# The detail view, full text included. Only names present in the deployed
# schema: an unknown property fails the whole gRPC call.
DETAIL_PROPERTIES = [
    *JUDGMENT_PROPERTIES,
    "court_type",
    "department_name",
    "judgment_type",
    "full_text",
    "keywords",
    "judges",
    "presiding_judge",
    "legal_bases",
    "references",
    "source_url",
    "language",
]


@dataclass(frozen=True)
class ChunkFilters:
    """Filters served by the denormalized fields on ``JudgmentChunks``.

    ``source`` is not among them (it lives on ``Judgments`` only), so it is not
    offered: filtering it would need a join per chunk.
    """

    court_type: list[str] = field(default_factory=list)
    date_from: date | None = None
    date_to: date | None = None

    def __bool__(self) -> bool:
        return bool(self.court_type or self.date_from or self.date_to)


def _utc_midnight(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


def build_chunk_filter(filters: ChunkFilters | None) -> Any:
    """Weaviate filter for ``filters``, or ``None`` when nothing is set.

    Both ingest paths store ``date_issued`` as UTC midnight of the (Polish)
    calendar day, so whole-day bounds are ``[from 00:00Z, to + 1 day 00:00Z)``.
    """
    if not filters:
        return None
    parts = []
    if filters.court_type:
        parts.append(Filter.by_property("court_type").contains_any(filters.court_type))
    if filters.date_from:
        parts.append(
            Filter.by_property("date_issued").greater_or_equal(
                _utc_midnight(filters.date_from)
            )
        )
    if filters.date_to:
        parts.append(
            Filter.by_property("date_issued").less_than(
                _utc_midnight(filters.date_to + timedelta(days=1))
            )
        )
    return parts[0] if len(parts) == 1 else Filter.all_of(parts)


@dataclass(frozen=True)
class ChunkHit:
    judgment_id: str
    chunk_idx: int
    chunk_text: str
    score: float


@dataclass(frozen=True)
class JudgmentHit:
    judgment_id: str
    score: float
    best_chunk: ChunkHit


def maxp(chunks: Iterable[ChunkHit], k: int) -> list[JudgmentHit]:
    """Judgments ranked by their best chunk; ties keep the chunk order of the input."""
    best: dict[str, ChunkHit] = {}
    for hit in chunks:
        current = best.get(hit.judgment_id)
        if current is None or hit.score > current.score:
            best[hit.judgment_id] = hit
    ranked = sorted(best.values(), key=lambda h: h.score, reverse=True)
    return [JudgmentHit(h.judgment_id, h.score, h) for h in ranked[:k]]


class QueryEmbedder(Protocol):
    def embed_query(self, text: str) -> list[float]: ...


class TeiQueryEmbedder:
    """Query vectors from a TEI ``/embed`` endpoint, with the e5 query prefix."""

    def __init__(
        self,
        url: str,
        timeout_s: float = 10.0,
        client: httpx.Client | None = None,
        retry_delays_s: Sequence[float] = TEI_RETRY_DELAYS_S,
    ):
        self._client = client or httpx.Client(base_url=url, timeout=timeout_s)
        self._retry_delays_s = tuple(retry_delays_s)

    def embed_query(self, text: str) -> list[float]:
        payload = {"inputs": [QUERY_PREFIX + text], "truncate": True}
        for delay in (*self._retry_delays_s, None):
            response = self._client.post("/embed", json=payload)
            # TEI sheds load with 429 while a bulk ingest saturates its queue;
            # one query is cheap to retry.
            if response.status_code not in TEI_RETRY_STATUSES or delay is None:
                break
            time.sleep(delay)
        response.raise_for_status()
        return response.json()[0]

    def close(self) -> None:
        self._client.close()


def connect(settings: WeaviateV2Settings) -> weaviate.WeaviateClient:
    return weaviate.connect_to_custom(
        http_host=settings.http_host,
        http_port=settings.http_port,
        http_secure=False,
        grpc_host=settings.http_host,
        grpc_port=settings.grpc_port,
        grpc_secure=False,
        auth_credentials=Auth.api_key(settings.api_key) if settings.api_key else None,
        additional_config=AdditionalConfig(
            timeout=Timeout(
                init=settings.init_timeout_s,
                query=settings.query_timeout_s,
                insert=settings.query_timeout_s,
            )
        ),
    )


class WeaviateV2Engine:
    """Lazily connected, reused Weaviate client plus the TEI embedder."""

    def __init__(
        self,
        settings: WeaviateV2Settings,
        *,
        embedder: QueryEmbedder | None = None,
        client_factory: Callable[[WeaviateV2Settings], Any] = connect,
    ):
        self.settings = settings
        self._embedder = embedder or TeiQueryEmbedder(
            settings.tei_url, timeout_s=settings.tei_timeout_s
        )
        self._client_factory = client_factory
        self._client: Any = None
        self._lock = threading.Lock()

    def _get_client(self) -> Any:
        if self._client is None:
            with self._lock:
                if self._client is None:
                    self._client = self._client_factory(self.settings)
                    logger.info(
                        "Weaviate v2 client connected to {}:{}",
                        self.settings.http_host,
                        self.settings.http_port,
                    )
        return self._client

    def reset(self) -> None:
        """Drop the client so the next request reconnects (after a failure)."""
        with self._lock:
            client, self._client = self._client, None
        if client is not None:
            try:
                client.close()
            except Exception as exc:  # closing a broken client must not mask the error
                logger.debug("Closing Weaviate v2 client failed: {}", exc)

    def _search_chunks(
        self,
        client: Any,
        query: str,
        vector: Sequence[float],
        alpha: float,
        filters: ChunkFilters | None = None,
    ) -> list[ChunkHit]:
        response = client.collections.use(CHUNKS_COLLECTION).query.hybrid(
            query=query,
            vector=list(vector),
            alpha=alpha,
            query_properties=["chunk_text"],
            target_vector=TARGET_VECTOR,
            fusion_type=HybridFusion.RELATIVE_SCORE,
            limit=CHUNK_LIMIT,
            filters=build_chunk_filter(filters),
            return_properties=["judgment_id", "chunk_idx", "chunk_text"],
            return_metadata=MetadataQuery(score=True),
        )
        return [
            ChunkHit(
                judgment_id=o.properties["judgment_id"],
                chunk_idx=int(o.properties["chunk_idx"]),
                chunk_text=o.properties["chunk_text"],
                score=float(o.metadata.score or 0.0),
            )
            for o in response.objects
        ]

    def _fetch_judgments(
        self, client: Any, judgment_ids: Sequence[str]
    ) -> dict[str, dict[str, Any]]:
        if not judgment_ids:
            return {}
        response = client.collections.use(JUDGMENTS_COLLECTION).query.fetch_objects(
            filters=Filter.by_id().contains_any(
                [generate_uuid5(jid) for jid in judgment_ids]
            ),
            limit=len(judgment_ids),
            return_properties=JUDGMENT_PROPERTIES,
        )
        return {
            o.properties["judgment_id"]: dict(o.properties) for o in response.objects
        }

    def search(
        self,
        query: str,
        limit: int,
        alpha: float,
        *,
        filters: ChunkFilters | None = None,
    ) -> list[tuple[JudgmentHit, dict[str, Any]]]:
        """Top ``limit`` judgments with their Weaviate metadata (empty dict if missing)."""
        vector = self._embedder.embed_query(query)
        client = self._get_client()
        hits = maxp(self._search_chunks(client, query, vector, alpha, filters), limit)
        meta = self._fetch_judgments(client, [h.judgment_id for h in hits])
        return [(hit, meta.get(hit.judgment_id, {})) for hit in hits]

    def get_judgment(self, judgment_id: str) -> dict[str, Any] | None:
        """One judgment with its full text, or ``None`` when it is not in the corpus."""
        obj = (
            self._get_client()
            .collections.use(JUDGMENTS_COLLECTION)
            .query.fetch_object_by_id(
                generate_uuid5(judgment_id), return_properties=DETAIL_PROPERTIES
            )
        )
        return None if obj is None else dict(obj.properties)

    def close(self) -> None:
        self.reset()
        close = getattr(self._embedder, "close", None)
        if close is not None:
            close()
