"""Redis-backed session store for schema generation sessions.

Falls back to in-memory dict if Redis is unavailable.
"""

import json
from datetime import timedelta

from loguru import logger

SESSION_TTL = timedelta(hours=1)
SESSION_PREFIX = "schema_gen_session:"


class SessionStore:
    """Store for schema generation sessions using Redis with in-memory fallback."""

    def __init__(self, redis_client=None):
        self._redis = redis_client
        self._fallback: dict = {}

    async def get(self, session_id: str):
        """Get session data by ID."""
        if self._redis:
            try:
                data = await self._redis.get(f"{SESSION_PREFIX}{session_id}")
                if data:
                    return json.loads(data)
            except Exception:
                logger.opt(exception=True).warning("Redis get failed, trying fallback")
        return self._fallback.get(session_id)

    async def set(self, session_id: str, data, ttl: timedelta = SESSION_TTL):
        """Store session data with TTL."""
        if self._redis:
            try:
                await self._redis.setex(
                    f"{SESSION_PREFIX}{session_id}",
                    int(ttl.total_seconds()),
                    json.dumps(data, default=str),
                )
                return
            except Exception:
                logger.opt(exception=True).warning("Redis set failed, using fallback")
        self._fallback[session_id] = data

    async def delete(self, session_id: str):
        """Delete a session."""
        if self._redis:
            try:
                await self._redis.delete(f"{SESSION_PREFIX}{session_id}")
            except Exception:
                logger.opt(exception=True).warning("Redis delete failed")
        self._fallback.pop(session_id, None)

    async def exists(self, session_id: str) -> bool:
        """Check whether a session exists."""
        if self._redis:
            try:
                return bool(await self._redis.exists(f"{SESSION_PREFIX}{session_id}"))
            except Exception:
                logger.opt(exception=True).warning(
                    "Redis exists check failed, trying fallback"
                )
        return session_id in self._fallback
