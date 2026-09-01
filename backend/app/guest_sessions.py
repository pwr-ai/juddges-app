"""
Guest Session Management Module

Handles anonymous user sessions, rate limiting, and conversion to registered users.
Tracks guest usage for search queries and feature access.

Author: Juddges Backend Team
Date: 2025-10-09
"""

import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

import redis.asyncio as redis
from fastapi import APIRouter, Cookie, HTTPException, Response
from loguru import logger
from pydantic import BaseModel, Field

# Environment detection for secure cookies
IS_PRODUCTION = os.getenv("PYTHON_ENV", "development") == "production"

# Redis client for session storage (sessions expire after 24 hours)
redis_client: redis.Redis | None = None


def get_redis_client():
    """Get or create Redis client for session management."""
    global redis_client
    if redis_client is None:
        import os

        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_password = os.getenv("REDIS_AUTH")

        redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_password,
            db=1,  # Use separate DB for sessions
            decode_responses=True,
        )
        logger.info(
            f"Initialized Redis client for guest sessions: {redis_host}:{redis_port}"
        )

    return redis_client


# Router configuration
router = APIRouter(prefix="/api/guest", tags=["Guest Sessions"])


# ===== Models =====


class GuestSessionResponse(BaseModel):
    """Response model for guest session creation."""

    session_id: str = Field(
        description="Unique session identifier (UUID)",
        examples=["550e8400-e29b-41d4-a716-446655440000"],
    )
    expires_at: str = Field(
        description="Session expiration timestamp (ISO 8601)",
        examples=["2025-10-10T12:00:00Z"],
    )
    message: str = Field(description="Welcome message for guest user")


class GuestUsageResponse(BaseModel):
    """Response model for guest usage tracking."""

    session_id: str = Field(description="Guest session ID")
    searches_used: int = Field(
        description="Number of searches performed in this session", examples=[3]
    )
    searches_remaining: int = Field(
        description="Number of searches remaining (5 max for guests)", examples=[2]
    )
    limit_reached: bool = Field(description="Whether the usage limit has been reached")
    expires_at: str = Field(description="Session expiration timestamp (ISO 8601)")
    upgrade_message: str | None = Field(
        default=None,
        description="Message prompting user to upgrade (shown when limit is close)",
    )


class ConvertGuestRequest(BaseModel):
    """Request model for converting guest to registered user."""

    session_id: str = Field(description="Guest session ID to migrate")
    user_id: str = Field(description="New registered user ID (from Supabase Auth)")
    email: str = Field(description="User email address")


class ConvertGuestResponse(BaseModel):
    """Response model for guest conversion."""

    status: str = Field(
        description="Conversion status (success, failed, session_not_found)"
    )
    user_id: str = Field(description="Registered user ID")
    searches_migrated: int = Field(
        description="Number of searches migrated from guest session"
    )
    message: str = Field(description="Status message")


# ===== Constants =====

GUEST_SEARCH_LIMIT = 5  # Free searches per guest session
SESSION_EXPIRY_HOURS = 24  # Sessions expire after 24 hours
UPGRADE_WARNING_THRESHOLD = 2  # Show upgrade message when 2 searches remain


# ===== Helper Functions =====


async def get_or_create_guest_session(
    session_id: str | None = Cookie(None, alias="guest_session_id"),
) -> str:
    """
    Get existing guest session or create a new one.

    Args:
        session_id: Optional existing session ID from cookie

    Returns:
        session_id: Valid guest session ID
    """
    client = get_redis_client()

    # Check if existing session is valid
    if session_id:
        exists = await client.exists(f"guest:session:{session_id}")
        if exists:
            logger.debug(f"Found existing guest session: {session_id}")
            return session_id

    # Create new session
    session_id = str(uuid.uuid4())
    session_key = f"guest:session:{session_id}"

    # Initialize session data
    session_data = {
        "searches_used": "0",
        "created_at": datetime.now(UTC).isoformat(),
        "last_activity": datetime.now(UTC).isoformat(),
    }

    # Store session with expiry (24 hours)
    expiry_seconds = SESSION_EXPIRY_HOURS * 3600
    await client.hset(session_key, mapping=session_data)
    await client.expire(session_key, expiry_seconds)

    logger.info(f"Created new guest session: {session_id}")
    return session_id


async def get_guest_usage(session_id: str) -> dict:
    """
    Get usage statistics for a guest session.

    Args:
        session_id: Guest session ID

    Returns:
        dict with usage statistics

    Raises:
        HTTPException: If session not found
    """
    client = get_redis_client()
    session_key = f"guest:session:{session_id}"

    # Check if session exists
    exists = await client.exists(session_key)
    if not exists:
        raise HTTPException(
            status_code=404, detail=f"Guest session not found or expired: {session_id}"
        )

    # Get session data
    data = await client.hgetall(session_key)
    searches_used = int(data.get("searches_used", 0))

    # Get TTL for expiration time
    ttl = await client.ttl(session_key)
    expires_at = datetime.now(UTC) + timedelta(seconds=ttl)

    return {
        "session_id": session_id,
        "searches_used": searches_used,
        "searches_remaining": max(0, GUEST_SEARCH_LIMIT - searches_used),
        "limit_reached": searches_used >= GUEST_SEARCH_LIMIT,
        "expires_at": expires_at.isoformat(),
    }


async def increment_guest_search_count(session_id: str) -> bool:
    """
    Increment search count for guest session and check if limit reached.

    Args:
        session_id: Guest session ID

    Returns:
        bool: True if within limit, False if limit exceeded
    """
    client = get_redis_client()
    session_key = f"guest:session:{session_id}"

    # Update last activity
    await client.hset(session_key, "last_activity", datetime.now(UTC).isoformat())

    # Increment search count
    searches_used = await client.hincrby(session_key, "searches_used", 1)

    # Re-assert the TTL. ``hset``/``hincrby`` recreate a hash that expired
    # between the quota check and this charge, and a recreated key carries no
    # expiry — it would leak forever on the Redis that also backs Celery
    # (issue #565).
    await client.expire(session_key, SESSION_EXPIRY_HOURS * 3600)

    logger.info(
        f"Guest session {session_id} used {searches_used}/{GUEST_SEARCH_LIMIT} searches"
    )

    return searches_used <= GUEST_SEARCH_LIMIT


# ===== API Endpoints =====


@router.post("/session", response_model=GuestSessionResponse)
async def create_guest_session(response: Response):
    """
    Create a new guest session for anonymous users.

    Sets a cookie with the session ID that expires in 24 hours.
    Allows 5 free searches before prompting for registration.

    Returns:
        GuestSessionResponse with session ID and expiration
    """
    try:
        session_id = await get_or_create_guest_session()

        # Set cookie (HttpOnly for security, SameSite=Lax for CSRF protection)
        expires = datetime.now(UTC) + timedelta(hours=SESSION_EXPIRY_HOURS)
        response.set_cookie(
            key="guest_session_id",
            value=session_id,
            expires=expires.isoformat(),
            httponly=True,
            samesite="lax",
            secure=IS_PRODUCTION,  # Secure cookies in production (HTTPS only)
        )

        return GuestSessionResponse(
            session_id=session_id,
            expires_at=expires.isoformat(),
            message="Guest session created. You have 5 free searches. Register for unlimited access!",
        )

    except Exception as e:
        logger.error(f"Failed to create guest session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create guest session")


@router.get("/usage", response_model=GuestUsageResponse)
async def get_guest_usage_endpoint(
    session_id: str = Cookie(None, alias="guest_session_id"),
):
    """
    Check guest session usage limits.

    Returns number of searches used/remaining and whether limit is reached.
    Shows upgrade message when 2 or fewer searches remain.

    Args:
        session_id: Guest session ID (from cookie)

    Returns:
        GuestUsageResponse with usage statistics
    """
    if not session_id:
        raise HTTPException(
            status_code=400, detail="No guest session found. Create a session first."
        )

    try:
        usage = await get_guest_usage(session_id)

        # Add upgrade message if approaching limit
        upgrade_message = None
        if usage["searches_remaining"] <= UPGRADE_WARNING_THRESHOLD:
            upgrade_message = (
                f"You have {usage['searches_remaining']} searches remaining. "
                "Register now for unlimited searches and advanced features!"
            )

        return GuestUsageResponse(**usage, upgrade_message=upgrade_message)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get guest usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve guest usage")


@router.post("/convert", response_model=ConvertGuestResponse)
async def convert_guest_to_user(request: ConvertGuestRequest):
    """
    Convert guest session to registered user account.

    Migrates search history and resets usage limits.
    Called after successful user registration.

    Args:
        request: Conversion request with session_id and new user_id

    Returns:
        ConvertGuestResponse with migration status
    """
    try:
        client = get_redis_client()
        session_key = f"guest:session:{request.session_id}"

        # Check if session exists
        exists = await client.exists(session_key)
        if not exists:
            return ConvertGuestResponse(
                status="session_not_found",
                user_id=request.user_id,
                searches_migrated=0,
                message="Guest session not found or expired. No data to migrate.",
            )

        # Get session data
        data = await client.hgetall(session_key)
        searches_used = int(data.get("searches_used", 0))

        # TODO: Migrate search history to user account in Supabase
        # This would involve:
        # 1. Query search_queries table for guest session
        # 2. Update records with new user_id
        # 3. Delete guest session

        # For now, just log the migration
        logger.info(
            f"Converting guest session {request.session_id} to user {request.user_id}. "
            f"Migrating {searches_used} searches."
        )

        # Delete guest session
        await client.delete(session_key)

        return ConvertGuestResponse(
            status="success",
            user_id=request.user_id,
            searches_migrated=searches_used,
            message=f"Successfully converted guest to user. Migrated {searches_used} searches.",
        )

    except Exception as e:
        logger.error(f"Failed to convert guest to user: {e}")
        return ConvertGuestResponse(
            status="failed",
            user_id=request.user_id,
            searches_migrated=0,
            message=f"Failed to convert guest session: {e!s}",
        )


@router.delete("/session")
async def delete_guest_session(
    session_id: str | None = Cookie(None, alias="guest_session_id"),
    response: Response = None,
):
    """
    Delete a guest session.

    Removes session data from Redis and clears cookie.
    Used when user explicitly logs out or session is no longer needed.

    Args:
        session_id: Guest session ID (from cookie)
        response: FastAPI response object to clear cookie

    Returns:
        Success message
    """
    if not session_id:
        raise HTTPException(status_code=400, detail="No guest session found")

    try:
        client = get_redis_client()
        session_key = f"guest:session:{session_id}"

        # Delete session
        await client.delete(session_key)

        # Clear cookie with same security attributes as set_cookie
        if response:
            response.delete_cookie(
                key="guest_session_id",
                httponly=True,
                samesite="lax",
                secure=IS_PRODUCTION,
            )

        logger.info(f"Deleted guest session: {session_id}")

        return {
            "status": "success",
            "message": f"Guest session {session_id} deleted successfully",
        }

    except Exception as e:
        logger.error(f"Failed to delete guest session: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete guest session")


# ===== Anonymous Search Quota (issue #510) =====


class GuestQuota(NamedTuple):
    """A guest's standing with the anonymous-search allowance.

    ``enforced`` is False when the quota could not be evaluated — Redis is not
    configured, or it is unreachable. Callers must treat that as "allow": the
    corpus is public court rulings, so a session store outage should degrade the
    free-search counter, not the ability to search. Scripted abuse is bounded by
    the per-IP limiter in ``app.rate_limiter``, which is independent of Redis.
    """

    session_id: str | None
    searches_remaining: int
    limit_reached: bool
    enforced: bool


def _unenforced_quota(session_id: str | None = None) -> GuestQuota:
    return GuestQuota(
        session_id=session_id,
        searches_remaining=GUEST_SEARCH_LIMIT,
        limit_reached=False,
        enforced=False,
    )


def guest_quota_configured() -> bool:
    """Return True when a Redis host is configured to hold guest counters.

    Mirrors ``app.rate_limiter.build_rate_limit_storage_uri``: an unset
    ``REDIS_HOST`` means no shared store, so the quota stays inert rather than
    dialling localhost on every anonymous search.
    """
    return bool(os.getenv("REDIS_HOST", "").strip())


async def open_guest_search_quota(session_id: str | None) -> GuestQuota:
    """Resolve a guest's session and remaining allowance without charging it.

    A missing, expired, or forged session id yields a fresh session with the
    full allowance — the counter is keyed on a cookie the visitor controls, so
    this is friction, not an access-control decision.
    """
    if not guest_quota_configured():
        return _unenforced_quota()

    try:
        resolved_id = await get_or_create_guest_session(session_id)
        usage = await get_guest_usage(resolved_id)
    except Exception as exc:
        logger.warning(f"Guest search quota unavailable, allowing search: {exc}")
        return _unenforced_quota()

    return GuestQuota(
        session_id=resolved_id,
        searches_remaining=usage["searches_remaining"],
        limit_reached=usage["limit_reached"],
        enforced=True,
    )


async def charge_guest_search(session_id: str | None) -> int:
    """Charge one search against a guest session and return searches remaining.

    Called only after a search actually returned, so a failing upstream never
    costs the visitor part of their allowance.
    """
    if not session_id or not guest_quota_configured():
        return GUEST_SEARCH_LIMIT

    try:
        await increment_guest_search_count(session_id)
        usage = await get_guest_usage(session_id)
    except Exception as exc:
        logger.warning(f"Failed to charge guest search {session_id}: {exc}")
        return GUEST_SEARCH_LIMIT

    return usage["searches_remaining"]


def guest_limit_exceeded_error() -> HTTPException:
    """The 429 a guest receives once the free-search allowance is spent."""
    return HTTPException(
        status_code=429,
        detail={
            "error": "Rate limit exceeded",
            "message": (
                f"You've reached the limit of {GUEST_SEARCH_LIMIT} free searches. "
                "Please register for unlimited access."
            ),
            "searches_used": GUEST_SEARCH_LIMIT,
            "limit": GUEST_SEARCH_LIMIT,
            "upgrade_url": "/auth/sign-up",
        },
    )


# ===== Middleware Helper =====


async def check_guest_rate_limit(
    session_id: str | None = Cookie(None, alias="guest_session_id"),
) -> tuple[str | None, bool]:
    """FastAPI dependency form of the quota check.

    Delegates to :func:`open_guest_search_quota` so there is one implementation
    of the allowance rule.

    Returns:
        tuple: (session_id, within_limit)

    Raises:
        HTTPException: 429 when the allowance is spent.
    """
    quota = await open_guest_search_quota(session_id)
    if quota.limit_reached:
        raise guest_limit_exceeded_error()
    return quota.session_id, True
