"""Search API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.search import MeiliSearchService


router = APIRouter(prefix="/api/search", tags=["Search"])


class AutocompleteResponse(BaseModel):
    """Autocomplete response payload."""

    hits: list[dict[str, Any]] = Field(default_factory=list)
    query: str
    processingTimeMs: int | None = None
    estimatedTotalHits: int | None = None


def get_search_service() -> MeiliSearchService:
    """Dependency factory for autocomplete search service."""
    return MeiliSearchService.from_env()


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete(
    q: str = Query(..., min_length=1, max_length=500, description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of hits"),
    filters: str | None = Query(
        None, description="Optional Meilisearch filter expression"
    ),
    search_service: MeiliSearchService = Depends(get_search_service),
) -> AutocompleteResponse:
    """Return autocomplete suggestions from Meilisearch."""
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if not search_service.configured:
        raise HTTPException(status_code=503, detail="Meilisearch is not configured")

    try:
        result = await search_service.autocomplete(
            query=query, limit=limit, filters=filters
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Autocomplete service error: {exc}"
        ) from exc

    return AutocompleteResponse(
        hits=result.get("hits", []),
        query=result.get("query", query),
        processingTimeMs=result.get("processingTimeMs"),
        estimatedTotalHits=result.get("estimatedTotalHits"),
    )

