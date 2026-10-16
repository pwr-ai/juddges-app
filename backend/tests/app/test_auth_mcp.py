"""Unit tests for app.core.auth_mcp: key material, key resolution, and the dual-credential dependency."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.core.auth_mcp import (
    MCP_KEY_PREFIX,
    THROTTLE_SECONDS,
    generate_mcp_key,
    get_current_user_or_mcp_key,
    hash_mcp_key,
    key_prefix,
    resolve_mcp_principal,
    should_record_use,
    touch_key,
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

    def test_key_prefix_is_the_first_sixteen_characters(self):
        # Not a real key: the expected value must come from slicing this
        # input, so an implementation returning a constant fails here.
        token = "ABCDEFGHIJKLMNOPQRSTUVWX"  # noqa: S105
        assert key_prefix(token) == "ABCDEFGHIJKLMNOP"
        assert len(key_prefix(token)) == 16

    def test_key_prefix_distinguishes_generated_keys(self):
        assert key_prefix(generate_mcp_key()) != key_prefix(generate_mcp_key())


@pytest.mark.unit
class TestResolutionFailureDoesNotLogTheKey:
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

    def test_key_never_reaches_the_log_when_the_backend_is_unconfigured(self):
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

    def test_key_never_reaches_the_log_when_the_query_fails_midway(self):
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


def _touch_client(last_used_at):
    """A Supabase admin client stub whose select().eq().execute() yields one row."""
    client = MagicMock()
    execute = MagicMock()
    execute.data = [{"last_used_at": last_used_at}]
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = execute
    return client


@pytest.mark.unit
class TestTouchKey:
    def test_recent_use_writes_nothing(self):
        recent = (datetime.now(UTC) - timedelta(seconds=10)).isoformat()
        client = _touch_client(recent)
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=client):
            touch_key("key-1")
        client.table.return_value.update.assert_not_called()

    def test_stale_use_writes_last_used_at(self):
        old = (datetime.now(UTC) - timedelta(seconds=THROTTLE_SECONDS + 1)).isoformat()
        client = _touch_client(old)
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=client):
            touch_key("key-1")
        update = client.table.return_value.update
        update.assert_called_once()
        assert "last_used_at" in update.call_args.args[0]
        update.return_value.eq.assert_called_once_with("id", "key-1")

    def test_failure_is_swallowed(self):
        # touch_key runs as a background task; it must never raise into the request.
        broken = MagicMock()
        broken.table.side_effect = RuntimeError("supabase down")
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=broken):
            touch_key("key-1")


def _request_with(authorization: str | None):
    request = MagicMock()
    request.headers = {} if authorization is None else {"Authorization": authorization}
    return request


@pytest.mark.unit
class TestDualCredentialDependency:
    async def test_mcp_key_takes_the_key_path(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        tasks = BackgroundTasks()
        with patch(
            "app.core.auth_mcp.resolve_mcp_principal", return_value=principal
        ) as resolve:
            user = await get_current_user_or_mcp_key(
                _request_with("Bearer jdg_mcp_abc"), tasks
            )
        resolve.assert_called_once_with("jdg_mcp_abc")
        assert user is principal
        assert len(tasks.tasks) == 1  # the throttled touch_key
        assert tasks.tasks[0].func is touch_key
        assert tasks.tasks[0].args == ("key-1",)

    async def test_invalid_mcp_key_is_rejected_with_401(self):
        with (
            patch("app.core.auth_mcp.resolve_mcp_principal", return_value=None),
            pytest.raises(HTTPException) as exc,
        ):
            await get_current_user_or_mcp_key(
                _request_with("Bearer jdg_mcp_revoked"), BackgroundTasks()
            )
        assert exc.value.status_code == 401

    async def test_jwt_falls_through_to_the_existing_path(self):
        jwt_user = MagicMock(id="user-456")
        with patch(
            "app.core.auth_mcp.get_current_user", return_value=jwt_user
        ) as jwt_path:
            user = await get_current_user_or_mcp_key(
                _request_with("Bearer eyJhbGciOi.header.sig"), BackgroundTasks()
            )
        jwt_path.assert_awaited_once()
        assert user is jwt_user

    async def test_missing_header_is_rejected_with_401(self):
        with pytest.raises(HTTPException) as exc:
            await get_current_user_or_mcp_key(_request_with(None), BackgroundTasks())
        assert exc.value.status_code == 401

    async def test_non_bearer_scheme_is_rejected_with_401(self):
        with pytest.raises(HTTPException) as exc:
            await get_current_user_or_mcp_key(
                _request_with("Basic dXNlcjpwYXNz"), BackgroundTasks()
            )
        assert exc.value.status_code == 401

    async def test_bearer_with_no_value_is_rejected_with_401(self):
        # Review Focus 1: must not IndexError on an empty credential.
        with pytest.raises(HTTPException) as exc:
            await get_current_user_or_mcp_key(
                _request_with("Bearer"), BackgroundTasks()
            )
        assert exc.value.status_code == 401
