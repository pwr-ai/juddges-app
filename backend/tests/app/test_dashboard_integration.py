"""
Integration tests for dashboard endpoints.
Tests /dashboard/* routes for stats and documents.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_stats_requires_auth(client: AsyncClient):
    """Dashboard stats should reject unauthenticated requests."""
    response = await client.get("/dashboard/stats")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_stats_with_auth(authenticated_client: AsyncClient):
    """Dashboard stats should return stats with valid auth."""
    response = await authenticated_client.get("/dashboard/stats")
    # May fail due to missing Supabase, but should not be 401/403
    assert response.status_code in [200, 500, 502, 503]
    if response.status_code == 200:
        data = response.json()
        # DashboardStats model uses total_judgments (not total_documents)
        assert "total_judgments" in data
        assert "jurisdictions" in data
        assert "court_levels" in data
        assert "computed_at" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_refresh_stats_requires_auth(client: AsyncClient):
    """Refresh stats should reject unauthenticated requests."""
    response = await client.post("/dashboard/refresh-stats")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_refresh_stats_with_auth(authenticated_client: AsyncClient):
    """Refresh stats with non-admin auth returns 403 after admin gate added in #216."""
    response = await authenticated_client.post("/dashboard/refresh-stats")
    assert response.status_code == 403


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_featured_examples_requires_auth(client: AsyncClient):
    """Featured examples should reject unauthenticated requests."""
    response = await client.get("/dashboard/featured-examples")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_featured_examples_with_auth(authenticated_client: AsyncClient):
    """Featured examples should return a list."""
    response = await authenticated_client.get("/dashboard/featured-examples")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_health_requires_auth(client: AsyncClient):
    """Health check should reject unauthenticated requests after #170 fix."""
    response = await client.get("/dashboard/health")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_health_with_api_key(authenticated_client: AsyncClient):
    """Health check should not return 401/403 with valid API key (DB may be unavailable)."""
    response = await authenticated_client.get("/dashboard/health")
    assert response.status_code not in [401, 403]
