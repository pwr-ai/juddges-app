"""Unit tests for app.health.checks module -- health check functions with mocked deps."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.health.checks import (
    check_all_services,
    check_celery,
    check_langfuse,
    check_llm,
    check_meilisearch,
    check_postgresql,
    check_redis,
    check_supabase,
    reset_llm_health_cache,
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
# check_llm (#546)
# ---------------------------------------------------------------------------


def _llm_client(*responses_or_errors):
    """AsyncClient mock whose .get returns/raises the given items in order."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=list(responses_or_errors))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


def _response(status_code, body=None):
    response = MagicMock()
    response.status_code = status_code
    response.json = MagicMock(return_value=body or {})
    return response


@pytest.fixture
def llm_env(monkeypatch):
    reset_llm_health_cache()
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-secret")
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_BASE", raising=False)
    monkeypatch.delenv("LLM_HEALTH_CACHE_TTL_SECONDS", raising=False)
    monkeypatch.delenv("LLM_HEALTH_FAILURE_CACHE_TTL_SECONDS", raising=False)
    yield monkeypatch
    reset_llm_health_cache()


@pytest.mark.unit
class TestCheckLlm:
    """Tests for the LLM provider probe."""

    @pytest.mark.asyncio
    async def test_healthy_when_models_endpoint_ok(self, llm_env):
        client = _llm_client(_response(200, {"data": []}))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.name == "llm"
        assert result.status == ServiceStatus.HEALTHY
        url = client.get.call_args.args[0]
        assert url == "https://api.openai.com/v1/models"

    @pytest.mark.asyncio
    async def test_invalid_project_401_is_unhealthy_and_names_the_code(self, llm_env):
        """Regression for #546: a rejected key must not look healthy."""
        body = {
            "error": {
                "code": "invalid_project",
                "message": "You do not have access to the project tied to the API key.",
            }
        }
        client = _llm_client(_response(401, body))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.status == ServiceStatus.UNHEALTHY
        assert "invalid_project" in (result.message or "")
        assert "401" in (result.error or "")
        assert result.metadata["targets"]["openai"]["error_code"] == "invalid_project"
        # The key must never leak into the status payload.
        assert "sk-test-secret" not in result.model_dump_json()

    @pytest.mark.asyncio
    async def test_quota_429_is_degraded(self, llm_env):
        body = {"error": {"code": "insufficient_quota"}}
        client = _llm_client(_response(429, body))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.status == ServiceStatus.DEGRADED
        assert "insufficient_quota" in (result.message or "")

    @pytest.mark.asyncio
    async def test_missing_key_is_unhealthy_without_network(self, llm_env):
        llm_env.delenv("OPENAI_API_KEY")
        client = _llm_client()
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.status == ServiceStatus.UNHEALTHY
        assert "OPENAI_API_KEY is not set" in (result.message or "")
        client.get.assert_not_called()

    @pytest.mark.asyncio
    async def test_unreachable_llm_base_url_is_unhealthy(self, llm_env):
        """get_default_llm() target (e.g. Ollama on container localhost) is probed too."""
        import httpx

        llm_env.setenv("LLM_BASE_URL", "http://localhost:11434/v1")
        client = _llm_client(
            _response(200),
            httpx.ConnectError("connection refused"),
        )
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.status == ServiceStatus.UNHEALTHY
        targets = result.metadata["targets"]
        assert targets["openai"]["status"] == "healthy"
        assert targets["default"]["status"] == "unhealthy"
        assert "localhost:11434" in (result.message or "")

    @pytest.mark.asyncio
    async def test_result_is_cached_between_calls(self, llm_env):
        """Polling /health/status must not hit the provider on every request."""
        client = _llm_client(_response(200))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            first = await check_llm()
            second = await check_llm()
        assert first is second
        assert client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_reset_forces_reprobe(self, llm_env):
        client = _llm_client(_response(401), _response(200))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            first = await check_llm()
            reset_llm_health_cache()
            second = await check_llm()
        assert first.status == ServiceStatus.UNHEALTHY
        assert second.status == ServiceStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_url_credentials_never_appear_in_payload(self, llm_env):
        import httpx

        llm_env.setenv("LLM_BASE_URL", "http://svcuser:s3cretpw@llm.internal:8000/v1")
        client = _llm_client(_response(200), httpx.ConnectError("refused"))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        payload = result.model_dump_json()
        assert "s3cretpw" not in payload
        assert "svcuser" not in payload
        assert result.metadata["targets"]["default"]["endpoint"] == (
            "http://llm.internal:8000"
        )
        assert "llm.internal:8000" in (result.message or "")

    def test_safe_endpoint_strips_userinfo_path_and_query(self):
        from app.health.checks import _safe_endpoint

        assert (
            _safe_endpoint("https://u:p@host.example:9/v1?token=x")
            == "https://host.example:9"
        )
        assert _safe_endpoint("not a url") == "<invalid url>"

    @pytest.mark.asyncio
    async def test_probe_sends_same_key_as_real_client_to_each_base(self, llm_env):
        """get_llm/get_default_llm both use OPENAI_API_KEY for their base URL."""
        llm_env.setenv("LLM_BASE_URL", "http://llm.internal:8000/v1")
        client = _llm_client(_response(200), _response(200))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            await check_llm()
        calls = {c.args[0]: c.kwargs["headers"] for c in client.get.call_args_list}
        assert calls["https://api.openai.com/v1/models"] == {
            "Authorization": "Bearer sk-test-secret"
        }
        assert calls["http://llm.internal:8000/v1/models"] == {
            "Authorization": "Bearer sk-test-secret"
        }

    @pytest.mark.asyncio
    async def test_missing_key_is_unhealthy_for_custom_base_too(self, llm_env):
        """The real client cannot be built without a key, so nothing is probed."""
        llm_env.delenv("OPENAI_API_KEY")
        llm_env.setenv("LLM_BASE_URL", "http://llm.internal:8000/v1")
        client = _llm_client()
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.status == ServiceStatus.UNHEALTHY
        assert result.metadata["targets"]["default"]["status"] == "unhealthy"
        client.get.assert_not_called()

    @pytest.mark.asyncio
    async def test_concurrent_cold_polls_probe_once(self, llm_env):
        import asyncio

        async def slow_get(*args, **kwargs):
            await asyncio.sleep(0.05)
            return _response(200)

        client = _llm_client()
        client.get = AsyncMock(side_effect=slow_get)
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            results = await asyncio.gather(*(check_llm() for _ in range(5)))
        assert client.get.call_count == 1
        assert all(r is results[0] for r in results)

    @pytest.mark.asyncio
    async def test_failure_cached_briefly_healthy_cached_long(self, llm_env):
        client = _llm_client(_response(401), _response(200), _response(500))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            with patch("app.health.checks.time.monotonic", return_value=1000.0):
                first = await check_llm()
            # 10s later: still inside the 30s failure TTL -> cached.
            with patch("app.health.checks.time.monotonic", return_value=1010.0):
                assert await check_llm() is first
            # 31s later: failure expired -> re-probed, now healthy.
            with patch("app.health.checks.time.monotonic", return_value=1031.0):
                healthy = await check_llm()
            assert healthy.status == ServiceStatus.HEALTHY
            # healthy result is still cached 200s later (TTL 300s).
            with patch("app.health.checks.time.monotonic", return_value=1231.0):
                assert await check_llm() is healthy
            # ...but not after 300s.
            with patch("app.health.checks.time.monotonic", return_value=1332.0):
                last = await check_llm()
        assert last.status == ServiceStatus.DEGRADED
        assert client.get.call_count == 3

    @pytest.mark.asyncio
    async def test_non_json_401_body_is_still_unhealthy(self, llm_env):
        response = _response(401)
        response.json = MagicMock(side_effect=ValueError("not json"))
        client = _llm_client(response)
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.status == ServiceStatus.UNHEALTHY
        assert "API key rejected (HTTP 401)" in (result.error or "")
        assert "error_code" not in result.metadata["targets"]["openai"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status_code", [500, 502, 503])
    async def test_5xx_is_degraded(self, llm_env, status_code):
        client = _llm_client(_response(status_code))
        with patch("app.health.checks.httpx.AsyncClient", return_value=client):
            result = await check_llm()
        assert result.status == ServiceStatus.DEGRADED
        assert f"unexpected HTTP {status_code}" in (result.message or "")
        assert result.error is None


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
            patch(
                "app.health.checks.check_llm",
                return_value=healthy_result,
            ),
        ):
            services = await check_all_services()

        # All 7 services must be present in the result
        assert len(services) == 7

        # The failing service should be marked unhealthy, not crash the call
        assert services["redis"].status == ServiceStatus.UNHEALTHY
        assert "RuntimeError" in (services["redis"].message or "")

        # The remaining services should still report healthy
        for name in [
            "postgresql",
            "supabase",
            "celery",
            "langfuse",
            "meilisearch",
            "llm",
        ]:
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
            patch(
                "app.health.checks.check_llm",
                return_value=healthy_result,
            ),
        ):
            services = await check_all_services()

        assert services["redis"].status == ServiceStatus.UNHEALTHY
        assert services["postgresql"].status == ServiceStatus.UNHEALTHY
        assert services["supabase"].status == ServiceStatus.HEALTHY
