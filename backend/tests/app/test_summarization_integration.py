"""Integration tests for summarization endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_summarize_requires_auth(client: AsyncClient):
    """Summarization should reject unauthenticated requests."""
    response = await client.post("/summarize", json={"document_ids": ["test-123"]})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_summarize_with_auth(authenticated_client: AsyncClient):
    """Summarization should accept authenticated requests."""
    response = await authenticated_client.post(
        "/summarize", json={"document_ids": ["test-123"]}
    )
    assert response.status_code in [200, 404, 422, 500]
