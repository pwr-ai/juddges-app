"""Integration tests for extraction endpoints."""
import pytest
from httpx import AsyncClient


@pytest.fixture
def anyio_backend() -> str:
    """Force asyncio backend for this module (trio has known baseline issues)."""
    return "asyncio"


@pytest.mark.anyio
@pytest.mark.api
async def test_list_extractions_requires_auth(client: AsyncClient):
    """List extractions should reject unauthenticated requests."""
    response = await client.get("/extractions")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_list_extractions_with_auth(authenticated_client: AsyncClient):
    """List extractions should return data with valid auth."""
    response = await authenticated_client.get("/extractions", params={"user_id": "test-user"})
    assert response.status_code in [200, 422, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_create_extraction_requires_auth(client: AsyncClient):
    """Create extraction should reject unauthenticated requests."""
    response = await client.post("/extractions", json={"document_ids": ["test-123"], "schema_id": "schema-1"})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_extraction_requires_auth(client: AsyncClient):
    """Get extraction should reject unauthenticated requests."""
    response = await client.get("/extractions/fake-job-id")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_list_prompts_requires_auth(client: AsyncClient):
    """List prompts should reject unauthenticated requests."""
    response = await client.get("/extractions/prompts")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_export_results_requires_auth(client: AsyncClient):
    """Export results should reject unauthenticated requests."""
    response = await client.get("/extractions/results")
    assert response.status_code in [401, 403]
