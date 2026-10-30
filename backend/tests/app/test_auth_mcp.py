"""Unit tests for app.core.auth_mcp: key material, key resolution, and use recording."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.core.auth_mcp import (
    MCP_KEY_PREFIX,
    THROTTLE_SECONDS,
    clear_principal_cache,
    generate_mcp_key,
    hash_mcp_key,
    key_prefix,
    resolve_mcp_principal,
    should_record_use,
    touch_key,
)


@pytest.fixture(autouse=True)
def _isolated_principal_cache(monkeypatch):
    # Cache off unless a test opts in, and never shared between tests.
    monkeypatch.setenv("MCP_KEY_CACHE_TTL_SECONDS", "0")
    clear_principal_cache()
    yield
    clear_principal_cache()


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

    def test_key_prefix_is_the_first_sixteen_characters(self):
        # Not a real key: the expected value must come from slicing this
        # input, so an implementation returning a constant fails here.
        token = "ABCDEFGHIJKLMNOPQRSTUVWX"  # noqa: S105
        assert key_prefix(token) == "ABCDEFGHIJKLMNOP"
        assert len(key_prefix(token)) == 16

    def test_key_prefix_distinguishes_generated_keys(self):
        assert key_prefix(generate_mcp_key()) != key_prefix(generate_mcp_key())


@pytest.mark.unit
class TestResolutionFailureDoesNotLogPlaintext:
    """A traceback annotated with frame locals would write the plaintext key to the log."""

    def _capture(self):
        from loguru import logger

        captured: list[str] = []
        # Same settings as loguru's default stderr handler.
        sink_id = logger.add(
            captured.append,
            level="DEBUG",
            backtrace=True,
            diagnose=True,
            format="{message}",
        )
        return logger, captured, sink_id

    def test_does_not_log_plaintext_when_the_backend_is_unconfigured(self):
        key = f"{MCP_KEY_PREFIX}SUPERSECRETPLAINTEXT1234567890abcdef"
        logger, captured, sink_id = self._capture()
        try:
            with patch(
                "app.core.auth_mcp.get_admin_supabase_client",
                side_effect=ValueError("SUPABASE_URL is not set"),
            ):
                assert resolve_mcp_principal(key) is None
        finally:
            logger.remove(sink_id)

        output = "".join(captured)
        assert "MCP key resolution failed" in output
        assert "ValueError" in output
        assert key not in output
        assert "SUPERSECRET" not in output
        assert MCP_KEY_PREFIX not in output
        assert hash_mcp_key(key) not in output

    def test_does_not_log_plaintext_when_the_query_fails_midway(self):
        key = f"{MCP_KEY_PREFIX}SUPERSECRETPLAINTEXT1234567890abcdef"
        logger, captured, sink_id = self._capture()
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.execute.side_effect = RuntimeError(
            "connection reset"
        )
        try:
            with patch(
                "app.core.auth_mcp.get_admin_supabase_client", return_value=client
            ):
                assert resolve_mcp_principal(key) is None
        finally:
            logger.remove(sink_id)

        output = "".join(captured)
        assert "RuntimeError" in output
        assert key not in output
        assert MCP_KEY_PREFIX not in output
        assert hash_mcp_key(key) not in output


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

    def test_lookup_is_keyed_on_the_hash_not_the_raw_token(self):
        token = "jdg_mcp_under_test"  # noqa: S105
        admin = _admin_returning([_row()])
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=admin):
            resolve_mcp_principal(token)
        eq = admin.table.return_value.select.return_value.eq
        eq.assert_called_once_with("token_hash", hash_mcp_key(token))

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

    def test_database_failure_is_logged_by_type_and_message_without_traceback(self):
        # A failure must stay distinguishable from a revoked key, but must not
        # use logger.exception: the traceback would carry the plaintext key
        # (see TestResolutionFailureDoesNotLogTheKey).
        broken = MagicMock()
        broken.table.side_effect = RuntimeError("supabase down")
        with (
            patch("app.core.auth_mcp.get_admin_supabase_client", return_value=broken),
            patch("app.core.auth_mcp.logger") as log,
        ):
            assert resolve_mcp_principal("jdg_mcp_whatever") is None
        log.exception.assert_not_called()
        log.error.assert_called_once()
        message = log.error.call_args.args[0]
        assert "RuntimeError" in message
        assert "supabase down" in message


@pytest.mark.unit
class TestLastUsedThrottle:
    def test_never_used_key_is_recorded(self):
        assert should_record_use(None) is True

    def test_recently_used_key_is_not_recorded(self):
        recent = (datetime.now(UTC) - timedelta(seconds=10)).isoformat()
        assert should_record_use(recent) is False

    def test_key_used_outside_the_window_is_recorded(self):
        old = (datetime.now(UTC) - timedelta(seconds=THROTTLE_SECONDS + 1)).isoformat()
        assert should_record_use(old) is True

    def test_unparseable_last_used_is_recorded(self):
        assert should_record_use("not-a-timestamp") is True

    def test_naive_last_used_is_recorded_rather_than_raising(self):
        # A naive timestamp cannot be compared with an aware clock; treat it as unusable.
        assert should_record_use(datetime.now().isoformat()) is True


def _touch_client():
    """A Supabase admin client stub for the single conditional update."""
    return MagicMock()


def _all_calls(client):
    return [c[0] for c in client.mock_calls]


@pytest.mark.unit
class TestTouchKey:
    def test_recent_key_no_queries(self):
        recent = (datetime.now(UTC) - timedelta(seconds=10)).isoformat()
        client = _touch_client()
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client", return_value=client
        ) as get_client:
            touch_key("key-1", recent)
        get_client.assert_not_called()
        client.table.assert_not_called()

    def test_stale_key_single_update(self):
        old = (datetime.now(UTC) - timedelta(seconds=THROTTLE_SECONDS + 1)).isoformat()
        client = _touch_client()
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=client):
            touch_key("key-1", old)
        table = client.table.return_value
        client.table.assert_called_once_with("mcp_api_keys")
        table.select.assert_not_called()
        table.update.assert_called_once()
        assert "last_used_at" in table.update.call_args.args[0]
        table.update.return_value.eq.assert_called_once_with("id", "key-1")

    def test_never_used_key_single_update(self):
        client = _touch_client()
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=client):
            touch_key("key-1")
        table = client.table.return_value
        table.select.assert_not_called()
        table.update.assert_called_once()

    def test_update_is_conditional_on_the_throttle_window(self):
        # Two requests racing on a stale key must not both write.
        client = _touch_client()
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=client):
            touch_key("key-1")
        guarded = client.table.return_value.update.return_value.eq.return_value
        guarded.or_.assert_called_once()
        condition = guarded.or_.call_args.args[0]
        assert "last_used_at.is.null" in condition
        assert "last_used_at.lt." in condition

    def test_failure_swallowed_and_logged(self):
        # touch_key runs as a background task; it must never raise into the request.
        broken = MagicMock()
        broken.table.side_effect = RuntimeError("supabase down")
        with (
            patch("app.core.auth_mcp.get_admin_supabase_client", return_value=broken),
            patch("app.core.auth_mcp.logger") as log,
        ):
            touch_key("key-1")
        log.warning.assert_called_once()
        assert "supabase down" in log.warning.call_args.args[0]


@pytest.mark.unit
class TestLastUsedOnPrincipal:
    def test_resolution_carries_last_used_at(self):
        stamp = "2026-01-01T00:00:00+00:00"
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row(last_used_at=stamp)]),
        ):
            user = resolve_mcp_principal("jdg_mcp_valid")
        assert user.mcp_last_used_at == stamp


@pytest.mark.unit
class TestPrincipalCache:
    def _resolve(self, client, token="jdg_mcp_cached"):  # noqa: S107
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=client):
            return resolve_mcp_principal(token)

    def test_ttl_zero_disables_the_cache(self):
        client = _admin_returning([_row()])
        self._resolve(client)
        self._resolve(client)
        assert client.table.call_count == 2

    def test_hit_within_ttl_skips_the_query(self, monkeypatch):
        monkeypatch.setenv("MCP_KEY_CACHE_TTL_SECONDS", "30")
        client = _admin_returning([_row()])
        first = self._resolve(client)
        second = self._resolve(client)
        assert client.table.call_count == 1
        assert second.mcp_key_id == first.mcp_key_id == "key-1"

    def test_cache_revoked_after_ttl_is_rejected(self, monkeypatch):
        monkeypatch.setenv("MCP_KEY_CACHE_TTL_SECONDS", "30")
        now = [1000.0]
        monkeypatch.setattr("app.core.auth_mcp.time.monotonic", lambda: now[0])
        assert self._resolve(_admin_returning([_row()])) is not None

        revoked = _admin_returning([_row(revoked_at="2026-01-01T00:00:00+00:00")])
        # Still within the TTL: revocation has not taken effect yet (documented).
        now[0] += 29
        assert self._resolve(revoked) is not None
        now[0] += 2
        assert self._resolve(revoked) is None

    def test_cache_never_stores_failures(self, monkeypatch):
        monkeypatch.setenv("MCP_KEY_CACHE_TTL_SECONDS", "30")
        assert self._resolve(_admin_returning([])) is None
        # The key appears afterwards: a cached miss would hide it.
        assert self._resolve(_admin_returning([_row()])) is not None

    def test_cache_does_not_keep_the_plaintext_key(self, monkeypatch):
        from app.core import auth_mcp

        monkeypatch.setenv("MCP_KEY_CACHE_TTL_SECONDS", "30")
        self._resolve(_admin_returning([_row()]), token="jdg_mcp_PLAINTEXTSECRET")
        assert all("PLAINTEXTSECRET" not in str(k) for k in auth_mcp._principal_cache)
