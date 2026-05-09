"""Redis-backed cache for full search responses.

Caches the *entire* :class:`SearchChunksResponse` (post-rerank, post-payload-
build, post-estimated-total) keyed by a content-addressed digest of the
:class:`SearchChunksRequest`. This complements the existing partial cache in
``app.services.search_cache`` (which caches raw RPC rows pre-rerank).

Why a separate layer?
- The existing ``services.search_cache`` short-circuits the Supabase RPC but
  still runs reranking, payload trimming, and ``estimated_total`` on every
  request. For the blazing-fast path we want to skip *all* of that on a
  warm cache hit and return the assembled response directly.
- Mirrors the lazy-init / fail-soft pattern from ``app.embedding_cache``.

DB index allocation (avoid collisions):
- 1 → guest_sessions
- 2 → embedding_cache, schema_generation
- 3 → rate limiter (reserved)
- 4 → search response cache (this module, default; configurable via
       ``SEARCH_CACHE_REDIS_DB``)

SECURITY CONTRACT — public-read only
------------------------------------
Cache keys are derived from the search inputs only. They DO NOT include any
user identity, role, or session context. This is safe today because every
field returned by the search endpoint is public-read under RLS. If RLS is
ever tightened (per-user filters, premium fields, non-public tables), the
cache key MUST be widened to include a stable user/role discriminator
*before* shipping the change. See
``app/services/search_cache.py`` for the longer write-up.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from app.models import SearchChunksRequest, SearchChunksResponse


_CACHE_DB = int(os.getenv("SEARCH_CACHE_REDIS_DB", "4"))
_CACHE_TTL = int(os.getenv("SEARCH_CACHE_TTL_SECONDS", "300"))
_CACHE_PREFIX = "search:v1:"

# Field order is part of the cache key contract: changing it invalidates
# every existing entry. The "v1" prefix lets us bump the namespace cleanly
# if the request schema grows.
_KEY_FIELDS: tuple[str, ...] = (
    "query",
    "alpha",
    "languages",
    "mode",
    "jurisdictions",
    "court_names",
    "court_levels",
    "case_types",
    "decision_types",
    "outcomes",
    "keywords",
    "legal_topics",
    "cited_legislation",
    "date_from",
    "date_to",
    "offset",
    "limit_docs",
    "result_view",
    "include_count",
)

_client = None  # lazy redis.asyncio.Redis | None


def _get_client():
    """Lazily construct the Redis client. Returns ``None`` on import error."""
    global _client
    if _client is not None:
        return _client
    try:
        import redis.asyncio as redis

        _client = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            # Honor the spec's REDIS_PASSWORD name, but fall back to REDIS_AUTH
            # for parity with embedding_cache / guest_sessions / Celery config.
            password=os.getenv("REDIS_PASSWORD") or os.getenv("REDIS_AUTH") or None,
            db=_CACHE_DB,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        logger.info(
            f"Search response cache: Redis db={_CACHE_DB} "
            f"ttl={_CACHE_TTL}s prefix={_CACHE_PREFIX}"
        )
    except Exception as exc:
        logger.warning(f"Search response cache: Redis init failed: {exc}")
        _client = None
    return _client


def _make_key(request: SearchChunksRequest) -> str:
    """SHA-256 of a stable JSON projection of the request payload."""
    payload = {field: getattr(request, field, None) for field in _KEY_FIELDS}
    blob = json.dumps(payload, sort_keys=True, default=str)
    digest = hashlib.sha256(blob.encode("utf-8")).hexdigest()
    return f"{_CACHE_PREFIX}{digest}"


async def get_cached_search(
    request: SearchChunksRequest,
) -> SearchChunksResponse | None:
    """Return a cached :class:`SearchChunksResponse` for *request* or ``None``.

    Bypasses the cache entirely for ``mode="thinking"`` (LLM-driven query
    rewriting is non-deterministic — caching would freeze a stale rewrite).
    Any Redis or deserialisation error is logged and treated as a miss.
    """
    if request.mode == "thinking":
        return None
    client = _get_client()
    if client is None:
        return None
    try:
        raw = await client.get(_make_key(request))
    except Exception as exc:
        logger.warning(f"Search cache GET failed (treating as miss): {exc}")
        return None
    if raw is None:
        return None
    try:
        from app.models import SearchChunksResponse

        return SearchChunksResponse.model_validate_json(raw)
    except Exception as exc:
        logger.warning(f"Search cache: stale/invalid entry, ignoring: {exc}")
        return None


async def set_cached_search(
    request: SearchChunksRequest,
    response: SearchChunksResponse,
) -> None:
    """Store *response* under the request's cache key. Best-effort, never raises."""
    if request.mode == "thinking":
        return
    client = _get_client()
    if client is None:
        return
    try:
        await client.set(
            _make_key(request),
            response.model_dump_json(),
            ex=_CACHE_TTL,
        )
    except Exception as exc:
        logger.warning(f"Search cache SET failed (non-fatal): {exc}")


async def close() -> None:
    """Close the Redis client. Safe to call when no client exists."""
    import contextlib

    global _client
    if _client is not None:
        with contextlib.suppress(Exception):
            await _client.aclose()
        _client = None
