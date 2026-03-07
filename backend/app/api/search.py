"""Search API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.search import MeiliSearchService
from app.services.search_analytics import (
    get_popular_queries,
    get_zero_result_queries,
    record_search_query,
)


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
    background_tasks: BackgroundTasks,
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

    hits = result.get("hits", [])
    processing_ms = result.get("processingTimeMs")

    # Record analytics in background (fire-and-forget)
    background_tasks.add_task(
        record_search_query,
        query=query,
        hit_count=len(hits),
        processing_ms=processing_ms,
        filters=filters,
    )

    return AutocompleteResponse(
        hits=hits,
        query=result.get("query", query),
        processingTimeMs=processing_ms,
        estimatedTotalHits=result.get("estimatedTotalHits"),
    )


# ── Search analytics endpoints ───────────────────────────────────────────


class PopularQueryItem(BaseModel):
    query: str
    search_count: int
    avg_hits: float | None = None
    avg_processing_ms: float | None = None


class ZeroResultQueryItem(BaseModel):
    query: str
    search_count: int
    last_searched: str | None = None


@router.get("/analytics/popular", response_model=list[PopularQueryItem])
async def popular_queries(
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    limit: int = Query(20, ge=1, le=100),
) -> list[PopularQueryItem]:
    """Return the most frequently searched queries."""
    rows = await get_popular_queries(days=days, limit=limit)
    return [PopularQueryItem(**r) for r in rows]


@router.get("/analytics/zero-results", response_model=list[ZeroResultQueryItem])
async def zero_result_queries_endpoint(
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    limit: int = Query(20, ge=1, le=100),
) -> list[ZeroResultQueryItem]:
    """Return queries that produced zero search results."""
    rows = await get_zero_result_queries(days=days, limit=limit)
    return [ZeroResultQueryItem(**r) for r in rows]

