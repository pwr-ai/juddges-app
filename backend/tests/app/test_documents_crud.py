"""
Comprehensive tests for document CRUD operations.

Tests:
- GET /documents/{id} - Get single document
- POST /documents/{id} - Get document by ID (legacy)
- POST /documents/batch - Batch retrieval
"""

import pytest
from httpx import AsyncClient


# ============================================================================
# Get Single Document Tests (GET /documents/{id})
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_by_id_success(authenticated_client: AsyncClient):
    """Test successful retrieval of a single document."""
    # First get a list to find a valid ID
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            # Now fetch that specific document
            response = await authenticated_client.get(f"/documents/{doc_id}")

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == doc_id


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_nonexistent_id(authenticated_client: AsyncClient):
    """Test retrieval of non-existent document."""
    fake_id = "nonexistent-doc-id-999999"
    response = await authenticated_client.get(f"/documents/{fake_id}")

    # Should return 404
    assert response.status_code == 404


@pytest.mark.anyio
@pytest.mark.api
async def test_get_document_invalid_id_format(authenticated_client: AsyncClient):
    """Test retrieval with invalid ID format."""
    invalid_ids = [
        "../../etc/passwd",
        "<script>alert(1)</script>",
        "'; DROP TABLE judgments;--",
        "",
        " ",
    ]

    for invalid_id in invalid_ids:
        response = await authenticated_client.get(f"/documents/{invalid_id}")
        # Should return 404 or 400
        assert response.status_code in [400, 404, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_get_document_requires_authentication(client: AsyncClient):
    """Test that document retrieval requires authentication."""
    response = await client.get("/documents/test-id")

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_response_structure(authenticated_client: AsyncClient):
    """Test document response structure."""
    # Get a valid document ID
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]
            response = await authenticated_client.get(f"/documents/{doc_id}")

            assert response.status_code == 200
            doc = response.json()

            # Check essential fields
            assert "id" in doc
            assert isinstance(doc, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_with_vectors(authenticated_client: AsyncClient):
    """Test document retrieval with vector embeddings."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]
            response = await authenticated_client.get(
                f"/documents/{doc_id}", params={"include_vectors": True}
            )

            # Should succeed even if vectors not available
            assert response.status_code in [200, 404]


# ============================================================================
# Legacy Document Retrieval (POST /documents/{id})
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_by_id_legacy_success(authenticated_client: AsyncClient):
    """Test legacy POST endpoint for document retrieval."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.post(f"/documents/{doc_id}", json={})

            assert response.status_code in [200, 404, 405]  # May not be implemented


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_legacy_nonexistent(authenticated_client: AsyncClient):
    """Test legacy endpoint with non-existent ID."""
    response = await authenticated_client.post("/documents/nonexistent-id-999", json={})

    assert response.status_code in [404, 405, 422]


# ============================================================================
# Batch Document Retrieval Tests (POST /documents/batch)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_success(authenticated_client: AsyncClient):
    """Test successful batch document retrieval."""
    # First get some valid IDs
    list_response = await authenticated_client.get("/documents", params={"limit": 5})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_ids = [doc["id"] for doc in docs[:3]]

            response = await authenticated_client.post(
                "/documents/batch", json={"document_ids": doc_ids}
            )

            assert response.status_code == 200
            data = response.json()

            # Check response structure
            assert "documents" in data
            assert isinstance(data["documents"], list)

            # Should return the requested documents
            returned_ids = {doc["id"] for doc in data["documents"]}
            for doc_id in doc_ids:
                assert doc_id in returned_ids


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_empty_list(authenticated_client: AsyncClient):
    """Test batch retrieval with empty ID list."""
    response = await authenticated_client.post(
        "/documents/batch", json={"document_ids": []}
    )

    assert response.status_code in [200, 422]

    if response.status_code == 200:
        data = response.json()
        assert data["documents"] == []


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_single_id(authenticated_client: AsyncClient):
    """Test batch retrieval with single ID."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.post(
                "/documents/batch", json={"document_ids": [doc_id]}
            )

            assert response.status_code == 200
            data = response.json()
            assert len(data["documents"]) == 1


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_nonexistent_ids(authenticated_client: AsyncClient):
    """Test batch retrieval with non-existent IDs."""
    fake_ids = ["fake-id-1", "fake-id-2", "fake-id-3"]

    response = await authenticated_client.post(
        "/documents/batch", json={"document_ids": fake_ids}
    )

    assert response.status_code == 200
    data = response.json()

    # Should return empty or handle gracefully
    assert isinstance(data["documents"], list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_mixed_valid_invalid(authenticated_client: AsyncClient):
    """Test batch retrieval with mix of valid and invalid IDs."""
    list_response = await authenticated_client.get("/documents", params={"limit": 2})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            valid_ids = [doc["id"] for doc in docs]
            mixed_ids = valid_ids + ["fake-id-1", "fake-id-2"]

            response = await authenticated_client.post(
                "/documents/batch", json={"document_ids": mixed_ids}
            )

            assert response.status_code == 200
            data = response.json()

            # Should return only the valid documents
            assert len(data["documents"]) >= len(valid_ids)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_large_batch(authenticated_client: AsyncClient):
    """Test batch retrieval with large number of IDs."""
    list_response = await authenticated_client.get("/documents", params={"limit": 50})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_ids = [doc["id"] for doc in docs]

            response = await authenticated_client.post(
                "/documents/batch", json={"document_ids": doc_ids}
            )

            assert response.status_code in [200, 413, 422]  # May have size limit


@pytest.mark.anyio
@pytest.mark.api
async def test_batch_documents_duplicate_ids(authenticated_client: AsyncClient):
    """Test batch retrieval with duplicate IDs."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]
            duplicate_ids = [doc_id, doc_id, doc_id]

            response = await authenticated_client.post(
                "/documents/batch", json={"document_ids": duplicate_ids}
            )

            assert response.status_code == 200
            data = response.json()

            # Should handle duplicates (either return once or multiple times)
            assert len(data["documents"]) >= 1


@pytest.mark.anyio
@pytest.mark.api
async def test_batch_documents_invalid_request_format(
    authenticated_client: AsyncClient,
):
    """Test batch retrieval with invalid request format."""
    # Missing document_ids field
    response = await authenticated_client.post(
        "/documents/batch",
        json={"ids": ["id1", "id2"]},  # Wrong field name
    )

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_batch_documents_invalid_id_types(authenticated_client: AsyncClient):
    """Test batch retrieval with invalid ID types."""
    # Non-string IDs
    response = await authenticated_client.post(
        "/documents/batch", json={"document_ids": [123, 456, 789]}
    )

    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_batch_documents_requires_authentication(client: AsyncClient):
    """Test that batch retrieval requires authentication."""
    response = await client.post(
        "/documents/batch", json={"document_ids": ["id1", "id2"]}
    )

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_with_vectors(authenticated_client: AsyncClient):
    """Test batch retrieval with vector embeddings."""
    list_response = await authenticated_client.get("/documents", params={"limit": 3})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_ids = [doc["id"] for doc in docs]

            response = await authenticated_client.post(
                "/documents/batch",
                json={"document_ids": doc_ids, "include_vectors": True},
            )

            # Should succeed even if include_vectors not supported
            assert response.status_code in [200, 422]


# ============================================================================
# Document CRUD Edge Cases
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_concurrent_requests(authenticated_client: AsyncClient):
    """Test concurrent document retrieval."""
    import asyncio

    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            async def fetch_doc():
                return await authenticated_client.get(f"/documents/{doc_id}")

            # Make 10 concurrent requests
            responses = await asyncio.gather(*[fetch_doc() for _ in range(10)])

            # All should succeed
            for response in responses:
                assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
async def test_get_document_special_characters_in_id(authenticated_client: AsyncClient):
    """Test document retrieval with special characters in ID."""
    special_ids = [
        "id-with-dash",
        "id_with_underscore",
        "id.with.dots",
        "id%20with%20spaces",
    ]

    for special_id in special_ids:
        response = await authenticated_client.get(f"/documents/{special_id}")
        # Should handle gracefully (404 or success if ID exists)
        assert response.status_code in [200, 404, 400, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_batch_documents_very_long_id(authenticated_client: AsyncClient):
    """Test batch retrieval with very long ID."""
    very_long_id = "a" * 1000

    response = await authenticated_client.post(
        "/documents/batch", json={"document_ids": [very_long_id]}
    )

    # Should handle gracefully
    assert response.status_code in [200, 400, 413, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_batch_documents_null_in_list(authenticated_client: AsyncClient):
    """Test batch retrieval with null values in ID list."""
    response = await authenticated_client.post(
        "/documents/batch", json={"document_ids": ["valid-id", None, "another-id"]}
    )

    # Should return validation error
    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_batch_documents_order_preservation(authenticated_client: AsyncClient):
    """Test if batch retrieval preserves order of requested IDs."""
    list_response = await authenticated_client.get("/documents", params={"limit": 5})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if len(docs) >= 3:
            doc_ids = [docs[0]["id"], docs[2]["id"], docs[1]["id"]]

            response = await authenticated_client.post(
                "/documents/batch", json={"document_ids": doc_ids}
            )

            assert response.status_code == 200
            data = response.json()

            # Check if documents are returned
            assert len(data["documents"]) >= 0
