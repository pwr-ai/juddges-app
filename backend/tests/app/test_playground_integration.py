"""Integration tests for playground endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_playground_extract_requires_auth(client: AsyncClient):
    """Playground extract should reject unauthenticated requests."""
    response = await client.post("/playground/extract", json={"text": "test", "schema_id": "s1"})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_playground_list_runs_requires_auth(client: AsyncClient):
    """List playground runs should reject unauthenticated requests."""
    response = await client.get("/playground/runs")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_playground_get_run_requires_auth(client: AsyncClient):
    """Get playground run should reject unauthenticated requests."""
    response = await client.get("/playground/runs/fake-run-id")
    assert response.status_code in [401, 403]
