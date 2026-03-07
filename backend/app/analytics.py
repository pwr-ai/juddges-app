"""
Usage Tracking & Analytics Module

Tracks user behavior, search queries, and feature usage for product analytics.
Stores events in Supabase for analysis and reporting.

Author: Juddges Backend Team
Date: 2025-10-09
"""

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_optional_user, get_user_db_client

# Router configuration
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


# ===== Models =====


class EventProperties(BaseModel):
    """Generic event properties (flexible schema)."""

    # Common properties
    query: str | None = None
    document_id: str | None = None
    collection_id: str | None = None
    feature_name: str | None = None
    duration_ms: int | None = None
    result_count: int | None = None

    # Search-specific
    search_type: str | None = None
    filters_applied: dict[str, Any] | None = None
    clicked_result_position: int | None = None

    # Feature usage
    feature_version: str | None = None
    success: bool | None = None
    error_message: str | None = None

    # Custom properties
    custom_properties: dict[str, Any] | None = Field(
        default_factory=dict, description="Additional custom event properties"
    )


class TrackEventRequest(BaseModel):
    """Generic event tracking request."""

    event_name: str = Field(
        description="Event name (e.g., 'search_performed', 'document_viewed')",
        examples=["search_performed", "document_viewed", "feature_used"],
    )
    session_id: str | None = Field(
        None, description="Session ID (for tracking user sessions)"
    )
    properties: EventProperties | None = Field(
        None, description="Event properties (flexible schema)"
    )
    timestamp: str | None = Field(
        None, description="Event timestamp (ISO 8601) - defaults to current time"
    )


class TrackSearchRequest(BaseModel):
    """Search-specific tracking request."""

    query: str = Field(description="Search query text")
    session_id: str | None = Field(None, description="Session ID")
    result_count: int = Field(description="Number of results returned")
    filters: dict[str, Any] | None = Field(
        None, description="Filters applied (document types, languages, etc.)"
    )
    duration_ms: int | None = Field(None, description="Search duration in milliseconds")
    clicked_result: dict[str, Any] | None = Field(
        None, description="Information about clicked result (if any)"
    )


class EventResponse(BaseModel):
    """Response for event tracking."""

    status: Literal["success", "failed"]
    event_id: str | None = Field(None, description="ID of the tracked event")
    message: str


class SessionSummary(BaseModel):
    """Summary of a user session."""

    session_id: str
    user_id: str | None
    started_at: str
    ended_at: str | None
    duration_seconds: int | None
    events_count: int
    searches_count: int
    documents_viewed: int


# ===== Database Schema Information =====
"""
Expected Supabase tables (create these manually or via migration):

1. user_sessions:
   - id: uuid (primary key)
   - session_id: text
   - user_id: text (nullable)
   - started_at: timestamp
   - ended_at: timestamp (nullable)
   - user_agent: text (nullable)
   - ip_address: text (nullable)
   - created_at: timestamp

2. search_queries:
   - id: uuid (primary key)
   - user_id: text (nullable)
   - session_id: text (nullable)
   - query: text
   - result_count: integer
   - filters: jsonb (nullable)
   - duration_ms: integer (nullable)
   - clicked_result: jsonb (nullable)
   - created_at: timestamp

3. feature_usage:
   - id: uuid (primary key)
   - user_id: text (nullable)
   - session_id: text (nullable)
   - feature_name: text
   - feature_version: text (nullable)
   - properties: jsonb (nullable)
   - success: boolean
   - error_message: text (nullable)
   - created_at: timestamp

4. events:
   - id: uuid (primary key)
   - event_name: text
   - user_id: text (nullable)
   - session_id: text (nullable)
   - properties: jsonb (nullable)
   - created_at: timestamp
"""


# ===== Helper Functions (removed - operations now inline in endpoints) =====
# Old helper functions have been removed in favor of inline database operations
# with proper authentication and RLS enforcement


# ===== API Endpoints =====


@router.post("/track", response_model=EventResponse)
async def track_event(
    request: TrackEventRequest,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Track a generic analytics event.

    Use for tracking any user action or system event.
    Stores event in Supabase for later analysis.

    Supports both authenticated and anonymous users.
    If authenticated, user_id is extracted from JWT token.

    Args:
        request: Event tracking request
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        EventResponse with status and event_id
    """
    try:
        # Convert properties to dict
        properties = request.properties.dict() if request.properties else {}

        # Add any custom properties
        if request.properties and request.properties.custom_properties:
            properties.update(request.properties.custom_properties)

        # Extract user_id from authenticated user (secure)
        user_id = user.id if user else None

        # Get appropriate Supabase client
        if user:
            # Use user's client (respects RLS)
            client = get_user_db_client(user)
        else:
            # For anonymous users, we still need admin client for analytics
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Track to database
        event_data = {
            "event_name": request.event_name,
            "user_id": user_id,
            "session_id": request.session_id,
            "properties": properties or {},
            "created_at": request.timestamp or datetime.now(UTC).isoformat(),
        }

        result = client.table("events").insert(event_data).execute()
        event_id = result.data[0]["id"] if result.data else None

        logger.info(
            f"Tracked event: {request.event_name} (user: {user_id}, session: {request.session_id})"
        )

        return EventResponse(
            status="success",
            event_id=event_id,
            message=f"Event '{request.event_name}' tracked successfully",
        )

    except Exception as e:
        logger.error(f"Failed to track event: {e}")
        return EventResponse(
            status="failed", event_id=None, message=f"Failed to track event: {e!s}"
        )


@router.post("/search", response_model=EventResponse)
async def track_search(
    request: TrackSearchRequest,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Track a search query for analytics.

    Stores search query, filters, results count, and user interactions.
    Used for understanding search behavior and improving ranking.

    Supports both authenticated and anonymous users.
    If authenticated, user_id is extracted from JWT token.

    Args:
        request: Search tracking request
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        EventResponse with status and search_id
    """
    try:
        # Extract user_id from authenticated user (secure)
        user_id = user.id if user else None

        # Get appropriate Supabase client
        if user:
            client = get_user_db_client(user)
        else:
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Track search to database
        search_data = {
            "user_id": user_id,
            "session_id": request.session_id,
            "query": request.query,
            "result_count": request.result_count,
            "filters": request.filters,
            "duration_ms": request.duration_ms,
            "clicked_result": request.clicked_result,
            "created_at": datetime.now(UTC).isoformat(),
        }

        result = client.table("search_queries").insert(search_data).execute()
        search_id = result.data[0]["id"] if result.data else None

        logger.info(
            f"Tracked search: '{request.query[:50]}...' "
            f"(user: {user_id}, results: {request.result_count})"
        )

        return EventResponse(
            status="success",
            event_id=search_id,
            message="Search query tracked successfully",
        )

    except Exception as e:
        logger.error(f"Failed to track search: {e}")
        return EventResponse(
            status="failed", event_id=None, message=f"Failed to track search: {e!s}"
        )


@router.post("/feature", response_model=EventResponse)
async def track_feature_usage(
    feature_name: str,
    session_id: str | None = None,
    success: bool = True,
    properties: dict[str, Any] | None = None,
    error_message: str | None = None,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Track feature usage for product analytics.

    Monitors which features are used, by whom, and whether they succeed.
    Helps identify popular features and areas needing improvement.

    Supports both authenticated and anonymous users.
    If authenticated, user_id is extracted from JWT token.

    Args:
        feature_name: Name of the feature used
        session_id: Session identifier
        success: Whether feature usage was successful
        properties: Additional feature-specific properties
        error_message: Error message if usage failed
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        EventResponse with status and usage_id
    """
    try:
        # Extract user_id from authenticated user (secure)
        user_id = user.id if user else None

        # Get appropriate Supabase client
        if user:
            client = get_user_db_client(user)
        else:
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Track feature usage to database
        usage_data = {
            "user_id": user_id,
            "session_id": session_id,
            "feature_name": feature_name,
            "feature_version": properties.get("feature_version")
            if properties
            else None,
            "properties": properties or {},
            "success": success,
            "error_message": error_message,
            "created_at": datetime.now(UTC).isoformat(),
        }

        result = client.table("feature_usage").insert(usage_data).execute()
        usage_id = result.data[0]["id"] if result.data else None

        logger.info(
            f"Tracked feature usage: {feature_name} "
            f"(user: {user_id}, success: {success})"
        )

        return EventResponse(
            status="success",
            event_id=usage_id,
            message=f"Feature usage '{feature_name}' tracked successfully",
        )

    except Exception as e:
        logger.error(f"Failed to track feature usage: {e}")
        return EventResponse(
            status="failed",
            event_id=None,
            message=f"Failed to track feature usage: {e!s}",
        )


@router.get("/session/{session_id}", response_model=SessionSummary)
async def get_session_summary(
    session_id: str, user: AuthenticatedUser | None = Depends(get_optional_user)
):
    """
    Get analytics summary for a specific session.

    Returns statistics about the session including:
    - Event counts
    - Search queries
    - Documents viewed
    - Session duration

    If authenticated, only returns data for the user's own sessions.
    Anonymous users can only query their current session.

    Args:
        session_id: Session identifier
        user: Authenticated user (optional, extracted from JWT token)

    Returns:
        SessionSummary with session statistics
    """
    try:
        # Get appropriate Supabase client
        if user:
            client = get_user_db_client(user)
        else:
            from app.core.auth_jwt import get_admin_supabase_client

            client = get_admin_supabase_client()

        # Get all events for this session
        query = client.table("events").select("*").eq("session_id", session_id)

        # If authenticated, filter by user_id for security
        if user:
            query = query.eq("user_id", user.id)

        events = query.order("created_at").execute()

        if not events.data:
            raise HTTPException(
                status_code=404, detail=f"No data found for session: {session_id}"
            )

        # Calculate statistics
        events_count = len(events.data)
        searches_count = sum(
            1 for e in events.data if "search" in e["event_name"].lower()
        )
        documents_viewed = sum(
            1 for e in events.data if "document_viewed" in e["event_name"]
        )

        first_event = events.data[0]
        last_event = events.data[-1]

        started_at = first_event["created_at"]
        ended_at = last_event["created_at"]

        # Calculate duration
        start_time = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(ended_at.replace("Z", "+00:00"))
        duration_seconds = int((end_time - start_time).total_seconds())

        return SessionSummary(
            session_id=session_id,
            user_id=first_event.get("user_id"),
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=duration_seconds,
            events_count=events_count,
            searches_count=searches_count,
            documents_viewed=documents_viewed,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session summary: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve session summary: {e!s}"
        )


logger.info("Analytics module initialized")
