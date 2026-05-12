"""
User Feedback System Module

Collects user feedback on search results, features, and product experience.
Stores feedback in Supabase for analysis and product improvements.

Author: Juddges Backend Team
Date: 2025-10-09
"""

import re
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_optional_user, get_user_db_client
from app.rate_limiter import limiter

# Router configuration
router = APIRouter(prefix="/api/feedback", tags=["User Feedback"])

# ---------------------------------------------------------------------------
# Abuse-prevention constants
# ---------------------------------------------------------------------------

# Maximum raw request body accepted before we abort (4 KiB).
_MAX_BODY_BYTES = 4 * 1024

# Maximum number of URLs (http/https) allowed in any free-text comment/description.
_MAX_URLS_IN_TEXT = 5

# Stricter per-feedback rate limit (applies to all feedback write endpoints).
_FEEDBACK_RATE_LIMIT = "20 per hour"

# Compiled pattern for URL detection.
_URL_RE = re.compile(r"https?://", re.IGNORECASE)


def _count_urls(text: str) -> int:
    """Return the number of http/https URLs found in *text*."""
    return len(_URL_RE.findall(text))


async def _check_body_size(request: Request) -> None:
    """Raise 413 if the raw request body exceeds *_MAX_BODY_BYTES*."""
    body = await request.body()
    if len(body) > _MAX_BODY_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Request body too large. Maximum allowed size is {_MAX_BODY_BYTES} bytes.",
        )


# ===== Models =====


class SearchFeedbackContext(BaseModel):
    """Enriched search context for evaluation dataset building."""

    # Filter state at time of search
    filters: dict | None = Field(
        None,
        description="Active filters: courts, date_from, date_to, document_types, languages, keywords, legal_concepts, issuing_bodies",
    )

    # Search parameters
    search_params: dict | None = Field(
        None,
        description="Search params: mode (rabbit/thinking), embedding_model, top_k, reranking_enabled, reranking_model",
    )

    # Result context
    result_context: dict | None = Field(
        None,
        description="Result context: total_results, retrieval_score, reranking_score, page_number, page_size",
    )

    # Document identifiers and metadata
    document: dict | None = Field(
        None,
        description="Document info: document_id, document_number, uuid, title, document_type, court, date, language, country",
    )

    # User interaction timing
    interaction: dict | None = Field(
        None,
        description="Interaction timing: search_timestamp, feedback_timestamp, time_to_feedback_ms, document_opened, chunks_expanded",
    )

    # Chunk information (if feedback on specific chunk)
    chunk_info: dict | None = Field(
        None,
        description="Chunk info: chunk_id, chunk_score, chunk_position, chunk_text",
    )

    # All chunks displayed for this document
    chunks: list | None = Field(
        None,
        description="All displayed chunks: [{chunk_id, chunk_text, chunk_score, position}]",
    )


class SearchFeedbackRequest(BaseModel):
    """Feedback on search results with enriched context for evaluation datasets."""

    document_id: str = Field(description="Document ID that was rated")
    search_query: str = Field(description="Original search query")
    rating: Literal["relevant", "not_relevant", "somewhat_relevant"] = Field(
        description="Relevance rating for this result"
    )
    session_id: str | None = Field(None, description="Session ID for tracking")
    result_position: int | None = Field(
        None, description="Position of this result in search results (1-based)", ge=1
    )
    reason: str | None = Field(
        None, description="Optional text reason for the rating", max_length=500
    )
    search_context: dict | None = Field(
        None,
        description="""Enriched search context for evaluation dataset. Structure:
        {
            "filters": { "courts", "date_from", "date_to", "document_types", "languages", "keywords", "legal_concepts", "issuing_bodies" },
            "search_params": { "mode", "embedding_model", "top_k", "reranking_enabled", "reranking_model" },
            "result_context": { "total_results", "retrieval_score", "reranking_score", "page_number", "page_size" },
            "document": { "document_id", "document_number", "uuid", "title", "document_type", "court", "date", "language", "country" },
            "interaction": { "search_timestamp", "feedback_timestamp", "time_to_feedback_ms", "document_opened", "chunks_expanded" },
            "chunk_info": { "chunk_id", "chunk_score", "chunk_position", "chunk_text" },
            "chunks": [{ "chunk_id", "chunk_text", "chunk_score", "position" }]
        }""",
    )


class SearchFeedbackResponse(BaseModel):
    """Response for search feedback submission."""

    status: Literal["success", "failed"]
    feedback_id: str | None = None
    message: str


class FeatureFeedbackRequest(BaseModel):
    """General feature feedback or feature request."""

    feedback_type: Literal["bug_report", "feature_request", "improvement", "praise"] = (
        Field(description="Type of feedback")
    )
    feature_name: str | None = Field(
        None,
        description="Name of the feature this feedback relates to",
        examples=["search", "collections", "document_viewer", "ai_chat"],
    )
    title: str = Field(
        description="Short title/summary of the feedback",
        min_length=5,
        max_length=200,
        examples=["Search results not relevant for tax queries"],
    )
    description: str = Field(
        description="Detailed description of the feedback",
        min_length=10,
        max_length=2000,
    )
    user_email: str | None = Field(None, description="Email for follow-up (optional)")
    priority: Literal["low", "medium", "high", "critical"] = Field(
        default="medium", description="User-perceived priority"
    )
    attachments: list[str] | None = Field(
        None, description="URLs to screenshots or other attachments", max_length=5
    )


class FeatureFeedbackResponse(BaseModel):
    """Response for feature feedback submission."""

    status: Literal["success", "failed"]
    feedback_id: str | None = None
    message: str
    thank_you_message: str | None = None


class FeedbackSummary(BaseModel):
    """Summary of feedback for a feature or search query."""

    total_feedback: int
    positive_count: int
    negative_count: int
    neutral_count: int
    average_rating: float | None = None
    recent_feedback: list[dict] = Field(
        default_factory=list, description="Sample of recent feedback items"
    )


# ===== Database Schema Information =====
"""
Expected Supabase tables (create these manually or via migration):

1. search_feedback:
   - id: uuid (primary key)
   - document_id: text
   - search_query: text
   - rating: text (relevant/not_relevant/somewhat_relevant)
   - user_id: text (nullable)
   - session_id: text (nullable)
   - result_position: integer (nullable)
   - reason: text (nullable)
   - search_context: jsonb (nullable) - Enriched context for evaluation datasets:
     {
       "filters": {
         "courts": ["Bundesgericht"],
         "date_from": "2020-01-01",
         "date_to": "2024-12-31",
         "document_types": ["judgment"],
         "languages": ["de", "fr"],
         "keywords": [],
         "legal_concepts": [],
         "issuing_bodies": []
       },
       "search_params": {
         "mode": "hybrid",
         "embedding_model": "BAAI/bge-m3",
         "top_k": 50,
         "reranking_enabled": true,
         "reranking_model": "cohere-rerank-v3"
       },
       "result_context": {
         "total_results": 127,
         "retrieval_score": 0.847,
         "reranking_score": 0.912,
         "page_number": 1,
         "page_size": 10
       },
       "document": {
         "document_id": "doc_abc123",
         "document_number": "BGE 147 III 423",
         "uuid": "550e8400-e29b-41d4-a716-446655440000",
         "title": "Urteil vom 15. Juni 2021",
         "document_type": "judgment",
         "court": "Bundesgericht",
         "date": "2021-06-15",
         "language": "de",
         "country": "CH"
       },
       "interaction": {
         "search_timestamp": "2025-01-15T10:32:45Z",
         "feedback_timestamp": "2025-01-15T10:33:12Z",
         "time_to_feedback_ms": 27000,
         "document_opened": true,
         "chunks_expanded": true
       },
       "chunk_info": {
         "chunk_id": "chunk_abc123",
         "chunk_score": 0.89,
         "chunk_position": 2,
         "chunk_text": "The relevant text fragment..."
       },
       "chunks": [
         {
           "chunk_id": 1,
           "chunk_text": "First chunk text displayed to user...",
           "chunk_score": 0.92,
           "position": 1
         },
         {
           "chunk_id": 2,
           "chunk_text": "Second chunk text displayed to user...",
           "chunk_score": 0.85,
           "position": 2
         }
       ]
     }
   - created_at: timestamp

2. feature_requests:
   - id: uuid (primary key)
   - feedback_type: text (bug_report/feature_request/improvement/praise)
   - feature_name: text (nullable)
   - title: text
   - description: text
   - user_id: text (nullable)
   - user_email: text (nullable)
   - priority: text
   - status: text (new/reviewed/planned/in_progress/completed/closed)
   - attachments: jsonb (nullable)
   - upvotes: integer (default 0)
   - created_at: timestamp
   - updated_at: timestamp
"""


# ===== Helper Functions (removed - operations now inline in endpoints) =====
# Old helper functions have been removed in favor of inline database operations
# with proper authentication and RLS enforcement


# ===== API Endpoints =====


@router.post("/search", response_model=SearchFeedbackResponse)
@limiter.limit(_FEEDBACK_RATE_LIMIT)
async def submit_search_feedback(
    request: Request,
    response: Response,
    body: SearchFeedbackRequest,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Submit feedback on search result relevance.

    Allows users to rate search results as relevant/not relevant.
    Used to improve search ranking algorithms over time.

    Supports both authenticated and anonymous users.
    If authenticated, user_id is extracted from JWT token.

    Rate-limited to 20 submissions per hour per IP to prevent abuse.

    Args:
        request: Raw Starlette request (required by SlowAPI for rate limiting)
        body: Search feedback payload
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        SearchFeedbackResponse with status
    """
    await _check_body_size(request)

    # Spam guard: reject empty or URL-heavy optional reason field.
    if body.reason is not None:
        if not body.reason.strip():
            raise HTTPException(
                status_code=422, detail="Feedback reason must not be empty."
            )
        if _count_urls(body.reason) > _MAX_URLS_IN_TEXT:
            raise HTTPException(
                status_code=422,
                detail=f"Feedback reason contains too many URLs (max {_MAX_URLS_IN_TEXT}).",
            )

    try:
        # Extract user_id from authenticated user (secure)
        user_id = user.id if user else None

        # Get appropriate Supabase client
        if user:
            client = get_user_db_client(user)
        else:
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Store search feedback
        feedback_data = {
            "document_id": body.document_id,
            "search_query": body.search_query,
            "rating": body.rating,
            "user_id": user_id,
            "session_id": body.session_id,
            "result_position": body.result_position,
            "reason": body.reason,
            "search_context": body.search_context or {},
            "created_at": datetime.now(UTC).isoformat(),
        }

        result = client.table("search_feedback").insert(feedback_data).execute()
        feedback_id = result.data[0]["id"] if result.data else None

        logger.info(
            f"Stored search feedback: {body.rating} for document {body.document_id} "
            f"(query: '{body.search_query[:30]}...', user: {user_id})"
        )

        # Generate thank you message based on rating
        if body.rating == "relevant":
            message = "Thank you! Your feedback helps us improve search results."
        elif body.rating == "not_relevant":
            message = "Thank you for the feedback! We'll work on improving relevance."
        else:
            message = "Thank you! Your feedback has been recorded."

        return SearchFeedbackResponse(
            status="success", feedback_id=feedback_id, message=message
        )

    except Exception as e:
        logger.error(f"Failed to submit search feedback: {e}")
        from app.sentry import capture_exception

        capture_exception(e, boundary="feedback_write", feedback_type="search")
        return SearchFeedbackResponse(
            status="failed",
            feedback_id=None,
            message=f"Failed to submit feedback: {e!s}",
        )


@router.post("/feature", response_model=FeatureFeedbackResponse)
@limiter.limit(_FEEDBACK_RATE_LIMIT)
async def submit_feature_feedback(
    request: Request,
    response: Response,
    body: FeatureFeedbackRequest,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Submit general feature feedback or feature request.

    Allows users to:
    - Report bugs
    - Request new features
    - Suggest improvements
    - Give praise

    All feedback is reviewed by the product team.

    Supports both authenticated and anonymous users.
    If authenticated, user_id is extracted from JWT token.

    Rate-limited to 20 submissions per hour per IP to prevent abuse.

    Args:
        request: Raw Starlette request (required by SlowAPI for rate limiting)
        body: Feature feedback payload
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        FeatureFeedbackResponse with status
    """
    await _check_body_size(request)

    # Spam guard: reject description that is only whitespace or URL-heavy.
    if not body.description.strip():
        raise HTTPException(
            status_code=422, detail="Feedback description must not be empty."
        )
    if _count_urls(body.description) > _MAX_URLS_IN_TEXT:
        raise HTTPException(
            status_code=422,
            detail=f"Feedback description contains too many URLs (max {_MAX_URLS_IN_TEXT}).",
        )

    try:
        # Extract user_id from authenticated user (secure)
        user_id = user.id if user else None

        # Get user's email from auth if not provided
        user_email = body.user_email or (user.email if user else None)

        # Get appropriate Supabase client
        if user:
            client = get_user_db_client(user)
        else:
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Store feature feedback
        feedback_data = {
            "feedback_type": body.feedback_type,
            "feature_name": body.feature_name,
            "title": body.title,
            "description": body.description,
            "user_id": user_id,
            "user_email": user_email,
            "priority": body.priority,
            "status": "new",  # Initial status
            "attachments": body.attachments or [],
            "upvotes": 0,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        result = client.table("feature_requests").insert(feedback_data).execute()
        feedback_id = result.data[0]["id"] if result.data else None

        logger.info(
            f"Stored feature feedback: {body.feedback_type} - '{body.title}' "
            f"(feature: {body.feature_name}, user: {user_id})"
        )

        # Generate appropriate thank you message
        thank_you_messages = {
            "bug_report": "Thank you for reporting this issue! Our team will investigate and fix it.",
            "feature_request": "Thank you for your suggestion! We'll consider it for future updates.",
            "improvement": "Thank you! We appreciate suggestions for improving our platform.",
            "praise": "Thank you so much! We're glad you're enjoying Juddges!",
        }

        thank_you = thank_you_messages.get(
            body.feedback_type, "Thank you for your feedback!"
        )

        return FeatureFeedbackResponse(
            status="success",
            feedback_id=feedback_id,
            message="Feedback submitted successfully",
            thank_you_message=thank_you,
        )

    except Exception as e:
        logger.error(f"Failed to submit feature feedback: {e}")
        from app.sentry import capture_exception

        capture_exception(e, boundary="feedback_write", feedback_type="feature")
        return FeatureFeedbackResponse(
            status="failed",
            feedback_id=None,
            message=f"Failed to submit feedback: {e!s}",
            thank_you_message=None,
        )


@router.get("/search/summary", response_model=FeedbackSummary)
async def get_search_feedback_summary(
    document_id: str | None = None,
    search_query: str | None = None,
    limit: int = 10,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Get summary of search feedback.

    Filter by document_id or search_query to see specific feedback.

    If authenticated, includes user's own feedback and aggregate stats.
    Anonymous users only see aggregate statistics.

    Args:
        document_id: Optional document ID to filter by
        search_query: Optional search query to filter by
        limit: Number of recent feedback items to return
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        FeedbackSummary with statistics
    """
    try:
        # Get appropriate Supabase client
        if user:
            client = get_user_db_client(user)
        else:
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Build query
        query = client.table("search_feedback").select(
            "id, user_id, document_id, search_query, rating, reason, result_position, created_at"
        )

        if document_id:
            query = query.eq("document_id", document_id)
        if search_query:
            query = query.eq("search_query", search_query)

        # Execute query
        result = query.order("created_at", desc=True).limit(100).execute()

        if not result.data:
            return FeedbackSummary(
                total_feedback=0,
                positive_count=0,
                negative_count=0,
                neutral_count=0,
                recent_feedback=[],
            )

        # Calculate statistics
        feedback_items = result.data
        total = len(feedback_items)

        positive_count = sum(
            1 for item in feedback_items if item["rating"] == "relevant"
        )
        negative_count = sum(
            1 for item in feedback_items if item["rating"] == "not_relevant"
        )
        neutral_count = sum(
            1 for item in feedback_items if item["rating"] == "somewhat_relevant"
        )

        # Get recent feedback (sanitized - don't expose user_ids)
        recent = [
            {
                "rating": item["rating"],
                "reason": item.get("reason"),
                "created_at": item["created_at"],
                "result_position": item.get("result_position"),
            }
            for item in feedback_items[:limit]
        ]

        return FeedbackSummary(
            total_feedback=total,
            positive_count=positive_count,
            negative_count=negative_count,
            neutral_count=neutral_count,
            recent_feedback=recent,
        )

    except Exception as e:
        logger.error(f"Failed to get feedback summary: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve feedback summary: {e!s}"
        )


@router.get("/feature/recent")
async def get_recent_feature_feedback(
    feedback_type: str | None = None,
    feature_name: str | None = None,
    limit: int = 20,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Get recent feature feedback and requests.

    Args:
        feedback_type: Filter by feedback type
        feature_name: Filter by feature name
        limit: Number of items to return
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        List of recent feedback items (emails sanitized for privacy)
    """
    try:
        # Get appropriate Supabase client
        if user:
            client = get_user_db_client(user)
        else:
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Build query
        query = client.table("feature_requests").select(
            "id, user_id, feedback_type, feature_name, title, description, "
            "priority, status, upvotes, created_at"
        )

        if feedback_type:
            query = query.eq("feedback_type", feedback_type)
        if feature_name:
            query = query.eq("feature_name", feature_name)

        # Execute query
        result = query.order("created_at", desc=True).limit(limit).execute()

        # Sanitize data (remove emails and user_ids for privacy)
        sanitized = [
            {
                "id": item["id"],
                "feedback_type": item["feedback_type"],
                "feature_name": item.get("feature_name"),
                "title": item["title"],
                "description": item["description"][:200] + "..."
                if len(item["description"]) > 200
                else item["description"],
                "priority": item["priority"],
                "status": item["status"],
                "upvotes": item.get("upvotes", 0),
                "created_at": item["created_at"],
            }
            for item in result.data
        ]

        return {"status": "success", "count": len(sanitized), "feedback": sanitized}

    except Exception as e:
        logger.error(f"Failed to get recent feedback: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve recent feedback: {e!s}"
        )


@router.post("/feature/{feedback_id}/upvote")
@limiter.limit(_FEEDBACK_RATE_LIMIT)
async def upvote_feature_request(
    request: Request,
    response: Response,
    feedback_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Upvote a feature request to show support.

    Authenticated users can upvote feature requests.
    Anonymous users can also upvote, but we track it for analytics.

    Args:
        feedback_id: ID of the feature request
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        Updated upvote count
    """
    try:
        # Get appropriate Supabase client
        # Note: For upvoting, we use admin client to increment the counter
        # But we log the user_id for analytics if available
        from app.core.auth_jwt import get_admin_supabase_client

        client = get_admin_supabase_client()

        user_id = user.id if user else None

        # Get current upvotes
        result = (
            client.table("feature_requests")
            .select("upvotes")
            .eq("id", feedback_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Feature request not found")

        current_upvotes = result.data[0].get("upvotes", 0)

        # Increment upvotes
        update_result = (
            client.table("feature_requests")
            .update({"upvotes": current_upvotes + 1})
            .eq("id", feedback_id)
            .execute()
        )

        new_upvotes = (
            update_result.data[0]["upvotes"]
            if update_result.data
            else current_upvotes + 1
        )

        logger.info(
            f"Feature request {feedback_id} upvoted by user {user_id} (total: {new_upvotes})"
        )

        return {
            "status": "success",
            "feedback_id": feedback_id,
            "upvotes": new_upvotes,
            "message": "Thank you for your vote!",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upvote feature request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upvote: {e!s}")


logger.info("Feedback module initialized")
