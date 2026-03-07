"""Integration tests for experiments (A/B testing) endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_list_experiments_requires_jwt(client: AsyncClient):
    """List experiments requires JWT auth (not API key)."""
    response = await client.get("/api/experiments")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_list_experiments_api_key_insufficient(authenticated_client: AsyncClient):
    """API key alone should not grant access to experiments."""
    response = await authenticated_client.get("/api/experiments")
    # Experiments use JWT, not API key
    assert response.status_code in [401, 403, 422, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_active_experiments_requires_jwt(client: AsyncClient):
    """Active experiments requires JWT auth."""
    response = await client.get("/api/experiments/active/running")
    assert response.status_code in [401, 403, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_create_experiment_requires_jwt(client: AsyncClient):
    """Create experiment requires JWT auth."""
    response = await client.post(
        "/api/experiments",
        json={"name": "test-exp", "description": "Test experiment"},
    )
    assert response.status_code in [401, 403, 422]
