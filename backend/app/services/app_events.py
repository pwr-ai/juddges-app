"""App-events write path + event taxonomy.

Product-analytics event stream backing the `app_events` table
(supabase/migrations/20260717000001). Writes are fire-and-forget and never
raise — analytics must never break a request path.

Taxonomy source of truth. Kept in sync with:
- frontend/lib/analytics/track.ts (ClientEventName)
- docs/explanation/event-taxonomy.md
"""

from __future__ import annotations

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from loguru import logger

from app.core.supabase import supabase_client

# Full taxonomy.
EVENT_ALLOWLIST: frozenset[str] = frozenset(
    {
        "auth_signed_up",
        "auth_signed_in",
        "auth_signed_out",
        "search_submitted",
        "search_result_clicked",
        "search_zero_results",
        "judgment_viewed",
        "judgment_copied_citation",
        "judgment_exported",
        "annotation_created",
        "annotation_updated",
        "annotation_deleted",
        "chat_message_sent",
        "chat_response_received",
        "chat_feedback_thumbs_up",
        "chat_feedback_thumbs_down",
        "collection_created",
        "collection_item_added",
        "error_boundary_triggered",
        "page_viewed",
        "mcp_tool_called",
        "api_route_rollup",
    }
)

# Emitted ONLY by the auth.users DB triggers (20260717000002) — rejected even
# from API-key callers so these rows can only originate server-side.
DB_TRIGGER_ONLY_EVENTS: frozenset[str] = frozenset({"auth_signed_up", "auth_signed_in"})

# Emitted ONLY by backend code paths via emit_app_event: the MCP tools and the
# per-route rollup middleware. Rejected by POST /api/events so a client can
# never inflate the usage numbers these events exist to measure.
SERVER_ONLY_EVENTS: frozenset[str] = frozenset({"mcp_tool_called", "api_route_rollup"})

# Accepted by POST /api/events. Includes auth_signed_out: reaching the backend
# requires X-API-Key (a server-only secret), and the Next.js /api/events proxy
# rejects all auth_* from browser bodies before forwarding.
API_EVENT_ALLOWLIST: frozenset[str] = (
    EVENT_ALLOWLIST - DB_TRIGGER_ONLY_EVENTS - SERVER_ONLY_EVENTS
)

MAX_PROPERTIES_BYTES = 8192
MAX_BATCH_SIZE = 20


def record_app_events(rows: list[dict[str, Any]]) -> None:
    """Fire-and-forget batch insert into app_events. Never raises."""
    if not supabase_client or not rows:
        return
    try:
        supabase_client.table("app_events").insert(rows).execute()
    except Exception as exc:
        logger.warning(f"Failed to record app events: {exc}")


def emit_app_event(
    event_name: str,
    *,
    user_id: str | None = None,
    guest_session_id: str | None = None,
    session_id: str | None = None,
    surface: str = "api",
    locale: str | None = None,
    app_version: str | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    """Server-side emission helper for backend code paths. Never raises."""
    if event_name not in EVENT_ALLOWLIST:
        logger.warning(f"emit_app_event: unknown event {event_name!r} dropped")
        return
    record_app_events(
        [
            {
                "event_name": event_name,
                "user_id": user_id,
                "guest_session_id": guest_session_id,
                "session_id": session_id,
                "surface": surface,
                "locale": locale,
                "app_version": app_version,
                "properties": properties or {},
            }
        ]
    )


# Dedicated, bounded pool for background writes. The loop's default executor is
# shared with everything else that uses run_in_executor, so a slow Supabase
# must not be able to occupy it. Beyond MAX_PENDING queued writes, events are
# dropped (and logged) rather than queued without limit.
_BACKGROUND_WORKERS = 2
MAX_PENDING_BACKGROUND_EVENTS = 200
_executor = ThreadPoolExecutor(
    max_workers=_BACKGROUND_WORKERS, thread_name_prefix="app-events"
)
_pending = 0
_pending_lock = threading.Lock()


def _run_and_release(event_name: str, kwargs: dict[str, Any]) -> None:
    global _pending
    try:
        emit_app_event(event_name, **kwargs)
    finally:
        with _pending_lock:
            _pending -= 1


def emit_app_event_in_background(event_name: str, **kwargs: Any) -> None:
    """Schedule emit_app_event on a dedicated bounded pool and return at once.

    For async code paths with no BackgroundTasks to hand (MCP tools,
    middleware). The Supabase client is synchronous, so calling
    emit_app_event inline would block the event loop for a network round
    trip. Without a running loop (sync callers, scripts) it runs inline.
    When more than MAX_PENDING_BACKGROUND_EVENTS writes are waiting the event
    is dropped and logged. Never raises.
    """
    global _pending
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        emit_app_event(event_name, **kwargs)
        return
    with _pending_lock:
        if _pending >= MAX_PENDING_BACKGROUND_EVENTS:
            logger.warning(
                f"emit_app_event_in_background: backlog full, dropped {event_name!r}"
            )
            return
        _pending += 1
    try:
        _executor.submit(_run_and_release, event_name, kwargs)
    except Exception as exc:
        with _pending_lock:
            _pending -= 1
        logger.warning(f"emit_app_event_in_background: could not schedule: {exc}")
