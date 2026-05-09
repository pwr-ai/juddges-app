"""Track Meilisearch sync status for health monitoring.

Stores last-sync metadata in-process (for health checks) and optionally in
Redis so the API process can read status written by the Celery worker.
"""

from __future__ import annotations

import contextlib
import json
import os
import time
from datetime import UTC, datetime
from typing import Any

from loguru import logger

# In-process cache (used by Celery worker that runs syncs)
_last_sync: dict[str, Any] | None = None

SYNC_STALE_THRESHOLD_SECONDS = float(
    os.getenv("MEILISEARCH_SYNC_STALE_SECONDS", "25200")  # 7 hours default
)

REDIS_SYNC_KEY = "meilisearch:last_sync"


def _get_redis():
    """Lazy Redis connection for cross-process sync status."""
    try:
        import redis

        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        password = os.getenv("REDIS_AUTH") or None
        return redis.Redis(
            host=host, port=port, password=password, decode_responses=True
        )
    except Exception:
        return None


def record_sync_completed(total_synced: int) -> None:
    """Called after a successful full sync."""
    global _last_sync
    _last_sync = {
        "completed_at": datetime.now(UTC).isoformat(),
        "total_synced": total_synced,
        "epoch": time.time(),
    }
    # Persist to Redis so the API process can read it
    r = _get_redis()
    if r:
        try:
            r.set(REDIS_SYNC_KEY, json.dumps(_last_sync), ex=86400)
        except Exception as exc:
            logger.debug(f"Failed to write sync status to Redis: {exc}")


def record_sync_failed(error: str) -> None:
    """Called when a full sync fails."""
    global _last_sync
    now = datetime.now(UTC).isoformat()
    _last_sync = {
        "completed_at": _last_sync["completed_at"] if _last_sync else None,
        "total_synced": _last_sync.get("total_synced") if _last_sync else None,
        "epoch": _last_sync.get("epoch") if _last_sync else None,
        "last_error": error,
        "last_error_at": now,
    }
    r = _get_redis()
    if r:
        with contextlib.suppress(Exception):
            r.set(REDIS_SYNC_KEY, json.dumps(_last_sync), ex=86400)


def get_sync_status() -> dict[str, Any]:
    """Return last sync info. Tries Redis first, falls back to in-process cache."""
    global _last_sync
    status = _last_sync

    # Try Redis if in-process cache is empty (we're likely in the API process)
    if status is None:
        r = _get_redis()
        if r:
            try:
                raw = r.get(REDIS_SYNC_KEY)
                if raw:
                    status = json.loads(raw)
            except Exception as e:
                logger.warning(f"Failed to update sync status: {e}")

    if status is None:
        return {"status": "unknown", "message": "No sync has been recorded yet"}

    epoch = status.get("epoch")
    if epoch:
        lag_seconds = time.time() - epoch
        stale = lag_seconds > SYNC_STALE_THRESHOLD_SECONDS
    else:
        lag_seconds = None
        stale = True

    return {
        "status": "stale" if stale else "ok",
        "last_completed_at": status.get("completed_at"),
        "total_synced": status.get("total_synced"),
        "lag_seconds": round(lag_seconds) if lag_seconds is not None else None,
        "stale_threshold_seconds": int(SYNC_STALE_THRESHOLD_SECONDS),
        "last_error": status.get("last_error"),
        "last_error_at": status.get("last_error_at"),
    }
