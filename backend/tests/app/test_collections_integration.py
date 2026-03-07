"""
Integration tests for collections management endpoints.

Tests the /collections router with actual HTTP requests.
"""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
@pytest.mark.collections
async def test_collections_require_api_key(client: AsyncClient):
    """Test that collection endpoints require valid API key."""
    response = await client.get("/collections")
    assert response.status_code == 403, "Should reject request without API key"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_list_collections(authenticated_client: AsyncClient):
    """Test listing all collections."""
    response = await authenticated_client.get("/collections")

    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    # Each collection should have expected fields
    if len(data) > 0:
        collection = data[0]
        assert "id" in collection
        assert "name" in collection


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_create_collection(
    authenticated_client: AsyncClient, sample_collection_data: dict[str, Any]
):
    """Test creating a new collection."""
    # Create unique collection name to avoid conflicts
    sample_collection_data["name"] = f"Test Collection {uuid.uuid4().hex[:8]}"

    response = await authenticated_client.post(
        "/collections", json=sample_collection_data
    )

    assert response.status_code in [200, 201]
    data = response.json()

    # Verify response structure
    assert "id" in data
    assert data["name"] == sample_collection_data["name"]
    assert data["description"] == sample_collection_data["description"]

    # Store collection ID for cleanup
    return data["id"]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_create_collection_minimal(authenticated_client: AsyncClient):
    """Test creating collection with only required fields."""
    minimal_data = {"name": f"Minimal Collection {uuid.uuid4().hex[:8]}"}

    response = await authenticated_client.post("/collections", json=minimal_data)

    assert response.status_code in [200, 201]
    data = response.json()
    assert "id" in data
    assert data["name"] == minimal_data["name"]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_create_duplicate_collection_name(
    authenticated_client: AsyncClient, sample_collection_data: dict[str, Any]
):
    """Test that duplicate collection names are handled properly."""
    collection_name = f"Duplicate Test {uuid.uuid4().hex[:8]}"
    sample_collection_data["name"] = collection_name

    # Create first collection
    response1 = await authenticated_client.post(
        "/collections", json=sample_collection_data
    )
    assert response1.status_code in [200, 201]

    # Try to create duplicate
    response2 = await authenticated_client.post(
        "/collections", json=sample_collection_data
    )

    # Should either succeed (allow duplicates) or fail with conflict
    assert response2.status_code in [200, 201, 409, 400]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_get_collection_by_id(authenticated_client: AsyncClient):
    """Test retrieving a specific collection."""
    # First create a collection
    collection_data = {
        "name": f"Get Test {uuid.uuid4().hex[:8]}",
        "description": "Collection for get test",
    }

    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Retrieve the collection
    response = await authenticated_client.get(f"/collections/{collection_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == collection_id
    assert data["name"] == collection_data["name"]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_get_nonexistent_collection(authenticated_client: AsyncClient):
    """Test retrieving a collection that doesn't exist."""
    fake_id = "nonexistent-collection-id"
    response = await authenticated_client.get(f"/collections/{fake_id}")

    assert response.status_code == 404


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_update_collection(authenticated_client: AsyncClient):
    """Test updating collection metadata."""
    # Create a collection
    collection_data = {
        "name": f"Update Test {uuid.uuid4().hex[:8]}",
        "description": "Original description",
    }

    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Update the collection
    update_data = {
        "name": f"Updated Collection {uuid.uuid4().hex[:8]}",
        "description": "Updated description",
    }

    response = await authenticated_client.put(
        f"/collections/{collection_id}", json=update_data
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == update_data["name"]
    assert data["description"] == update_data["description"]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_delete_collection(authenticated_client: AsyncClient):
    """Test deleting a collection."""
    # Create a collection
    collection_data = {"name": f"Delete Test {uuid.uuid4().hex[:8]}"}

    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Delete the collection
    response = await authenticated_client.delete(f"/collections/{collection_id}")

    assert response.status_code in [200, 204]

    # Verify it's deleted
    get_response = await authenticated_client.get(f"/collections/{collection_id}")
    assert get_response.status_code == 404


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_add_documents_to_collection(authenticated_client: AsyncClient):
    """Test adding documents to a collection."""
    # Create a collection
    collection_data = {"name": f"Documents Test {uuid.uuid4().hex[:8]}"}
    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Get some document IDs
    docs_response = await authenticated_client.get("/documents", params={"limit": 2})
    assert docs_response.status_code == 200
    docs_data = docs_response.json()

    if len(docs_data["documents"]) > 0:
        document_ids = [doc["id"] for doc in docs_data["documents"][:2]]

        # Add documents to collection
        response = await authenticated_client.post(
            f"/collections/{collection_id}/documents",
            json={"document_ids": document_ids},
        )

        assert response.status_code in [200, 201]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_add_documents_batch(authenticated_client: AsyncClient):
    """Test batch adding multiple documents to a collection."""
    # Create a collection
    collection_data = {"name": f"Batch Test {uuid.uuid4().hex[:8]}"}
    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Get multiple document IDs
    docs_response = await authenticated_client.get("/documents", params={"limit": 5})
    assert docs_response.status_code == 200
    docs_data = docs_response.json()

    if len(docs_data["documents"]) > 0:
        document_ids = [doc["id"] for doc in docs_data["documents"]]

        # Batch add
        response = await authenticated_client.post(
            f"/collections/{collection_id}/documents/batch",
            json={"document_ids": document_ids},
        )

        assert response.status_code in [200, 201]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_list_collection_documents(authenticated_client: AsyncClient):
    """Test listing documents in a collection."""
    # Create collection and add documents
    collection_data = {"name": f"List Docs Test {uuid.uuid4().hex[:8]}"}
    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Get document IDs
    docs_response = await authenticated_client.get("/documents", params={"limit": 1})
    if docs_response.status_code == 200:
        docs_data = docs_response.json()
        if len(docs_data["documents"]) > 0:
            doc_id = docs_data["documents"][0]["id"]

            # Add document
            await authenticated_client.post(
                f"/collections/{collection_id}/documents",
                json={"document_ids": [doc_id]},
            )

    # List documents
    response = await authenticated_client.get(f"/collections/{collection_id}/documents")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list | dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_remove_document_from_collection(authenticated_client: AsyncClient):
    """Test removing a specific document from a collection."""
    # Create collection
    collection_data = {"name": f"Remove Test {uuid.uuid4().hex[:8]}"}
    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Add and then remove document
    docs_response = await authenticated_client.get("/documents", params={"limit": 1})

    if docs_response.status_code == 200:
        docs_data = docs_response.json()
        if len(docs_data["documents"]) > 0:
            doc_id = docs_data["documents"][0]["id"]

            # Add document
            await authenticated_client.post(
                f"/collections/{collection_id}/documents",
                json={"document_ids": [doc_id]},
            )

            # Remove document
            response = await authenticated_client.delete(
                f"/collections/{collection_id}/documents/{doc_id}"
            )

            assert response.status_code in [200, 204]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_remove_all_documents_from_collection(authenticated_client: AsyncClient):
    """Test removing all documents from a collection."""
    # Create collection and add documents
    collection_data = {"name": f"Clear Test {uuid.uuid4().hex[:8]}"}
    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Add documents
    docs_response = await authenticated_client.get("/documents", params={"limit": 2})
    if docs_response.status_code == 200:
        docs_data = docs_response.json()
        if len(docs_data["documents"]) > 0:
            doc_ids = [doc["id"] for doc in docs_data["documents"]]

            await authenticated_client.post(
                f"/collections/{collection_id}/documents",
                json={"document_ids": doc_ids},
            )

    # Remove all documents
    response = await authenticated_client.delete(
        f"/collections/{collection_id}/documents"
    )

    assert response.status_code in [200, 204]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_collection_validation_errors(authenticated_client: AsyncClient):
    """Test validation errors for collection operations."""
    # Empty name
    response = await authenticated_client.post("/collections", json={"name": ""})
    assert response.status_code == 422

    # Missing required fields
    response = await authenticated_client.post("/collections", json={})
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.collections
@pytest.mark.integration
async def test_add_invalid_document_ids(authenticated_client: AsyncClient):
    """Test adding non-existent document IDs to collection."""
    # Create collection
    collection_data = {"name": f"Invalid IDs Test {uuid.uuid4().hex[:8]}"}
    create_response = await authenticated_client.post(
        "/collections", json=collection_data
    )
    assert create_response.status_code in [200, 201]
    collection_id = create_response.json()["id"]

    # Try to add invalid document IDs
    response = await authenticated_client.post(
        f"/collections/{collection_id}/documents",
        json={"document_ids": ["invalid-id-1", "invalid-id-2"]},
    )

    # Should either accept (silently skip) or reject
    assert response.status_code in [200, 201, 400, 404]
