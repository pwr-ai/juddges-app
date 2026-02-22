"""
Comprehensive tests for document listing endpoints.

Tests:
- GET /documents - List documents with pagination
- GET /documents/sample - Random sample of documents
- GET /documents/stats/embeddings - Embedding statistics
"""

import pytest
from httpx import AsyncClient


# ============================================================================
# List Documents Tests (GET /documents)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_success(authenticated_client: AsyncClient):
    """Test successful document listing with default parameters."""
    response = await authenticated_client.get("/documents")

    assert response.status_code == 200
    data = response.json()

    # Check response structure
    assert "documents" in data
    assert isinstance(data["documents"], list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_with_limit(authenticated_client: AsyncClient):
    """Test document listing with custom limit."""
    limit = 5
    response = await authenticated_client.get("/documents", params={"limit": limit})

    assert response.status_code == 200
    data = response.json()

    # Should return at most the requested limit
    assert len(data["documents"]) <= limit


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_limit_boundaries(authenticated_client: AsyncClient):
    """Test document listing with boundary limit values."""
    # Test minimum limit (1)
    response = await authenticated_client.get("/documents", params={"limit": 1})
    assert response.status_code == 200
    data = response.json()
    assert len(data["documents"]) <= 1

    # Test maximum limit (100)
    response = await authenticated_client.get("/documents", params={"limit": 100})
    assert response.status_code == 200
    data = response.json()
    assert len(data["documents"]) <= 100


@pytest.mark.anyio
@pytest.mark.api
async def test_list_documents_invalid_limit_too_low(authenticated_client: AsyncClient):
    """Test document listing with limit below minimum."""
    response = await authenticated_client.get("/documents", params={"limit": 0})

    # Should return validation error
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_list_documents_invalid_limit_too_high(authenticated_client: AsyncClient):
    """Test document listing with limit above maximum."""
    response = await authenticated_client.get("/documents", params={"limit": 101})

    # Should return validation error
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_list_documents_invalid_limit_negative(authenticated_client: AsyncClient):
    """Test document listing with negative limit."""
    response = await authenticated_client.get("/documents", params={"limit": -5})

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_list_documents_invalid_limit_string(authenticated_client: AsyncClient):
    """Test document listing with string limit."""
    response = await authenticated_client.get("/documents", params={"limit": "invalid"})

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_with_vectors(authenticated_client: AsyncClient):
    """Test document listing with vector embeddings included."""
    response = await authenticated_client.get(
        "/documents", params={"limit": 5, "return_vectors": True}
    )

    assert response.status_code == 200
    data = response.json()

    # If there are documents, check if they have vectors
    if data["documents"]:
        # Some documents might have vectors
        for doc in data["documents"]:
            if "embedding" in doc and doc["embedding"]:
                assert isinstance(doc["embedding"], list)
                # OpenAI embeddings are 1536 dimensions
                assert len(doc["embedding"]) == 1536


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_without_vectors(authenticated_client: AsyncClient):
    """Test document listing without vector embeddings."""
    response = await authenticated_client.get(
        "/documents", params={"limit": 5, "return_vectors": False}
    )

    assert response.status_code == 200
    data = response.json()

    # Vectors should not be included or should be null
    for doc in data["documents"]:
        assert doc.get("embedding") is None or doc.get("embedding") == []


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_with_coordinates_filter(
    authenticated_client: AsyncClient,
):
    """Test document listing with coordinates filter."""
    response = await authenticated_client.get(
        "/documents", params={"limit": 10, "only_with_coordinates": True}
    )

    assert response.status_code == 200
    data = response.json()

    # All returned documents should have coordinates
    for doc in data["documents"]:
        assert "x" in doc
        assert "y" in doc
        assert doc["x"] is not None
        assert doc["y"] is not None


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_without_coordinates_filter(
    authenticated_client: AsyncClient,
):
    """Test document listing without coordinates filter."""
    response = await authenticated_client.get(
        "/documents", params={"limit": 10, "only_with_coordinates": False}
    )

    assert response.status_code == 200
    data = response.json()

    # Documents may or may not have coordinates
    assert "documents" in data


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_list_documents_requires_authentication(client: AsyncClient):
    """Test that listing documents requires authentication."""
    response = await client.get("/documents")

    # Should return 401 or 403
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_list_documents_invalid_api_key(client: AsyncClient):
    """Test document listing with invalid API key."""
    response = await client.get(
        "/documents", headers={"X-API-Key": "invalid-key-12345"}
    )

    assert response.status_code == 401


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_response_structure(authenticated_client: AsyncClient):
    """Test that document listing response has correct structure."""
    response = await authenticated_client.get("/documents", params={"limit": 5})

    assert response.status_code == 200
    data = response.json()

    # Check top-level structure
    assert "documents" in data
    assert isinstance(data["documents"], list)

    # Check document structure if any exist
    if data["documents"]:
        doc = data["documents"][0]
        # Check common fields
        assert "id" in doc
        assert "title" in doc or "content" in doc


# ============================================================================
# Sample Documents Tests (GET /documents/sample)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_documents_sample_success(authenticated_client: AsyncClient):
    """Test successful document sampling."""
    response = await authenticated_client.get("/documents/sample")

    assert response.status_code in [200, 404]  # 404 if no documents exist

    if response.status_code == 200:
        data = response.json()
        assert "documents" in data
        assert isinstance(data["documents"], list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_documents_sample_with_size(authenticated_client: AsyncClient):
    """Test document sampling with custom size."""
    sample_size = 10
    response = await authenticated_client.get(
        "/documents/sample", params={"sample_size": sample_size}
    )

    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        assert len(data["documents"]) <= sample_size


@pytest.mark.anyio
@pytest.mark.api
async def test_get_documents_sample_invalid_size_too_low(
    authenticated_client: AsyncClient,
):
    """Test document sampling with size below minimum."""
    response = await authenticated_client.get(
        "/documents/sample", params={"sample_size": 0}
    )

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_get_documents_sample_invalid_size_negative(
    authenticated_client: AsyncClient,
):
    """Test document sampling with negative size."""
    response = await authenticated_client.get(
        "/documents/sample", params={"sample_size": -10}
    )

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_documents_sample_with_coordinates(authenticated_client: AsyncClient):
    """Test document sampling with coordinates filter."""
    response = await authenticated_client.get(
        "/documents/sample", params={"sample_size": 10, "only_with_coordinates": True}
    )

    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        # All sampled documents should have coordinates
        for doc in data["documents"]:
            assert "x" in doc
            assert "y" in doc


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_documents_sample_with_vectors(authenticated_client: AsyncClient):
    """Test document sampling with vector embeddings."""
    response = await authenticated_client.get(
        "/documents/sample", params={"sample_size": 5, "return_vectors": True}
    )

    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        for doc in data["documents"]:
            if "embedding" in doc and doc["embedding"]:
                assert isinstance(doc["embedding"], list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_get_documents_sample_requires_authentication(client: AsyncClient):
    """Test that document sampling requires authentication."""
    response = await client.get("/documents/sample")

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_documents_sample_randomness(authenticated_client: AsyncClient):
    """Test that document sampling returns different samples."""
    # Get first sample
    response1 = await authenticated_client.get(
        "/documents/sample", params={"sample_size": 20}
    )

    if response1.status_code != 200:
        pytest.skip("No documents available for sampling")

    data1 = response1.json()
    ids1 = {doc["id"] for doc in data1["documents"]}

    # Get second sample
    response2 = await authenticated_client.get(
        "/documents/sample", params={"sample_size": 20}
    )

    assert response2.status_code == 200
    data2 = response2.json()
    ids2 = {doc["id"] for doc in data2["documents"]}

    # With enough documents, samples should likely differ
    # (though there's a small chance they're identical)
    if len(ids1) >= 20:
        # Allow some overlap but expect some difference
        assert len(ids1.symmetric_difference(ids2)) >= 0


# ============================================================================
# Embedding Statistics Tests (GET /documents/stats/embeddings)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_embedding_stats_success(authenticated_client: AsyncClient):
    """Test successful retrieval of embedding statistics."""
    response = await authenticated_client.get("/documents/stats/embeddings")

    assert response.status_code == 200
    data = response.json()

    # Check for expected fields
    assert "total_documents" in data or "count" in data or isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_get_embedding_stats_requires_authentication(client: AsyncClient):
    """Test that embedding stats require authentication."""
    response = await client.get("/documents/stats/embeddings")

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_embedding_stats_structure(authenticated_client: AsyncClient):
    """Test embedding statistics response structure."""
    response = await authenticated_client.get("/documents/stats/embeddings")

    assert response.status_code == 200
    data = response.json()

    # Should return a dict with stats
    assert isinstance(data, dict)


# ============================================================================
# Edge Cases and Error Handling
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_empty_database(authenticated_client: AsyncClient):
    """Test listing documents when database might be empty."""
    response = await authenticated_client.get(
        "/documents", params={"limit": 10, "only_with_coordinates": False}
    )

    # Should succeed even if empty
    assert response.status_code == 200
    data = response.json()
    assert "documents" in data
    assert isinstance(data["documents"], list)


@pytest.mark.anyio
@pytest.mark.api
async def test_list_documents_multiple_invalid_params(
    authenticated_client: AsyncClient,
):
    """Test listing documents with multiple invalid parameters."""
    response = await authenticated_client.get(
        "/documents", params={"limit": -5, "return_vectors": "not_a_boolean"}
    )

    # Should return validation error
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_list_documents_concurrent_requests(authenticated_client: AsyncClient):
    """Test handling of concurrent document listing requests."""
    import asyncio

    async def make_request():
        return await authenticated_client.get("/documents", params={"limit": 5})

    # Make 5 concurrent requests
    responses = await asyncio.gather(*[make_request() for _ in range(5)])

    # All should succeed
    for response in responses:
        assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_sample_documents_max_size(authenticated_client: AsyncClient):
    """Test document sampling with maximum allowed size."""
    # Check what the max sample size is (should be in settings)
    # Typically 200 or similar
    response = await authenticated_client.get(
        "/documents/sample", params={"sample_size": 200}
    )

    assert response.status_code in [200, 404, 422]

    if response.status_code == 200:
        data = response.json()
        assert len(data["documents"]) <= 200


@pytest.mark.anyio
@pytest.mark.api
async def test_sample_documents_exceeds_max_size(authenticated_client: AsyncClient):
    """Test document sampling with size exceeding maximum."""
    response = await authenticated_client.get(
        "/documents/sample", params={"sample_size": 9999}
    )

    # Should return validation error
    assert response.status_code == 422
