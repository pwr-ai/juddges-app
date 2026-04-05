"""Shared SlowAPI limiter configuration for the backend application."""

from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def build_rate_limit_storage_uri() -> str:
    """Build rate-limit storage URI with env override and Redis fallback."""
    explicit_uri = os.getenv("RATE_LIMIT_STORAGE_URI")
    if explicit_uri:
        return explicit_uri

    redis_host = os.getenv("REDIS_HOST", "").strip()
    if not redis_host:
        return "memory://"

    redis_port = os.getenv("REDIS_PORT", "6379")
    redis_auth = os.getenv("REDIS_AUTH", "")
    if redis_auth:
        return f"redis://:{redis_auth}@{redis_host}:{redis_port}"
    return f"redis://{redis_host}:{redis_port}"


RATE_LIMIT_STORAGE_URI = build_rate_limit_storage_uri()
DEFAULT_RATE_LIMITS = [
    os.getenv("DEFAULT_RATE_LIMIT_PER_MINUTE", "100 per minute"),
    os.getenv("DEFAULT_RATE_LIMIT_PER_HOUR", "1000 per hour"),
]

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=DEFAULT_RATE_LIMITS,
    storage_uri=RATE_LIMIT_STORAGE_URI,
    # Fall back to process-local limits if Redis storage is unavailable.
    in_memory_fallback=DEFAULT_RATE_LIMITS,
    in_memory_fallback_enabled=True,
    # Emit X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers.
    headers_enabled=True,
)
