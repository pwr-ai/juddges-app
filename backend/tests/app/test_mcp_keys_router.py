"""Unit tests for the /mcp/keys management router."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.auth_jwt import get_current_user
from app.core.auth_mcp import MCP_KEY_PREFIX
from app.mcp_keys import create_key, router

KEY_ID = "11111111-1111-4111-8111-111111111111"


class _FakeUser:
    id = "user-123"
    email = "user@example.com"
    role = "authenticated"


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    return TestClient(app)


def _admin_stub(select_rows=None, inserted=None):
    """Supabase admin stub covering insert/select/update chains."""
    admin = MagicMock()
    table = admin.table.return_value

    insert_exec = MagicMock()
    insert_exec.data = [inserted or {"id": "key-1"}]
    table.insert.return_value.execute.return_value = insert_exec

    select_exec = MagicMock()
    select_exec.data = select_rows or []
    table.select.return_value.eq.return_value.order.return_value.execute.return_value = select_exec

    update_exec = MagicMock()
    update_exec.data = [{"id": "key-1"}]
    table.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = update_exec
    return admin


@pytest.mark.unit
class TestCreateKey:
    def test_audit_payload_never_contains_the_plaintext(self, client):
        with (
            patch("app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()),
            patch("app.mcp_keys.log_audit_background") as audit,
        ):
            response = client.post("/mcp/keys", json={"name": "laptop"})
        assert response.json()["key"] not in str(audit.call_args)

    def test_created_at_prefers_the_stored_value(self, client):
        stored = "2026-01-01T00:00:00+00:00"
        admin = _admin_stub(inserted={"id": "key-1", "created_at": stored})
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.post("/mcp/keys", json={"name": "laptop"})
        assert response.json()["created_at"] == stored

    def test_returns_the_plaintext_key_exactly_once(self, client):
        with patch(
            "app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()
        ):
            response = client.post("/mcp/keys", json={"name": "laptop"})
        assert response.status_code == 201
        body = response.json()
        assert body["key"].startswith("jdg_mcp_")
        assert body["prefix"].startswith(MCP_KEY_PREFIX)
        assert len(body["prefix"]) == 16
        assert body["key"].startswith(body["prefix"])
        assert "token_hash" not in body

    def test_stores_only_the_hash(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.post("/mcp/keys", json={"name": "laptop"})
        plaintext = response.json()["key"]
        stored = admin.table.return_value.insert.call_args[0][0]
        assert stored["token_hash"] != plaintext
        assert plaintext not in str(stored)
        assert stored["user_id"] == "user-123"
        assert stored["scopes"] == ["search:read"]

    def test_writes_an_audit_record(self, client):
        with (
            patch("app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()),
            patch("app.mcp_keys.log_audit_background") as audit,
        ):
            client.post("/mcp/keys", json={"name": "laptop"})
        assert audit.call_args.kwargs["action_type"] == "mcp_key_created"


@pytest.mark.unit
class TestListKeys:
    def test_is_scoped_to_the_caller(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            client.get("/mcp/keys")
        admin.table.return_value.select.return_value.eq.assert_called_once_with(
            "user_id", "user-123"
        )

    def test_never_returns_hashes_or_plaintext(self, client):
        rows = [
            {
                "id": "key-1",
                "name": "laptop",
                "prefix": "jdg_mcp_AbCd1234",
                "scopes": ["search:read"],
                "created_at": "2026-10-14T10:00:00+00:00",
                "last_used_at": None,
                "expires_at": None,
                "revoked_at": None,
            }
        ]
        with patch(
            "app.mcp_keys.get_admin_supabase_client",
            return_value=_admin_stub(select_rows=rows),
        ):
            response = client.get("/mcp/keys")
        assert response.status_code == 200
        [key] = response.json()
        assert key["prefix"] == "jdg_mcp_AbCd1234"
        assert "token_hash" not in key
        assert "key" not in key


@pytest.mark.unit
class TestRevokeKey:
    def test_sets_revoked_at_scoped_to_the_caller(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.delete(f"/mcp/keys/{KEY_ID}")
        assert response.status_code == 204
        payload = admin.table.return_value.update.call_args[0][0]
        assert payload["revoked_at"] is not None
        # Scoped by both id and user_id so one user cannot revoke another's key.
        first = admin.table.return_value.update.return_value.eq
        first.assert_called_once_with("id", KEY_ID)
        first.return_value.eq.assert_called_once_with("user_id", "user-123")

    def test_unknown_key_is_404(self, client):
        admin = _admin_stub()
        empty = MagicMock()
        empty.data = []
        admin.table.return_value.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = empty
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.delete(f"/mcp/keys/{KEY_ID}")
        assert response.status_code == 404

    def test_only_live_keys_are_revoked(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            client.delete(f"/mcp/keys/{KEY_ID}")
        live = admin.table.return_value.update.return_value.eq.return_value.eq
        live.return_value.is_.assert_called_once_with("revoked_at", "null")

    def test_already_revoked_key_is_404_and_not_audited(self, client):
        admin = _admin_stub()
        empty = MagicMock()
        empty.data = []
        chain = admin.table.return_value.update.return_value.eq.return_value.eq
        chain.return_value.is_.return_value.execute.return_value = empty
        with (
            patch("app.mcp_keys.get_admin_supabase_client", return_value=admin),
            patch("app.mcp_keys.log_audit_background") as audit,
        ):
            response = client.delete(f"/mcp/keys/{KEY_ID}")
        assert response.status_code == 404
        audit.assert_not_called()

    def test_non_uuid_id_is_rejected_before_the_database(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.delete("/mcp/keys/nope")
        assert response.status_code == 422
        admin.table.assert_not_called()

    def test_writes_an_audit_record(self, client):
        with (
            patch("app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()),
            patch("app.mcp_keys.log_audit_background") as audit,
        ):
            client.delete(f"/mcp/keys/{KEY_ID}")
        assert audit.call_args.kwargs["action_type"] == "mcp_key_revoked"


def _reachable_calls(dependant):
    """Every dependency callable reachable from a route, recursively."""
    found = []
    for sub in dependant.dependencies:
        found.append(sub.call)
        found.extend(_reachable_calls(sub))
    return found


def _walk_routes(app_or_router):
    """Return (dependency callables, endpoints) for every route beneath this.

    fastapi >= 0.137 does not flatten `include_router`: it leaves an
    `_IncludedRouter` wrapper in `routes` that carries the included APIRouter
    and whatever dependencies the include added, and that wrapper has no
    `dependant` of its own. Descending through `include_context` is therefore
    the only way to see a domain router at all.
    """
    dependencies = []
    endpoints = []
    for route in app_or_router.routes:
        context = getattr(route, "include_context", None)
        if context is not None:
            for dependency in getattr(context, "dependencies", None) or []:
                dependencies.append(dependency.dependency)
            sub_dependencies, sub_endpoints = _walk_routes(context.included_router)
            dependencies.extend(sub_dependencies)
            endpoints.extend(sub_endpoints)
            continue
        dependant = getattr(route, "dependant", None)
        if dependant is not None:
            dependencies.extend(_reachable_calls(dependant))
        endpoint = getattr(route, "endpoint", None)
        if endpoint is not None:
            endpoints.append(endpoint)
    return dependencies, endpoints


def _key_resolving(callables):
    """Those defined in app.core.auth_mcp, i.e. that could resolve a key.

    Matched by module rather than by name so a newly added dependency is
    caught too; the module exposes no dependency at all today.
    """
    return [
        getattr(c, "__qualname__", repr(c))
        for c in callables
        if getattr(c, "__module__", None) == "app.core.auth_mcp"
    ]


@pytest.mark.unit
class TestKeyCannotManageKeys:
    def test_router_depends_on_jwt_only(self):
        """An MCP key must not mint or revoke keys.

        Asserted structurally: every route on this router depends on
        get_current_user, and nothing it reaches resolves an MCP key.
        """
        routes = [r for r in router.routes if hasattr(r, "dependant")]
        assert len(routes) == 3
        for route in routes:
            reachable = _reachable_calls(route.dependant)
            assert get_current_user in reachable, route.path
            assert not _key_resolving(reachable), route.path

    def test_no_http_route_authenticates_an_mcp_key(self):
        """No FastAPI route anywhere may accept a key as a credential.

        app.core.auth_mcp deliberately exposes no dependency: a key
        authenticates in one place only, the ASGI middleware in front of the
        mounted /mcp app. Checked app-wide rather than on this router alone,
        because a key accepted on any route widens what a leaked one reaches.
        """
        from app.server import app

        dependencies, endpoints = _walk_routes(app)
        assert not _key_resolving(dependencies), _key_resolving(dependencies)
        # Guards the walk, not the app: without this the assertion above
        # passes on an empty list. app.routes holds the domain routers as
        # unflattened wrappers, so a walk that does not descend into them
        # inspects only the LangServe chains and sees nothing.
        assert create_key in endpoints
        assert get_current_user in dependencies
