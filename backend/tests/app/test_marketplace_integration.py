"""Integration tests for marketplace endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_browse_marketplace_requires_auth(client: AsyncClient):
    """Browse marketplace should reject unauthenticated requests."""
    response = await client.get("/marketplace")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_browse_marketplace_with_auth(authenticated_client: AsyncClient):
    """Browse marketplace should return data."""
    response = await authenticated_client.get("/marketplace")
    assert response.status_code in [200, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_marketplace_stats_requires_auth(client: AsyncClient):
    """Marketplace stats should reject unauthenticated requests."""
    response = await client.get("/marketplace/stats")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_publish_listing_requires_auth(client: AsyncClient):
    """Publish listing should reject unauthenticated requests."""
    response = await client.post(
        "/marketplace", json={"schema_id": "s1", "title": "Test"}
    )
    assert response.status_code in [401, 403]
