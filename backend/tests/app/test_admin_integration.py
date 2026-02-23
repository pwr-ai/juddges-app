"""
Integration tests for admin endpoints.
Tests /api/admin/* routes - these require admin JWT auth (require_admin).
"""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_stats_requires_auth(client: AsyncClient):
    """Admin stats should reject unauthenticated requests."""
    response = await client.get("/api/admin/stats")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_users_requires_auth(client: AsyncClient):
    """Admin user list should reject unauthenticated requests."""
    response = await client.get("/api/admin/users")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_activity_requires_auth(client: AsyncClient):
    """Admin activity log should reject unauthenticated requests."""
    response = await client.get("/api/admin/activity")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_search_queries_requires_auth(client: AsyncClient):
    """Admin search queries should reject unauthenticated requests."""
    response = await client.get("/api/admin/search-queries")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_document_stats_requires_auth(client: AsyncClient):
    """Admin document stats should reject unauthenticated requests."""
    response = await client.get("/api/admin/documents/stats")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_system_health_requires_auth(client: AsyncClient):
    """Admin system health should reject unauthenticated requests."""
    response = await client.get("/api/admin/system/health")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_content_stats_requires_auth(client: AsyncClient):
    """Admin content stats should reject unauthenticated requests."""
    response = await client.get("/api/admin/content/stats")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_admin_api_key_does_not_grant_admin(authenticated_client: AsyncClient):
    """API key authentication should NOT grant admin access."""
    response = await authenticated_client.get("/api/admin/stats")
    # API key is not JWT admin auth - should still be rejected
    assert response.status_code in [401, 403, 422]
