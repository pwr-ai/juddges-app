"""Integration tests for SSO management endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_check_domain_sso_public(client: AsyncClient):
    """Check domain SSO should be accessible publicly."""
    response = await client.get("/api/sso/check-domain", params={"domain": "example.com"})
    # Public endpoint - should not return 401
    assert response.status_code in [200, 422, 500]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_list_sso_connections_requires_admin(client: AsyncClient):
    """List SSO connections requires admin auth."""
    response = await client.get("/api/sso/connections")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_create_sso_connection_requires_admin(client: AsyncClient):
    """Create SSO connection requires admin auth."""
    response = await client.post(
        "/api/sso/connections",
        json={"domain": "example.com", "provider": "saml", "name": "Test SSO"},
    )
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_delete_sso_connection_requires_admin(client: AsyncClient):
    """Delete SSO connection requires admin auth."""
    response = await client.delete("/api/sso/connections/fake-conn-id")
    assert response.status_code in [401, 403, 422]
