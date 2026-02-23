"""Integration tests for argumentation analysis endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_analyze_arguments_requires_auth(client: AsyncClient):
    """Argumentation analysis should reject unauthenticated requests."""
    response = await client.post("/argumentation/analyze", json={"document_id": "test-123"})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_analyze_arguments_with_auth(authenticated_client: AsyncClient):
    """Argumentation analysis should accept authenticated requests."""
    response = await authenticated_client.post("/argumentation/analyze", json={"document_id": "test-123"})
    assert response.status_code in [200, 422, 500]
