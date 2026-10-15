"""Transport-level tests for the /mcp mount.

The auth tests below get their 401 from McpAuthMiddleware before the MCP app
runs, so they say nothing about whether the mount works. TestMcpOverHttp is
the part that does: it drives the production `app` object, with its real
lifespan wrapper and its real mount, through to a JSON-RPC answer.
"""

import json
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from juddges_mcp.http import McpAuthMiddleware, McpMount
from juddges_mcp.principal import MissingPrincipalError, get_principal, set_principal
from juddges_mcp.server import build_server
from starlette.responses import PlainTextResponse

from app.server import app as real_app

MCP_HEADERS = {
    "Authorization": "Bearer jdg_mcp_good",
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}
INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "pytest", "version": "0"},
    },
}


def _sse_payload(response) -> dict:
    """Parse the JSON-RPC message out of the SSE-framed response body."""
    data_lines = [
        line[len("data:") :].strip()
        for line in response.text.splitlines()
        if line.startswith("data:")
    ]
    assert data_lines, f"no SSE data line in response: {response.text!r}"
    return json.loads(data_lines[-1])


@pytest.fixture(autouse=True)
def _fresh_sse_exit_event():
    """sse-starlette keeps one process-global exit Event bound to the first
    event loop that serves an SSE response. Each TestClient runs its own loop,
    so the second SSE response in the process fails with "bound to a different
    event loop" and the body comes back empty. Production has one loop."""
    from sse_starlette.sse import AppStatus

    AppStatus.should_exit_event = None
    yield
    AppStatus.should_exit_event = None


def _app_with(mount: McpMount) -> FastAPI:
    """A FastAPI app that mounts `mount` and owns its lifespan, as production does."""

    @asynccontextmanager
    async def lifespan(_app):
        async with mount.lifespan():
            yield

    app = FastAPI(lifespan=lifespan)
    app.mount("/mcp", mount)
    return app


@pytest.fixture
def client():
    """A throwaway app on a fresh mount, with the session manager running.

    Without the lifespan a request that clears authentication raises inside
    the MCP app, which is the failure the live_client tests exist to catch.
    """
    with TestClient(_app_with(McpMount())) as test_client:
        yield test_client


@pytest.fixture
def live_client():
    """The production app, started through its real lifespan wrapper.

    Only the inner application lifespan (Supabase, Meilisearch, checkpointer)
    is stubbed out; the MCP session-manager wrapper is production code.
    """

    @asynccontextmanager
    async def _no_startup(app):
        yield

    with (
        patch("app.server._app_lifespan", _no_startup),
        TestClient(real_app) as test_client,
    ):
        yield test_client


@pytest.mark.unit
class TestTransportAuth:
    # Review Focus 1
    def test_missing_authorization_header_is_401(self, client):
        response = client.post(
            "/mcp", json={"jsonrpc": "2.0", "method": "ping", "id": 1}
        )
        assert response.status_code == 401

    def test_bearer_with_no_value_is_401_not_500(self, client):
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "ping", "id": 1},
            headers={"Authorization": "Bearer"},
        )
        assert response.status_code == 401

    def test_non_bearer_scheme_is_401(self, client):
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "ping", "id": 1},
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert response.status_code == 401

    def test_unresolvable_key_is_401(self, client):
        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=None):
            response = client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "method": "ping", "id": 1},
                headers={"Authorization": "Bearer jdg_mcp_revoked"},
            )
        assert response.status_code == 401

    def test_valid_key_binds_the_principal_for_the_call(self, client):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        seen = {}

        def record(user):
            seen["bound"] = user
            # The real token: reset_principal rejects anything else.
            return set_principal(user)

        with (
            patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal),
            patch("juddges_mcp.http.set_principal", side_effect=record),
        ):
            client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "method": "ping", "id": 1},
                headers={"Authorization": "Bearer jdg_mcp_good"},
            )
        assert seen["bound"] is principal


@pytest.mark.unit
class TestRejectionsSurviveRepeat:
    def test_repeated_401s_through_the_real_app_stay_decodable(self):
        """The production app gzips responses. A rejection object shared across
        requests is edited in place by that middleware, and the second client
        then fails with "incorrect header check" decoding the body."""
        client = TestClient(real_app)
        for _ in range(3):
            response = client.post(
                "/mcp", json=INITIALIZE, headers={"Accept-Encoding": "gzip"}
            )
            assert response.status_code == 401
            assert response.json() == {"error": "Invalid or missing MCP key"}


@pytest.mark.unit
class TestMcpLifespan:
    def test_the_app_can_start_more_than_once(self):
        """A session manager runs once per instance; the mount must not care.

        Other tests in the suite start the real app too, so a mount that
        consumed a process-wide server on first startup would break whichever
        started second.
        """
        mount = McpMount()
        for _ in range(2):
            with (
                patch(
                    "juddges_mcp.http.resolve_mcp_principal", return_value=MagicMock()
                ),
                TestClient(_app_with(mount)) as c,
            ):
                response = c.post("/mcp", json=INITIALIZE, headers=MCP_HEADERS)
            assert response.status_code == 200, response.text

    def test_the_real_app_can_start_more_than_once(self):
        @asynccontextmanager
        async def _no_startup(app):
            yield

        for _ in range(2):
            with (
                patch("app.server._app_lifespan", _no_startup),
                patch(
                    "juddges_mcp.http.resolve_mcp_principal", return_value=MagicMock()
                ),
                TestClient(real_app) as c,
            ):
                response = c.post("/mcp", json=INITIALIZE, headers=MCP_HEADERS)
            assert response.status_code == 200, response.text

    def test_authenticated_request_before_startup_is_503_not_a_crash(self):
        app = FastAPI()
        app.mount("/mcp", McpMount())
        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=MagicMock()):
            response = TestClient(app).post(
                "/mcp", json=INITIALIZE, headers=MCP_HEADERS
            )
        assert response.status_code == 503


@pytest.mark.unit
class TestMcpOverHttp:
    """Requests that get past authentication and reach the MCP app."""

    @pytest.mark.parametrize("path", ["/mcp", "/mcp/"])
    def test_initialize_reaches_the_mcp_app(self, live_client, path):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal):
            response = live_client.post(path, json=INITIALIZE, headers=MCP_HEADERS)

        assert response.status_code == 200, response.text
        message = _sse_payload(response)
        assert message["id"] == 1
        assert "protocolVersion" in message["result"]

    def test_tools_list_returns_exactly_the_three_tools(self, live_client):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        request = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal):
            response = live_client.post("/mcp", json=request, headers=MCP_HEADERS)

        assert response.status_code == 200, response.text
        names = {tool["name"] for tool in _sse_payload(response)["result"]["tools"]}
        assert names == {"search_judgments", "get_judgment", "get_extracted_fields"}

    def test_mount_does_not_shadow_the_mcp_keys_router(self):
        """/mcp/keys must stay served by the keys router.

        A shadowing mount still answers 200 on this path with the MCP app's
        response, so "not 404" would pass while the endpoint is broken. The
        keys router rejects an unauthenticated call itself: 401 with its own
        error body. The MCP middleware's 401 body is {"error": ...}.
        """
        response = TestClient(real_app).get("/mcp/keys")

        assert response.status_code == 401
        assert "detail" in response.json()
        assert "error" not in response.json()


@pytest.mark.unit
class TestToolRegistration:
    async def test_all_three_tools_are_registered(self):
        names = {tool.name for tool in await build_server().list_tools()}
        assert names == {"search_judgments", "get_judgment", "get_extracted_fields"}


@pytest.mark.unit
class TestOpenApiIsolation:
    def test_mounting_mcp_does_not_change_the_schema(self):
        """Criterion 11: a mounted sub-app must stay out of /openapi.json."""
        app = FastAPI()
        before = app.openapi()
        app.mount("/mcp", McpMount())
        app.openapi_schema = None
        after = app.openapi()
        assert before["paths"] == after["paths"]

    def test_real_app_exposes_only_the_keys_operations_under_mcp(self):
        real_app.openapi_schema = None
        paths = real_app.openapi()["paths"]
        assert "/mcp" not in paths
        mcp_paths = [p for p in paths if p.startswith("/mcp")]
        assert mcp_paths
        assert all(p.startswith("/mcp/keys") for p in mcp_paths)


@pytest.mark.unit
class TestPrincipalLifetime:
    """ASGITransport awaits the app in this task's context, so a principal
    the middleware fails to reset is visible here afterwards. TestClient would
    run it in another thread and hide the leak."""

    async def test_principal_is_bound_during_and_unbound_after_the_request(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        seen = {}

        async def inner(scope, receive, send):
            seen["during"] = get_principal()
            await PlainTextResponse("ok")(scope, receive, send)

        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal):
            async with _asgi_client(McpAuthMiddleware(inner)) as c:
                response = await c.post(
                    "/", headers={"Authorization": "Bearer jdg_mcp_good"}
                )

        assert response.status_code == 200
        assert seen["during"] is principal
        with pytest.raises(MissingPrincipalError):
            get_principal()

    async def test_principal_is_unbound_even_when_the_app_raises(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")

        async def inner(scope, receive, send):
            raise RuntimeError("tool blew up")

        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal):
            async with _asgi_client(McpAuthMiddleware(inner)) as c:
                with pytest.raises(RuntimeError, match="tool blew up"):
                    await c.post("/", headers={"Authorization": "Bearer jdg_mcp_good"})

        with pytest.raises(MissingPrincipalError):
            get_principal()


def _asgi_client(asgi_app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=asgi_app), base_url="http://test"
    )
