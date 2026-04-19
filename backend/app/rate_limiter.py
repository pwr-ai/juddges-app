"""Shared SlowAPI limiter configuration for the backend application."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from slowapi import Limiter
from slowapi.util import get_remote_address

if TYPE_CHECKING:
    from starlette.requests import Request


def _is_trusted_proxy() -> bool:
    """Return True when TRUSTED_PROXY env var is set to a truthy value."""
    return os.getenv("TRUSTED_PROXY", "false").strip().lower() in ("1", "true", "yes")


def get_client_ip(request: Request) -> str:
    """Resolve the real client IP for rate-limit keying.

    When ``TRUSTED_PROXY=true`` the leftmost address in ``X-Forwarded-For``
    (the original client) is used.  The leftmost value is chosen because
    each proxy *appends* its own view of the client; only the first entry
    was written by the actual client-facing proxy and cannot be spoofed by
    downstream hops when the outermost proxy is trusted.

    When ``TRUSTED_PROXY=false`` (the default) the raw socket address is
    used, which is the safe behaviour for direct-to-internet deployments.
    """
    if _is_trusted_proxy():
        forwarded_for = request.headers.get("X-Forwarded-For", "").strip()
        if forwarded_for:
            # Take the *leftmost* (client) address; strip whitespace.
            client_ip = forwarded_for.split(",")[0].strip()
            if client_ip:
                return client_ip

        real_ip = request.headers.get("X-Real-IP", "").strip()
        if real_ip:
            return real_ip

    return get_remote_address(request)


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
    key_func=get_client_ip,
    default_limits=DEFAULT_RATE_LIMITS,
    storage_uri=RATE_LIMIT_STORAGE_URI,
    # Fall back to process-local limits if Redis storage is unavailable.
    in_memory_fallback=DEFAULT_RATE_LIMITS,
    in_memory_fallback_enabled=True,
    # Emit X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers.
    headers_enabled=True,
)
