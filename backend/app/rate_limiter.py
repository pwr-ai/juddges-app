"""Shared SlowAPI limiter configuration for the backend application."""

from __future__ import annotations

import os
import re
import secrets
from typing import TYPE_CHECKING

from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

if TYPE_CHECKING:
    from limits import RateLimitItem
    from starlette.requests import Request


_RATE_LIMIT_IDENTITY_PATTERN = re.compile(r"^[a-f0-9]{64}$")


def _get_verified_identity_key(request: Request) -> str | None:
    """Return a BFF-provided user quota key for an authenticated service call."""
    identity = request.headers.get("X-RateLimit-Identity", "").strip()
    expected_api_key = os.getenv("BACKEND_API_KEY", "")
    supplied_api_key = request.headers.get("X-API-Key", "")

    if (
        identity
        and _RATE_LIMIT_IDENTITY_PATTERN.fullmatch(identity)
        and expected_api_key
        and secrets.compare_digest(supplied_api_key, expected_api_key)
    ):
        return f"user:{identity}"
    return None


def _is_trusted_proxy() -> bool:
    """Return True when TRUSTED_PROXY env var is set to a truthy value."""
    return os.getenv("TRUSTED_PROXY", "false").strip().lower() in ("1", "true", "yes")


def get_client_ip(request: Request) -> str:
    """Resolve the per-user or real-client-IP rate-limit key.

    Requests from an API-key-authenticated BFF may provide an opaque user
    identity derived after Supabase authentication. This takes precedence over
    the proxy socket so different signed-in users receive independent quotas.

    When ``TRUSTED_PROXY=true`` the leftmost address in ``X-Forwarded-For``
    (the original client) is used.  The leftmost value is chosen because
    each proxy *appends* its own view of the client; only the first entry
    was written by the actual client-facing proxy and cannot be spoofed by
    downstream hops when the outermost proxy is trusted.

    When ``TRUSTED_PROXY=false`` (the default) the raw socket address is
    used, which is the safe behaviour for direct-to-internet deployments.
    """
    verified_identity = _get_verified_identity_key(request)
    if verified_identity:
        return verified_identity

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

# Process-local fallback for the callers below that talk to `limits` directly
# (LangServe LLM budget, invite-code redemption) rather than through the
# slowapi `Limiter` above, which already has its own fallback. A single
# module-level instance so the fallback keeps enforcing across calls within
# a process rather than resetting its counters on every hit.
_fallback_limiter = MovingWindowRateLimiter(MemoryStorage())


def hit_with_fallback(
    limiter_instance: MovingWindowRateLimiter,
    item: RateLimitItem,
    *identifiers: str,
) -> bool:
    """Hit ``limiter_instance``, degrading to an in-memory limiter on a storage error.

    A Redis outage must not fail open (unbounded OpenAI spend) or fail closed
    (an unrelated outage taking down chat/registration). This keeps enforcing
    the same limit against a process-local counter until storage recovers.
    """
    try:
        return limiter_instance.hit(item, *identifiers)
    except Exception:
        logger.warning(
            "Rate limit storage unreachable - falling back to in-memory limiter"
        )
        return _fallback_limiter.hit(item, *identifiers)
