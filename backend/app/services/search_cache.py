"""Redis-backed cache for search embeddings and query results.

Provides caching for:
- Embedding vectors (keyed by input text hash)
- Search result payloads (keyed by query + filters hash)

Gracefully degrades to no-op when Redis is unavailable.

SECURITY CONTRACT — public-read only
------------------------------------
Cache keys are derived from the search inputs only (query text, filters,
alpha, limit, offset). They DO NOT include any user identity, role, or
session context. This is safe today because every search path that calls
this cache returns rows that are public-read under RLS (judgments and
document_chunks both expose `Public read access` SELECT policies).

If you add ANY of the following, the cache key MUST be widened to include
a stable user/role discriminator (e.g. anon/authenticated/admin tag, or
the auth.uid()) BEFORE shipping the change:
- per-user filters (bookmarks, owned uploads, draft visibility)
- premium/tier-gated result fields
- judgment_base_extractions or any other table becoming non-public
  (see supabase/migrations/20260429074740_enable_rls_and_tighten_policies.sql
  lines 64-66 for the explicit caveat)

Cached results bypass the Supabase RPC entirely, which is also where RLS
re-evaluates per request. Tightening RLS later will NOT tighten responses
served from this cache until the cache layer is updated to match.
"""

import hashlib
import json
import os

from loguru import logger

from app.config import settings

# ---------------------------------------------------------------------------
# Redis client setup (optional - mirrors pattern from app.dashboard)
# ---------------------------------------------------------------------------

_REDIS_OK = False
_redis_client = None

try:
    import redis.asyncio as redis

    _redis_client = redis.Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        password=os.getenv("REDIS_AUTH"),
        decode_responses=False,  # we store JSON bytes
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    _REDIS_OK = True
    logger.info("Redis client initialized for search caching")
except Exception as e:
    logger.warning(f"Redis not available for search cache: {e}")

# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

_EMB_PREFIX = "search:emb:"
_RES_PREFIX = "search:res:"


def _cache_enabled() -> bool:
    """Return True only when Redis import succeeded, client exists, and caching is on."""
    return _REDIS_OK and settings.SEARCH_CACHE_ENABLED and _redis_client is not None


def _embedding_key(text: str) -> str:
    """Deterministic cache key for an embedding input text."""
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]
    return f"{_EMB_PREFIX}{digest}"


def _result_key(
    query: str,
    filters: dict | None,
    alpha: float | None,
    limit: int | None,
    offset: int | None,
    user_id: str | None = None,
) -> str:
    """Deterministic cache key for a search result set.

    ``user_id`` is an optional discriminator. When ``None`` (current default)
    the key is request-only, preserving today's public-read behaviour.
    Once RLS tightens, callers MUST pass a stable user/role identifier so
    cache entries are partitioned per user. See module docstring.
    """
    blob = {"q": query, "f": filters, "a": alpha, "l": limit, "o": offset}
    if user_id is not None:
        blob["u"] = user_id
    payload = json.dumps(blob, sort_keys=True, default=str)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
    return f"{_RES_PREFIX}{digest}"


# ---------------------------------------------------------------------------
# Public API - embeddings
# ---------------------------------------------------------------------------


async def get_cached_embedding(text: str) -> list[float] | None:
    """Return cached embedding vector for *text*, or ``None`` on miss/error."""
    if not _cache_enabled():
        return None
    try:
        raw = await _redis_client.get(_embedding_key(text))  # type: ignore[union-attr]
        if raw is not None:
            return json.loads(raw)
    except Exception as exc:
        logger.debug(f"search cache: embedding get failed: {exc}")
    return None


async def set_cached_embedding(text: str, embedding: list[float]) -> None:
    """Store an embedding vector in the cache."""
    if not _cache_enabled():
        return
    try:
        key = _embedding_key(text)
        value = json.dumps(embedding)
        await _redis_client.setex(key, settings.SEARCH_EMBEDDING_CACHE_TTL, value)  # type: ignore[union-attr]
    except Exception as exc:
        logger.debug(f"search cache: embedding set failed: {exc}")


# ---------------------------------------------------------------------------
# Public API - search results
# ---------------------------------------------------------------------------


async def get_cached_results(
    query: str,
    filters: dict | None = None,
    alpha: float | None = None,
    limit: int | None = None,
    offset: int | None = None,
    user_id: str | None = None,
) -> dict | list | None:
    """Return cached search results, or ``None`` on miss/error.

    ``user_id`` is forward-compatible: when ``None`` (current default) the
    key is request-only — safe today because RLS exposes public-read on
    every cached field. See module docstring for the contract you accept
    by relying on the default.
    """
    if not _cache_enabled():
        return None
    try:
        raw = await _redis_client.get(  # type: ignore[union-attr]
            _result_key(query, filters, alpha, limit, offset, user_id)
        )
        if raw is not None:
            return json.loads(raw)
    except Exception as exc:
        logger.debug(f"search cache: result get failed: {exc}")
    return None


async def set_cached_results(
    query: str,
    results: dict | list,
    filters: dict | None = None,
    alpha: float | None = None,
    limit: int | None = None,
    offset: int | None = None,
    user_id: str | None = None,
) -> None:
    """Store search results in the cache.

    See :func:`get_cached_results` for the ``user_id`` semantics.
    """
    if not _cache_enabled():
        return
    try:
        key = _result_key(query, filters, alpha, limit, offset, user_id)
        value = json.dumps(results, default=str)
        await _redis_client.setex(key, settings.SEARCH_RESULT_CACHE_TTL, value)  # type: ignore[union-attr]
    except Exception as exc:
        logger.debug(f"search cache: result set failed: {exc}")
