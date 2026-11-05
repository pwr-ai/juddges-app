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
from slowapi.middleware import _should_exempt
from slowapi.util import get_remote_address
from starlette.requests import (
    Request,  # noqa: TC002 - FastAPI resolves the dependency signature at runtime
)

if TYPE_CHECKING:
    from limits import RateLimitItem


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


def _router_backstop_enabled() -> bool:
    """Return True when ``RATE_LIMIT_ROUTER_BACKSTOP`` is set to a truthy value."""
    return os.getenv("RATE_LIMIT_ROUTER_BACKSTOP", "false").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def enforce_default_rate_limits(request: Request) -> None:
    """Charge ``default_limits`` for routes ``SlowAPIMiddleware`` cannot see (#574).

    On the pinned FastAPI, ``include_router`` registers an ``_IncludedRouter``
    on ``app.routes`` instead of copying the prefixed routes, and slowapi's
    middleware route lookup cannot match through it: every router-mounted
    route was silently exempt from ``DEFAULT_RATE_LIMITS``. A dependency runs
    after routing, so ``scope["route"]`` already names the real endpoint
    whatever the mounting style.

    Registered app-wide (``FastAPI(dependencies=...)``), it reaches every
    ``APIRoute``, including ones the middleware already charged; those are
    skipped (the middleware leaves ``request.state.view_rate_limit``), as are
    routes with their own ``@limiter.limit`` (same rule as the middleware: an
    explicit limit replaces the defaults) and ``@limiter.exempt`` routes.

    Inert unless ``RATE_LIMIT_ROUTER_BACKSTOP=true``: the backstop keys on
    ``get_client_ip``, and BFF routes that do not yet forward
    ``X-RateLimit-Identity`` would put every pilot user in the frontend
    container's single bucket (#565). Enable it once that propagation lands.

    A plain ``def`` on purpose: the limit check is blocking storage I/O
    (Redis), so FastAPI runs it in the threadpool rather than on the loop.
    """
    if not _router_backstop_enabled():
        return

    app_limiter: Limiter | None = getattr(request.app.state, "limiter", None)
    if app_limiter is None or not app_limiter.enabled:
        return

    # Already charged by SlowAPIMiddleware (a route registered directly on app).
    if getattr(request.state, "view_rate_limit", None) is not None:
        return

    handler = getattr(request.scope.get("route"), "endpoint", None)
    if _should_exempt(app_limiter, handler):
        return

    # Raises RateLimitExceeded -> the app's handler renders the 429.
    app_limiter._check_request_limit(request, handler, True)


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


def test_with_fallback(
    limiter_instance: MovingWindowRateLimiter,
    item: RateLimitItem,
    *identifiers: str,
) -> bool:
    """Check ``item`` without consuming budget, with ``hit_with_fallback``'s fallback.

    Returns True while the bucket still has room. A non-consuming check is
    needed where the caller must know whether an identifier is already over
    budget *before* doing expensive work, and only charges the bucket
    afterwards if that work fails: the MCP transport asks whether an IP has
    spent its rejected-key budget before spending a database round trip on
    key resolution.

    On a storage error this degrades to the same process-local limiter as
    ``hit_with_fallback``, so a Redis outage neither fails open nor closed.
    """
    try:
        return limiter_instance.test(item, *identifiers)
    except Exception:
        logger.warning(
            "Rate limit storage unreachable - falling back to in-memory limiter"
        )
        return _fallback_limiter.test(item, *identifiers)


# The name matches pytest's ``test_*`` pattern; without this, importing it into
# a test module would make pytest collect it as a test.
test_with_fallback.__test__ = False  # type: ignore[attr-defined]
