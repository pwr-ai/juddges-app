"""Hardening tests for dashboard configuration and route-level rate limiting."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from app import dashboard as dashboard_module

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.fixture
def anyio_backend() -> str:
    """Force asyncio backend for this module (trio has known baseline issues)."""
    return "asyncio"


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
async def test_dashboard_trending_topics_enforces_route_rate_limit(
    authenticated_client: AsyncClient,
):
    """Dashboard trending-topics should return 200s under limit and 429 when exceeded."""

    statuses: list[int] = []
    for _ in range(120):
        response = await authenticated_client.get("/dashboard/trending-topics")
        statuses.append(response.status_code)
        if response.status_code == 429:
            break

    assert statuses[0] == 200
    assert 429 in statuses
