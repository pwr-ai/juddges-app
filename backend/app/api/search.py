"""Search API endpoints."""

from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from loguru import logger
from pydantic import BaseModel, Field

from app.auth import verify_api_key
from app.core.auth_jwt import AuthenticatedUser, get_current_user, get_optional_user
from app.rate_limiter import limiter
from app.services.search import (
    MeiliSearchService,
    SearchMode,
    SuggestionHit,
    TopicHit,
)
from app.services.search_analytics import (
    export_eval_queries,
    get_popular_queries,
    get_user_search_history,
    get_zero_result_queries,
    record_search_query,
    record_topic_click,
)
from app.services.suggestions_config import SUGGESTION_CATEGORIES

router = APIRouter(prefix="/api/search", tags=["Search"])

# Rate limit for admin analytics endpoints (configurable via env)
SEARCH_ANALYTICS_RATE_LIMIT = os.getenv("SEARCH_ANALYTICS_RATE_LIMIT", "30/minute")
# Rate limit for autocomplete endpoint (configurable via env)
AUTOCOMPLETE_RATE_LIMIT = os.getenv("AUTOCOMPLETE_RATE_LIMIT", "60/minute")
# Rate limit for topic-click endpoint (configurable via env)
TOPIC_CLICK_RATE_LIMIT = os.getenv("TOPIC_CLICK_RATE_LIMIT", "30/minute")
# Rate limit for corpus-suggestion endpoint (configurable via env)
SUGGEST_RATE_LIMIT = os.getenv("SUGGEST_RATE_LIMIT", "60/minute")
# Optional secondary key that gates the eval-queries export endpoint.
# When set, only callers presenting this exact key may access the endpoint.
# When unset, any valid BACKEND_API_KEY is accepted.
RESEARCHER_API_KEY = os.getenv("RESEARCHER_API_KEY")


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


class SuggestResponse(BaseModel):
    """Corpus-derived autocomplete suggestions (issue #153).

    Phrase-level hits from the Meilisearch ``suggestions`` index, mined from the
    PL + EN judgment corpus.  ``suggestion_hits`` is an empty list when the
    suggestions index is unavailable (graceful fallback for the frontend).
    """

    suggestion_hits: list[SuggestionHit] = Field(default_factory=list)
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
    """Paginated document search response (Meilisearch-backed text mode).

    ``search_mode`` indicates which ranking strategy was used:

    - ``"keyword"`` — pure keyword search (``semantic_ratio == 0``).
    - ``"hybrid"`` — hybrid semantic+keyword search ran successfully.
    - ``"keyword_fallback"`` — hybrid was requested but Meilisearch returned
      4xx (e.g. the ``bge-m3`` embedder is not registered); the response
      contains keyword results only.  Ops should treat this as an ops alert.
    """

    documents: list[dict[str, Any]] = Field(default_factory=list)
    query: str
    query_time_ms: int | None = None
    pagination: DocumentPagination
    total_count: int | None = None
    search_mode: SearchMode = "keyword"


class TopicClickEvent(BaseModel):
    """Request body for the topic-click analytics endpoint."""

    topic_id: str = Field(..., max_length=200)
    query: str = Field(..., max_length=500)  # the autocomplete query the user had typed
    jurisdiction: str | None = Field(None, max_length=64)  # if a filter was active


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
@limiter.limit(AUTOCOMPLETE_RATE_LIMIT)
async def autocomplete(
    request: Request,
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


@router.get("/suggest", response_model=SuggestResponse)
@limiter.limit(SUGGEST_RATE_LIMIT)
async def suggest(
    request: Request,
    q: str = Query(..., min_length=1, max_length=500, description="Search query"),
    limit: int = Query(8, ge=1, le=25, description="Maximum number of suggestions"),
    language: str | None = Query(
        None, description="Filter by suggestion language ('pl' or 'en')"
    ),
    category: str | None = Query(
        None,
        description=(
            "Filter by suggestion category (keyword, legal_topic, legislation, "
            "court, judge, phrase, query)"
        ),
    ),
    search_service: MeiliSearchService = Depends(get_search_service),
) -> SuggestResponse:
    """Return corpus-derived phrase-level autocomplete suggestions (issue #153).

    Surfaces the *language of legal practice* — legal terms, doctrines, court
    names, judge names, statute names — mined from the PL + EN judgment corpus.
    Falls back to an empty list (HTTP 200) when the ``suggestions`` index is
    unavailable so the frontend can degrade to today's behaviour rather than
    showing an error.
    """
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    lang = (language or "").strip().lower() or None
    if lang is not None and lang not in ("pl", "en"):
        raise HTTPException(status_code=422, detail="language must be 'pl' or 'en'")

    cat = (category or "").strip().lower() or None
    if cat is not None and cat not in SUGGESTION_CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail=f"category must be one of {', '.join(SUGGESTION_CATEGORIES)}",
        )

    if not search_service.configured:
        # Graceful fallback rather than 503: the frontend treats an empty list
        # as "no corpus suggestions" and shows its own popular-search chips.
        return SuggestResponse(suggestion_hits=[], query=query)

    try:
        result = await search_service.suggest(
            query=query, limit=limit, language=lang, category=cat
        )
    except Exception as exc:
        logger.warning("suggest_endpoint_error — returning empty hits: {}", str(exc))
        return SuggestResponse(suggestion_hits=[], query=query)

    suggestion_hits: list[SuggestionHit] = []
    for raw in result.get("suggestion_hits", []):
        try:
            suggestion_hits.append(SuggestionHit.model_validate(raw))
        except Exception as exc:
            logger.debug(
                "Skipping malformed suggestion hit: {} ({})",
                raw,
                type(exc).__name__,
            )

    return SuggestResponse(
        suggestion_hits=suggestion_hits,
        query=result.get("query", query),
        processingTimeMs=result.get("processingTimeMs"),
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
        search_mode=result.get("search_mode", "keyword"),
    )


# ── Topic analytics + metadata endpoints ─────────────────────────────────


@router.post("/topic-click", status_code=200)
@limiter.limit(TOPIC_CLICK_RATE_LIMIT)
async def topic_click(
    request: Request,
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
@limiter.limit(SEARCH_ANALYTICS_RATE_LIMIT)
async def popular_queries(
    request: Request,
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    limit: int = Query(20, ge=1, le=100),
    api_key: str = Depends(verify_api_key),
) -> list[PopularQueryItem]:
    """Return the most frequently searched queries."""
    rows = await get_popular_queries(days=days, limit=limit)
    return [PopularQueryItem(**r) for r in rows]


@router.get("/analytics/zero-results", response_model=list[ZeroResultQueryItem])
@limiter.limit(SEARCH_ANALYTICS_RATE_LIMIT)
async def zero_result_queries_endpoint(
    request: Request,
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    limit: int = Query(20, ge=1, le=100),
    api_key: str = Depends(verify_api_key),
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
@limiter.limit(SEARCH_ANALYTICS_RATE_LIMIT)
async def eval_queries_endpoint(
    request: Request,
    days: int = Query(30, ge=1, le=365, description="Lookback window in days"),
    min_frequency: int = Query(
        1, ge=1, le=100, description="Minimum query frequency to include"
    ),
    limit: int = Query(500, ge=1, le=5000, description="Maximum queries to return"),
    include_feedback: bool = Query(
        True, description="Include user relevance labels from search_feedback"
    ),
    api_key: str = Depends(verify_api_key),
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

    When ``RESEARCHER_API_KEY`` is set in the environment, only that key is
    accepted for this endpoint (403 otherwise).  When unset, any valid
    ``BACKEND_API_KEY`` is sufficient.
    """
    if RESEARCHER_API_KEY and not secrets.compare_digest(api_key, RESEARCHER_API_KEY):
        raise HTTPException(
            status_code=403,
            detail="This endpoint requires the researcher API key.",
        )
    data = await export_eval_queries(
        days=days,
        min_frequency=min_frequency,
        limit=limit,
        include_feedback=include_feedback,
    )
    return EvalExportResponse(**data)
