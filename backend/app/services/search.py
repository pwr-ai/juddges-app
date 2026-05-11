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


class SearchServiceError(RuntimeError):
    """Raised when autocomplete backend calls fail."""


class MeiliSearchService:
    """Meilisearch HTTP client for autocomplete queries and index administration."""

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

    @property
    def configured(self) -> bool:
        """True when the service has enough config for search queries."""
        return bool(self.base_url and self.api_key and self.index_name)

    @property
    def admin_configured(self) -> bool:
        """True when the service has enough config for admin operations."""
        return bool(self.base_url and self.admin_key and self.index_name)

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

    async def _search_post(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST a payload to Meilisearch's /search, degrading hybrid to keyword on 4xx.

        Meilisearch rejects a hybrid request with HTTP 400 when the index has no
        ``bge-m3`` embedder registered (e.g. the prod index whose ``userProvided``
        embedder settings task never succeeded because the legacy docs lacked an
        opt-out). Rather than surfacing that as a 502 to the UI, strip ``hybrid``
        + ``vector`` and retry once as keyword-only — the user still gets results.

        5xx and network failures are not retried; they indicate a Meili outage
        the keyword path can't paper over.
        """
        url = f"{self.base_url}/indexes/{self.index_name}/search"
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    url, json=payload, headers=self._search_headers()
                )
                if 400 <= response.status_code < 500 and (
                    "hybrid" in payload or "vector" in payload
                ):
                    logger.warning(
                        "Meilisearch rejected hybrid search "
                        f"(status={response.status_code}): "
                        f"{response.text[:300]} — retrying as keyword-only"
                    )
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
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

        if not isinstance(data, dict):
            raise SearchServiceError("Unexpected Meilisearch response format")

        return data

    # Facets used to source autocomplete suggestions. Each must be in
    # ``filterableAttributes`` (see meilisearch_config.MEILISEARCH_INDEX_SETTINGS)
    # or Meilisearch will reject the facet-search request.
    AUTOCOMPLETE_FACETS: tuple[str, ...] = (
        "legal_topics",
        "keywords",
        "cited_legislation",
    )

    async def autocomplete(
        self,
        query: str,
        limit: int = 10,
        filters: str | None = None,
    ) -> dict[str, Any]:
        """Topic / keyword / citation typeahead via Meilisearch facet-search.

        Issues parallel ``facet-search`` requests against each entry in
        ``AUTOCOMPLETE_FACETS``, merges hits by case-folded value, sums per-facet
        counts so a term that appears in both ``legal_topics`` and ``keywords``
        is ranked above a single-source hit, and returns the top ``limit``
        suggestions ordered by combined count.

        Returns ``{"hits": [{value, count, sources}], query, processingTimeMs,
        estimatedTotalHits}``. A failed facet (e.g. not yet filterable in the
        live index) is logged and skipped so the other facets still respond.
        """
        if not self.configured:
            raise SearchServiceError("Meilisearch is not configured")

        results = await asyncio.gather(
            *(
                self._facet_search(facet, query, filters)
                for facet in self.AUTOCOMPLETE_FACETS
            ),
            return_exceptions=True,
        )

        merged: dict[str, dict[str, Any]] = {}
        total_processing_ms = 0
        for facet, result in zip(self.AUTOCOMPLETE_FACETS, results, strict=True):
            if isinstance(result, Exception):
                logger.warning(f"Facet autocomplete for '{facet}' failed: {result}")
                continue
            total_processing_ms += int(result.get("processingTimeMs") or 0)
            for hit in result.get("facetHits", []) or []:
                value = (hit.get("value") or "").strip()
                if not value:
                    continue
                count = int(hit.get("count") or 0)
                key = value.casefold()
                entry = merged.get(key)
                if entry is None:
                    entry = {"value": value, "count": 0, "sources": []}
                    merged[key] = entry
                entry["count"] += count
                if facet not in entry["sources"]:
                    entry["sources"].append(facet)

        ranked = sorted(merged.values(), key=lambda h: h["count"], reverse=True)
        return {
            "hits": ranked[:limit],
            "query": query,
            "processingTimeMs": total_processing_ms,
            "estimatedTotalHits": len(ranked),
        }

    async def _facet_search(
        self,
        facet_name: str,
        facet_query: str,
        filters: str | None,
    ) -> dict[str, Any]:
        """POST to Meilisearch's facet-search endpoint for a single facet."""
        payload: dict[str, Any] = {
            "facetName": facet_name,
            "facetQuery": facet_query,
        }
        if filters:
            payload["filter"] = filters

        url = f"{self.base_url}/indexes/{self.index_name}/facet-search"
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
            raise SearchServiceError(
                "Unexpected Meilisearch facet-search response format"
            )
        return data

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

        return await self._search_post(payload)

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
