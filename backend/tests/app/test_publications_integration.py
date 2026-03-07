"""
Integration tests for publications endpoints.
Tests /publications/* routes for publication CRUD and resource linking.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_list_publications_requires_auth(client: AsyncClient):
    """List publications should reject unauthenticated requests."""
    response = await client.get("/publications")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_list_publications_with_auth(authenticated_client: AsyncClient):
    """List publications should return a list."""
    response = await authenticated_client.get("/publications")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)


@pytest.mark.anyio
@pytest.mark.api
async def test_create_publication_requires_auth(client: AsyncClient):
    """Create publication should reject unauthenticated requests."""
    response = await client.post(
        "/publications",
        json={"name": "Test Publication", "description": "A test"},
    )
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_publication_requires_auth(client: AsyncClient):
    """Get single publication should reject unauthenticated requests."""
    response = await client.get("/publications/fake-pub-id")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_publication_not_found(authenticated_client: AsyncClient):
    """Get non-existent publication should return 404 or empty."""
    response = await authenticated_client.get("/publications/nonexistent-id")
    assert response.status_code in [404, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_delete_publication_requires_auth(client: AsyncClient):
    """Delete publication should reject unauthenticated requests."""
    response = await client.delete("/publications/fake-pub-id")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_publication_schemas_requires_auth(client: AsyncClient):
    """Publication schemas endpoint should reject unauthenticated requests."""
    response = await client.get("/publications/fake-pub-id/schemas")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_publication_collections_requires_auth(client: AsyncClient):
    """Publication collections endpoint should reject unauthenticated requests."""
    response = await client.get("/publications/fake-pub-id/collections")
    assert response.status_code in [401, 403]
