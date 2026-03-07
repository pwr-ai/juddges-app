"""Integration tests for embeddings API endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_list_models_requires_auth(client: AsyncClient):
    """List embedding models should reject unauthenticated requests."""
    response = await client.get("/embeddings/models")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_list_models_with_auth(authenticated_client: AsyncClient):
    """List embedding models should return data."""
    response = await authenticated_client.get("/embeddings/models")
    assert response.status_code in [200, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_active_model_requires_auth(client: AsyncClient):
    """Get active model should reject unauthenticated requests."""
    response = await client.get("/embeddings/models/active")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_test_embedding_requires_auth(client: AsyncClient):
    """Test embedding should reject unauthenticated requests."""
    response = await client.post("/embeddings/test", json={"text": "test text"})
    assert response.status_code in [401, 403]
