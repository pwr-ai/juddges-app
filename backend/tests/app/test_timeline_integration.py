"""Integration tests for timeline extraction endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_extract_timeline_requires_auth(client: AsyncClient):
    """Timeline extraction should reject unauthenticated requests."""
    response = await client.post("/timeline", json={"document_id": "test-123"})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_extract_timeline_with_auth(authenticated_client: AsyncClient):
    """Timeline extraction should accept authenticated requests."""
    response = await authenticated_client.post(
        "/timeline", json={"document_id": "test-123"}
    )
    assert response.status_code in [200, 422, 500]
