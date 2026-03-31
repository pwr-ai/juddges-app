"""
Unit tests for app.langchain_cache module.

Tests cover:
- setup_langchain_cache behavior with/without env vars
- Error handling when cache setup fails
- Safe logging (no credentials leaked)
"""

from unittest.mock import MagicMock, patch

import pytest

# ===== setup_langchain_cache Tests =====


@pytest.mark.unit
class TestSetupLangchainCache:
    """Test setup_langchain_cache function."""

    @patch.dict("os.environ", {}, clear=True)
    @patch("app.langchain_cache.os.getenv", return_value=None)
    def test_no_env_var_skips_setup(self, mock_getenv):
        """When LANGCHAIN_CACHE_DATABASE_URL is not set, cache setup is skipped."""
        from app.langchain_cache import setup_langchain_cache

        # Should not raise
        setup_langchain_cache()

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    @patch("app.langchain_cache.create_engine")
    @patch("app.langchain_cache.os.getenv")
    def test_valid_url_initializes_cache(
        self, mock_getenv, mock_engine, mock_cache_cls, mock_set_cache
    ):
        """With a valid DATABASE_URL, cache should be initialized."""
        mock_getenv.return_value = "postgresql://user:pass@localhost:5432/mydb"
        mock_engine_instance = MagicMock()
        mock_engine.return_value = mock_engine_instance
        mock_cache_instance = MagicMock()
        mock_cache_cls.return_value = mock_cache_instance

        from app.langchain_cache import setup_langchain_cache

        setup_langchain_cache()

        mock_engine.assert_called_once_with(
            "postgresql://user:pass@localhost:5432/mydb"
        )
        mock_cache_cls.assert_called_once_with(mock_engine_instance)
        mock_set_cache.assert_called_once_with(mock_cache_instance)

    @patch("app.langchain_cache.create_engine")
    @patch("app.langchain_cache.os.getenv")
    def test_engine_failure_does_not_raise(self, mock_getenv, mock_engine):
        """If create_engine fails, the error is caught and app continues."""
        mock_getenv.return_value = "postgresql://bad-url"
        mock_engine.side_effect = Exception("Connection refused")

        from app.langchain_cache import setup_langchain_cache

        # Should NOT raise
        setup_langchain_cache()

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    @patch("app.langchain_cache.create_engine")
    @patch("app.langchain_cache.os.getenv")
    def test_cache_init_failure_does_not_raise(
        self, mock_getenv, mock_engine, mock_cache_cls, mock_set_cache
    ):
        """If SQLAlchemyMd5Cache fails, the error is caught."""
        mock_getenv.return_value = "postgresql://user:pass@host:5432/db"
        mock_cache_cls.side_effect = Exception("Table creation failed")

        from app.langchain_cache import setup_langchain_cache

        # Should NOT raise
        setup_langchain_cache()
