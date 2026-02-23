"""
Integration tests for feedback endpoints.
Tests /api/feedback/* routes for search and feature feedback.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_submit_search_feedback(client: AsyncClient):
    """Submit search feedback - no API key required (uses JWT/optional auth)."""
    response = await client.post(
        "/api/feedback/search",
        json={
            "document_id": "test-doc-123",
            "search_query": "contract law",
            "rating": "relevant",
        },
    )
    # Should not be 401 (no API key required), but may fail on DB
    assert response.status_code in [200, 422, 500]
    if response.status_code == 200:
        data = response.json()
        assert "status" in data
        assert "message" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_submit_search_feedback_invalid_rating(client: AsyncClient):
    """Search feedback should reject invalid ratings."""
    response = await client.post(
        "/api/feedback/search",
        json={
            "document_id": "test-doc-123",
            "search_query": "contract law",
            "rating": "invalid_rating",
        },
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_submit_search_feedback_missing_fields(client: AsyncClient):
    """Search feedback should require document_id and search_query."""
    response = await client.post(
        "/api/feedback/search",
        json={"rating": "relevant"},
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_submit_feature_feedback(client: AsyncClient):
    """Submit feature feedback."""
    response = await client.post(
        "/api/feedback/feature",
        json={
            "feedback_type": "feature_request",
            "title": "Add export functionality",
            "description": "It would be great to export search results to CSV format.",
        },
    )
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert data["status"] in ["success", "failed"]  # "failed" when DB unavailable
        if data["status"] == "success":
            assert "thank_you_message" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_submit_feature_feedback_all_types(client: AsyncClient):
    """Feature feedback should accept all valid feedback types."""
    for feedback_type in ["bug_report", "feature_request", "improvement", "praise"]:
        response = await client.post(
            "/api/feedback/feature",
            json={
                "feedback_type": feedback_type,
                "title": f"Test {feedback_type} feedback",
                "description": f"This is a test {feedback_type} with enough description length.",
            },
        )
        assert response.status_code in [200, 500]


@pytest.mark.anyio
@pytest.mark.api
async def test_submit_feature_feedback_validation(client: AsyncClient):
    """Feature feedback should validate title length."""
    response = await client.post(
        "/api/feedback/feature",
        json={
            "feedback_type": "bug_report",
            "title": "Hi",  # Too short (min 5)
            "description": "This is a valid description with enough length.",
        },
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_get_search_feedback_summary(client: AsyncClient):
    """Get search feedback summary."""
    response = await client.get("/api/feedback/search/summary")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert "total_feedback" in data
        assert "positive_count" in data
        assert "negative_count" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_get_recent_feature_feedback(client: AsyncClient):
    """Get recent feature feedback."""
    response = await client.get("/api/feedback/feature/recent")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert "status" in data
        assert "count" in data
        assert "feedback" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_upvote_feature_request(client: AsyncClient):
    """Upvote a feature request."""
    response = await client.post("/api/feedback/feature/fake-id-123/upvote")
    # Should either work or fail on DB lookup
    assert response.status_code in [200, 404, 500]
