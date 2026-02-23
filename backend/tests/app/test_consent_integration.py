"""Integration tests for consent management endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_consent_status_requires_jwt(client: AsyncClient):
    """Consent status requires JWT auth."""
    response = await client.get("/api/consent/status")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_consent_history_requires_jwt(client: AsyncClient):
    """Consent history requires JWT auth."""
    response = await client.get("/api/consent/history")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_update_consent_requires_jwt(client: AsyncClient):
    """Update consent requires JWT auth."""
    response = await client.post(
        "/api/consent/update",
        json={"consent_type": "analytics", "granted": True},
    )
    assert response.status_code in [401, 403, 422]
