"""Search API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_current_user, get_optional_user
from app.services.search import MeiliSearchService, TopicHit
from app.services.search_analytics import (
    export_eval_queries,
    get_popular_queries,
    get_user_search_history,
    get_zero_result_queries,
    record_search_query,
    record_topic_click,
)

router = APIRouter(prefix="/api/search", tags=["Search"])


class AutocompleteResponse(BaseModel):
    """Autocomplete response payload — topic chips from the Meilisearch
    ``topics`` index.

    Judgment-document suggestions were retired in favour of routing topic
    clicks to a full search.  If the topics index is unavailable,
    ``topic_hits`` is an empty list.
    """

    topic_hits: list[TopicHit] = Field(default_factory=list)
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


class TopicClickEvent(BaseModel):
    """Request body for the topic-click analytics endpoint."""

    topic_id: str
    query: str  # the autocomplete query the user had typed
    jurisdiction: str | None = None  # if a filter was active


class TopicsMetaResponse(BaseModel):
    """Metadata about the Meilisearch topics index.

    Fields are ``None`` until ``scripts/generate_search_topics.py`` has run
    at least once and written ``generated_at`` / ``corpus_snapshot`` onto index
    documents.
    """

    total_concepts: int
    generated_at: str | None  # ISO timestamp from the most-recent doc
    corpus_snapshot: int | None  # criminal-judgment count at generation time
    jurisdictions: list[str]  # distinct jurisdictions in the index


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
    user: AuthenticatedUser | None = Depends(get_optional_user),
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

    raw_topic_hits = result.get("topic_hits", [])
    processing_ms = result.get("processingTimeMs")

    # Coerce raw topic dicts into TopicHit models (malformed hits are skipped).
    topic_hits: list[TopicHit] = []
    for raw in raw_topic_hits:
        try:
            topic_hits.append(TopicHit.model_validate(raw))
        except Exception as exc:
            logger.debug(
                "Skipping malformed topic hit: {} ({})", raw, type(exc).__name__
            )

    # Record analytics in background (fire-and-forget). ``hit_count`` reflects
    # how many topic chips the user saw — there are no separate judgment hits
    # in the autocomplete path anymore.
    background_tasks.add_task(
        record_search_query,
        query=query,
        hit_count=len(topic_hits),
        processing_ms=processing_ms,
        filters=filters,
        topic_hits_count=len(topic_hits),
        user_id=user.id if user else None,
    )

    return AutocompleteResponse(
        topic_hits=topic_hits,
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
    user: AuthenticatedUser | None = Depends(get_optional_user),
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
            user_id=user.id if user else None,
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


# ── Topic analytics + metadata endpoints ─────────────────────────────────


@router.post("/topic-click", status_code=200)
async def topic_click(
    event: TopicClickEvent,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict[str, str]:
    """Record a topic-chip click for analytics (fire-and-forget).

    The insert is scheduled as a background task so the response is returned
    immediately without blocking on the database write.  Failures are logged
    as warnings only — never surfaced to the caller.
    """
    background_tasks.add_task(
        record_topic_click,
        topic_id=event.topic_id,
        query=event.query,
        jurisdiction=event.jurisdiction,
        user_id=user.id if user else None,
    )
    return {"status": "ok"}


@router.get("/topics/meta", response_model=TopicsMetaResponse)
async def topics_meta(
    search_service: MeiliSearchService = Depends(get_search_service),
) -> TopicsMetaResponse:
    """Return metadata about the Meilisearch topics index.

    Used for debugging and the admin UI.  Returns ``total_concepts=0`` with
    all other fields ``None`` when the topics index is empty or unavailable.
    """
    if not search_service.configured:
        return TopicsMetaResponse(
            total_concepts=0,
            generated_at=None,
            corpus_snapshot=None,
            jurisdictions=[],
        )

    data = await search_service.topics_stats()
    return TopicsMetaResponse(
        total_concepts=data["total_concepts"],
        generated_at=data.get("generated_at"),
        corpus_snapshot=data.get("corpus_snapshot"),
        jurisdictions=data.get("jurisdictions", []),
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


class UserSearchHistoryItem(BaseModel):
    """A single row from the requesting user's search history."""

    query: str
    hit_count: int
    topic_hits_count: int | None = None
    processing_ms: int | None = None
    filters: str | None = None
    created_at: str


@router.get("/analytics/history", response_model=list[UserSearchHistoryItem])
async def user_search_history(
    days: int = Query(30, ge=1, le=365, description="Lookback window in days"),
    limit: int = Query(100, ge=1, le=500),
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[UserSearchHistoryItem]:
    """Return the authenticated caller's own search history (most recent first)."""
    rows = await get_user_search_history(user_id=user.id, days=days, limit=limit)
    return [UserSearchHistoryItem(**r) for r in rows]


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
