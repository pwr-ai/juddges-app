"""Hardening tests for dashboard configuration and route-level rate limiting."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from loguru import logger

from app import dashboard as dashboard_module
from app.server import app

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.fixture
def anyio_backend() -> str:
    """Force asyncio backend for this module (trio has known baseline issues)."""
    return "asyncio"


class _FailingFallbackQuery:
    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def execute(self):
        raise dashboard_module.PostgrestAPIError(
            {
                "message": "database unavailable",
                "code": "XX000",
                "hint": None,
                "details": None,
            }
        )


class _PrecomputedQuery(_FailingFallbackQuery):
    def __init__(self, *, fail: bool) -> None:
        self.fail = fail

    def execute(self):
        if self.fail:
            return super().execute()
        return SimpleNamespace(data=[])


class _DashboardFailureClient:
    def __init__(self, *, precomputed_error: bool) -> None:
        self.precomputed_error = precomputed_error

    def table(self, name: str):
        if name != "dashboard_precomputed_stats":
            return _FailingFallbackQuery()
        return _PrecomputedQuery(fail=self.precomputed_error)


@pytest.fixture
def failed_dashboard_sources(monkeypatch):
    dashboard_module._clear_stats_cache()
    monkeypatch.setattr(dashboard_module, "REDIS_AVAILABLE", False)
    yield
    dashboard_module._clear_stats_cache()


@pytest.fixture
def active_dashboard_log_sink():
    sink_id = logger.add(lambda _message: None, format="{message}")
    try:
        yield
    finally:
        logger.remove(sink_id)


def test_dashboard_supabase_client_uses_backend_env(monkeypatch):
    """Dashboard client must use SUPABASE_URL (backend env), not NEXT_PUBLIC_* vars."""

    monkeypatch.setenv("SUPABASE_URL", "http://backend-supabase.local")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "http://wrong-frontend-url.local")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

    captured: dict[str, object] = {}

    def fake_create_client(url, key, options=None):
        captured["url"] = url
        captured["key"] = key
        captured["options"] = options
        return object()

    monkeypatch.setattr(dashboard_module, "create_client", fake_create_client)
    dashboard_module.get_supabase_client.cache_clear()

    dashboard_module.get_supabase_client()

    assert captured["url"] == "http://backend-supabase.local"
    assert captured["key"] == "test-service-role-key"


def test_dashboard_supabase_client_requires_backend_url(monkeypatch):
    """Dashboard client creation should fail clearly when SUPABASE_URL is missing."""

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "http://wrong-frontend-url.local")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

    dashboard_module.get_supabase_client.cache_clear()

    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        dashboard_module.get_supabase_client()


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_stats_returns_503_when_empty_precomputed_fallback_fails(
    authenticated_client: AsyncClient,
    active_dashboard_log_sink,
    failed_dashboard_sources,
    monkeypatch,
):
    monkeypatch.setattr(
        dashboard_module,
        "supabase",
        _DashboardFailureClient(precomputed_error=False),
    )

    response = await authenticated_client.get("/dashboard/stats")

    assert response.status_code == 503
    assert response.json() == {"detail": "Dashboard statistics are unavailable"}
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_stats_returns_503_when_precomputed_and_fallback_fail(
    authenticated_client: AsyncClient,
    active_dashboard_log_sink,
    failed_dashboard_sources,
    monkeypatch,
):
    monkeypatch.setattr(
        dashboard_module,
        "supabase",
        _DashboardFailureClient(precomputed_error=True),
    )

    response = await authenticated_client.get("/dashboard/stats")

    assert response.status_code == 503
    assert response.json() == {"detail": "Dashboard statistics are unavailable"}
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_health_requires_api_key(client: AsyncClient):
    """GET /dashboard/health must reject requests without X-API-Key (fixes #170)."""
    response = await client.get("/dashboard/health")
    assert response.status_code in (401, 403)


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_refresh_stats_requires_admin(
    valid_api_headers: dict,
):
    """POST /dashboard/refresh-stats must reject non-admin authenticated users with 403 (fixes #216)."""
    from httpx import ASGITransport, AsyncClient

    from app.core.auth_jwt import AuthenticatedUser
    from app.core.auth_jwt import get_current_user as jwt_get_current_user
    from app.server import app

    async def non_admin_user() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_data={
                "id": "non-admin-user",
                "email": "user@example.com",
                "role": "authenticated",
                "app_metadata": {},
            },
            access_token="test-token",
        )

    app.dependency_overrides[jwt_get_current_user] = non_admin_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=valid_api_headers,
        ) as ac:
            response = await ac.post("/dashboard/refresh-stats")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)


class TestNoFabricatedTrendingTopics:
    """The dashboard must not serve invented search activity (#558).

    `GET /dashboard/trending-topics` returned a hardcoded list — "Swiss Franc
    Loans, +45%, query_count=1234" and four more — typed as real aggregates
    and rendered to every anonymous visitor on the public home page. The
    endpoint is gone; these tests keep it from coming back unbacked.
    """

    def test_trending_topics_route_is_not_registered(self) -> None:
        paths = {getattr(r, "path", None) for r in app.routes}
        assert "/dashboard/trending-topics" not in paths

    def test_dashboard_module_has_no_hardcoded_topics(self) -> None:
        source = Path(dashboard_module.__file__).read_text(encoding="utf-8")
        for invented in (
            "Swiss Franc Loans",
            "GDPR Violations",
            "VAT Deductions",
            "Employment Contracts",
            "Corporate Governance",
        ):
            assert invented not in source
