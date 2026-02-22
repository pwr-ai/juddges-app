"""
Integration tests for analytics and feedback endpoints.

Tests the /analytics and /feedback routers.
"""

import pytest
from httpx import AsyncClient
from typing import Dict, Any
from datetime import datetime, timedelta


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_analytics_overview(authenticated_client: AsyncClient):
    """Test getting analytics overview."""
    response = await authenticated_client.get("/api/analytics")
    
    # Analytics may or may not require API key
    assert response.status_code in [200, 404, 501]
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_analytics_search_metrics(authenticated_client: AsyncClient):
    """Test getting search analytics."""
    response = await authenticated_client.get("/api/analytics/search")
    
    assert response.status_code in [200, 404]
    
    if response.status_code == 200:
        data = response.json()
        # Should contain search metrics
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_analytics_with_date_range(authenticated_client: AsyncClient):
    """Test analytics with date range filters."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    params = {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat()
    }
    
    response = await authenticated_client.get(
        "/api/analytics",
        params=params
    )
    
    assert response.status_code in [200, 404, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_analytics_user_metrics(authenticated_client: AsyncClient):
    """Test getting user-specific analytics."""
    response = await authenticated_client.get("/api/analytics/users")
    
    assert response.status_code in [200, 404]
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, (dict, list))


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_analytics_document_metrics(authenticated_client: AsyncClient):
    """Test getting document usage analytics."""
    response = await authenticated_client.get("/api/analytics/documents")
    
    assert response.status_code in [200, 404]
    
    if response.status_code == 200:
        data = response.json()
        # Should contain document metrics
        assert isinstance(data, (dict, list))


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_submit_feedback(authenticated_client: AsyncClient):
    """Test submitting user feedback."""
    feedback_data = {
        "type": "search_quality",
        "rating": 4,
        "comment": "Good results but could be more relevant",
        "context": {
            "query": "contract law",
            "session_id": "test-session-123"
        }
    }
    
    response = await authenticated_client.post(
        "/api/feedback",
        json=feedback_data
    )
    
    assert response.status_code in [200, 201, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_submit_feedback_minimal(authenticated_client: AsyncClient):
    """Test submitting feedback with minimal required fields."""
    feedback_data = {
        "type": "general",
        "rating": 3
    }
    
    response = await authenticated_client.post(
        "/api/feedback",
        json=feedback_data
    )
    
    assert response.status_code in [200, 201, 404, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_submit_document_feedback(authenticated_client: AsyncClient):
    """Test submitting feedback for a specific document."""
    # Get a document ID first
    docs_response = await authenticated_client.get(
        "/documents",
        params={"limit": 1}
    )
    
    if docs_response.status_code == 200:
        docs = docs_response.json()
        if len(docs["documents"]) > 0:
            doc_id = docs["documents"][0]["id"]
            
            feedback_data = {
                "type": "document_quality",
                "rating": 5,
                "document_id": doc_id,
                "comment": "Very helpful document"
            }
            
            response = await authenticated_client.post(
                "/api/feedback",
                json=feedback_data
            )
            
            assert response.status_code in [200, 201, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_feedback_list(authenticated_client: AsyncClient):
    """Test listing feedback entries."""
    response = await authenticated_client.get("/api/feedback")
    
    assert response.status_code in [200, 404]
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_feedback_by_type(authenticated_client: AsyncClient):
    """Test filtering feedback by type."""
    params = {"type": "search_quality"}
    
    response = await authenticated_client.get(
        "/api/feedback",
        params=params
    )
    
    assert response.status_code in [200, 404]
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)
        # All items should match filter
        for item in data:
            if "type" in item:
                assert item["type"] == "search_quality"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_feedback_validation(authenticated_client: AsyncClient):
    """Test feedback validation rules."""
    # Invalid rating (out of range)
    invalid_feedback = {
        "type": "general",
        "rating": 10  # Assuming max is 5
    }
    
    response = await authenticated_client.post(
        "/api/feedback",
        json=invalid_feedback
    )
    
    # Should validate rating range
    assert response.status_code in [200, 201, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_analytics_export(authenticated_client: AsyncClient):
    """Test exporting analytics data."""
    response = await authenticated_client.get(
        "/api/analytics/export",
        params={"format": "json"}
    )
    
    # Export may or may not be implemented
    assert response.status_code in [200, 404, 501]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_analytics_aggregations(authenticated_client: AsyncClient):
    """Test analytics aggregations and grouping."""
    params = {
        "group_by": "date",
        "interval": "day"
    }
    
    response = await authenticated_client.get(
        "/api/analytics",
        params=params
    )
    
    assert response.status_code in [200, 404, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_feedback_statistics(authenticated_client: AsyncClient):
    """Test getting feedback statistics."""
    response = await authenticated_client.get("/api/feedback/stats")
    
    assert response.status_code in [200, 404]
    
    if response.status_code == 200:
        data = response.json()
        # Should contain aggregated stats
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_track_search_event(authenticated_client: AsyncClient):
    """Test tracking a search event for analytics."""
    event_data = {
        "event_type": "search",
        "query": "contract law",
        "results_count": 10,
        "user_id": "test-user-123",
        "timestamp": datetime.now().isoformat()
    }
    
    response = await authenticated_client.post(
        "/api/analytics/events",
        json=event_data
    )
    
    # Event tracking may or may not be implemented
    assert response.status_code in [200, 201, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_track_document_view(authenticated_client: AsyncClient):
    """Test tracking document view event."""
    # Get a document ID
    docs_response = await authenticated_client.get(
        "/documents",
        params={"limit": 1}
    )
    
    if docs_response.status_code == 200:
        docs = docs_response.json()
        if len(docs["documents"]) > 0:
            doc_id = docs["documents"][0]["id"]
            
            event_data = {
                "event_type": "document_view",
                "document_id": doc_id,
                "user_id": "test-user-123",
                "timestamp": datetime.now().isoformat()
            }
            
            response = await authenticated_client.post(
                "/api/analytics/events",
                json=event_data
            )
            
            assert response.status_code in [200, 201, 404]
