"""
Integration tests for document search and retrieval endpoints.

Tests the /documents router with actual HTTP requests.
"""

import pytest
from httpx import AsyncClient
from typing import Dict, Any


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_documents_require_api_key(client: AsyncClient):
    """Test that document endpoints require valid API key."""
    # No API key
    response = await client.get("/documents")
    assert response.status_code == 403, "Should reject request without API key"
    
    # Invalid API key
    response = await client.get(
        "/documents",
        headers={"X-API-Key": "invalid-key"}
    )
    assert response.status_code == 401, "Should reject invalid API key"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_invalid_api_key_rejected(
    client: AsyncClient,
    invalid_api_headers: Dict[str, str]
):
    """Test that invalid API key is properly rejected."""
    response = await client.get("/documents", headers=invalid_api_headers)
    assert response.status_code == 401
    assert "Invalid API key" in response.text or response.status_code == 401


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_documents_list(authenticated_client: AsyncClient):
    """Test listing documents with pagination."""
    response = await authenticated_client.get(
        "/documents",
        params={"limit": 10, "offset": 0}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Check response structure
    assert "documents" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data
    
    # Verify pagination
    assert isinstance(data["documents"], list)
    assert len(data["documents"]) <= 10
    assert data["limit"] == 10
    assert data["offset"] == 0


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_documents_with_filters(authenticated_client: AsyncClient):
    """Test listing documents with jurisdiction filter."""
    response = await authenticated_client.get(
        "/documents",
        params={
            "limit": 5,
            "jurisdiction": "PL"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # All documents should match jurisdiction filter
    for doc in data["documents"]:
        assert doc.get("jurisdiction") == "PL" or doc.get("country") == "PL"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_basic(
    authenticated_client: AsyncClient,
    sample_search_request: Dict[str, Any]
):
    """Test basic document search functionality."""
    response = await authenticated_client.post(
        "/documents/search",
        json=sample_search_request
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Check response structure
    assert "chunks" in data
    assert isinstance(data["chunks"], list)
    
    # If results exist, validate structure
    if len(data["chunks"]) > 0:
        chunk = data["chunks"][0]
        assert "document_id" in chunk
        assert "chunk_text" in chunk
        assert "chunk_type" in chunk
        assert chunk["chunk_type"] in ["summary", "excerpt", "title", "full_text"]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_with_filters(authenticated_client: AsyncClient):
    """Test search with jurisdiction and date filters."""
    request_data = {
        "query": "contract law",
        "limit_docs": 5,
        "alpha": 0.5,
        "filters": {
            "jurisdiction": ["PL"],
            "year_from": 2020,
            "year_to": 2024
        }
    }
    
    response = await authenticated_client.post(
        "/documents/search",
        json=request_data
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert "chunks" in data
    # Results should respect filters (when available)
    if "metadata" in data:
        assert isinstance(data["metadata"], dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_returns_metadata(authenticated_client: AsyncClient):
    """Test that search returns proper chunk metadata."""
    request_data = {
        "query": "legal precedent",
        "limit_docs": 3,
        "alpha": 0.7
    }
    
    response = await authenticated_client.post(
        "/documents/search",
        json=request_data
    )
    
    assert response.status_code == 200
    data = response.json()
    
    if len(data["chunks"]) > 0:
        chunk = data["chunks"][0]
        
        # Validate chunk metadata
        assert "chunk_text" in chunk
        assert "chunk_type" in chunk
        assert "chunk_start_pos" in chunk
        assert "chunk_end_pos" in chunk
        
        # Validate scores
        if "vector_score" in chunk or "text_score" in chunk:
            assert "combined_score" in chunk


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_with_invalid_params(authenticated_client: AsyncClient):
    """Test search validation with invalid parameters."""
    # Invalid limit (too high)
    response = await authenticated_client.post(
        "/documents/search",
        json={
            "query": "test",
            "limit_docs": 1000,  # Exceeds maximum
            "alpha": 0.5
        }
    )
    
    # Should either reject or cap at max
    assert response.status_code in [200, 422]
    
    # Invalid alpha (out of range)
    response = await authenticated_client.post(
        "/documents/search",
        json={
            "query": "test",
            "limit_docs": 10,
            "alpha": 1.5  # Should be 0-1
        }
    )
    
    assert response.status_code == 422  # Validation error


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_by_id(authenticated_client: AsyncClient):
    """Test retrieving a specific document by ID."""
    # First get a list to find a valid ID
    list_response = await authenticated_client.get(
        "/documents",
        params={"limit": 1}
    )
    
    assert list_response.status_code == 200
    data = list_response.json()
    
    if len(data["documents"]) > 0:
        doc_id = data["documents"][0]["id"]
        
        # Retrieve specific document
        response = await authenticated_client.get(f"/documents/{doc_id}")
        
        assert response.status_code == 200
        doc = response.json()
        assert doc["id"] == doc_id


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_nonexistent_document(authenticated_client: AsyncClient):
    """Test retrieving a document that doesn't exist."""
    response = await authenticated_client.get("/documents/nonexistent-id-999999")
    
    # Should return 404 or empty result
    assert response.status_code in [404, 200]
    
    if response.status_code == 200:
        data = response.json()
        # Should indicate no document found
        assert data is None or "error" in data or data == {}


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_similar_documents(authenticated_client: AsyncClient):
    """Test finding similar documents."""
    # First get a document ID
    list_response = await authenticated_client.get(
        "/documents",
        params={"limit": 1}
    )
    
    assert list_response.status_code == 200
    data = list_response.json()
    
    if len(data["documents"]) > 0:
        doc_id = data["documents"][0]["id"]
        
        # Find similar documents
        request_data = {
            "document_ids": [doc_id],
            "top_k": 5
        }
        
        response = await authenticated_client.post(
            "/documents/similar",
            json=request_data
        )
        
        assert response.status_code == 200
        results = response.json()
        assert isinstance(results, list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_similar_documents_multiple_ids(authenticated_client: AsyncClient):
    """Test finding similar documents for multiple source documents."""
    list_response = await authenticated_client.get(
        "/documents",
        params={"limit": 2}
    )
    
    assert list_response.status_code == 200
    data = list_response.json()
    
    if len(data["documents"]) >= 2:
        doc_ids = [doc["id"] for doc in data["documents"][:2]]
        
        request_data = {
            "document_ids": doc_ids,
            "top_k": 3
        }
        
        response = await authenticated_client.post(
            "/documents/similar",
            json=request_data
        )
        
        assert response.status_code == 200
        results = response.json()
        assert isinstance(results, list)
        # Should have results for each input document
        assert len(results) <= len(doc_ids)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_search_empty_query(authenticated_client: AsyncClient):
    """Test search with empty query string."""
    response = await authenticated_client.post(
        "/documents/search",
        json={
            "query": "",
            "limit_docs": 10,
            "alpha": 0.5
        }
    )
    
    # Should either reject or return empty results
    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_pagination_consistency(authenticated_client: AsyncClient):
    """Test that pagination returns consistent results."""
    # First page
    response1 = await authenticated_client.get(
        "/documents",
        params={"limit": 5, "offset": 0}
    )
    
    assert response1.status_code == 200
    data1 = response1.json()
    
    # Second page
    response2 = await authenticated_client.get(
        "/documents",
        params={"limit": 5, "offset": 5}
    )
    
    assert response2.status_code == 200
    data2 = response2.json()
    
    # Documents should not overlap
    if len(data1["documents"]) > 0 and len(data2["documents"]) > 0:
        ids1 = {doc["id"] for doc in data1["documents"]}
        ids2 = {doc["id"] for doc in data2["documents"]}
        assert ids1.isdisjoint(ids2), "Pages should not have overlapping documents"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_search_mode_rabbit(authenticated_client: AsyncClient):
    """Test search with 'rabbit' mode (fast retrieval)."""
    request_data = {
        "question": "What are the tax implications?",
        "mode": "rabbit",
        "max_documents": 5
    }
    
    response = await authenticated_client.post(
        "/documents",
        json=request_data
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "document" in data or "documents" in data


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_search_mode_thinking(authenticated_client: AsyncClient):
    """Test search with 'thinking' mode (query enhancement)."""
    request_data = {
        "question": "What are the legal precedents?",
        "mode": "thinking",
        "max_documents": 5
    }
    
    response = await authenticated_client.post(
        "/documents",
        json=request_data
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Thinking mode may include enhanced query
    assert "document" in data or "documents" in data
    if "enhanced_query" in data:
        assert isinstance(data["enhanced_query"], str)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_facets_endpoint(authenticated_client: AsyncClient):
    """Test facets/aggregations endpoint if available."""
    response = await authenticated_client.get("/documents/facets")
    
    # Endpoint may or may not exist
    if response.status_code == 200:
        data = response.json()
        # Should contain aggregation data
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_document_retrieval(authenticated_client: AsyncClient):
    """Test retrieving multiple documents in batch."""
    # Get some document IDs first
    list_response = await authenticated_client.get(
        "/documents",
        params={"limit": 3}
    )
    
    assert list_response.status_code == 200
    data = list_response.json()
    
    if len(data["documents"]) > 0:
        doc_ids = [doc["id"] for doc in data["documents"]]
        
        # Batch retrieval endpoint (if available)
        request_data = {"document_ids": doc_ids}
        
        response = await authenticated_client.post(
            "/documents/batch",
            json=request_data
        )
        
        # May or may not be implemented
        if response.status_code == 200:
            results = response.json()
            assert isinstance(results, (list, dict))
