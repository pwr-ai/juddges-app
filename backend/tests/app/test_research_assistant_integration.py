"""Integration tests for research assistant endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_analyze_research_without_auth(client: AsyncClient):
    """Research analysis still requires the shared backend API key."""
    response = await client.post(
        "/research-assistant/analyze", json={"query": "test research"}
    )
    # FastAPI's APIKeyHeader dependency returns 403 when the header is
    # missing (auto_error=True default). Accept both 401/403 so the suite
    # doesn't snag on that semantic distinction — the important invariant
    # is "missing key → not authorized", not the specific code.
    assert response.status_code in (401, 403)


@pytest.mark.anyio
@pytest.mark.api
async def test_get_suggestions_without_auth(client: AsyncClient):
    """Research suggestions still require the shared backend API key."""
    response = await client.get("/research-assistant/suggestions")
    # FastAPI's APIKeyHeader dependency returns 403 when the header is
    # missing (auto_error=True default). Accept both 401/403 so the suite
    # doesn't snag on that semantic distinction — the important invariant
    # is "missing key → not authorized", not the specific code.
    assert response.status_code in (401, 403)


@pytest.mark.anyio
@pytest.mark.api
async def test_save_context_requires_auth(client: AsyncClient):
    """Saving research context requires authentication."""
    response = await client.post(
        "/research-assistant/contexts",
        json={"title": "Test Context"},
    )
    # FastAPI's APIKeyHeader dependency returns 403 when the header is
    # missing (auto_error=True default). Accept both 401/403 so the suite
    # doesn't snag on that semantic distinction — the important invariant
    # is "missing key → not authorized", not the specific code.
    assert response.status_code in (401, 403)


@pytest.mark.anyio
@pytest.mark.api
async def test_list_contexts_without_auth(client: AsyncClient):
    """Listing contexts without auth is rejected by router-level API key auth."""
    response = await client.get("/research-assistant/contexts")
    # FastAPI's APIKeyHeader dependency returns 403 when the header is
    # missing (auto_error=True default). Accept both 401/403 so the suite
    # doesn't snag on that semantic distinction — the important invariant
    # is "missing key → not authorized", not the specific code.
    assert response.status_code in (401, 403)
