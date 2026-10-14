"""Unit tests for the /mcp/keys management router."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.auth_jwt import get_current_user
from app.mcp_keys import router


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
    table.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
        update_exec
    )
    return admin


@pytest.mark.unit
class TestCreateKey:
    def test_returns_the_plaintext_key_exactly_once(self, client):
        with patch(
            "app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()
        ):
            response = client.post("/mcp/keys", json={"name": "laptop"})
        assert response.status_code == 201
        body = response.json()
        assert body["key"].startswith("jdg_mcp_")
        assert body["prefix"] == "jdg_mcp_"
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
    def test_never_returns_hashes_or_plaintext(self, client):
        rows = [
            {
                "id": "key-1",
                "name": "laptop",
                "prefix": "jdg_mcp_",
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
        assert key["prefix"] == "jdg_mcp_"
        assert "token_hash" not in key
        assert "key" not in key


@pytest.mark.unit
class TestRevokeKey:
    def test_sets_revoked_at_scoped_to_the_caller(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.delete("/mcp/keys/key-1")
        assert response.status_code == 204
        payload = admin.table.return_value.update.call_args[0][0]
        assert payload["revoked_at"] is not None
        # Scoped by both id and user_id so one user cannot revoke another's key.
        first = admin.table.return_value.update.return_value.eq
        first.assert_called_once_with("id", "key-1")
        first.return_value.eq.assert_called_once_with("user_id", "user-123")

    def test_unknown_key_is_404(self, client):
        admin = _admin_stub()
        empty = MagicMock()
        empty.data = []
        admin.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = empty
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.delete("/mcp/keys/nope")
        assert response.status_code == 404

    def test_writes_an_audit_record(self, client):
        with (
            patch("app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()),
            patch("app.mcp_keys.log_audit_background") as audit,
        ):
            client.delete("/mcp/keys/key-1")
        assert audit.call_args.kwargs["action_type"] == "mcp_key_revoked"


@pytest.mark.unit
class TestKeyCannotManageKeys:
    def test_router_depends_on_jwt_only(self):
        """An MCP key must not mint or revoke keys.

        Asserted structurally: every route on this router depends on
        get_current_user, never get_current_user_or_mcp_key.
        """
        from app.core.auth_mcp import get_current_user_or_mcp_key

        def calls(dependant):
            """Every dependency callable reachable from a route, recursively."""
            found = []
            for sub in dependant.dependencies:
                found.append(sub.call)
                found.extend(calls(sub))
            return found

        routes = [r for r in router.routes if hasattr(r, "dependant")]
        assert len(routes) == 3
        for route in routes:
            reachable = calls(route.dependant)
            assert get_current_user in reachable, route.path
            assert get_current_user_or_mcp_key not in reachable, route.path
