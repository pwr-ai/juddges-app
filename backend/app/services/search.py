"""Search service integrations (Meilisearch-backed autocomplete)."""

from __future__ import annotations

import os
from typing import Any

import httpx


class SearchServiceError(RuntimeError):
    """Raised when autocomplete backend calls fail."""


class MeiliSearchService:
    """Thin Meilisearch HTTP client for autocomplete queries."""

    def __init__(
        self,
        *,
        base_url: str | None,
        api_key: str | None,
        index_name: str,
        timeout_seconds: float = 5.0,
    ) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key or ""
        self.index_name = index_name
        self.timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.index_name)

    @classmethod
    def from_env(cls) -> "MeiliSearchService":
        return cls(
            base_url=os.getenv("MEILISEARCH_URL"),
            api_key=(
                os.getenv("MEILISEARCH_SEARCH_KEY")
                or os.getenv("MEILISEARCH_API_KEY")
                or os.getenv("MEILISEARCH_ADMIN_KEY")
            ),
            index_name=os.getenv("MEILISEARCH_INDEX_NAME", "documents"),
            timeout_seconds=float(os.getenv("MEILISEARCH_TIMEOUT_SECONDS", "5")),
        )

    async def autocomplete(
        self, query: str, limit: int = 10, filters: str | None = None
    ) -> dict[str, Any]:
        if not self.configured:
            raise SearchServiceError("Meilisearch is not configured")

        payload: dict[str, Any] = {
            "q": query,
            "limit": limit,
            "attributesToHighlight": ["title", "summary", "thesis"],
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
        }
        if filters:
            payload["filter"] = filters

        url = f"{self.base_url}/indexes/{self.index_name}/search"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

        if not isinstance(data, dict):
            raise SearchServiceError("Unexpected Meilisearch response format")

        return data

