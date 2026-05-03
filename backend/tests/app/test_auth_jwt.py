"""
Unit tests for app.core.auth_jwt module.

Tests JWT authentication, admin client initialization, user authentication,
and authorization checks.
"""

import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    get_current_user,
    get_optional_user,
    get_user_db_client,
    get_user_supabase_client,
    require_admin,
)

# ===== AuthenticatedUser model tests =====


@pytest.mark.unit
class TestAuthenticatedUser:
    """Tests for the AuthenticatedUser class."""

    def _make_user_data(self, **overrides):
        base = {
            "id": "user-123",
            "email": "user@example.com",
            "role": "authenticated",
            "aud": "authenticated",
            "exp": 9999999999,
            "iat": 1000000000,
            "sub": "user-123",
            "user_metadata": {"name": "Test User"},
            "app_metadata": {},
        }
        base.update(overrides)
        return base

    def test_basic_initialization(self):
        data = self._make_user_data()
        user = AuthenticatedUser(data, access_token="tok-abc")

        assert user.id == "user-123"
        assert user.email == "user@example.com"
        assert user.role == "authenticated"
        assert user.raw_token == "tok-abc"  # noqa: S105
        assert user.sub == "user-123"

    def test_defaults_for_missing_fields(self):
        user = AuthenticatedUser({"id": "x"}, access_token="t")
        assert user.role == "authenticated"
        assert user.aud == ""
        assert user.exp == 0
        assert user.iat == 0
        assert user.sub == "x"  # defaults to id
        assert user.user_metadata == {}
        assert user.app_metadata == {}

    def test_repr(self):
        data = self._make_user_data()
        user = AuthenticatedUser(data, access_token="t")
        r = repr(user)
        assert "user-123" in r
        assert "user@example.com" in r

    def test_has_role(self):
        data = self._make_user_data(role="service_role")
        user = AuthenticatedUser(data, access_token="t")
        assert user.has_role("service_role") is True
        assert user.has_role("authenticated") is False

    def test_is_admin_service_role(self):
        data = self._make_user_data(role="service_role")
        user = AuthenticatedUser(data, access_token="t")
        assert user.is_admin() is True

    def test_is_admin_app_metadata_flag(self):
        data = self._make_user_data(
            role="authenticated", app_metadata={"is_admin": True}
        )
        user = AuthenticatedUser(data, access_token="t")
        assert user.is_admin() is True

    def test_not_admin(self):
        data = self._make_user_data(role="authenticated", app_metadata={})
        user = AuthenticatedUser(data, access_token="t")
        assert user.is_admin() is False


# ===== get_admin_supabase_client tests =====


@pytest.mark.unit
class TestGetAdminSupabaseClient:
    def setup_method(self):
        # Reset the global singleton before each test
        import app.core.auth_jwt as mod

        mod._admin_supabase_client = None

    def teardown_method(self):
        # Reset after the last test too — otherwise the MagicMock cached by
        # `test_creates_client_once` leaks into unrelated tests (e.g.,
        # require_admin checks in test_authorization_boundaries.py see a mock
        # client and accept any auth).
        import app.core.auth_jwt as mod

        mod._admin_supabase_client = None

    def test_raises_when_env_vars_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            # Remove the vars
            os.environ.pop("SUPABASE_URL", None)
            os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
            with pytest.raises(ValueError, match="SUPABASE_URL"):
                get_admin_supabase_client()

    @patch("app.core.auth_jwt.create_client")
    def test_creates_client_once(self, mock_create):
        mock_client = MagicMock()
        mock_create.return_value = mock_client

        with patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://test.supabase.co",
                "SUPABASE_SERVICE_ROLE_KEY": "svc-key",
            },
        ):
            result1 = get_admin_supabase_client()
            result2 = get_admin_supabase_client()

        # Should only create once (singleton)
        assert mock_create.call_count == 1
        assert result1 is result2


# ===== get_user_supabase_client tests =====


@pytest.mark.unit
class TestGetUserSupabaseClient:
    def test_raises_when_env_vars_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("SUPABASE_URL", None)
            os.environ.pop("NEXT_PUBLIC_SUPABASE_ANON_KEY", None)
            with pytest.raises(ValueError, match="SUPABASE_URL"):
                get_user_supabase_client("some-token")

    @patch("app.core.auth_jwt.create_client")
    def test_creates_client_with_token(self, mock_create):
        mock_client = MagicMock()
        mock_create.return_value = mock_client

        with patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://test.supabase.co",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon-key",
            },
        ):
            result = get_user_supabase_client("user-token")

        mock_client.auth.set_session.assert_called_once_with("user-token", "")
        assert result is mock_client


# ===== get_current_user tests =====


@pytest.mark.unit
class TestGetCurrentUser:
    async def test_rejects_empty_token(self):
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="")
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)
        assert exc_info.value.status_code == 401

    @patch("app.core.auth_jwt.get_admin_supabase_client")
    async def test_rejects_invalid_token(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.auth.get_user.return_value = None
        mock_get_client.return_value = mock_client

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-token")
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)
        assert exc_info.value.status_code == 401

    @patch("app.core.auth_jwt.get_admin_supabase_client")
    async def test_rejects_when_user_response_has_no_user(self, mock_get_client):
        mock_response = MagicMock()
        mock_response.user = None
        mock_client = MagicMock()
        mock_client.auth.get_user.return_value = mock_response
        mock_get_client.return_value = mock_client

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="tok")
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)
        assert exc_info.value.status_code == 401

    @patch("app.core.auth_jwt.get_admin_supabase_client")
    async def test_success_with_model_dump(self, mock_get_client):
        mock_user = MagicMock()
        mock_user.model_dump.return_value = {
            "id": "u1",
            "email": "a@b.com",
            "role": "authenticated",
        }
        mock_response = MagicMock()
        mock_response.user = mock_user
        mock_client = MagicMock()
        mock_client.auth.get_user.return_value = mock_response
        mock_get_client.return_value = mock_client

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-tok")
        result = await get_current_user(creds)
        assert result.id == "u1"
        assert result.email == "a@b.com"

    @patch("app.core.auth_jwt.get_admin_supabase_client")
    async def test_wraps_unexpected_exceptions(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.auth.get_user.side_effect = RuntimeError("network down")
        mock_get_client.return_value = mock_client

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="tok")
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)
        assert exc_info.value.status_code == 401
        assert "network down" in str(exc_info.value.detail)


# ===== get_optional_user tests =====


@pytest.mark.unit
class TestGetOptionalUser:
    async def test_returns_none_without_credentials(self):
        result = await get_optional_user(None)
        assert result is None

    @patch("app.core.auth_jwt.get_admin_supabase_client")
    async def test_returns_none_on_invalid_token(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.auth.get_user.return_value = None
        mock_get_client.return_value = mock_client

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad")
        result = await get_optional_user(creds)
        assert result is None


# ===== require_admin tests =====


@pytest.mark.unit
class TestRequireAdmin:
    async def test_allows_admin_user(self):
        user = AuthenticatedUser(
            {"id": "a1", "email": "admin@test.com", "role": "service_role"},
            access_token="t",
        )
        result = await require_admin(user)
        assert result is user

    async def test_rejects_non_admin(self):
        user = AuthenticatedUser(
            {"id": "u1", "email": "user@test.com", "role": "authenticated"},
            access_token="t",
        )
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(user)
        assert exc_info.value.status_code == 403


# ===== get_user_db_client tests =====


@pytest.mark.unit
class TestGetUserDbClient:
    @patch("app.core.auth_jwt.get_user_supabase_client")
    def test_delegates_to_get_user_supabase_client(self, mock_get):
        mock_client = MagicMock()
        mock_get.return_value = mock_client

        user = AuthenticatedUser(
            {"id": "u1", "email": "a@b.com"}, access_token="my-tok"
        )
        result = get_user_db_client(user)
        mock_get.assert_called_once_with("my-tok")
        assert result is mock_client
