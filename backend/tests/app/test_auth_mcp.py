"""Unit tests for app.core.auth_mcp: key material helpers and key resolution."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.core.auth_mcp import (
    MCP_KEY_PREFIX,
    generate_mcp_key,
    hash_mcp_key,
    key_prefix,
    resolve_mcp_principal,
)


@pytest.mark.unit
class TestKeyMaterial:
    def test_generated_key_carries_the_prefix(self):
        assert generate_mcp_key().startswith(MCP_KEY_PREFIX)

    def test_generated_keys_are_unique(self):
        assert len({generate_mcp_key() for _ in range(100)}) == 100

    def test_generated_key_has_enough_entropy(self):
        # 32 random bytes base64url-encoded is 43 chars, no padding.
        assert len(generate_mcp_key()) >= len(MCP_KEY_PREFIX) + 43

    def test_hash_is_stable_and_hex(self):
        token = "jdg_mcp_abc"  # noqa: S105
        first = hash_mcp_key(token)
        assert first == hash_mcp_key(token)
        assert len(first) == 64
        assert int(first, 16) >= 0

    def test_hash_differs_between_keys(self):
        assert hash_mcp_key("jdg_mcp_a") != hash_mcp_key("jdg_mcp_b")

    def test_keys_sharing_a_long_prefix_hash_differently(self):
        # Hashing must cover the whole key, not just a leading slice of it.
        shared = MCP_KEY_PREFIX + "A" * 40
        assert hash_mcp_key(shared + "B") != hash_mcp_key(shared + "C")

    def test_key_prefix_is_the_first_eight_characters(self):
        # Not a real key: the expected value must come from slicing this
        # input, so an implementation returning a constant fails here.
        token = "ABCDEFGHIJKL"  # noqa: S105
        assert key_prefix(token) == "ABCDEFGH"
        assert len(key_prefix(token)) == 8


def _row(**overrides):
    base = {
        "id": "key-1",
        "user_id": "user-123",
        "scopes": ["search:read"],
        "expires_at": None,
        "revoked_at": None,
    }
    base.update(overrides)
    return base


def _admin_returning(rows):
    """A Supabase admin client stub whose select().eq().execute() yields rows."""
    client = MagicMock()
    execute = MagicMock()
    execute.data = rows
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = execute
    return client


@pytest.mark.unit
class TestResolveMcpPrincipal:
    def test_valid_key_resolves_to_its_owner(self):
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row()]),
        ):
            user = resolve_mcp_principal("jdg_mcp_valid")
        assert user is not None
        assert user.id == "user-123"
        assert user.raw_token == ""
        assert user.mcp_scopes == ["search:read"]
        assert user.mcp_key_id == "key-1"

    def test_wrong_prefix_never_touches_the_database(self):
        admin = _admin_returning([_row()])
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=admin):
            assert resolve_mcp_principal("eyJhbGciOi.some.jwt") is None
        admin.table.assert_not_called()

    def test_empty_token_returns_none(self):
        assert resolve_mcp_principal("") is None

    def test_unknown_hash_returns_none(self):
        # Review Focus 2: ON DELETE CASCADE removed the row with the user,
        # so the lookup misses and no dangling principal is minted.
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([]),
        ):
            assert resolve_mcp_principal("jdg_mcp_deleted_owner") is None

    def test_revoked_key_returns_none(self):
        revoked = _row(revoked_at="2026-01-01T00:00:00+00:00")
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([revoked]),
        ):
            assert resolve_mcp_principal("jdg_mcp_revoked") is None

    def test_expired_key_returns_none(self):
        past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row(expires_at=past)]),
        ):
            assert resolve_mcp_principal("jdg_mcp_expired") is None

    def test_future_expiry_still_resolves(self):
        future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row(expires_at=future)]),
        ):
            assert resolve_mcp_principal("jdg_mcp_fresh") is not None

    @pytest.mark.parametrize(
        "expires_at",
        ["not-a-date", "2030-01-01T00:00:00"],  # garbage, and naive (no offset)
    )
    def test_unparseable_or_naive_expiry_fails_closed(self, expires_at):
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row(expires_at=expires_at)]),
        ):
            assert resolve_mcp_principal("jdg_mcp_odd") is None

    def test_malformed_row_returns_none_and_does_not_raise(self):
        row = _row()
        del row["user_id"]
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([row]),
        ):
            assert resolve_mcp_principal("jdg_mcp_malformed") is None

    def test_database_failure_returns_none_and_does_not_raise(self):
        broken = MagicMock()
        broken.table.side_effect = RuntimeError("supabase down")
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=broken):
            assert resolve_mcp_principal("jdg_mcp_whatever") is None
