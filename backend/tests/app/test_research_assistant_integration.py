"""Integration tests for research assistant endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_analyze_research_requires_auth(client: AsyncClient):
    """Research analysis should reject unauthenticated requests."""
    response = await client.post("/research-assistant/analyze", json={"query": "test research"})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_suggestions_requires_auth(client: AsyncClient):
    """Research suggestions should reject unauthenticated requests."""
    response = await client.get("/research-assistant/suggestions")
    assert response.status_code in [401, 403]
