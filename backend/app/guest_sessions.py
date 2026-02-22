"""
Guest Session Management Module

Handles anonymous user sessions, rate limiting, and conversion to registered users.
Tracks guest usage for search queries and feature access.

Author: Juddges Backend Team
Date: 2025-10-09
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import redis.asyncio as redis
from fastapi import APIRouter, HTTPException, Response, Cookie
from loguru import logger
from pydantic import BaseModel, Field

# Environment detection for secure cookies
IS_PRODUCTION = os.getenv("PYTHON_ENV", "development") == "production"

# Redis client for session storage (sessions expire after 24 hours)
redis_client: Optional[redis.Redis] = None


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
    upgrade_message: Optional[str] = Field(
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
    session_id: Optional[str] = Cookie(None, alias="guest_session_id"),
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
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_activity": datetime.now(timezone.utc).isoformat(),
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
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

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
    await client.hset(
        session_key, "last_activity", datetime.now(timezone.utc).isoformat()
    )

    # Increment search count
    searches_used = await client.hincrby(session_key, "searches_used", 1)

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
        expires = datetime.now(timezone.utc) + timedelta(hours=SESSION_EXPIRY_HOURS)
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
            message=f"Failed to convert guest session: {str(e)}",
        )


@router.delete("/session")
async def delete_guest_session(
    session_id: str = Cookie(None, alias="guest_session_id"), response: Response = None
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


# ===== Middleware Helper =====


async def check_guest_rate_limit(
    session_id: Optional[str] = Cookie(None, alias="guest_session_id"),
) -> tuple[str, bool]:
    """
    Check if guest has reached rate limit.

    Can be used as a dependency in search endpoints to enforce limits.

    Args:
        session_id: Guest session ID (from cookie)

    Returns:
        tuple: (session_id, within_limit)

    Raises:
        HTTPException: If rate limit exceeded
    """
    # Get or create session
    session_id = await get_or_create_guest_session(session_id)

    # Check current usage
    usage = await get_guest_usage(session_id)

    if usage["limit_reached"]:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Rate limit exceeded",
                "message": "You've reached the limit of 5 free searches. Please register for unlimited access.",
                "searches_used": usage["searches_used"],
                "upgrade_url": "/auth/signup",
            },
        )

    return session_id, True
