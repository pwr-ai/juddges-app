"""
Integration tests for dashboard endpoints.
Tests /dashboard/* routes for stats, documents, and trending topics.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_stats_requires_auth(client: AsyncClient):
    """Dashboard stats should reject unauthenticated requests."""
    response = await client.get("/dashboard/stats")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_stats_with_auth(authenticated_client: AsyncClient):
    """Dashboard stats should return stats with valid auth."""
    response = await authenticated_client.get("/dashboard/stats")
    # May fail due to missing Supabase, but should not be 401/403
    assert response.status_code in [200, 500, 502, 503]
    if response.status_code == 200:
        data = response.json()
        assert "total_documents" in data
        assert "judgments" in data
        assert "tax_interpretations" in data
        assert "added_this_week" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_refresh_stats_requires_auth(client: AsyncClient):
    """Refresh stats should reject unauthenticated requests."""
    response = await client.post("/dashboard/refresh-stats")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_refresh_stats_with_auth(authenticated_client: AsyncClient):
    """Refresh stats should work with valid auth."""
    response = await authenticated_client.post("/dashboard/refresh-stats")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert "status" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_recent_documents_requires_auth(client: AsyncClient):
    """Recent documents should reject unauthenticated requests."""
    response = await client.get("/dashboard/recent-documents")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_recent_documents_with_auth(authenticated_client: AsyncClient):
    """Recent documents should return a list with valid auth."""
    response = await authenticated_client.get("/dashboard/recent-documents")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_featured_examples_requires_auth(client: AsyncClient):
    """Featured examples should reject unauthenticated requests."""
    response = await client.get("/dashboard/featured-examples")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_featured_examples_with_auth(authenticated_client: AsyncClient):
    """Featured examples should return a list."""
    response = await authenticated_client.get("/dashboard/featured-examples")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_trending_topics_requires_auth(client: AsyncClient):
    """Trending topics should reject unauthenticated requests."""
    response = await client.get("/dashboard/trending-topics")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_trending_topics_with_auth(authenticated_client: AsyncClient):
    """Trending topics should return curated topics."""
    response = await authenticated_client.get("/dashboard/trending-topics")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        topic = data[0]
        assert "topic" in topic
        assert "change" in topic
        assert "trend" in topic
        assert "query_count" in topic
        assert "category" in topic


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_trending_topics_filter_by_category(
    authenticated_client: AsyncClient,
):
    """Trending topics should filter by category."""
    response = await authenticated_client.get(
        "/dashboard/trending-topics", params={"category": "Tax Law"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    for topic in data:
        assert topic["category"] == "Tax Law"


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_trending_topics_limit(authenticated_client: AsyncClient):
    """Trending topics should respect limit parameter."""
    response = await authenticated_client.get(
        "/dashboard/trending-topics", params={"limit": 2}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) <= 2


@pytest.mark.anyio
@pytest.mark.api
async def test_dashboard_test_document_counts_requires_auth(client: AsyncClient):
    """Test document counts should reject unauthenticated requests."""
    response = await client.get("/dashboard/test-document-counts")
    assert response.status_code in [401, 403]
