"""Search service integrations (Meilisearch-backed autocomplete)."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx
from juddges_search.embeddings import embed_texts
from loguru import logger
from pydantic import BaseModel, Field


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

# Maximum hits returned from the topics index per autocomplete call.
_TOPICS_LIMIT: int = 4


class MeiliSearchService:
    """Meilisearch HTTP client for autocomplete queries and index administration.

    A single instance is scoped to one Meilisearch index (``index_name``).
    The autocomplete method queries the judgments index (``self``) *and* the
    topics index in parallel.  The topics-side service is constructed lazily on
    first access via the ``_topics_service`` cached property so it is built once
    per process lifetime rather than once per keystroke.
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

    async def autocomplete(
        self,
        query: str,
        limit: int = 10,
        filters: str | None = None,
        semantic_ratio: float = 0.0,
    ) -> dict[str, Any]:
        """Return autocomplete hits from the judgments index, merged with topic hits.

        Both queries are fired in parallel.  A failure on the topics side is
        handled silently: a ``logger.warning`` is emitted and ``topic_hits`` is
        returned as an empty list so the judgments results are never blocked.

        Topics are skipped entirely when ``query`` has fewer than 2 characters
        (same guard as the document side).

        Args:
            query: The search string as typed by the user.
            limit: Maximum document hits from the judgments index (default 10).
                   The topics index is always capped at 4, independent of this
                   value.
            filters: Optional Meilisearch filter expression forwarded to *both*
                     indexes.  If the topics index rejects the filter (e.g. it
                     references a field that only exists on judgments), the topics
                     query is retried without a filter rather than failing.
            semantic_ratio: Hybrid search mix for the judgments query (0 = pure
                            keyword, 1 = pure semantic).  Not applied to topics.
        """
        if not self.configured:
            raise SearchServiceError("Meilisearch is not configured")

        # ── Judgments query payload ───────────────────────────────────────────
        payload: dict[str, Any] = {
            "q": query,
            "limit": limit,
            # Keep autocomplete focused on short, high-signal fields.
            "attributesToSearchOn": [
                "title",
                "case_number",
                "keywords",
                "legal_topics",
                "court_name",
                "summary",
            ],
            "attributesToHighlight": [
                "title",
                "summary",
                "case_number",
                "court_name",
            ],
            "attributesToCrop": ["summary"],
            "cropLength": 24,
            "attributesToRetrieve": [
                "id",
                "title",
                "summary",
                "case_number",
                "jurisdiction",
                "court_name",
                "decision_date",
                "case_type",
                "keywords",
            ],
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
            "matchingStrategy": "last",
        }
        if filters:
            payload["filter"] = filters

        if semantic_ratio > 0 and query.strip():
            try:
                query_vec = await asyncio.to_thread(embed_texts, query)
                payload["hybrid"] = {
                    "embedder": "bge-m3",
                    "semanticRatio": semantic_ratio,
                }
                payload["vector"] = query_vec
            except Exception:
                logger.opt(exception=True).warning(
                    "TEI embedding failed for query — falling back to keyword search"
                )

        # ── Parallel execution ────────────────────────────────────────────────
        judgments_coro = self._query_judgments(payload)

        long_enough = len(query) >= 2
        if long_enough:
            topics_coro = self._query_topics(query, filters=filters)
            docs_result, topics_result = await asyncio.gather(
                judgments_coro, topics_coro, return_exceptions=True
            )
        else:
            docs_result = await judgments_coro
            topics_result = None

        # ── Handle judgments result ───────────────────────────────────────────
        if isinstance(docs_result, Exception):
            raise SearchServiceError(str(docs_result)) from docs_result

        if not isinstance(docs_result, dict):
            raise SearchServiceError("Unexpected Meilisearch response format")

        # ── Handle topics result (silent degradation) ─────────────────────────
        if topics_result is None:
            topic_hits: list[dict[str, Any]] = []
        elif isinstance(topics_result, Exception):
            logger.warning(
                "topics_index_unavailable — returning empty topic_hits: {}",
                str(topics_result),
            )
            topic_hits = []
        else:
            topic_hits = topics_result.get("hits", [])

        return {
            **docs_result,
            "topic_hits": topic_hits,
        }

    async def _query_judgments(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Execute the prepared judgments-index search payload."""
        url = f"{self.base_url}/indexes/{self.index_name}/search"
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    url, json=payload, headers=self._search_headers()
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

    async def _query_topics(
        self,
        query: str,
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
            "limit": _TOPICS_LIMIT,
            "attributesToHighlight": _TOPICS_HIGHLIGHT_ATTRS,
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
            "matchingStrategy": "all",
        }
        if filters:
            topics_payload["filter"] = filters

        url = f"{svc.base_url}/indexes/{svc.index_name}/search"

        try:
            async with httpx.AsyncClient(timeout=svc.timeout_seconds) as client:
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

        ``semantic_ratio`` enables Meilisearch hybrid search when > 0 — the
        query is embedded via TEI and combined with keyword matching at the
        requested mix (0 = pure keyword, 1 = pure semantic). Caller controls
        the ratio so the keyword-only ``text`` mode stays cheap and the
        ``hybrid`` mode opts in explicitly.
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

        if semantic_ratio > 0 and query.strip():
            try:
                query_vec = await asyncio.to_thread(embed_texts, query)
                payload["hybrid"] = {
                    "embedder": "bge-m3",
                    "semanticRatio": semantic_ratio,
                }
                payload["vector"] = query_vec
            except Exception:
                logger.opt(exception=True).warning(
                    "TEI embedding failed for documents_search — falling back to keyword"
                )

        url = f"{self.base_url}/indexes/{self.index_name}/search"

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    url, json=payload, headers=self._search_headers()
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

        if not isinstance(data, dict):
            raise SearchServiceError("Unexpected Meilisearch response format")

        return data

    # ── admin / index management ─────────────────────────────────────────

    async def health(self) -> dict[str, Any]:
        """Check Meilisearch server health (GET /health)."""
        url = f"{self.base_url}/health"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    async def index_exists(self) -> bool:
        """Check whether the index already exists (GET /indexes/{uid})."""
        url = f"{self.base_url}/indexes/{self.index_name}"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, headers=self._admin_headers())
            return response.status_code == 200

    async def create_index(self, primary_key: str = "id") -> dict[str, Any]:
        """Create the index if it doesn't already exist."""
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = f"{self.base_url}/indexes"
        payload = {"uid": self.index_name, "primaryKey": primary_key}

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
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

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.patch(
                url, json=settings, headers=self._admin_headers()
            )
            response.raise_for_status()
            return response.json()

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

        async with httpx.AsyncClient(timeout=max(self.timeout_seconds, 30.0)) as client:
            response = await client.post(
                url, json=documents, headers=self._admin_headers()
            )
            response.raise_for_status()
            return response.json()

    async def delete_document(self, document_id: str) -> dict[str, Any]:
        """Delete a single document by ID."""
        if not self.admin_configured:
            raise SearchServiceError("Meilisearch admin key is not configured")

        url = f"{self.base_url}/indexes/{self.index_name}/documents/{document_id}"

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.delete(url, headers=self._admin_headers())
            response.raise_for_status()
            return response.json()

    async def get_task(self, task_uid: int) -> dict[str, Any]:
        """Poll a Meilisearch async task by UID."""
        url = f"{self.base_url}/tasks/{task_uid}"

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
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

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, headers=self._admin_headers())
            response.raise_for_status()
            return response.json()


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
