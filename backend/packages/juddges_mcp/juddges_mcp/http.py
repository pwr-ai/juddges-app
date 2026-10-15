"""The HTTP entrypoint mounted at /mcp.

Authentication happens here, once, before any tool runs: the Authorization
header is resolved to a principal and bound to the call's context. Tools
never see a credential, so a model cannot pass one.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from loguru import logger
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.auth_mcp import MCP_KEY_PREFIX, resolve_mcp_principal
from juddges_mcp.principal import reset_principal, set_principal
from juddges_mcp.server import build_server


def _unauthorized() -> JSONResponse:
    # Built per request, not shared: the app's GZip middleware edits a
    # response's header list in place, so a module-level instance would
    # carry Content-Encoding: gzip into every later response.
    return JSONResponse(
        {"error": "Invalid or missing MCP key"},
        status_code=401,
        headers={"WWW-Authenticate": "Bearer"},
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
        if not credential or not credential.startswith(MCP_KEY_PREFIX):
            await _unauthorized()(scope, receive, send)
            return

        principal = resolve_mcp_principal(credential)
        if principal is None:
            logger.warning("Rejected an unresolvable MCP key")
            await _unauthorized()(scope, receive, send)
            return

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
