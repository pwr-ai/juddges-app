"""Redis-backed cache for query embeddings.

Search endpoints generate a fresh embedding for every request. Users typing
slowly, revisiting dashboards, or running the same filter twice all re-pay
the full embedding round-trip. Polish legal queries are highly repeatable
across a small user base, so a simple LRU-style Redis cache removes most
of the embedding latency on hot paths.

Keys are content-addressed so cache entries are immutable: changing the
model or dimension automatically generates a new key namespace.

Disable with EMBEDDING_CACHE_ENABLED=false for debugging.
"""

from __future__ import annotations

import hashlib
import json
import os

import redis.asyncio as redis
from loguru import logger

_CACHE_DB = int(os.getenv("EMBEDDING_CACHE_REDIS_DB", "2"))
_CACHE_TTL = int(os.getenv("EMBEDDING_CACHE_TTL_SECONDS", "86400"))  # 24h
_CACHE_PREFIX = os.getenv("EMBEDDING_CACHE_PREFIX", "emb")

_client: redis.Redis | None = None
_enabled: bool | None = None


def is_enabled() -> bool:
    global _enabled
    if _enabled is None:
        _enabled = os.getenv("EMBEDDING_CACHE_ENABLED", "true").lower() not in (
            "false",
            "0",
            "no",
        )
    return _enabled


def _get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            password=os.getenv("REDIS_AUTH") or None,
            db=_CACHE_DB,
            decode_responses=True,
        )
        logger.info(
            f"Embedding cache: Redis db={_CACHE_DB} "
            f"ttl={_CACHE_TTL}s prefix={_CACHE_PREFIX}"
        )
    return _client


def _make_key(model_id: str, text: str, dimensions: int) -> str:
    """Content-addressed key. Model + dim in key means changing either
    automatically bypasses stale entries."""
    h = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"{_CACHE_PREFIX}:{model_id}:{dimensions}:{h}"


async def get(model_id: str, text: str, dimensions: int) -> list[float] | None:
    if not is_enabled():
        return None
    try:
        raw = await _get_client().get(_make_key(model_id, text, dimensions))
    except Exception as e:
        logger.warning(f"Embedding cache GET failed (treating as miss): {e}")
        return None
    if raw is None:
        return None
    try:
        vec = json.loads(raw)
    except Exception:
        return None
    if not isinstance(vec, list) or len(vec) != dimensions:
        return None
    return vec


async def set(
    model_id: str,
    text: str,
    dimensions: int,
    embedding: list[float],
) -> None:
    if not is_enabled():
        return
    try:
        await _get_client().set(
            _make_key(model_id, text, dimensions),
            json.dumps(embedding),
            ex=_CACHE_TTL,
        )
    except Exception as e:
        logger.warning(f"Embedding cache SET failed (non-fatal): {e}")


async def close() -> None:
    import contextlib

    global _client
    if _client is not None:
        with contextlib.suppress(Exception):
            await _client.aclose()
        _client = None
