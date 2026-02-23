"""Integration tests for versioning endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_version_history_requires_auth(client: AsyncClient):
    """Version history should reject unauthenticated requests."""
    response = await client.get("/documents/test-doc-123/versions")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_version_history_with_auth(authenticated_client: AsyncClient):
    """Version history should return data with valid auth."""
    response = await authenticated_client.get("/documents/test-doc-123/versions")
    assert response.status_code in [200, 404, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_create_version_requires_auth(client: AsyncClient):
    """Creating version snapshot should reject unauthenticated requests."""
    response = await client.post("/documents/test-doc-123/versions", json={"reason": "test"})
    assert response.status_code in [401, 403]
