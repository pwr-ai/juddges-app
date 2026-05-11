"""Search API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.search import MeiliSearchService
from app.services.search_analytics import (
    export_eval_queries,
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


class DocumentPagination(BaseModel):
    offset: int
    limit: int
    loaded_count: int
    estimated_total: int | None = None
    has_more: bool
    next_offset: int | None = None


class DocumentSearchResponse(BaseModel):
    """Paginated document search response (Meilisearch-backed text mode)."""

    documents: list[dict[str, Any]] = Field(default_factory=list)
    query: str
    query_time_ms: int | None = None
    pagination: DocumentPagination
    total_count: int | None = None


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


@router.get("/documents", response_model=DocumentSearchResponse)
async def documents_search(
    background_tasks: BackgroundTasks,
    q: str = Query("", max_length=500, description="Search query (empty = match all)"),
    limit: int = Query(10, ge=1, le=100, description="Max documents to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    filters: str | None = Query(
        None, description="Optional Meilisearch filter expression"
    ),
    semantic_ratio: float = Query(
        0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Hybrid mix between keyword and semantic search. 0 = pure keyword "
            "(default), 1 = pure semantic. Frontend's 'hybrid' mode sends ~0.5."
        ),
    ),
    search_service: MeiliSearchService = Depends(get_search_service),
) -> DocumentSearchResponse:
    """Paginated Meilisearch-backed document search for the /search results page."""
    query = q.strip()

    if not search_service.configured:
        raise HTTPException(status_code=503, detail="Meilisearch is not configured")

    try:
        result = await search_service.documents_search(
            query=query,
            limit=limit,
            offset=offset,
            filters=filters,
            semantic_ratio=semantic_ratio,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Document search error: {exc}"
        ) from exc

    hits = result.get("hits", [])
    estimated_total = result.get("estimatedTotalHits")
    processing_ms = result.get("processingTimeMs")
    loaded_count = offset + len(hits)
    has_more = bool(estimated_total is not None and loaded_count < estimated_total)
    next_offset = loaded_count if has_more else None

    if query:
        background_tasks.add_task(
            record_search_query,
            query=query,
            hit_count=len(hits),
            processing_ms=processing_ms,
            filters=filters,
        )

    return DocumentSearchResponse(
        documents=hits,
        query=result.get("query", query),
        query_time_ms=processing_ms,
        pagination=DocumentPagination(
            offset=offset,
            limit=limit,
            loaded_count=loaded_count,
            estimated_total=estimated_total,
            has_more=has_more,
            next_offset=next_offset,
        ),
        total_count=estimated_total,
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


# ── Eval query export ────────────────────────────────────────────────────


class RelevanceLabel(BaseModel):
    """A single user-provided relevance label for a query-document pair."""

    search_query: str
    document_id: str
    rating: str  # relevant | not_relevant | somewhat_relevant
    result_position: int | None = None
    reason: str | None = None


class EvalQuery(BaseModel):
    """A query from the evaluation dataset with optional ground-truth labels."""

    query: str
    query_source: str  # user_logs | feedback_rated
    frequency: int = 0
    avg_hit_count: float | None = None
    avg_processing_ms: float | None = None
    relevance_labels: list[RelevanceLabel] = Field(default_factory=list)
    has_ground_truth: bool = False


class EvalExportMetadata(BaseModel):
    """Statistics about the exported eval dataset."""

    exported_at: str
    days: int
    min_frequency: int
    total_queries: int
    labeled_queries: int
    unlabeled_queries: int
    source_breakdown: dict[str, int] = Field(default_factory=dict)


class EvalExportResponse(BaseModel):
    """Full eval query export response."""

    queries: list[EvalQuery]
    metadata: EvalExportMetadata


@router.get("/analytics/eval-queries", response_model=EvalExportResponse)
async def eval_queries_endpoint(
    days: int = Query(30, ge=1, le=365, description="Lookback window in days"),
    min_frequency: int = Query(
        1, ge=1, le=100, description="Minimum query frequency to include"
    ),
    limit: int = Query(500, ge=1, le=5000, description="Maximum queries to return"),
    include_feedback: bool = Query(
        True, description="Include user relevance labels from search_feedback"
    ),
) -> EvalExportResponse:
    """Export deduplicated search queries as an evaluation dataset.

    Combines user search logs (from ``search_analytics``) with user-rated
    relevance labels (from ``search_feedback``) into a single dataset
    suitable for offline search quality evaluation.

    Each query includes:
    - ``query_source``: whether it came from logs or feedback
    - ``frequency``: how often users searched this query
    - ``relevance_labels``: list of user-provided relevance ratings (if any)
    - ``has_ground_truth``: whether at least one rating exists
    """
    data = await export_eval_queries(
        days=days,
        min_frequency=min_frequency,
        limit=limit,
        include_feedback=include_feedback,
    )
    return EvalExportResponse(**data)
