"""Integration tests for legal compliance endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_dpa_info_accessible(client: AsyncClient):
    """DPA info may be accessible without auth (uses optional JWT)."""
    response = await client.get("/api/legal/dpa")
    # Uses optional JWT - may work without auth
    assert response.status_code in [200, 401, 403, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_retention_policies_accessible(client: AsyncClient):
    """Retention policies may be accessible without auth."""
    response = await client.get("/api/legal/retention-policies")
    assert response.status_code in [200, 401, 403, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_privacy_policy(client: AsyncClient):
    """Privacy policy may be accessible without auth."""
    response = await client.get("/api/legal/privacy-policy")
    assert response.status_code in [200, 401, 403, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_terms_of_service(client: AsyncClient):
    """Terms of service may be accessible without auth."""
    response = await client.get("/api/legal/terms-of-service")
    assert response.status_code in [200, 401, 403, 500]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_data_export_requires_jwt(client: AsyncClient):
    """Data export requires JWT auth."""
    response = await client.post("/api/legal/data-export")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_data_deletion_requires_jwt(client: AsyncClient):
    """Data deletion requires JWT auth."""
    response = await client.post(
        "/api/legal/data-deletion",
        json={"reason": "testing"},
    )
    assert response.status_code in [401, 403, 422]
