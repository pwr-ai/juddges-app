"""Unit tests for app.core.secrets — SecretsManager and convenience functions."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.unit
class TestSecretsManager:
    """Tests for the SecretsManager class."""

    def _make_manager(self):
        """Create a fresh SecretsManager instance (avoid cached singleton)."""
        from app.core.secrets import SecretsManager

        return SecretsManager()

    # --- init state ---

    def test_initial_state(self):
        mgr = self._make_manager()
        assert mgr._vault_secrets is None
        assert mgr._supabase is None
        assert mgr._vault_enabled is True

    # --- _init_supabase ---

    @patch("app.core.secrets.SUPABASE_AVAILABLE", False)
    def test_init_supabase_when_library_unavailable(self):
        mgr = self._make_manager()
        result = mgr._init_supabase()
        assert result is False
        assert mgr._vault_enabled is False

    @patch("app.core.secrets.SUPABASE_AVAILABLE", True)
    def test_init_supabase_missing_env_vars(self):
        mgr = self._make_manager()
        with patch.dict(os.environ, {}, clear=True):
            # Remove relevant env vars
            os.environ.pop("SUPABASE_URL", None)
            os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
            result = mgr._init_supabase()
        assert result is False
        assert mgr._vault_enabled is False

    @patch("app.core.secrets.SUPABASE_AVAILABLE", True)
    def test_init_supabase_returns_true_when_already_initialized(self):
        mgr = self._make_manager()
        mgr._supabase = MagicMock()  # pretend already connected
        result = mgr._init_supabase()
        assert result is True

    @patch("app.core.secrets.SUPABASE_AVAILABLE", True)
    @patch("app.core.secrets.create_client")
    def test_init_supabase_success(self, mock_create_client):
        mock_client = MagicMock()
        mock_create_client.return_value = mock_client
        mgr = self._make_manager()
        with patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_SERVICE_ROLE_KEY": "test-key",
            },
        ):
            result = mgr._init_supabase()
        assert result is True
        assert mgr._supabase is mock_client

    @patch("app.core.secrets.SUPABASE_AVAILABLE", True)
    @patch(
        "app.core.secrets.create_client", side_effect=RuntimeError("connection error")
    )
    def test_init_supabase_handles_exception(self, _mock_create):
        mgr = self._make_manager()
        with patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_SERVICE_ROLE_KEY": "test-key",
            },
        ):
            result = mgr._init_supabase()
        assert result is False
        assert mgr._vault_enabled is False

    # --- load_vault_secrets ---

    def test_load_vault_secrets_returns_cached(self):
        mgr = self._make_manager()
        cached = {"openai_api_key": "sk-test"}
        mgr._vault_secrets = cached
        result = mgr.load_vault_secrets()
        assert result is cached

    def test_load_vault_secrets_force_reload_ignores_cache(self):
        mgr = self._make_manager()
        mgr._vault_secrets = {"stale": "value"}
        mgr._vault_enabled = False  # no vault, should return empty
        result = mgr.load_vault_secrets(force_reload=True)
        assert result == {}

    def test_load_vault_secrets_vault_disabled(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        result = mgr.load_vault_secrets()
        assert result == {}

    def test_load_vault_secrets_from_rpc(self):
        """Secrets loaded via RPC function."""
        mgr = self._make_manager()
        mgr._vault_enabled = True

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [
            {"name": "openai_api_key", "decrypted_secret": "sk-real"},
            {"name": "other_key", "decrypted_secret": "val"},
        ]
        mock_supabase.rpc.return_value.execute.return_value = mock_response
        mgr._supabase = mock_supabase

        result = mgr.load_vault_secrets(force_reload=True)
        assert result == {"openai_api_key": "sk-real", "other_key": "val"}

    def test_load_vault_secrets_filters_empty_entries(self):
        """Entries with None name or secret are filtered out."""
        mgr = self._make_manager()
        mgr._vault_enabled = True

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [
            {"name": None, "decrypted_secret": "sk-real"},
            {"name": "key", "decrypted_secret": None},
            {"name": "good_key", "decrypted_secret": "good_val"},
        ]
        mock_supabase.rpc.return_value.execute.return_value = mock_response
        mgr._supabase = mock_supabase

        result = mgr.load_vault_secrets(force_reload=True)
        assert result == {"good_key": "good_val"}

    def test_load_vault_secrets_handles_exception(self):
        mgr = self._make_manager()
        mgr._vault_enabled = True

        mock_supabase = MagicMock()
        mock_supabase.rpc.side_effect = RuntimeError("db down")
        mgr._supabase = mock_supabase

        result = mgr.load_vault_secrets(force_reload=True)
        assert result == {}

    # --- get_secret ---

    def test_get_secret_from_vault(self):
        mgr = self._make_manager()
        mgr._vault_secrets = {"my_secret": "vault_value"}
        mgr._vault_enabled = True
        result = mgr.get_secret("my_secret")
        assert result == "vault_value"

    def test_get_secret_fallback_to_env(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        with patch.dict(os.environ, {"MY_ENV_SECRET": "env_value"}):
            result = mgr.get_secret("missing", fallback_env="MY_ENV_SECRET")
        assert result == "env_value"

    def test_get_secret_required_raises_when_not_found(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        with pytest.raises(ValueError, match="not found"):
            mgr.get_secret("missing", required=True)

    def test_get_secret_required_with_fallback_env_in_error_message(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("FALLBACK_VAR", None)
            with pytest.raises(ValueError, match="FALLBACK_VAR"):
                mgr.get_secret("missing", fallback_env="FALLBACK_VAR", required=True)

    def test_get_secret_returns_none_when_not_found_and_not_required(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        result = mgr.get_secret("nonexistent")
        assert result is None

    # --- get_openai_key ---

    def test_get_openai_key_from_vault(self):
        mgr = self._make_manager()
        mgr._vault_secrets = {"openai_api_key": "sk-vault-123"}
        mgr._vault_enabled = True
        result = mgr.get_openai_key()
        assert result == "sk-vault-123"

    def test_get_openai_key_from_env(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-env-456"}):
            result = mgr.get_openai_key()
        assert result == "sk-env-456"

    def test_get_openai_key_raises_when_missing(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        with (
            patch.dict(os.environ, {}, clear=True),
            pytest.raises(ValueError, match="openai_api_key"),
        ):
            mgr.get_openai_key()

    # --- refresh_secrets ---

    def test_refresh_secrets_calls_force_reload(self):
        mgr = self._make_manager()
        mgr._vault_enabled = False
        result = mgr.refresh_secrets()
        assert result == {}

    # --- list_available_secrets ---

    def test_list_available_secrets_returns_names(self):
        mgr = self._make_manager()
        mgr._vault_secrets = {"key_a": "a", "key_b": "b"}
        mgr._vault_enabled = True
        result = mgr.list_available_secrets()
        assert set(result) == {"key_a", "key_b"}


@pytest.mark.unit
class TestConvenienceFunctions:
    """Test module-level convenience functions."""

    @patch("app.core.secrets.get_secrets_manager")
    def test_get_openai_key_convenience(self, mock_get_mgr):
        from app.core.secrets import get_openai_key

        mock_mgr = MagicMock()
        mock_mgr.get_openai_key.return_value = "sk-convenience"
        mock_get_mgr.return_value = mock_mgr
        assert get_openai_key() == "sk-convenience"

    @patch("app.core.secrets.get_secrets_manager")
    def test_refresh_secrets_convenience(self, mock_get_mgr):
        from app.core.secrets import refresh_secrets

        mock_mgr = MagicMock()
        mock_mgr.refresh_secrets.return_value = {"k": "v"}
        mock_get_mgr.return_value = mock_mgr
        assert refresh_secrets() == {"k": "v"}

    @patch("app.core.secrets.get_secrets_manager")
    def test_list_secrets_convenience(self, mock_get_mgr):
        from app.core.secrets import list_secrets

        mock_mgr = MagicMock()
        mock_mgr.list_available_secrets.return_value = ["a", "b"]
        mock_get_mgr.return_value = mock_mgr
        assert list_secrets() == ["a", "b"]
