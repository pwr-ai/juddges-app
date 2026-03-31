"""Unit tests for app.health.checks module -- health check functions with mocked deps."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.health.checks import (
    check_all_services,
    check_celery,
    check_langfuse,
    check_meilisearch,
    check_postgresql,
    check_redis,
    check_supabase,
)
from app.health.models import ServiceHealth, ServiceStatus

# ---------------------------------------------------------------------------
# check_redis
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCheckRedis:
    """Tests for check_redis health check."""

    @pytest.mark.asyncio
    async def test_healthy_redis(self, monkeypatch):
        monkeypatch.setenv("REDIS_HOST", "localhost")
        monkeypatch.setenv("REDIS_PORT", "6379")

        mock_client = AsyncMock()
        mock_client.ping = AsyncMock(return_value=True)
        mock_client.aclose = AsyncMock()

        with patch("app.health.checks.aioredis.Redis", return_value=mock_client):
            result = await check_redis(timeout=1.0)
        assert result.status == ServiceStatus.HEALTHY
        assert result.name == "redis"
        assert result.response_time_ms is not None

    @pytest.mark.asyncio
    async def test_redis_not_configured(self, monkeypatch):
        monkeypatch.setenv("REDIS_HOST", "")
        result = await check_redis()
        assert result.status == ServiceStatus.UNKNOWN

    @pytest.mark.asyncio
    async def test_redis_timeout(self, monkeypatch):
        monkeypatch.setenv("REDIS_HOST", "localhost")
        monkeypatch.setenv("REDIS_PORT", "6379")

        mock_client = AsyncMock()
        mock_client.ping = AsyncMock(side_effect=TimeoutError("timed out"))
        mock_client.aclose = AsyncMock()

        with patch("app.health.checks.aioredis.Redis", return_value=mock_client):
            result = await check_redis(timeout=0.1)
        assert result.status == ServiceStatus.UNHEALTHY

    @pytest.mark.asyncio
    async def test_redis_connection_error(self, monkeypatch):
        monkeypatch.setenv("REDIS_HOST", "localhost")
        monkeypatch.setenv("REDIS_PORT", "6379")

        with patch(
            "app.health.checks.aioredis.Redis",
            side_effect=ConnectionError("refused"),
        ):
            result = await check_redis(timeout=0.1)
        assert result.status == ServiceStatus.UNHEALTHY


# ---------------------------------------------------------------------------
# check_postgresql
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCheckPostgresql:
    """Tests for check_postgresql health check."""

    @pytest.mark.asyncio
    async def test_postgresql_not_configured(self, monkeypatch):
        monkeypatch.delenv("DATABASE_URL", raising=False)
        result = await check_postgresql()
        assert result.status == ServiceStatus.UNKNOWN
        assert "not configured" in (result.message or "")

    @pytest.mark.asyncio
    async def test_postgresql_connection_error(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://bad:bad@nowhere:5432/nope")
        # AsyncConnectionPool will fail to connect
        result = await check_postgresql(timeout=0.5)
        assert result.status == ServiceStatus.UNHEALTHY


# ---------------------------------------------------------------------------
# check_supabase
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCheckSupabase:
    """Tests for check_supabase health check."""

    @pytest.mark.asyncio
    async def test_supabase_not_configured(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
        result = await check_supabase()
        assert result.status == ServiceStatus.UNKNOWN

    @pytest.mark.asyncio
    async def test_supabase_healthy(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://test-supabase.local")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.health.checks.httpx.AsyncClient", return_value=mock_client):
            result = await check_supabase()
        assert result.status == ServiceStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_supabase_degraded_status_code(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://test-supabase.local")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.health.checks.httpx.AsyncClient", return_value=mock_client):
            result = await check_supabase()
        assert result.status == ServiceStatus.DEGRADED

    @pytest.mark.asyncio
    async def test_supabase_404_is_healthy(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://test-supabase.local")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.health.checks.httpx.AsyncClient", return_value=mock_client):
            result = await check_supabase()
        assert result.status == ServiceStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_supabase_timeout(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://test-supabase.local")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=TimeoutError("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.health.checks.httpx.AsyncClient", return_value=mock_client):
            result = await check_supabase()
        assert result.status == ServiceStatus.DEGRADED


# ---------------------------------------------------------------------------
# check_celery
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCheckCelery:
    """Tests for check_celery health check."""

    @pytest.mark.asyncio
    async def test_celery_not_configured(self, monkeypatch):
        monkeypatch.delenv("CELERY_BROKER_URL", raising=False)
        monkeypatch.delenv("CELERY_BACKEND_URL", raising=False)
        result = await check_celery()
        assert result.status == ServiceStatus.UNKNOWN

    @pytest.mark.asyncio
    async def test_celery_with_active_workers(self, monkeypatch):
        monkeypatch.setenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
        monkeypatch.setenv("CELERY_BACKEND_URL", "redis://localhost:6379/1")

        mock_inspect = MagicMock()
        mock_inspect.active = MagicMock(
            return_value={"worker1@host": [{"task": "test"}]}
        )

        mock_celery = MagicMock()
        mock_celery.control.inspect.return_value = mock_inspect

        with patch("app.health.checks.Celery", return_value=mock_celery):
            result = await check_celery()
        assert result.status == ServiceStatus.HEALTHY
        assert "1 Celery worker" in (result.message or "")

    @pytest.mark.asyncio
    async def test_celery_no_workers(self, monkeypatch):
        monkeypatch.setenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
        monkeypatch.setenv("CELERY_BACKEND_URL", "redis://localhost:6379/1")

        mock_inspect = MagicMock()
        mock_inspect.active = MagicMock(return_value=None)

        mock_celery = MagicMock()
        mock_celery.control.inspect.return_value = mock_inspect

        with patch("app.health.checks.Celery", return_value=mock_celery):
            result = await check_celery()
        assert result.status == ServiceStatus.DEGRADED


# ---------------------------------------------------------------------------
# check_langfuse
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCheckLangfuse:
    """Tests for check_langfuse health check."""

    @pytest.mark.asyncio
    async def test_langfuse_not_configured(self, monkeypatch):
        monkeypatch.delenv("LANGFUSE_HOST", raising=False)
        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
        result = await check_langfuse()
        assert result.status == ServiceStatus.UNKNOWN

    @pytest.mark.asyncio
    async def test_langfuse_healthy(self, monkeypatch):
        monkeypatch.setenv("LANGFUSE_HOST", "http://langfuse.local")
        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")

        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.health.checks.httpx.AsyncClient", return_value=mock_client):
            result = await check_langfuse()
        assert result.status == ServiceStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_langfuse_unexpected_status(self, monkeypatch):
        monkeypatch.setenv("LANGFUSE_HOST", "http://langfuse.local")
        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")

        mock_response = MagicMock()
        mock_response.status_code = 503

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.health.checks.httpx.AsyncClient", return_value=mock_client):
            result = await check_langfuse()
        assert result.status == ServiceStatus.DEGRADED


# ---------------------------------------------------------------------------
# check_meilisearch
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCheckMeilisearch:
    """Tests for check_meilisearch health check."""

    @pytest.mark.asyncio
    async def test_meilisearch_not_configured(self, monkeypatch):
        monkeypatch.delenv("MEILISEARCH_URL", raising=False)
        with patch(
            "app.services.sync_status.get_sync_status",
            return_value={"status": "unknown"},
        ):
            result = await check_meilisearch()
        assert result.status == ServiceStatus.UNKNOWN

    @pytest.mark.asyncio
    async def test_meilisearch_healthy(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://meilisearch.local:7700")

        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.health.checks.httpx.AsyncClient", return_value=mock_client),
            patch(
                "app.services.sync_status.get_sync_status",
                return_value={"status": "ok"},
            ),
        ):
            result = await check_meilisearch()
        assert result.status == ServiceStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_meilisearch_stale_sync_degrades(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://meilisearch.local:7700")

        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.health.checks.httpx.AsyncClient", return_value=mock_client),
            patch(
                "app.services.sync_status.get_sync_status",
                return_value={"status": "stale"},
            ),
        ):
            result = await check_meilisearch()
        assert result.status == ServiceStatus.DEGRADED


# ---------------------------------------------------------------------------
# check_all_services -- cascade failure regression
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCheckAllServices:
    """Tests for check_all_services resilience."""

    @pytest.mark.asyncio
    async def test_one_failing_check_does_not_crash_all(self):
        """Regression: a single check raising an exception must not prevent
        other services from reporting their health status."""

        healthy_result = ServiceHealth(
            name="mock",
            status=ServiceStatus.HEALTHY,
            message="ok",
        )

        # Make check_redis raise an unhandled RuntimeError while others succeed
        with (
            patch(
                "app.health.checks.check_redis",
                side_effect=RuntimeError("unexpected redis crash"),
            ),
            patch(
                "app.health.checks.check_postgresql",
                return_value=healthy_result,
            ),
            patch(
                "app.health.checks.check_supabase",
                return_value=healthy_result,
            ),
            patch(
                "app.health.checks.check_celery",
                return_value=healthy_result,
            ),
            patch(
                "app.health.checks.check_langfuse",
                return_value=healthy_result,
            ),
            patch(
                "app.health.checks.check_meilisearch",
                return_value=healthy_result,
            ),
        ):
            services = await check_all_services()

        # All 6 services must be present in the result
        assert len(services) == 6

        # The failing service should be marked unhealthy, not crash the call
        assert services["redis"].status == ServiceStatus.UNHEALTHY
        assert "RuntimeError" in (services["redis"].message or "")

        # The remaining services should still report healthy
        for name in ["postgresql", "supabase", "celery", "langfuse", "meilisearch"]:
            assert services[name].status == ServiceStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_multiple_failing_checks_all_reported(self):
        """When multiple checks raise exceptions, each gets its own unhealthy entry."""

        healthy_result = ServiceHealth(
            name="mock",
            status=ServiceStatus.HEALTHY,
            message="ok",
        )

        with (
            patch(
                "app.health.checks.check_redis",
                side_effect=ConnectionError("redis down"),
            ),
            patch(
                "app.health.checks.check_postgresql",
                side_effect=TimeoutError("pg timeout"),
            ),
            patch(
                "app.health.checks.check_supabase",
                return_value=healthy_result,
            ),
            patch(
                "app.health.checks.check_celery",
                return_value=healthy_result,
            ),
            patch(
                "app.health.checks.check_langfuse",
                return_value=healthy_result,
            ),
            patch(
                "app.health.checks.check_meilisearch",
                return_value=healthy_result,
            ),
        ):
            services = await check_all_services()

        assert services["redis"].status == ServiceStatus.UNHEALTHY
        assert services["postgresql"].status == ServiceStatus.UNHEALTHY
        assert services["supabase"].status == ServiceStatus.HEALTHY
