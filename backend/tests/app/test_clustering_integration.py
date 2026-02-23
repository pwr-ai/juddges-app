"""Integration tests for clustering endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_semantic_clusters_requires_auth(client: AsyncClient):
    """Semantic clustering should reject unauthenticated requests."""
    response = await client.post("/clustering/semantic-clusters", json={"document_ids": ["test-1", "test-2"]})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_semantic_clusters_with_auth(authenticated_client: AsyncClient):
    """Semantic clustering should accept authenticated requests."""
    response = await authenticated_client.post("/clustering/semantic-clusters", json={"document_ids": ["test-1", "test-2"]})
    assert response.status_code in [200, 422, 500]
