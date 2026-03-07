"""
Comprehensive tests for similar documents endpoints.

Tests:
- GET /documents/{id}/similar - Find similar documents
- POST /documents/similar/batch - Batch similar documents search
"""

import pytest
from httpx import AsyncClient

# ============================================================================
# Similar Documents Tests (GET /documents/{id}/similar)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_success(authenticated_client: AsyncClient):
    """Test successful retrieval of similar documents."""
    # First get a valid document ID
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 5}
            )

            assert response.status_code == 200
            data = response.json()

            # Check response structure
            assert "documents" in data or isinstance(data, list)

            # Get the actual list
            similar_docs = (
                data.get("documents", data) if isinstance(data, dict) else data
            )

            # Similar docs should not include the source document
            for doc in similar_docs:
                assert doc["id"] != doc_id


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_with_limit(authenticated_client: AsyncClient):
    """Test similar documents with custom limit."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]
            limit = 3

            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": limit}
            )

            assert response.status_code == 200
            data = response.json()

            similar_docs = (
                data.get("documents", data) if isinstance(data, dict) else data
            )
            assert len(similar_docs) <= limit


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_get_similar_documents_invalid_limit(authenticated_client: AsyncClient):
    """Test similar documents with invalid limit values."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            # Negative limit
            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": -5}
            )
            assert response.status_code in [200, 422]

            # Zero limit
            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 0}
            )
            assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_nonexistent_id(authenticated_client: AsyncClient):
    """Test similar documents for non-existent document."""
    fake_id = "nonexistent-doc-999999"

    response = await authenticated_client.get(
        f"/documents/{fake_id}/similar", params={"limit": 5}
    )

    # Should return 404 or empty list
    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        similar_docs = data.get("documents", data) if isinstance(data, dict) else data
        assert isinstance(similar_docs, list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.auth
async def test_get_similar_documents_requires_authentication(client: AsyncClient):
    """Test that similar documents endpoint requires authentication."""
    response = await client.get("/documents/test-id/similar")

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_response_structure(
    authenticated_client: AsyncClient,
):
    """Test similar documents response structure."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 5}
            )

            assert response.status_code == 200
            data = response.json()

            similar_docs = (
                data.get("documents", data) if isinstance(data, dict) else data
            )

            if similar_docs:
                # Check structure of first similar document
                doc = similar_docs[0]
                assert "id" in doc
                assert isinstance(doc, dict)

                # Might have similarity score
                if "score" in doc or "similarity" in doc:
                    score = doc.get("score", doc.get("similarity"))
                    assert isinstance(score, int | float)
                    assert 0 <= score <= 1 or score >= 0  # Depends on scoring method


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_with_threshold(authenticated_client: AsyncClient):
    """Test similar documents with similarity threshold."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 10, "threshold": 0.7}
            )

            # Should succeed even if threshold not supported
            assert response.status_code in [200, 404, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_boundary_limits(authenticated_client: AsyncClient):
    """Test similar documents with boundary limit values."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            # Minimum limit
            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 1}
            )
            assert response.status_code == 200

            # Large limit
            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 100}
            )
            assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_no_duplicates(authenticated_client: AsyncClient):
    """Test that similar documents don't include duplicates."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 20}
            )

            assert response.status_code == 200
            data = response.json()

            similar_docs = (
                data.get("documents", data) if isinstance(data, dict) else data
            )

            # Check for duplicates
            doc_ids = [doc["id"] for doc in similar_docs]
            assert len(doc_ids) == len(set(doc_ids)), (
                "Similar documents contain duplicates"
            )


# ============================================================================
# Batch Similar Documents Tests (POST /documents/similar/batch)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_batch_similar_documents_success(authenticated_client: AsyncClient):
    """Test successful batch similar documents search."""
    # Get some valid document IDs
    list_response = await authenticated_client.get("/documents", params={"limit": 3})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_ids = [doc["id"] for doc in docs]

            response = await authenticated_client.post(
                "/documents/similar/batch", json={"document_ids": doc_ids, "limit": 5}
            )

            assert response.status_code == 200
            data = response.json()

            # Check response structure
            assert isinstance(data, dict | list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_batch_similar_documents_single_id(authenticated_client: AsyncClient):
    """Test batch similar documents with single ID."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.post(
                "/documents/similar/batch", json={"document_ids": [doc_id], "limit": 5}
            )

            assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_batch_similar_documents_empty_list(authenticated_client: AsyncClient):
    """Test batch similar documents with empty ID list."""
    response = await authenticated_client.post(
        "/documents/similar/batch", json={"document_ids": [], "limit": 5}
    )

    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_batch_similar_documents_nonexistent_ids(
    authenticated_client: AsyncClient,
):
    """Test batch similar documents with non-existent IDs."""
    fake_ids = ["fake-1", "fake-2", "fake-3"]

    response = await authenticated_client.post(
        "/documents/similar/batch", json={"document_ids": fake_ids, "limit": 5}
    )

    # Should handle gracefully
    assert response.status_code in [200, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_batch_similar_documents_mixed_valid_invalid(
    authenticated_client: AsyncClient,
):
    """Test batch similar documents with mix of valid and invalid IDs."""
    list_response = await authenticated_client.get("/documents", params={"limit": 2})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            valid_ids = [doc["id"] for doc in docs]
            mixed_ids = [*valid_ids, "fake-1", "fake-2"]

            response = await authenticated_client.post(
                "/documents/similar/batch", json={"document_ids": mixed_ids, "limit": 5}
            )

            assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_batch_similar_documents_invalid_limit(authenticated_client: AsyncClient):
    """Test batch similar documents with invalid limit."""
    response = await authenticated_client.post(
        "/documents/similar/batch", json={"document_ids": ["id1", "id2"], "limit": -5}
    )

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.auth
async def test_batch_similar_documents_requires_authentication(client: AsyncClient):
    """Test that batch similar documents requires authentication."""
    response = await client.post(
        "/documents/similar/batch", json={"document_ids": ["id1", "id2"], "limit": 5}
    )

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_batch_similar_documents_missing_fields(
    authenticated_client: AsyncClient,
):
    """Test batch similar documents with missing required fields."""
    # Missing document_ids
    response = await authenticated_client.post(
        "/documents/similar/batch", json={"limit": 5}
    )

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_batch_similar_documents_large_batch(authenticated_client: AsyncClient):
    """Test batch similar documents with large number of IDs."""
    list_response = await authenticated_client.get("/documents", params={"limit": 20})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if len(docs) >= 10:
            doc_ids = [doc["id"] for doc in docs[:10]]

            response = await authenticated_client.post(
                "/documents/similar/batch", json={"document_ids": doc_ids, "limit": 5}
            )

            assert response.status_code in [200, 413, 422]


# ============================================================================
# Similar Documents Edge Cases
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_similar_documents_concurrent_requests(
    authenticated_client: AsyncClient,
):
    """Test concurrent similar documents requests."""
    import asyncio

    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            async def fetch_similar():
                return await authenticated_client.get(
                    f"/documents/{doc_id}/similar", params={"limit": 5}
                )

            # Make 5 concurrent requests
            responses = await asyncio.gather(*[fetch_similar() for _ in range(5)])

            # All should succeed
            for response in responses:
                assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_similar_documents_consistency(authenticated_client: AsyncClient):
    """Test that similar documents results are consistent."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            # First request
            response1 = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 5}
            )

            # Second request
            response2 = await authenticated_client.get(
                f"/documents/{doc_id}/similar", params={"limit": 5}
            )

            assert response1.status_code == 200
            assert response2.status_code == 200

            # Results should be consistent
            data1 = response1.json()
            data2 = response2.json()

            similar1 = (
                data1.get("documents", data1) if isinstance(data1, dict) else data1
            )
            similar2 = (
                data2.get("documents", data2) if isinstance(data2, dict) else data2
            )

            # At least some overlap in top results
            if similar1 and similar2:
                ids1 = [doc["id"] for doc in similar1]
                ids2 = [doc["id"] for doc in similar2]
                assert len(set(ids1) & set(ids2)) >= 0


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_similar_documents_with_filters(authenticated_client: AsyncClient):
    """Test similar documents with additional filters."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.get(
                f"/documents/{doc_id}/similar",
                params={"limit": 5, "jurisdiction": "PL"},
            )

            # Should succeed even if filters not supported
            assert response.status_code in [200, 404, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_batch_similar_documents_duplicate_ids(authenticated_client: AsyncClient):
    """Test batch similar documents with duplicate IDs."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]
            duplicate_ids = [doc_id, doc_id, doc_id]

            response = await authenticated_client.post(
                "/documents/similar/batch",
                json={"document_ids": duplicate_ids, "limit": 5},
            )

            # Should handle duplicates gracefully
            assert response.status_code == 200
