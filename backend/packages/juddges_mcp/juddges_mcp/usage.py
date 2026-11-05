"""Usage instrumentation for MCP tools (`mcp_tool_called` in app_events).

`instrumented(tool)` wraps a tool coroutine so every call records one event
with the tool name, the caller, the outcome and the duration. It never
records arguments: a search query or a document id is caller data, and the
point of the event is "which tools are used, by how many keys' owners", not
what they asked. The write goes to the thread pool after the call returns,
so a tool never waits for analytics, and a failed write never fails a tool.

The tools themselves stay transport-agnostic and untouched; the wrapper is
applied where the server registers them (`juddges_mcp/server.py`).
"""

from __future__ import annotations

import functools
import time
from typing import TYPE_CHECKING, Any

from loguru import logger

from app.services.app_events import emit_app_event_in_background
from juddges_mcp.principal import MissingPrincipalError, get_principal

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

EVENT_NAME = "mcp_tool_called"


def _caller_id() -> str | None:
    try:
        return get_principal().id
    except MissingPrincipalError:
        return None


def _result_count(result: Any) -> int | None:
    return len(result) if isinstance(result, list) else None


def instrumented[**P, R](
    tool: Callable[P, Awaitable[R]],
) -> Callable[P, Awaitable[R]]:
    """Return `tool` wrapped to emit `mcp_tool_called` after each call.

    `functools.wraps` keeps `__name__`, `__doc__` and `__wrapped__`, which
    FastMCP reads to build the tool's name, description and input schema, so
    the schema an agent sees is unchanged.
    """
    name = tool.__name__

    @functools.wraps(tool)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        started = time.perf_counter()
        outcome = "error"
        result_count: int | None = None
        try:
            result = await tool(*args, **kwargs)
            outcome = "ok"
            result_count = _result_count(result)
            return result
        except Exception as exc:
            outcome = type(exc).__name__
            raise
        finally:
            try:
                properties: dict[str, Any] = {
                    "tool": name,
                    "outcome": outcome,
                    "duration_ms": round((time.perf_counter() - started) * 1000),
                }
                if result_count is not None:
                    properties["result_count"] = result_count
                emit_app_event_in_background(
                    EVENT_NAME,
                    user_id=_caller_id(),
                    surface="mcp",
                    properties=properties,
                )
            except Exception as exc:  # analytics must never break a tool call
                logger.debug(f"mcp usage event failed: {exc}")

    return wrapper
