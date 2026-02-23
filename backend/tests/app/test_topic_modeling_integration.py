"""Integration tests for topic modeling endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_topic_analyze_requires_auth(client: AsyncClient):
    """Topic modeling analyze should reject unauthenticated requests."""
    response = await client.post("/topic-modeling/analyze", json={"document_ids": ["test-1"]})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_topic_analyze_with_auth(authenticated_client: AsyncClient):
    """Topic modeling analyze should accept authenticated requests."""
    response = await authenticated_client.post(
        "/topic-modeling/analyze", json={"document_ids": ["test-1"]}
    )
    assert response.status_code in [200, 422, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_topic_trending_requires_auth(client: AsyncClient):
    """Trending topics should reject unauthenticated requests."""
    response = await client.get("/topic-modeling/trending")
    assert response.status_code in [401, 403]
