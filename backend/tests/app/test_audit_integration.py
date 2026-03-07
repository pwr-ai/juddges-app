"""Integration tests for audit trail endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_my_activity_requires_jwt(client: AsyncClient):
    """My activity requires JWT auth."""
    response = await client.get("/api/audit/my-activity")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_my_activity_statistics_requires_jwt(client: AsyncClient):
    """Activity statistics requires JWT auth."""
    response = await client.get("/api/audit/my-activity/statistics")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_export_audit_trail_requires_jwt(client: AsyncClient):
    """Export audit trail requires JWT auth."""
    response = await client.get("/api/audit/my-activity/export")
    assert response.status_code in [401, 403, 422]
