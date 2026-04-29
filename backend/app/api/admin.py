"""
Admin API Endpoints

Provides admin-only endpoints for the admin panel UI.
All endpoints require admin role via the require_admin dependency.

Author: Juddges Backend Team
Date: 2026-02-23
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from loguru import logger
from pydantic import BaseModel, Field
from supabase import PostgrestAPIError, StorageException

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    require_admin,
)

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ===== Response Models =====


class PlatformStats(BaseModel):
    """Platform-wide overview statistics."""

    total_users: int = Field(description="Total registered users")
    total_documents: int = Field(description="Total documents in the platform")
    searches_today: int = Field(description="Number of searches performed today")
    active_sessions_24h: int = Field(description="Unique sessions active in last 24h")
    documents_added_this_week: int = Field(
        description="Documents added in the last 7 days"
    )


class UserListItem(BaseModel):
    """Single user entry in the admin user list."""

    id: str
    email: str | None = None
    created_at: str | None = None
    last_sign_in_at: str | None = None
    app_metadata: dict[str, Any] = Field(default_factory=dict)


class UserListResponse(BaseModel):
    """Paginated list of users."""

    users: list[UserListItem]
    page: int
    per_page: int
    total: int | None = None


class ActivityLogEntry(BaseModel):
    """Single activity log entry from the audit_logs table."""

    id: str
    user_id: str | None = None
    action_type: str | None = None
    created_at: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    session_id: str | None = None


class SearchQueryEntry(BaseModel):
    """Single search query entry."""

    id: str
    user_id: str | None = None
    session_id: str | None = None
    query: str | None = None
    result_count: int | None = None
    filters: dict[str, Any] | None = None
    duration_ms: int | None = None
    created_at: str | None = None


class SearchQueriesResponse(BaseModel):
    """Paginated search query response."""

    queries: list[SearchQueryEntry] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    limit: int = 50


class DocumentStats(BaseModel):
    """Aggregated document statistics."""

    total: int = Field(default=0, description="Total number of documents")
    by_type: dict[str, int] = Field(default_factory=dict)
    by_country: dict[str, int] = Field(default_factory=dict)
    by_language: dict[str, int] = Field(default_factory=dict)
    added_this_week: int = Field(
        default=0, description="Documents added in the last 7 days"
    )


class ServiceHealthEntry(BaseModel):
    """Health status of a single service."""

    name: str
    status: str
    message: str | None = None
    error: str | None = None
    response_time_ms: float | None = None


class SystemHealthResponse(BaseModel):
    """Health status of all platform services."""

    status: str = "healthy"
    services: dict[str, ServiceHealthEntry] = Field(default_factory=dict)
    checked_at: str = ""


class ContentStats(BaseModel):
    """Blog/content statistics."""

    total_posts: int = 0
    published: int = 0
    drafts: int = 0
    total_views: int = 0


# ===== Endpoints =====


@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(
    admin: AuthenticatedUser = Depends(require_admin),
) -> PlatformStats:
    """
    Get platform-wide overview statistics.

    Returns aggregate counts for users, documents, searches, and active sessions.
    Individual sub-queries fail gracefully, returning zero on error.
    """
    client = get_admin_supabase_client()
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    last_24h = datetime.now(UTC) - timedelta(hours=24)
    last_week = datetime.now(UTC) - timedelta(days=7)

    # Total users via Supabase Auth Admin API
    # NOTE: gotrue-py does not expose a direct count endpoint. We paginate
    # through pages of users until we get an incomplete page or hit a safety
    # limit. If the limit is reached, a warning is logged because the count
    # may be an undercount.
    _USER_PAGE_SIZE = 1000
    _MAX_PAGES = 20  # Safety limit: up to 20,000 users before warning
    total_users = 0
    try:
        page = 1
        while page <= _MAX_PAGES:
            users_response = client.auth.admin.list_users(
                page=page, per_page=_USER_PAGE_SIZE
            )
            if isinstance(users_response, list):
                batch_size = len(users_response)
            else:
                # Some gotrue-py versions return an object with .users attribute
                users_list = getattr(users_response, "users", users_response)
                batch_size = len(users_list) if users_list else 0

            total_users += batch_size

            # If we got fewer than a full page, we have reached the end
            if batch_size < _USER_PAGE_SIZE:
                break
            page += 1
        else:
            # Reached safety limit -- count may be truncated
            logger.warning(
                f"Admin stats: user count reached pagination limit "
                f"({_MAX_PAGES} pages x {_USER_PAGE_SIZE}). "
                f"Reported count ({total_users}) may be an undercount."
            )
    except Exception as e:
        # Broad catch: gotrue-py auth admin API may raise arbitrary exceptions
        # depending on version and network conditions.
        logger.warning(f"Admin stats: could not fetch user count: {e}")

    # Total documents
    total_documents = 0
    try:
        docs_response = (
            client.table("legal_documents")
            .select("document_id", count="exact")
            .execute()
        )
        total_documents = docs_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin stats: could not fetch document count: {e}")

    # Searches today
    searches_today = 0
    try:
        searches_response = (
            client.table("search_queries")
            .select("id", count="exact")
            .gte("created_at", today_start.isoformat())
            .execute()
        )
        searches_today = searches_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin stats: could not fetch searches_today: {e}")

    # Active sessions in last 24h (distinct session_id in events table)
    active_sessions_24h = 0
    try:
        events_response = (
            client.table("events")
            .select("session_id")
            .gte("created_at", last_24h.isoformat())
            .not_.is_("session_id", "null")
            .execute()
        )
        if events_response.data:
            active_sessions_24h = len(
                {
                    row["session_id"]
                    for row in events_response.data
                    if row.get("session_id")
                }
            )
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin stats: could not fetch active sessions: {e}")

    # Documents added this week
    documents_added_this_week = 0
    try:
        recent_response = (
            client.table("legal_documents")
            .select("document_id", count="exact")
            .gte("ingestion_date", last_week.isoformat())
            .execute()
        )
        documents_added_this_week = recent_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin stats: could not fetch documents_added_this_week: {e}")

    logger.info(
        f"Admin stats fetched by {admin.email}: "
        f"users={total_users}, docs={total_documents}, "
        f"searches_today={searches_today}"
    )

    return PlatformStats(
        total_users=total_users,
        total_documents=total_documents,
        searches_today=searches_today,
        active_sessions_24h=active_sessions_24h,
        documents_added_this_week=documents_added_this_week,
    )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    per_page: int = Query(default=20, ge=1, le=100, description="Users per page"),
    admin: AuthenticatedUser = Depends(require_admin),
) -> UserListResponse:
    """
    List all platform users with pagination.

    Uses the Supabase Auth Admin API, which bypasses RLS.
    Returns user id, email, created_at, last_sign_in_at, and app_metadata.
    """
    client = get_admin_supabase_client()

    try:
        users_response = client.auth.admin.list_users(page=page, per_page=per_page)

        # gotrue-py may return a plain list or an object depending on version
        if isinstance(users_response, list):
            raw_users = users_response
        else:
            raw_users = getattr(users_response, "users", users_response) or []

        users: list[UserListItem] = []
        for u in raw_users:
            # Each user may be a dict or a model instance
            if hasattr(u, "model_dump"):
                u_dict = u.model_dump()
            elif hasattr(u, "__dict__"):
                u_dict = u.__dict__
            else:
                u_dict = dict(u)

            users.append(
                UserListItem(
                    id=str(u_dict.get("id", "")),
                    email=u_dict.get("email"),
                    created_at=str(u_dict.get("created_at", "")) or None,
                    last_sign_in_at=str(u_dict.get("last_sign_in_at", "")) or None,
                    app_metadata=u_dict.get("app_metadata") or {},
                )
            )

        logger.info(
            f"Admin user list fetched by {admin.email}: page={page}, count={len(users)}"
        )

        return UserListResponse(users=users, page=page, per_page=per_page)

    except Exception as e:
        # Broad catch: gotrue-py list_users raises arbitrary exceptions across
        # versions; no stable base exception class is exposed publicly.
        logger.error(f"Admin list_users failed: {e}")
        return UserListResponse(users=[], page=page, per_page=per_page)


@router.get("/activity", response_model=list[ActivityLogEntry])
async def get_recent_activity(
    limit: int = Query(
        default=20, ge=1, le=100, description="Number of entries to return"
    ),
    admin: AuthenticatedUser = Depends(require_admin),
) -> list[ActivityLogEntry]:
    """
    Get recent platform-wide activity from the audit_logs table.

    Returns all users' activity ordered by most recent first.
    """
    client = get_admin_supabase_client()

    try:
        response = (
            client.table("audit_logs")
            .select(
                "id, user_id, action_type, created_at, resource_type, resource_id, session_id"
            )
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        entries: list[ActivityLogEntry] = []
        for row in response.data or []:
            entries.append(
                ActivityLogEntry(
                    id=str(row.get("id", "")),
                    user_id=row.get("user_id"),
                    action_type=row.get("action_type"),
                    created_at=row.get("created_at"),
                    resource_type=row.get("resource_type"),
                    resource_id=row.get("resource_id"),
                    session_id=row.get("session_id"),
                )
            )

        logger.info(f"Admin activity fetched by {admin.email}: {len(entries)} entries")
        return entries

    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin get_recent_activity failed: {e}")
        return []


@router.get("/search-queries", response_model=SearchQueriesResponse)
async def get_search_queries(
    limit: int = Query(
        default=50, ge=1, le=200, description="Number of queries to return"
    ),
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    admin: AuthenticatedUser = Depends(require_admin),
) -> SearchQueriesResponse:
    """
    Get recent search queries across all users.

    Returns queries ordered by most recent first with optional pagination.
    """
    client = get_admin_supabase_client()
    offset = (page - 1) * limit

    # Get total count
    total = 0
    try:
        count_response = (
            client.table("search_queries").select("id", count="exact").execute()
        )
        total = count_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin search queries count failed: {e}")

    try:
        response = (
            client.table("search_queries")
            .select(
                "id, user_id, session_id, query, result_count, filters, duration_ms, created_at"
            )
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        entries: list[SearchQueryEntry] = []
        for row in response.data or []:
            entries.append(
                SearchQueryEntry(
                    id=str(row.get("id", "")),
                    user_id=row.get("user_id"),
                    session_id=row.get("session_id"),
                    query=row.get("query"),
                    result_count=row.get("result_count"),
                    filters=row.get("filters"),
                    duration_ms=row.get("duration_ms"),
                    created_at=row.get("created_at"),
                )
            )

        logger.info(
            f"Admin search queries fetched by {admin.email}: page={page}, count={len(entries)}"
        )
        return SearchQueriesResponse(
            queries=entries, total=total, page=page, limit=limit
        )

    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin get_search_queries failed: {e}")
        return SearchQueriesResponse(queries=[], total=0, page=page, limit=limit)


@router.get("/documents/stats", response_model=DocumentStats)
async def get_document_stats(
    admin: AuthenticatedUser = Depends(require_admin),
) -> DocumentStats:
    """
    Get document statistics grouped by type, country, and language.

    Queries the doc_type_stats pre-computed table for type counts, and
    legal_documents for country/language breakdowns and recent additions.
    """
    client = get_admin_supabase_client()
    last_week = datetime.now(UTC) - timedelta(days=7)

    # Total documents
    total = 0
    try:
        total_response = (
            client.table("legal_documents")
            .select("document_id", count="exact")
            .execute()
        )
        total = total_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin doc stats: could not fetch total: {e}")

    # Counts by type from doc_type_stats (return as dict)
    by_type: dict[str, int] = {}
    try:
        stats_response = (
            client.table("doc_type_stats").select("doc_type, count").execute()
        )
        for row in stats_response.data or []:
            doc_type = row.get("doc_type", "unknown")
            if doc_type != "TOTAL":
                by_type[doc_type] = row.get("count", 0)
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin doc stats: could not fetch doc_type_stats: {e}")

    # Counts by country (return as dict)
    by_country: dict[str, int] = {}
    try:
        country_response = client.table("legal_documents").select("country").execute()
        for row in country_response.data or []:
            country = row.get("country") or "unknown"
            by_country[country] = by_country.get(country, 0) + 1
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin doc stats: could not fetch country breakdown: {e}")

    # Counts by language (return as dict)
    by_language: dict[str, int] = {}
    try:
        lang_response = client.table("legal_documents").select("language").execute()
        for row in lang_response.data or []:
            lang = row.get("language") or "unknown"
            by_language[lang] = by_language.get(lang, 0) + 1
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin doc stats: could not fetch language breakdown: {e}")

    # Recent additions
    added_this_week = 0
    try:
        recent_response = (
            client.table("legal_documents")
            .select("document_id", count="exact")
            .gte("ingestion_date", last_week.isoformat())
            .execute()
        )
        added_this_week = recent_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin doc stats: could not fetch added_this_week: {e}")

    logger.info(f"Admin document stats fetched by {admin.email}")

    return DocumentStats(
        total=total,
        by_type=by_type,
        by_country=by_country,
        by_language=by_language,
        added_this_week=added_this_week,
    )


@router.get("/system/health", response_model=SystemHealthResponse)
async def get_system_health(
    admin: AuthenticatedUser = Depends(require_admin),
) -> SystemHealthResponse:
    """
    Get health status of all platform subsystems.

    Delegates to the shared check_all_services() function used by the
    public health endpoint, and returns results in a structured format.
    """
    # Lazy import to avoid module-level circular import chain through
    # app.health.__init__ -> app.health.router -> app.auth
    from app.health.checks import check_all_services

    try:
        services_health = await check_all_services()
    except Exception as e:
        # Broad catch: check_all_services() probes multiple external systems
        # (database, Redis, OpenAI) which may raise arbitrary exceptions.
        logger.error(f"Admin system health check failed: {e}")
        services_health = {}

    services: dict[str, ServiceHealthEntry] = {}
    for name, health in services_health.items():
        if hasattr(health, "model_dump"):
            h = health.model_dump()
        elif hasattr(health, "__dict__"):
            h = health.__dict__
        else:
            h = dict(health)

        raw_status = h.get("status", "unknown")
        # ServiceStatus is a str enum; .value gives "healthy", "degraded", etc.
        status_str = (
            raw_status.value if hasattr(raw_status, "value") else str(raw_status)
        )
        services[name] = ServiceHealthEntry(
            name=h.get("name", name),
            status=status_str,
            message=h.get("message"),
            error=h.get("error"),
            response_time_ms=h.get("response_time_ms"),
        )

    # Derive overall status from individual services
    statuses = {s.status for s in services.values()}
    if "unhealthy" in statuses:
        overall_status = "unhealthy"
    elif "degraded" in statuses:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    logger.info(
        f"Admin system health fetched by {admin.email}: {len(services)} services"
    )

    return SystemHealthResponse(
        status=overall_status,
        services=services,
        checked_at=datetime.now(UTC).isoformat(),
    )


@router.get("/content/stats", response_model=ContentStats)
async def get_content_stats(
    admin: AuthenticatedUser = Depends(require_admin),
) -> ContentStats:
    """
    Get blog/content statistics.

    Returns total posts, published count, draft count, and total views
    aggregated from the blog_posts table.
    """
    client = get_admin_supabase_client()

    total_posts = 0
    published_count = 0
    draft_count = 0
    total_views = 0

    try:
        # Total posts
        total_response = (
            client.table("blog_posts").select("id", count="exact").execute()
        )
        total_posts = total_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin content stats: could not fetch total_posts: {e}")

    try:
        # Published posts
        pub_response = (
            client.table("blog_posts")
            .select("id", count="exact")
            .eq("status", "published")
            .execute()
        )
        published_count = pub_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin content stats: could not fetch published_count: {e}")

    try:
        # Draft posts
        draft_response = (
            client.table("blog_posts")
            .select("id", count="exact")
            .eq("status", "draft")
            .execute()
        )
        draft_count = draft_response.count or 0
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin content stats: could not fetch draft_count: {e}")

    try:
        # Total views (sum of views column)
        views_response = client.table("blog_posts").select("views").execute()
        total_views = sum(row.get("views", 0) or 0 for row in views_response.data or [])
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Admin content stats: could not fetch total_views: {e}")

    logger.info(
        f"Admin content stats fetched by {admin.email}: "
        f"total={total_posts}, published={published_count}, draft={draft_count}, views={total_views}"
    )

    return ContentStats(
        total_posts=total_posts,
        published=published_count,
        drafts=draft_count,
        total_views=total_views,
    )


logger.info("Admin API module initialized")
