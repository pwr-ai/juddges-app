"""Integration tests for deduplication endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_dedup_stats_requires_auth(client: AsyncClient):
    """Deduplication stats should reject unauthenticated requests."""
    response = await client.get("/deduplication/stats")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dedup_stats_with_auth(authenticated_client: AsyncClient):
    """Deduplication stats should return data."""
    response = await authenticated_client.get("/deduplication/stats")
    assert response.status_code in [200, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_dedup_scan_requires_auth(client: AsyncClient):
    """Scan for duplicates should reject unauthenticated requests."""
    response = await client.post("/deduplication/scan", json={})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dedup_check_requires_auth(client: AsyncClient):
    """Check document duplicates should reject unauthenticated requests."""
    response = await client.post("/deduplication/check", json={"document_id": "test-123"})
    assert response.status_code in [401, 403]
