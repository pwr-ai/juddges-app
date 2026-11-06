"""Search service integrations (Meilisearch-backed autocomplete)."""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal
from urllib.parse import urlparse, urlunparse

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

import httpx
from juddges_search.embeddings import embed_texts
from loguru import logger
from pydantic import BaseModel, Field

from app.services.meilisearch_embeddings import EMBEDDER_NAME

# Sentinel key injected into the raw Meilisearch response dict when a hybrid
# search degrades to keyword-only.  Consumers (e.g. ``documents_search``) read
# and strip this key so it never leaks into the HTTP response body.
_FALLBACK_SENTINEL = "_hybrid_fallback"

SearchMode = Literal["hybrid", "keyword", "keyword_fallback"]

# ── Hybrid fusion (issue #798) ───────────────────────────────────────────────
#
# Meilisearch's own ``hybrid.semanticRatio`` merges the keyword and vector
# lists by comparing their weighted *ranking scores*. Keyword ranking scores
# sit near 1.0 for every hit that matches all query words, while BGE-M3 cosine
# scores sit in a narrow band of their own; weighting two near-constant lists
# gives a step function: below the crossover ratio every keyword hit outscores
# every semantic hit and vice versa, so the top-k flipped from pure keyword to
# pure semantic around 0.5 with no blend in between. ``documents_search``
# therefore fetches both lists separately and fuses them by *rank* (weighted
# RRF), which is scale-free and moves smoothly with the ratio.

#: RRF damping constant (Cormack et al., 2009). Larger = flatter rank curve.
RRF_K = 60
#: Each leg fetches this many hits from offset 0, for *every* page of a query.
#: The depth must not depend on ``offset``: fusing a deeper slice on a later
#: page lets a document found by both legs deep down (e.g. keyword #35 +
#: semantic #20) collect two RRF contributions and jump ahead of hits already
#: served, so consecutive pages would repeat some documents and skip others.
#: A fixed depth gives one fused list per query that every page slices; the
#: hybrid result set is therefore capped at the union of the two top-N lists.
HYBRID_CANDIDATE_DEPTH = 200


def _normalize_case_number(value: Any) -> str:
    return " ".join(str(value).split()).casefold() if value else ""


def reciprocal_rank_fusion(
    keyword_hits: list[dict[str, Any]],
    semantic_hits: list[dict[str, Any]],
    semantic_ratio: float,
    *,
    k: int = RRF_K,
    query: str | None = None,
) -> list[dict[str, Any]]:
    """Fuse keyword and semantic hit lists with ratio-weighted Reciprocal Rank Fusion.

    ``score(d) = 1 / (k + rank_kw(d) / (1 - r)) + 1 / (k + rank_sem(d) / r)``
    with 1-based ranks; a document missing from a list (or a list whose weight
    is 0) contributes 0 for it.

    The weight scales the *rank*, not the score. Multiplying the score instead
    (``w / (k + rank)``) is not a blend at ``k = 60``: the 1/(k+rank) curve is
    so flat that for two disjoint lists the weight alone decides, and at
    r = 0.6 all of the semantic top-30 outranks keyword #1 — the same flip
    #798 reported. With scaled ranks, semantic #j beats keyword #i exactly when
    ``j / r < i / (1 - r)``, so single-list hits interleave in proportion to
    the ratio (~3 semantic per keyword at 0.75), and a document found by both
    legs still gets both contributions. The semantic term only grows and the
    keyword term only shrinks as ``r`` rises, so the blend is monotone.

    When ``query`` exactly equals a keyword hit's ``case_number`` (whitespace-
    and case-insensitive), that hit is pinned to rank 1: an exact case-number
    lookup must never be outranked by a vague semantic neighbour.

    Ties break on best rank on either side, then keyword rank, so the output
    is deterministic. When a document is in both lists the keyword copy is
    returned (its ``_formatted`` highlights match the query terms).
    """
    ratio = min(max(semantic_ratio, 0.0), 1.0)
    docs: dict[str, dict[str, Any]] = {}
    scores: dict[str, float] = {}
    kw_rank: dict[str, int] = {}
    sem_rank: dict[str, int] = {}

    for weight, hits, ranks in (
        (1.0 - ratio, keyword_hits, kw_rank),
        (ratio, semantic_hits, sem_rank),
    ):
        for position, hit in enumerate(hits, start=1):
            if hit.get("id") is None:
                continue
            key = str(hit["id"])
            if key in ranks:
                continue
            ranks[key] = position
            docs.setdefault(key, hit)
            contribution = 1.0 / (k + position / weight) if weight > 0 else 0.0
            scores[key] = scores.get(key, 0.0) + contribution

    missing_kw = len(keyword_hits) + 1
    missing_sem = len(semantic_hits) + 1

    pinned: set[str] = set()
    target = _normalize_case_number(query)
    if target:
        pinned = {
            str(hit.get("id"))
            for hit in keyword_hits
            if _normalize_case_number(hit.get("case_number")) == target
        }

    ordered = sorted(
        docs,
        key=lambda key: (
            key not in pinned,
            -scores[key],
            min(kw_rank.get(key, missing_kw), sem_rank.get(key, missing_sem)),
            kw_rank.get(key, missing_kw),
        ),
    )
    return [docs[key] for key in ordered]


class SearchServiceError(RuntimeError):
    """Raised when autocomplete backend calls fail."""


# ── Topic hit schema ─────────────────────────────────────────────────────────


class TopicHit(BaseModel):
    """A single hit from the Meilisearch ``topics`` index.

    The ``formatted`` field (alias ``_formatted``) carries highlighted versions
    of the searchable fields when ``attributesToHighlight`` is set in the query.
    Pydantic's ``populate_by_name=True`` model config lets callers pass the field
    as either ``formatted`` or ``_formatted``.
    """

    model_config = {"populate_by_name": True}

    id: str
    label_pl: str
    label_en: str
    aliases_pl: list[str] = Field(default_factory=list)
    aliases_en: list[str] = Field(default_factory=list)
    category: str | None = None
    doc_count: int = 0
    jurisdictions: list[str] = Field(default_factory=list)
    formatted: dict[str, Any] | None = Field(default=None, alias="_formatted")


# ── Topics-index fields used for highlighting ────────────────────────────────

_TOPICS_HIGHLIGHT_ATTRS: list[str] = [
    "label_pl",
    "label_en",
    "aliases_pl",
    "aliases_en",
]


# ── Suggestion hit schema (corpus-derived autocomplete — issue #153) ──────────


class SuggestionHit(BaseModel):
    """A single hit from the Meilisearch ``suggestions`` index.

    Phrase-level suggestion mined from the PL + EN judgment corpus.  The
    ``formatted`` field (alias ``_formatted``) carries the highlighted ``term``
    when ``attributesToHighlight`` is set on the query.
    """

    model_config = {"populate_by_name": True}

    id: str
    term: str
    language: str
    category: str
    weight: int = 0
    formatted: dict[str, Any] | None = Field(default=None, alias="_formatted")


class MeiliSearchService:
    """Meilisearch HTTP client for autocomplete queries and index administration.

    A single instance is scoped to one Meilisearch index (``index_name``).
    The autocomplete method queries the topics index only — judgment-document
    suggestions were retired in favour of topic chips that route the user to a
    full search.  ``self`` (scoped to the judgments index) is still used by
    ``documents_search`` for the results page.  The topics-side service is
    constructed lazily on first access via the ``_topics_service`` cached
    property so it is built once per process lifetime rather than once per
    keystroke.
    """

    def __init__(
        self,
        *,
        base_url: str | None,
        api_key: str | None,
        admin_key: str | None = None,
        index_name: str,
        timeout_seconds: float = 5.0,
    ) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key or ""
        self.admin_key = admin_key or ""
        self.index_name = index_name
        self.timeout_seconds = timeout_seconds
        # Lazily initialised on first access; ``None`` until then.
        self._topics_service_instance: MeiliSearchService | None = None
        self._suggestions_service_instance: MeiliSearchService | None = None
        # Shared, process-lifetime httpx client. Lazily created on first request
        # (inside the running event loop) so a connection pool is reused across
        # calls instead of paying a fresh TLS handshake per Meili request (#180).
        self._http: httpx.AsyncClient | None = None

    def _client(self) -> httpx.AsyncClient:
        """Return the shared httpx client, creating it on first use."""
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(timeout=self.timeout_seconds)
        return self._http

    @asynccontextmanager
    async def _client_ctx(self) -> AsyncIterator[httpx.AsyncClient]:
        """Yield the shared client without closing it.

        Drop-in replacement for ``async with httpx.AsyncClient(...) as client``
        that keeps the connection pool alive for the service's lifetime. The
        pool is torn down once via :meth:`aclose` on app shutdown.
        """
        yield self._client()

    async def aclose(self) -> None:
        """Close the shared client and any lazily-created sub-service clients.

        Wired into the FastAPI lifespan shutdown. Idempotent.
        """
        if self._http is not None and not self._http.is_closed:
            await self._http.aclose()
        self._http = None
        for sub in (
            self._topics_service_instance,
            self._suggestions_service_instance,
        ):
            if sub is not None:
                await sub.aclose()

    @property
    def configured(self) -> bool:
        """True when the service has enough config for search queries."""
        return bool(self.base_url and self.api_key and self.index_name)

    @property
    def admin_configured(self) -> bool:
        """True when the service has enough config for admin operations."""
        return bool(self.base_url and self.admin_key and self.index_name)

    @property
    def _topics_service(self) -> MeiliSearchService:
        """Lazily constructed topics-index service (cached for process lifetime).

        Using a cached property rather than calling ``topics_from_env()`` inside
        ``autocomplete()`` avoids the overhead of environment-variable reads and
        object construction on every keystroke.
        """
        if self._topics_service_instance is None:
            self._topics_service_instance = MeiliSearchService.topics_from_env()
        return self._topics_service_instance

    @property
    def _suggestions_service(self) -> MeiliSearchService:
        """Lazily constructed suggestions-index service (cached for lifetime)."""
        if self._suggestions_service_instance is None:
            self._suggestions_service_instance = (
                MeiliSearchService.suggestions_from_env()
            )
        return self._suggestions_service_instance

    @classmethod
    def from_env(cls) -> MeiliSearchService:
        base_url = os.getenv("MEILISEARCH_INTERNAL_URL") or os.getenv("MEILISEARCH_URL")
        base_url = _normalize_meilisearch_url_for_runtime(base_url)
        return cls(
            base_url=base_url,
            api_key=(
                os.getenv("MEILISEARCH_SEARCH_KEY")
                or os.getenv("MEILISEARCH_API_KEY")
                or os.getenv("MEILISEARCH_ADMIN_KEY")
                or os.getenv("MEILI_MASTER_KEY")
            ),
            admin_key=os.getenv("MEILISEARCH_ADMIN_KEY")
            or os.getenv("MEILI_MASTER_KEY"),
            index_name=os.getenv("MEILISEARCH_INDEX_NAME", "judgments"),
            timeout_seconds=float(os.getenv("MEILISEARCH_TIMEOUT_SECONDS", "5")),
        )

    @classmethod
    def topics_from_env(cls) -> MeiliSearchService:
        """Construct a MeiliSearchService scoped to the topics index.

        Reads the same connection env vars as ``from_env()``; only the index
        name comes from ``MEILISEARCH_TOPICS_INDEX_NAME`` (default ``"topics"``).
        """
        base_url = os.getenv("MEILISEARCH_INTERNAL_URL") or os.getenv("MEILISEARCH_URL")
        base_url = _normalize_meilisearch_url_for_runtime(base_url)
        return cls(
            base_url=base_url,
            api_key=(
                os.getenv("MEILISEARCH_SEARCH_KEY")
                or os.getenv("MEILISEARCH_API_KEY")
                or os.getenv("MEILISEARCH_ADMIN_KEY")
                or os.getenv("MEILI_MASTER_KEY")
            ),
            admin_key=os.getenv("MEILISEARCH_ADMIN_KEY")
            or os.getenv("MEILI_MASTER_KEY"),
            index_name=os.getenv("MEILISEARCH_TOPICS_INDEX_NAME", "topics"),
            timeout_seconds=float(os.getenv("MEILISEARCH_TIMEOUT_SECONDS", "5")),
        )

    @classmethod
    def suggestions_from_env(cls) -> MeiliSearchService:
        """Construct a MeiliSearchService scoped to the ``suggestions`` index.

        Reads the same connection env vars as ``from_env()``; only the index
        name comes from ``MEILISEARCH_SUGGESTIONS_INDEX_NAME`` (default
        ``"suggestions"``).
        """
        base_url = os.getenv("MEILISEARCH_INTERNAL_URL") or os.getenv("MEILISEARCH_URL")
        base_url = _normalize_meilisearch_url_for_runtime(base_url)
        return cls(
            base_url=base_url,
            api_key=(
                os.getenv("MEILISEARCH_SEARCH_KEY")
                or os.getenv("MEILISEARCH_API_KEY")
                or os.getenv("MEILISEARCH_ADMIN_KEY")
                or os.getenv("MEILI_MASTER_KEY")
            ),
            admin_key=os.getenv("MEILISEARCH_ADMIN_KEY")
            or os.getenv("MEILI_MASTER_KEY"),
            index_name=os.getenv("MEILISEARCH_SUGGESTIONS_INDEX_NAME", "suggestions"),
            timeout_seconds=float(os.getenv("MEILISEARCH_TIMEOUT_SECONDS", "5")),
        )

    # ── helpers ──────────────────────────────────────────────────────────

    def _search_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _admin_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.admin_key}",
            "Content-Type": "application/json",
        }

    # ── search ───────────────────────────────────────────────────────────

    async def _search_post(
        self, payload: dict[str, Any], *, keyword_retry: bool = True
    ) -> dict[str, Any]:
        """POST a payload to Meilisearch's /search, degrading hybrid to keyword on 4xx.

        Meilisearch rejects a hybrid request with HTTP 400 when the index has no
        ``bge-m3`` embedder registered (e.g. the prod index whose ``userProvided``
        embedder settings task never succeeded because the legacy docs lacked an
        opt-out). Rather than surfacing that as a 502 to the UI, strip ``hybrid``
        + ``vector`` and retry once as keyword-only — the user still gets results.

        ``keyword_retry=False`` skips that retry and returns an empty, flagged
        result instead — for callers that already run the keyword leg in
        parallel (the fused hybrid path in ``documents_search``).

        5xx and network failures are not retried; they indicate a Meili outage
        the keyword path can't paper over.
        """
        url = f"{self.base_url}/indexes/{self.index_name}/search"
        try:
            async with self._client_ctx() as client:
                response = await client.post(
                    url, json=payload, headers=self._search_headers()
                )
                if 400 <= response.status_code < 500 and (
                    "hybrid" in payload or "vector" in payload
                ):
                    meili_error = response.text[:300]
                    logger.warning(
                        "hybrid_search_degraded index={} status={} reason={!r} — "
                        "retrying as keyword-only; semantic ranking is unavailable",
                        self.index_name,
                        response.status_code,
                        meili_error,
                    )
                    try:
                        import sentry_sdk

                        sentry_sdk.add_breadcrumb(
                            category="search",
                            message="Hybrid search degraded to keyword-only",
                            data={
                                "index": self.index_name,
                                "status_code": response.status_code,
                                "meili_error": meili_error,
                            },
                            level="warning",
                        )
                    except Exception:
                        pass  # sentry_sdk absent or not initialised — structured log is enough
                    if not keyword_retry:
                        return {"hits": [], _FALLBACK_SENTINEL: True}
                    keyword_payload = {
                        k: v
                        for k, v in payload.items()
                        if k not in ("hybrid", "vector")
                    }
                    response = await client.post(
                        url, json=keyword_payload, headers=self._search_headers()
                    )
                    response.raise_for_status()
                    data = response.json()
                    data[_FALLBACK_SENTINEL] = True
                else:
                    response.raise_for_status()
                    data = response.json()
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

        if not isinstance(data, dict):
            raise SearchServiceError("Unexpected Meilisearch response format")

        return data

    async def autocomplete(
        self,
        query: str,
        limit: int = 10,
        filters: str | None = None,
    ) -> dict[str, Any]:
        """Return autocomplete topic hits from the Meilisearch ``topics`` index.

        The judgments index is *not* queried — autocomplete surfaces topic
        chips only.  Clicking a topic navigates the user to a full search,
        which is where judgment documents are returned.

        Args:
            query: The search string as typed by the user.
            limit: Maximum topic hits to return (default 10).
            filters: Optional Meilisearch filter expression. If the topics
                     index rejects the filter (e.g. it references a field
                     that does not exist on topics), the query is retried
                     without the filter rather than failing.

        Returns a dict shaped like ``{"topic_hits": [...], "query": str,
        "processingTimeMs": int | None, "estimatedTotalHits": int | None}``.
        """
        if not self.configured:
            raise SearchServiceError("Meilisearch is not configured")

        # Mirror the previous frontend behaviour: skip the network call for
        # very short queries that would otherwise match too broadly.
        if len(query) < 2:
            return {
                "topic_hits": [],
                "query": query,
                "processingTimeMs": None,
                "estimatedTotalHits": 0,
            }

        try:
            topics_result = await self._query_topics(
                query, limit=limit, filters=filters
            )
        except SearchServiceError as exc:
            logger.warning(
                "topics_index_unavailable — returning empty topic_hits: {}", str(exc)
            )
            return {
                "topic_hits": [],
                "query": query,
                "processingTimeMs": None,
                "estimatedTotalHits": 0,
            }

        return {
            "topic_hits": topics_result.get("hits", []),
            "query": topics_result.get("query", query),
            "processingTimeMs": topics_result.get("processingTimeMs"),
            "estimatedTotalHits": topics_result.get("estimatedTotalHits"),
        }

    async def _query_topics(
        self,
        query: str,
        *,
        limit: int = 10,
        filters: str | None = None,
    ) -> dict[str, Any]:
        """Execute a topics-index search and return raw Meilisearch data.

        Uses ``matchingStrategy="all"`` for tighter matches on the short topic
        labels (prevents very broad results on single-word queries).

        If the topics service is not configured, returns an empty hits payload
        rather than raising, to keep degradation silent.

        Filter handling: the caller passes the same filter string used for
        judgments.  If Meilisearch rejects it (HTTP 400 — likely because the
        filter field does not exist on the topics index), the query is retried
        without the filter and a debug message is emitted.
        """
        svc = self._topics_service
        if not svc.configured:
            logger.debug("Topics Meilisearch service not configured — skipping")
            return {"hits": []}

        topics_payload: dict[str, Any] = {
            "q": query,
            "limit": limit,
            "attributesToHighlight": _TOPICS_HIGHLIGHT_ATTRS,
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
            "matchingStrategy": "all",
        }
        if filters:
            topics_payload["filter"] = filters

        url = f"{svc.base_url}/indexes/{svc.index_name}/search"

        try:
            async with svc._client_ctx() as client:
                response = await client.post(
                    url, json=topics_payload, headers=svc._search_headers()
                )
                if response.status_code == 400 and filters:
                    # The filter references a field the topics index does not have;
                    # retry without filter rather than surfacing an error.
                    logger.debug(
                        "topics_filter_unsupported — filter '{}' rejected by Meilisearch ({}); retrying without filter",
                        filters,
                        response.text[:200],
                    )
                    topics_payload_no_filter = {
                        k: v for k, v in topics_payload.items() if k != "filter"
                    }
                    response = await client.post(
                        url,
                        json=topics_payload_no_filter,
                        headers=svc._search_headers(),
                    )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

    # ── suggestions (corpus-derived autocomplete — issue #153) ────────────

    async def suggest(
        self,
        query: str,
        *,
        limit: int = 8,
        language: str | None = None,
        category: str | None = None,
    ) -> dict[str, Any]:
        """Return phrase-level corpus suggestions from the ``suggestions`` index.

        Unlike :meth:`autocomplete` (topic chips) and :meth:`documents_search`
        (full judgments), this returns short ranked phrases mined from the
        corpus. Degrades silently to an empty hit list when the suggestions
        index is unavailable so the caller can fall back to today's behaviour.

        Args:
            query: The search string as typed by the user.
            limit: Maximum suggestions to return.
            language: Optional ``"pl"`` / ``"en"`` filter (active jurisdiction).
            category: Optional category filter (e.g. ``"legal_topic"``).

        Returns a dict shaped like ``{"suggestion_hits": [...], "query": str,
        "processingTimeMs": int | None, "estimatedTotalHits": int | None}``.
        """
        empty: dict[str, Any] = {
            "suggestion_hits": [],
            "query": query,
            "processingTimeMs": None,
            "estimatedTotalHits": 0,
        }

        # Mirror the autocomplete contract: skip very short queries.
        if len(query) < 2:
            return empty

        svc = self._suggestions_service
        if not svc.configured:
            logger.debug("Suggestions Meilisearch service not configured — skipping")
            return empty

        filter_clauses: list[str] = []
        if language:
            filter_clauses.append(f'language = "{language}"')
        if category:
            filter_clauses.append(f'category = "{category}"')

        payload: dict[str, Any] = {
            "q": query,
            "limit": limit,
            "attributesToHighlight": ["term"],
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
            "sort": ["weight:desc"],
        }
        if filter_clauses:
            payload["filter"] = " AND ".join(filter_clauses)

        url = f"{svc.base_url}/indexes/{svc.index_name}/search"
        try:
            async with svc._client_ctx() as client:
                response = await client.post(
                    url, json=payload, headers=svc._search_headers()
                )
                if response.status_code == 400 and "filter" in payload:
                    # Filter references a field not on the index — retry plain.
                    logger.debug(
                        "suggestions_filter_unsupported — retrying without filter"
                    )
                    payload_no_filter = {
                        k: v for k, v in payload.items() if k != "filter"
                    }
                    response = await client.post(
                        url, json=payload_no_filter, headers=svc._search_headers()
                    )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            logger.warning(
                "suggestions_index_unavailable — returning empty hits: {}", str(exc)
            )
            return empty

        return {
            "suggestion_hits": data.get("hits", []),
            "query": data.get("query", query),
            "processingTimeMs": data.get("processingTimeMs"),
            "estimatedTotalHits": data.get("estimatedTotalHits"),
        }

    async def documents_search(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        filters: str | None = None,
        semantic_ratio: float = 0.0,
    ) -> dict[str, Any]:
        """Paginated document search used by /api/search/documents.

        Wider ``attributesToRetrieve`` than autocomplete so the results page can
        render full cards without an extra Supabase round-trip.

        ``semantic_ratio`` enables hybrid search when > 0 — the query is
        embedded via TEI and combined with keyword matching at the requested
        mix (0 = pure keyword, 1 = pure semantic). Caller controls the ratio
        so the keyword-only ``text`` mode stays cheap and the ``hybrid`` mode
        opts in explicitly.

        For ``0 < ratio < 1`` the keyword and vector lists are fetched
        separately (in parallel) and fused here with weighted RRF — see
        :func:`reciprocal_rank_fusion` and issue #798 for why Meilisearch's
        score-based ``semanticRatio`` merge is not used. ``ratio == 1`` is a
        single pure-vector Meilisearch query.
        """
        if not self.configured:
            raise SearchServiceError("Meilisearch is not configured")

        payload: dict[str, Any] = {
            "q": query,
            "limit": limit,
            "offset": offset,
            "attributesToSearchOn": [
                "title",
                "case_number",
                "keywords",
                "legal_topics",
                "court_name",
                "judges_flat",
                "summary",
                "full_text",
            ],
            "attributesToHighlight": ["title", "summary"],
            "attributesToCrop": ["summary"],
            "cropLength": 48,
            "attributesToRetrieve": [
                "id",
                "title",
                "summary",
                "case_number",
                "jurisdiction",
                "court_name",
                "court_level",
                "decision_date",
                "publication_date",
                "case_type",
                "decision_type",
                "outcome",
                "keywords",
                "legal_topics",
                "cited_legislation",
                "judges",
                "judges_flat",
                "source_url",
                "created_at",
                "updated_at",
            ],
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
            "matchingStrategy": "last",
        }
        if filters:
            payload["filter"] = filters

        if semantic_ratio > 0 and query.strip() and semantic_ratio < 1.0:
            return await self._fused_hybrid_search(
                payload, query=query, limit=limit, offset=offset, ratio=semantic_ratio
            )

        # Track whether we intended hybrid search so we can set search_mode.
        hybrid_requested = False
        if semantic_ratio > 0 and query.strip():
            query_vec = await self._embed_query(query)
            if query_vec is not None:
                payload["hybrid"] = {
                    "embedder": EMBEDDER_NAME,
                    "semanticRatio": semantic_ratio,
                }
                payload["vector"] = query_vec
                hybrid_requested = True

        raw = await self._search_post(payload)

        # Determine and surface the effective search mode.
        fallback = raw.pop(_FALLBACK_SENTINEL, False)
        if fallback:
            search_mode: SearchMode = "keyword_fallback"
        elif hybrid_requested:
            search_mode = "hybrid"
        else:
            search_mode = "keyword"

        raw["search_mode"] = search_mode
        return raw

    @staticmethod
    async def _embed_query(query: str) -> list[float] | None:
        """Embed ``query`` via TEI; ``None`` (logged) when the embedder fails."""
        try:
            return await asyncio.to_thread(embed_texts, query)
        except Exception:
            logger.opt(exception=True).warning(
                "TEI embedding failed for documents_search — falling back to keyword"
            )
            return None

    async def _fused_hybrid_search(
        self,
        payload: dict[str, Any],
        *,
        query: str,
        limit: int,
        offset: int,
        ratio: float,
    ) -> dict[str, Any]:
        """Run keyword + pure-vector legs in parallel and RRF-fuse them (#798).

        The keyword leg starts while the query is still being embedded, so the
        added latency over a single Meilisearch call is roughly one vector
        query. Both legs fetch the same fixed top ``HYBRID_CANDIDATE_DEPTH``
        hits regardless of the requested page, so every page of a query slices
        one identical fused list: no duplicates or gaps across pages.
        ``estimatedTotalHits`` is the fused list's length, which is what this
        mode can serve, so pagination stops at the end of it.
        """
        window = HYBRID_CANDIDATE_DEPTH
        keyword_payload = {**payload, "limit": window, "offset": 0}

        def _page(source: dict[str, Any], hits: list[dict[str, Any]], mode: str):
            result = {k: v for k, v in source.items() if k != _FALLBACK_SENTINEL}
            result["hits"] = hits[offset : offset + limit]
            result["limit"] = limit
            result["offset"] = offset
            result["search_mode"] = mode
            return result

        async def _keyword_only(keyword: dict[str, Any], mode: str):
            # The window covers the page: slice it. A page past the window
            # (deep scroll while the vector leg is down) is fetched directly.
            if offset + limit <= window:
                return _page(keyword, keyword.get("hits", []), mode)
            direct = await self._search_post(payload)
            direct.pop(_FALLBACK_SENTINEL, None)
            direct["search_mode"] = mode
            return direct

        keyword_task = asyncio.ensure_future(self._search_post(keyword_payload))
        try:
            query_vec = await self._embed_query(query)
            if query_vec is None:
                return await _keyword_only(await keyword_task, "keyword")

            semantic_payload = {
                **keyword_payload,
                "hybrid": {"embedder": EMBEDDER_NAME, "semanticRatio": 1.0},
                "vector": query_vec,
            }
            keyword, semantic = await asyncio.gather(
                keyword_task,
                self._search_post(semantic_payload, keyword_retry=False),
            )
        except BaseException:
            keyword_task.cancel()
            raise

        if semantic.get(_FALLBACK_SENTINEL):
            return await _keyword_only(keyword, "keyword_fallback")

        fused = reciprocal_rank_fusion(
            keyword.get("hits", []),
            semantic.get("hits", []),
            ratio,
            query=query,
        )
        result = _page(keyword, fused, "hybrid")
        result["estimatedTotalHits"] = len(fused)
        result["processingTimeMs"] = max(
            keyword.get("processingTimeMs") or 0,
            semantic.get("processingTimeMs") or 0,
        )
        return result

    async def search(
        self,
        *,
        query: str = "",
        limit: int = 0,
        offset: int = 0,
        filters: str | None = None,
        facets: list[str] | None = None,
        facet_query: str | None = None,
    ) -> dict[str, Any]:
        """Thin Meilisearch search wrapper used by the facets pass-through path.

        Unlike ``documents_search``, this method does **not** restrict the
        returned attributes or inject hybrid embeddings — it is intentionally
        minimal so callers can request facet counts (``facets``) and an
        optional substring filter on values (``facet_query`` → Meili's
        ``facetQuery``) without paying the cost of the full document search.

        The Meilisearch response is returned verbatim so callers can read
        ``facetDistribution`` and ``facetStats`` directly. Raises
        :class:`SearchServiceError` on network/HTTP failure.
        """
        if not self.configured:
            raise SearchServiceError("Meilisearch is not configured")

        payload: dict[str, Any] = {
            "q": query,
            "limit": limit,
            "offset": offset,
        }
        if filters:
            payload["filter"] = filters
        if facets:
            payload["facets"] = facets
        if facet_query is not None:
            # Meilisearch expects camelCase facetQuery on the request body.
            payload["facetQuery"] = facet_query

        return await self._search_post(payload)

    async def facet_search(
        self,
        facet_name: str,
        query: str,
        limit: int = 10,
    ) -> list[str]:
        """Look up canonical facet values matching a free-text query.

        Returns an empty list when Meilisearch is not configured — callers
        should treat this as "no canonicalisation available" rather than
        an error.
        """
        if not self.configured:
            return []

        url = f"{self.base_url}/indexes/{self.index_name}/facet-search"
        payload = {"facetName": facet_name, "facetQuery": query, "limit": limit}

        try:
            async with self._client_ctx() as client:
                response = await client.post(
                    url, json=payload, headers=self._search_headers()
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

        hits = data.get("facetHits") or []
        return [h["value"] for h in hits if isinstance(h, dict) and "value" in h]

    # ── admin / index management ─────────────────────────────────────────

    async def health(self) -> dict[str, Any]:
        """Check Meilisearch server health (GET /health)."""
        url = f"{self.base_url}/health"
        async with self._client_ctx() as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    async def index_exists(self) -> bool:
        """Check whether the index already exists (GET /indexes/{uid})."""
        url = f"{self.base_url}/indexes/{self.index_name}"
        async with self._client_ctx() as client:
            response = await client.get(url, headers=self._admin_headers())
            return response.status_code == 200

    async def create_index(self, primary_key: str = "id") -> dict[str, Any]:
        """Create the index if it doesn't already exist."""
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = f"{self.base_url}/indexes"
        payload = {"uid": self.index_name, "primaryKey": primary_key}

        async with self._client_ctx() as client:
            response = await client.post(
                url, json=payload, headers=self._admin_headers()
            )
            # 202 = task enqueued (normal), 409 = already exists (also fine)
            if response.status_code not in (200, 201, 202, 409):
                response.raise_for_status()
            return response.json()

    async def configure_index(self, settings: dict[str, Any]) -> dict[str, Any]:
        """Update index settings (searchable/filterable/sortable attributes, etc.)."""
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = f"{self.base_url}/indexes/{self.index_name}/settings"

        async with self._client_ctx() as client:
            response = await client.patch(
                url, json=settings, headers=self._admin_headers()
            )
            response.raise_for_status()
            return response.json()

    async def update_settings_embedders(
        self, embedders: dict[str, Any]
    ) -> dict[str, Any]:
        """PATCH the embedders block on its own.

        Kept separate from ``configure_index`` so a rejected embedders update
        (e.g. when bge-m3 backfill is incomplete in prod) doesn't take the rest
        of the settings down with it. See
        docs/reference/specs/2026-05-12-base-schema-search-filter-parity-design.md
        §4.3 and the [[project-meili-settings-atomic-fail]] memory.
        """
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")
        url = f"{self.base_url}/indexes/{self.index_name}/settings/embedders"
        async with self._client_ctx() as client:
            response = await client.patch(
                url, json=embedders, headers=self._admin_headers()
            )
            response.raise_for_status()
            return response.json()

    async def get_settings_embedders(self) -> dict[str, Any]:
        """GET the currently registered embedders block.

        Returns the raw ``settings/embedders`` mapping (``{}`` when none are
        registered). Used to verify the bge-m3 embedder actually landed after a
        settings apply — a silent gap here is what caused issue #200 (hybrid
        search 400s with ``invalid_search_embedder``).
        """
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")
        url = f"{self.base_url}/indexes/{self.index_name}/settings/embedders"
        async with self._client_ctx() as client:
            response = await client.get(url, headers=self._admin_headers())
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else {}

    async def upsert_documents(
        self, documents: list[dict[str, Any]], primary_key: str = "id"
    ) -> dict[str, Any]:
        """Add or replace documents in the index."""
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = (
            f"{self.base_url}/indexes/{self.index_name}"
            f"/documents?primaryKey={primary_key}"
        )

        # Bulk upserts need a longer ceiling than the default search timeout;
        # the shared client is built with ``self.timeout_seconds`` so override
        # per-request here.
        async with self._client_ctx() as client:
            response = await client.post(
                url,
                json=documents,
                headers=self._admin_headers(),
                timeout=max(self.timeout_seconds, 30.0),
            )
            response.raise_for_status()
            return response.json()

    async def delete_document(self, document_id: str) -> dict[str, Any]:
        """Delete a single document by ID."""
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = f"{self.base_url}/indexes/{self.index_name}/documents/{document_id}"

        async with self._client_ctx() as client:
            response = await client.delete(url, headers=self._admin_headers())
            response.raise_for_status()
            return response.json()

    async def get_task(self, task_uid: int) -> dict[str, Any]:
        """Poll a Meilisearch async task by UID."""
        url = f"{self.base_url}/tasks/{task_uid}"

        async with self._client_ctx() as client:
            response = await client.get(url, headers=self._admin_headers())
            response.raise_for_status()
            return response.json()

    async def wait_for_task(
        self,
        task_uid: int,
        *,
        poll_interval: float = 0.5,
        max_wait: float = 60.0,
    ) -> dict[str, Any]:
        """Poll until a task reaches a terminal state (succeeded / failed / canceled)."""
        elapsed = 0.0
        while elapsed < max_wait:
            task = await self.get_task(task_uid)
            status = task.get("status", "")
            if status in ("succeeded", "failed", "canceled"):
                if status == "failed":
                    logger.warning(
                        f"Meilisearch task {task_uid} failed: {task.get('error')}"
                    )
                return task
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise SearchServiceError(
            f"Meilisearch task {task_uid} did not complete within {max_wait}s"
        )

    async def get_index_stats(self) -> dict[str, Any]:
        """Retrieve stats for the index (document count, indexing status, etc.)."""
        url = f"{self.base_url}/indexes/{self.index_name}/stats"

        async with self._client_ctx() as client:
            response = await client.get(url, headers=self._admin_headers())
            response.raise_for_status()
            return response.json()

    async def get_documents(
        self,
        *,
        limit: int = 1000,
        offset: int = 0,
        fields: list[str] | None = None,
        filter_expr: str | None = None,
    ) -> dict[str, Any]:
        """Fetch documents from the index (GET /indexes/{uid}/documents).

        Useful for diffing before an atomic swap — retrieves all stored docs
        without a search query.
        """
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = f"{self.base_url}/indexes/{self.index_name}/documents"
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if fields:
            params["fields"] = ",".join(fields)
        if filter_expr:
            params["filter"] = filter_expr

        async with self._client_ctx() as client:
            response = await client.get(
                url, params=params, headers=self._admin_headers()
            )
            response.raise_for_status()
            return response.json()

    async def swap_indexes(self, index_a: str, index_b: str) -> dict[str, Any]:
        """Atomically swap two Meilisearch indexes (POST /swap-indexes).

        After the swap, ``index_a`` contains what was in ``index_b`` and vice
        versa.  The swap is atomic — zero-downtime — and returns a task UID
        that should be awaited with ``wait_for_task``.

        Args:
            index_a: First index UID (e.g. ``"topics"``).
            index_b: Second index UID (e.g. ``"topics_new"``).
        """
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = f"{self.base_url}/swap-indexes"
        payload = [{"indexes": [index_a, index_b]}]

        async with self._client_ctx() as client:
            response = await client.post(
                url, json=payload, headers=self._admin_headers()
            )
            response.raise_for_status()
            return response.json()

    async def delete_index(self, index_uid: str | None = None) -> dict[str, Any]:
        """Delete the specified index (DELETE /indexes/{uid}).

        If ``index_uid`` is omitted, deletes the service's own ``index_name``.
        Returns the Meilisearch task envelope.
        """
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        uid = index_uid if index_uid is not None else self.index_name
        url = f"{self.base_url}/indexes/{uid}"

        async with self._client_ctx() as client:
            response = await client.delete(url, headers=self._admin_headers())
            # 202 = task enqueued; 404 = already gone (treat as success)
            if response.status_code not in (200, 202, 404):
                response.raise_for_status()
            if response.status_code == 404:
                return {"status": "not_found", "indexUid": uid}
            return response.json()

    async def topics_stats(self) -> dict[str, Any]:
        """Return metadata about the topics index for the /topics/meta endpoint.

        Queries the topics-index service (not ``self``, which is scoped to the
        judgments index) for:
        - ``numberOfDocuments`` from the index stats endpoint
        - The top doc_count document for ``generated_at``, ``corpus_snapshot``,
          and ``jurisdictions`` field values

        Returns a dict with keys:
        - ``total_concepts`` (int)
        - ``generated_at`` (str | None)
        - ``corpus_snapshot`` (int | None)
        - ``jurisdictions`` (list[str])

        Never raises — on any failure returns zeros/None/empty values.
        """
        svc = self._topics_service
        empty: dict[str, Any] = {
            "total_concepts": 0,
            "generated_at": None,
            "corpus_snapshot": None,
            "jurisdictions": [],
        }

        if not svc.configured:
            logger.debug("Topics service not configured — returning empty topics_stats")
            return empty

        try:
            stats_url = f"{svc.base_url}/indexes/{svc.index_name}/stats"
            search_url = f"{svc.base_url}/indexes/{svc.index_name}/search"

            async with svc._client_ctx() as client:
                # 1. Fetch document count from index stats
                stats_response = await client.get(
                    stats_url, headers=svc._admin_headers()
                )
                stats_response.raise_for_status()
                stats_data = stats_response.json()
                total_concepts: int = stats_data.get("numberOfDocuments", 0)

                if total_concepts == 0:
                    return empty

                # 2. Fetch one document (highest doc_count) for metadata fields
                search_payload: dict[str, Any] = {
                    "q": "",
                    "limit": 1,
                    "sort": ["doc_count:desc"],
                }
                search_response = await client.post(
                    search_url, json=search_payload, headers=svc._search_headers()
                )
                search_response.raise_for_status()
                search_data = search_response.json()

                hits = search_data.get("hits", [])
                top_doc = hits[0] if hits else {}

                # 3. Gather distinct jurisdictions from all documents
                all_payload: dict[str, Any] = {
                    "q": "",
                    "limit": total_concepts,
                    "attributesToRetrieve": ["jurisdictions"],
                }
                all_response = await client.post(
                    search_url, json=all_payload, headers=svc._search_headers()
                )
                all_response.raise_for_status()
                all_data = all_response.json()

            jurisdiction_set: set[str] = set()
            for hit in all_data.get("hits", []):
                for j in hit.get("jurisdictions", []):
                    if isinstance(j, str):
                        jurisdiction_set.add(j)

            return {
                "total_concepts": total_concepts,
                "generated_at": top_doc.get("generated_at"),
                "corpus_snapshot": top_doc.get("corpus_snapshot"),
                "jurisdictions": sorted(jurisdiction_set),
            }

        except Exception as exc:
            logger.warning(
                "topics_stats_failed — returning empty metadata: {}", str(exc)
            )
            return empty


def _normalize_meilisearch_url_for_runtime(base_url: str | None) -> str | None:
    """Normalize Meilisearch URL for common Docker-compose dev topology.

    When backend runs in Docker, ``localhost`` points to the backend container.
    In this repository, Meilisearch is reachable as ``meilisearch-dev`` on the
    compose network, so we rewrite localhost URLs automatically.
    """
    if not base_url:
        return base_url

    if not Path("/.dockerenv").exists():
        return base_url

    parsed = urlparse(base_url)
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        return base_url

    port = parsed.port or 7700
    rewritten = parsed._replace(netloc=f"meilisearch-dev:{port}")
    return urlunparse(rewritten)
