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
            "postgresql+psycopg://user:pass@localhost:5432/mydb"
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


@pytest.mark.unit
class TestLangchainCacheDatabaseUrlFallback:
    """#191: cache falls back to DATABASE_URL when its own var is unset."""

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    @patch("app.langchain_cache.create_engine")
    def test_falls_back_to_database_url(
        self, mock_engine, mock_cache_cls, mock_set, monkeypatch
    ):
        monkeypatch.delenv("LANGCHAIN_CACHE_DATABASE_URL", raising=False)
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/main")

        from app.langchain_cache import setup_langchain_cache

        setup_langchain_cache()

        mock_engine.assert_called_once_with(
            "postgresql+psycopg://u:p@localhost:5432/main"
        )
        mock_set.assert_called_once()

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    @patch("app.langchain_cache.create_engine")
    def test_explicit_var_takes_precedence_over_database_url(
        self, mock_engine, mock_cache_cls, mock_set, monkeypatch
    ):
        monkeypatch.setenv(
            "LANGCHAIN_CACHE_DATABASE_URL", "postgresql://u:p@cache-host:5432/cache"
        )
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@main-host:5432/main")

        from app.langchain_cache import setup_langchain_cache

        setup_langchain_cache()

        mock_engine.assert_called_once_with(
            "postgresql+psycopg://u:p@cache-host:5432/cache"
        )


@pytest.mark.unit
class TestLangchainCacheDriver:
    """The backend image ships psycopg 3 only, so a bare ``postgresql://`` URL
    must not resolve to SQLAlchemy's default psycopg2 dialect."""

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    def test_bare_postgresql_url_uses_psycopg3_driver(
        self, mock_cache_cls, mock_set, monkeypatch
    ):
        monkeypatch.delenv("LANGCHAIN_CACHE_DATABASE_URL", raising=False)
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/main")

        from app.langchain_cache import setup_langchain_cache

        setup_langchain_cache()

        assert mock_cache_cls.called, (
            "cache was never initialised — building the engine raised"
        )
        engine = mock_cache_cls.call_args.args[0]
        assert engine.dialect.driver == "psycopg"

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    def test_explicit_psycopg_driver_is_left_alone(
        self, mock_cache_cls, mock_set, monkeypatch
    ):
        monkeypatch.delenv("LANGCHAIN_CACHE_DATABASE_URL", raising=False)
        monkeypatch.setenv(
            "DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/main"
        )

        from app.langchain_cache import setup_langchain_cache

        setup_langchain_cache()

        assert mock_cache_cls.called
        engine = mock_cache_cls.call_args.args[0]
        assert engine.dialect.driver == "psycopg"
        assert str(engine.url) == "postgresql+psycopg://u:***@localhost:5432/main"


@pytest.mark.unit
class TestLangchainCacheCreateRace:
    """Eight gunicorn workers build the cache concurrently at boot, so the
    CREATE TABLE inside SQLAlchemyMd5Cache can lose a race against a sibling
    worker. The table exists by then, so a retry succeeds."""

    @staticmethod
    def _unique_violation():
        from sqlalchemy.exc import IntegrityError

        return IntegrityError(
            "CREATE TABLE full_md5_llm_cache (...)",
            {},
            Exception(
                "duplicate key value violates unique constraint "
                '"pg_type_typname_nsp_index"'
            ),
        )

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    @patch("app.langchain_cache.create_engine")
    def test_retries_once_when_a_sibling_worker_wins_the_create(
        self, mock_engine, mock_cache_cls, mock_set, monkeypatch
    ):
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/main")
        winning_cache = MagicMock()
        mock_cache_cls.side_effect = [self._unique_violation(), winning_cache]

        from app.langchain_cache import setup_langchain_cache

        setup_langchain_cache()

        mock_set.assert_called_once_with(winning_cache)

    @patch("app.langchain_cache.set_llm_cache")
    @patch("app.langchain_cache.SQLAlchemyMd5Cache")
    @patch("app.langchain_cache.create_engine")
    def test_gives_up_after_a_second_failure(
        self, mock_engine, mock_cache_cls, mock_set, monkeypatch
    ):
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/main")
        mock_cache_cls.side_effect = [
            self._unique_violation(),
            self._unique_violation(),
        ]

        from app.langchain_cache import setup_langchain_cache

        # Must not raise — the app still boots without a cache.
        setup_langchain_cache()

        mock_set.assert_not_called()
