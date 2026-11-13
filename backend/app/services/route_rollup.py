"""Per-route request counter, flushed to app_events as `api_route_rollup`.

Answers "which backend routes does anything still call?" so unused endpoints
can be pruned on evidence instead of grep. Each worker process counts
requests in memory, keyed by HTTP method and route *template*
(`GET /documents/{document_id}`), never the concrete path, so no document
id, query string or other request data reaches the counter. Requests that
match no route are lumped under one key rather than recorded by path, which
would let a scanner write arbitrary strings into the table.

Cost on the hot path is one dict increment. Every `interval_seconds` (15
minutes by default) the next request swaps the counter out and hands it to
a thread-pool write; the request never waits for it. Counts left in memory
are flushed on application shutdown. A crash loses at most one window from
one worker, which is acceptable for a ranking signal.

Read it back with the queries in docs/how-to/rank-features-by-usage.md.
"""

from __future__ import annotations

import os
import time
from collections import Counter
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from loguru import logger

from app.services.app_events import emit_app_event, emit_app_event_in_background

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Receive, Scope, Send

EVENT_NAME = "api_route_rollup"
DEFAULT_INTERVAL_SECONDS = 15 * 60
UNMATCHED_KEY = "<unmatched>"


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, default)))
    except ValueError:
        return default


class RouteRollup:
    """In-memory request counter for one worker process."""

    def __init__(self, interval_seconds: int = DEFAULT_INTERVAL_SECONDS) -> None:
        self.interval_seconds = interval_seconds
        self._counts: Counter[str] = Counter()
        self._window_started_at = datetime.now(UTC)
        self._window_started_mono = time.monotonic()

    def record(self, key: str) -> None:
        self._counts[key] += 1

    def due(self) -> bool:
        return time.monotonic() - self._window_started_mono >= self.interval_seconds

    def drain(self) -> dict[str, Any] | None:
        """Swap the counter out and return the event properties, or None."""
        counts, self._counts = self._counts, Counter()
        started_at = self._window_started_at
        self._window_started_at = datetime.now(UTC)
        self._window_started_mono = time.monotonic()
        if not counts:
            return None
        return {
            "counts": dict(counts),
            "window_start": started_at.isoformat(),
            "window_end": self._window_started_at.isoformat(),
            "total": sum(counts.values()),
        }

    def flush_in_background(self) -> None:
        properties = self.drain()
        if properties:
            emit_app_event_in_background(EVENT_NAME, properties=properties)

    def flush_now(self) -> None:
        """Synchronous flush for shutdown, when the loop is going away."""
        properties = self.drain()
        if properties:
            emit_app_event(EVENT_NAME, properties=properties)


rollup = RouteRollup(
    interval_seconds=_env_int(
        "API_ROUTE_ROLLUP_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS
    )
)


def route_key(scope: Scope, root_path_before: str) -> str:
    """Return `METHOD /template` for a handled request, never the raw path."""
    method = scope.get("method", "?")
    # Routing through a Mount (e.g. /mcp) extends root_path by the mount
    # prefix, and any `route` the sub-app sets is relative to it. The prefix
    # is a path we declared, not caller input.
    root_path = scope.get("root_path", "")
    prefix = ""
    if root_path != root_path_before and root_path.startswith(root_path_before):
        prefix = root_path[len(root_path_before) :]
    path = getattr(scope.get("route"), "path", None)
    if isinstance(path, str):
        return f"{method} {prefix}{path}"
    if prefix:
        return f"{method} {prefix}/*"
    return f"{method} {UNMATCHED_KEY}"


class RouteRollupMiddleware:
    """Pure ASGI middleware: count the request, flush when the window is up."""

    def __init__(
        self,
        app: ASGIApp,
        counter: RouteRollup | None = None,
        enabled: bool | None = None,
    ) -> None:
        self.app = app
        self.counter = counter or rollup
        self.enabled = (
            _env_flag("API_ROUTE_ROLLUP_ENABLED", True) if enabled is None else enabled
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self.enabled:
            await self.app(scope, receive, send)
            return
        root_path_before = scope.get("root_path", "")
        try:
            await self.app(scope, receive, send)
        finally:
            try:
                self.counter.record(route_key(scope, root_path_before))
                if self.counter.due():
                    self.counter.flush_in_background()
            except Exception as exc:  # analytics must never break a request
                logger.debug(f"route rollup failed: {exc}")
