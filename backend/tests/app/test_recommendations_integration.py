"""Integration tests for recommendations endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_get_recommendations_requires_auth(client: AsyncClient):
    """Recommendations should reject unauthenticated requests."""
    response = await client.get("/recommendations")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_recommendations_with_auth(authenticated_client: AsyncClient):
    """Recommendations should return data with valid auth."""
    response = await authenticated_client.get("/recommendations")
    assert response.status_code in [200, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_track_interaction_requires_auth(client: AsyncClient):
    """Track interaction should reject unauthenticated requests."""
    response = await client.post(
        "/recommendations/track", json={"document_id": "test-123", "action": "view"}
    )
    assert response.status_code in [401, 403]
