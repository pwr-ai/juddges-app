"""The HTTP entrypoint mounted at /mcp.

Authentication happens here, once, before any tool runs: the Authorization
header is resolved to a principal and bound to the call's context. Tools
never see a credential, so a model cannot pass one.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from loguru import logger
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.auth_mcp import MCP_KEY_PREFIX, resolve_mcp_principal, touch_key
from app.mcp_rate_limit import (
    McpRateLimitExceeded,
    enforce_mcp_rate_limit,
    mcp_auth_failure_retry_after,
    mcp_auth_failures_exhausted,
    record_mcp_auth_failure,
)
from app.rate_limiter import get_client_ip
from juddges_mcp.principal import reset_principal, set_principal
from juddges_mcp.server import build_server

# Strong references: asyncio keeps only a weak reference to a task, so one
# created and dropped can be garbage-collected before it runs.
_key_use_tasks: set[asyncio.Task] = set()


def _key_use_finished(task: asyncio.Task) -> None:
    _key_use_tasks.discard(task)
    # Reading the outcome marks a failure as handled; otherwise asyncio logs
    # "exception was never retrieved" at garbage-collection time instead.
    if not task.cancelled() and task.exception() is not None:
        logger.warning(f"Recording MCP key use failed: {task.exception()!r}")


def _record_key_use(key_id: str) -> None:
    # touch_key is a sync Supabase call, so it goes to a thread rather than
    # stalling the event loop. It is deliberately not awaited, unlike the
    # compliance write in the tools: a dropped audit entry is a compliance
    # failure, whereas a dropped last_used_at is a cosmetic timestamp, and
    # should_record_use already makes most calls a single cheap select.
    task = asyncio.create_task(asyncio.to_thread(touch_key, key_id))
    _key_use_tasks.add(task)
    task.add_done_callback(_key_use_finished)


def _unauthorized() -> JSONResponse:
    # Built per request, not shared: the app's GZip middleware edits a
    # response's header list in place, so a module-level instance would
    # carry Content-Encoding: gzip into every later response.
    return JSONResponse(
        {"error": "Invalid or missing MCP key"},
        status_code=401,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _too_many_requests(message: str, retry_after: int) -> JSONResponse:
    # Per request for the same reason as _unauthorized: never share a response.
    return JSONResponse(
        {"error": message},
        status_code=429,
        headers={"Retry-After": str(max(1, retry_after))},
    )


def _unavailable() -> JSONResponse:
    return JSONResponse({"error": "MCP server is not running"}, status_code=503)


def _credential(scope: Scope) -> str | None:
    """Return the Bearer credential from an ASGI scope, or None."""
    for name, value in scope.get("headers") or []:
        if name.lower() != b"authorization":
            continue
        scheme, _, credential = value.decode("latin-1").partition(" ")
        if scheme.lower() != "bearer":
            return None
        credential = credential.strip()
        return credential or None
    return None


class McpAuthMiddleware:
    """Resolve the MCP key and bind the principal for the wrapped app."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        credential = _credential(scope)
        # Not charged to the failure bucket: this path costs nothing to serve,
        # so counting it would only let an attacker lock their own IP out.
        if not credential or not credential.startswith(MCP_KEY_PREFIX):
            await _unauthorized()(scope, receive, send)
            return

        client_ip = get_client_ip(Request(scope))

        # Before resolution, so an IP that has spent its rejected-key budget
        # costs no database round trip.
        if mcp_auth_failures_exhausted(client_ip):
            logger.warning("MCP auth-failure budget exhausted for a client IP")
            await _too_many_requests(
                "Too many rejected MCP keys from this address. Try again later.",
                mcp_auth_failure_retry_after(),
            )(scope, receive, send)
            return

        principal = resolve_mcp_principal(credential)
        if principal is None:
            record_mcp_auth_failure(client_ip)
            logger.warning("Rejected an unresolvable MCP key")
            await _unauthorized()(scope, receive, send)
            return

        # Guarded: a principal without a key id must never turn a working
        # request into a 500. Such a principal has no per-key budget to charge
        # and is served uncharged rather than rejected: failing closed would
        # turn a missing cosmetic attribute into an outage, and resolution
        # always sets a key id for a real key.
        key_id = getattr(principal, "mcp_key_id", None)
        if key_id:
            # Before _record_key_use: a throttled caller must not also incur
            # the last_used_at write; shedding load is the point.
            try:
                enforce_mcp_rate_limit(key_id)
            except McpRateLimitExceeded as e:
                await _too_many_requests(str(e), e.retry_after)(scope, receive, send)
                return
            _record_key_use(key_id)

        # try/finally so a failing tool cannot leave this caller's principal
        # bound for whoever the context serves next.
        token = set_principal(principal)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_principal(token)


class McpMount:
    """The ASGI app mounted at /mcp, plus the lifespan that makes it serve.

    FastAPI does not run a mounted sub-app's lifespan, and the streamable-HTTP
    transport fails every request ("Task group is not initialized") until its
    session manager is running. The parent app therefore enters `lifespan()`.

    A session manager can run only once per instance, so each lifespan builds
    a fresh server. Holding one process-wide FastMCP would let the first
    startup consume it: any later startup of the same app object (a second
    TestClient, a worker reload) would then raise at startup.
    """

    def __init__(self) -> None:
        self._inner: ASGIApp | None = None
        self._authenticated = McpAuthMiddleware(self._dispatch)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self._authenticated(scope, receive, send)

    async def _dispatch(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Behind the auth middleware on purpose: a caller without a valid key
        # learns nothing about whether the server is up.
        inner = self._inner
        if inner is None:
            logger.error("MCP request arrived while the MCP lifespan is not running")
            await _unavailable()(scope, receive, send)
            return
        await inner(scope, receive, send)

    @asynccontextmanager
    async def lifespan(self) -> AsyncIterator[None]:
        server = build_server()
        inner = server.streamable_http_app()
        async with server.session_manager.run():
            self._inner = inner
            try:
                yield
            finally:
                self._inner = None


mcp_mount = McpMount()
