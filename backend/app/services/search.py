"""Search service integrations (Meilisearch-backed autocomplete)."""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx
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
        return cls(
            base_url=os.getenv("MEILISEARCH_URL"),
            api_key=(
                os.getenv("MEILISEARCH_SEARCH_KEY")
                or os.getenv("MEILISEARCH_API_KEY")
                or os.getenv("MEILISEARCH_ADMIN_KEY")
            ),
            admin_key=os.getenv("MEILISEARCH_ADMIN_KEY"),
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

    async def autocomplete(
        self, query: str, limit: int = 10, filters: str | None = None
    ) -> dict[str, Any]:
        if not self.configured:
            raise SearchServiceError("Meilisearch is not configured")

        payload: dict[str, Any] = {
            "q": query,
            "limit": limit,
            "attributesToHighlight": [
                "title",
                "summary",
                "case_number",
                "court_name",
            ],
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
        }
        if filters:
            payload["filter"] = filters

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

        async with httpx.AsyncClient(
            timeout=max(self.timeout_seconds, 30.0)
        ) as client:
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
