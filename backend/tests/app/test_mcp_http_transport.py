"""Transport-level tests for the /mcp mount.

The auth tests below get their 401 from McpAuthMiddleware before the MCP app
runs, so they say nothing about whether the mount works. TestMcpOverHttp is
the part that does: it drives the production `app` object, with its real
lifespan wrapper and its real mount, through to a JSON-RPC answer.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from juddges_mcp import http as mcp_http
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


@pytest.fixture(autouse=True)
def _no_real_key_writes():
    """Requests that clear auth now schedule a key-use write; never let one
    reach Supabase from a test that is about something else."""
    with patch("juddges_mcp.http.touch_key"):
        yield


@pytest.fixture(autouse=True)
def _fresh_rate_limit_state():
    """The MCP limiters are process-wide; without fresh storage per test, the
    rejected-key budget for the shared test client IP would fill up across
    tests and start answering 429 to tests about something else."""
    from limits.storage import MemoryStorage
    from limits.strategies import MovingWindowRateLimiter

    with (
        patch("app.mcp_rate_limit._limiter", MovingWindowRateLimiter(MemoryStorage())),
        patch(
            "app.rate_limiter._fallback_limiter",
            MovingWindowRateLimiter(MemoryStorage()),
        ),
    ):
        yield


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


async def _drain_key_use_tasks() -> None:
    """Wait for every in-flight key-use write; no timer involved."""
    # Only this loop's tasks: the set is process-wide, and tasks left by
    # TestClient requests belong to loops that are already closed.
    loop = asyncio.get_running_loop()
    pending = [t for t in mcp_http._key_use_tasks if t.get_loop() is loop]
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)


async def _ok_inner(scope, receive, send):
    await PlainTextResponse("ok")(scope, receive, send)


@pytest.mark.unit
class TestKeyUseRecording:
    """last_used_at is only filled in if the /mcp transport records the use."""

    async def _post(self, headers, principal=None, resolves=True):
        resolved = principal if resolves else None
        with (
            patch("juddges_mcp.http.resolve_mcp_principal", return_value=resolved),
            patch("juddges_mcp.http.touch_key") as touch,
        ):
            async with _asgi_client(McpAuthMiddleware(_ok_inner)) as c:
                response = await c.post("/", headers=headers)
            await _drain_key_use_tasks()
        return response, touch

    async def test_successful_request_records_the_key_use_once(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        response, touch = await self._post(
            {"Authorization": "Bearer jdg_mcp_good"}, principal
        )
        assert response.status_code == 200
        touch.assert_called_once_with("key-1")

    @pytest.mark.parametrize(
        ("headers", "resolves"),
        [
            ({}, True),
            ({"Authorization": "Basic dXNlcjpwYXNz"}, True),
            ({"Authorization": "Bearer jdg_mcp_revoked"}, False),
        ],
        ids=["no-credential", "non-bearer-scheme", "unresolvable-key"],
    )
    async def test_rejected_request_records_nothing(self, headers, resolves):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        response, touch = await self._post(headers, principal, resolves)
        assert response.status_code == 401
        touch.assert_not_called()

    async def test_principal_without_key_id_is_served_and_records_nothing(self):
        principal = SimpleNamespace(id="user-123")
        response, touch = await self._post(
            {"Authorization": "Bearer jdg_mcp_good"}, principal
        )
        assert response.status_code == 200
        touch.assert_not_called()

    async def test_a_failing_write_does_not_fail_the_request(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        with (
            patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal),
            patch("juddges_mcp.http.touch_key", side_effect=RuntimeError("db down")),
            patch("juddges_mcp.http.logger") as log,
        ):
            async with _asgi_client(McpAuthMiddleware(_ok_inner)) as c:
                response = await c.post(
                    "/", headers={"Authorization": "Bearer jdg_mcp_good"}
                )
            await _drain_key_use_tasks()
            # The done-callback runs on the loop after the task finishes.
            await asyncio.sleep(0)
        assert response.status_code == 200
        assert response.text == "ok"
        # The failure was consumed and logged, not left to surface at GC time.
        log.warning.assert_called_once()
        assert "db down" in log.warning.call_args.args[0]

    async def test_finished_tasks_release_their_strong_reference(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        await self._post({"Authorization": "Bearer jdg_mcp_good"}, principal)
        await asyncio.sleep(0)
        loop = asyncio.get_running_loop()
        assert not [t for t in mcp_http._key_use_tasks if t.get_loop() is loop]


def _asgi_client(asgi_app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=asgi_app), base_url="http://test"
    )


BEARER = {"Authorization": "Bearer jdg_mcp_good"}


@pytest.mark.unit
class TestMcpRateLimiting:
    """The per-key budget and the rejected-key budget per IP."""

    async def _call(self, *, headers=BEARER, principal=None, resolves=True, n=1):
        resolved = principal if resolves else None
        responses = []
        with (
            patch(
                "juddges_mcp.http.resolve_mcp_principal", return_value=resolved
            ) as resolve,
            patch("juddges_mcp.http.touch_key") as touch,
        ):
            async with _asgi_client(McpAuthMiddleware(_ok_inner)) as c:
                for _ in range(n):
                    responses.append(await c.post("/", headers=headers))
            await _drain_key_use_tasks()
        return responses, resolve, touch

    def test_over_budget_key_is_429(self, client):
        from app.mcp_rate_limit import McpRateLimitExceeded

        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        with (
            patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal),
            patch(
                "juddges_mcp.http.enforce_mcp_rate_limit",
                side_effect=McpRateLimitExceeded("limit: 120/hour", retry_after=3600),
            ),
        ):
            response = client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "method": "ping", "id": 1},
                headers=BEARER,
            )
        assert response.status_code == 429
        assert "120/hour" in response.text
        assert response.headers["Retry-After"] == "3600"
        assert int(response.headers["Retry-After"]) > 0

    async def test_real_per_key_budget_throttles_and_sets_retry_after(
        self, monkeypatch
    ):
        monkeypatch.setenv("MCP_RATE_LIMIT", "2/minute")
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        responses, _, _ = await self._call(principal=principal, n=3)
        assert [r.status_code for r in responses] == [200, 200, 429]
        assert responses[2].headers["Retry-After"] == "60"

    async def test_throttled_key_does_not_reach_the_key_use_write(self, monkeypatch):
        monkeypatch.setenv("MCP_RATE_LIMIT", "1/minute")
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        responses, _, touch = await self._call(principal=principal, n=3)
        assert [r.status_code for r in responses] == [200, 429, 429]
        # Only the one served request recorded a use.
        touch.assert_called_once_with("key-1")

    async def test_throttled_key_never_calls_record_key_use(self):
        from app.mcp_rate_limit import McpRateLimitExceeded

        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        with (
            patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal),
            patch(
                "juddges_mcp.http.enforce_mcp_rate_limit",
                side_effect=McpRateLimitExceeded("limit", retry_after=60),
            ),
            patch("juddges_mcp.http._record_key_use") as record,
        ):
            async with _asgi_client(McpAuthMiddleware(_ok_inner)) as c:
                response = await c.post("/", headers=BEARER)
        assert response.status_code == 429
        record.assert_not_called()

    async def test_exhausted_ip_is_429_and_never_resolves_the_key(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        with (
            patch("juddges_mcp.http.mcp_auth_failures_exhausted", return_value=True),
            patch(
                "juddges_mcp.http.resolve_mcp_principal", return_value=principal
            ) as resolve,
        ):
            async with _asgi_client(McpAuthMiddleware(_ok_inner)) as c:
                response = await c.post("/", headers=BEARER)
        assert response.status_code == 429
        assert int(response.headers["Retry-After"]) > 0
        resolve.assert_not_called()

    async def test_real_rejected_keys_exhaust_the_ip_and_spare_the_database(
        self, monkeypatch
    ):
        """No mocked budget: the third request is refused by the real counter,
        and resolution (the database) ran only for the two that were charged."""
        monkeypatch.setenv("MCP_IP_RATE_LIMIT", "2/minute")
        responses, resolve, _ = await self._call(resolves=False, n=4)
        assert [r.status_code for r in responses] == [401, 401, 429, 429]
        assert resolve.call_count == 2
        assert responses[2].headers["Retry-After"] == "60"

    async def test_rejected_key_charges_the_failure_bucket_once(self):
        with patch("juddges_mcp.http.record_mcp_auth_failure") as record:
            responses, _, _ = await self._call(resolves=False)
        assert responses[0].status_code == 401
        record.assert_called_once()
        assert isinstance(record.call_args[0][0], str)

    async def test_valid_key_never_charges_the_failure_bucket(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        with patch("juddges_mcp.http.record_mcp_auth_failure") as record:
            responses, _, _ = await self._call(principal=principal, n=3)
        assert [r.status_code for r in responses] == [200, 200, 200]
        record.assert_not_called()

    @pytest.mark.parametrize(
        "headers",
        [{}, {"Authorization": "Basic dXNlcjpwYXNz"}, {"Authorization": "Bearer nope"}],
        ids=["no-credential", "non-bearer", "wrong-prefix"],
    )
    async def test_credentials_that_cost_nothing_to_reject_are_not_charged(
        self, headers
    ):
        with patch("juddges_mcp.http.record_mcp_auth_failure") as record:
            responses, resolve, _ = await self._call(headers=headers, resolves=False)
        assert responses[0].status_code == 401
        record.assert_not_called()
        resolve.assert_not_called()

    async def test_valid_key_is_served_even_when_the_ip_has_spent_nothing_else(
        self, monkeypatch
    ):
        """Legitimate traffic is not throttled by the IP budget however many
        requests it makes."""
        monkeypatch.setenv("MCP_IP_RATE_LIMIT", "1/minute")
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        responses, _, _ = await self._call(principal=principal, n=5)
        assert [r.status_code for r in responses] == [200] * 5

    async def test_principal_without_key_id_is_served_uncharged(self):
        principal = SimpleNamespace(id="user-123")
        with patch("juddges_mcp.http.enforce_mcp_rate_limit") as enforce:
            responses, _, _ = await self._call(principal=principal)
        assert responses[0].status_code == 200
        enforce.assert_not_called()

    def test_repeated_429s_through_the_real_app_stay_decodable(self, monkeypatch):
        """429s are built per request, like the 401: GZip edits a shared
        response's headers in place."""
        monkeypatch.setenv("MCP_IP_RATE_LIMIT", "1/minute")
        http_client = TestClient(real_app)
        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=None):
            statuses = []
            for _ in range(4):
                response = http_client.post(
                    "/mcp",
                    json=INITIALIZE,
                    headers={**BEARER, "Accept-Encoding": "gzip"},
                )
                statuses.append(response.status_code)
                body = response.json()
                assert "error" in body
        assert statuses == [401, 429, 429, 429]
