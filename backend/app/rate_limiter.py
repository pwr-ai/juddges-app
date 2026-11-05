"""Shared SlowAPI limiter configuration for the backend application."""

from __future__ import annotations

import ipaddress
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

# Header the Next.js BFF uses to tell the backend which visitor a proxied
# anonymous request belongs to (issue #565). Honoured only alongside a matching
# ``X-API-Key``: without that, anyone could pick their own bucket.
RATE_LIMIT_CLIENT_IP_HEADER = "X-RateLimit-Client-IP"

# One IPv6 visitor usually holds a whole /64, so keying on the full address
# would let a single host rotate through 2**64 buckets.
_IPV6_BUCKET_PREFIX = 64


def _has_valid_service_key(request: Request) -> bool:
    """Return True when the request carries the backend's own API key."""
    expected_api_key = os.getenv("BACKEND_API_KEY", "")
    supplied_api_key = request.headers.get("X-API-Key", "")
    return bool(expected_api_key) and secrets.compare_digest(
        supplied_api_key, expected_api_key
    )


def _get_verified_identity_key(request: Request) -> str | None:
    """Return a BFF-provided user quota key for an authenticated service call."""
    identity = request.headers.get("X-RateLimit-Identity", "").strip()

    if (
        identity
        and _RATE_LIMIT_IDENTITY_PATTERN.fullmatch(identity)
        and _has_valid_service_key(request)
    ):
        return f"user:{identity}"
    return None


def _normalize_client_ip(raw: str) -> str | None:
    """Parse ``raw`` as an IP address and return its rate-limit bucket key.

    IPv4 addresses key as themselves; IPv6 addresses key on their /64 network.
    Anything that is not an IP address returns ``None`` so a malformed header
    cannot mint arbitrary limiter keys.
    """
    try:
        address = ipaddress.ip_address(raw.strip())
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        network = ipaddress.IPv6Network((address, _IPV6_BUCKET_PREFIX), strict=False)
        return str(network)
    return str(address)


def _get_verified_forwarded_client_ip(request: Request) -> str | None:
    """Return the BFF-asserted visitor address for a proxied service call.

    The BFF resolves the visitor's address from its own reverse proxy (and only
    does so when that proxy is trusted, see ``frontend/app/api/_lib/client-ip.ts``),
    then passes it here. Trust rests on the service key, not on
    ``TRUSTED_PROXY``: the BFF talks to the backend over the internal network,
    not through the gateway that would rewrite ``X-Forwarded-For``.
    """
    raw = request.headers.get(RATE_LIMIT_CLIENT_IP_HEADER, "").strip()
    if not raw or not _has_valid_service_key(request):
        return None
    return _normalize_client_ip(raw)


def _is_trusted_proxy() -> bool:
    """Return True when TRUSTED_PROXY env var is set to a truthy value."""
    return os.getenv("TRUSTED_PROXY", "false").strip().lower() in ("1", "true", "yes")


def get_client_ip(request: Request) -> str:
    """Resolve the per-user or real-client-IP rate-limit key.

    Requests from an API-key-authenticated BFF may provide an opaque user
    identity derived after Supabase authentication. This takes precedence over
    the proxy socket so different signed-in users receive independent quotas.

    The same BFF may instead provide the anonymous visitor's address in
    ``X-RateLimit-Client-IP`` (again only honoured with a matching
    ``X-API-Key``), so signed-out visitors get a bucket each rather than
    sharing the frontend container's.

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

    # Anonymous visitors proxied by the BFF (issue #565). Without this they all
    # key on the frontend container's socket address -- one bucket for every
    # signed-out visitor, which one script can exhaust for everyone.
    forwarded_client_ip = _get_verified_forwarded_client_ip(request)
    if forwarded_client_ip:
        return forwarded_client_ip

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
