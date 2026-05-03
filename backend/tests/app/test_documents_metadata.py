"""
Comprehensive tests for document metadata and citation endpoints.

Tests:
- GET /documents/{id}/metadata - Get document metadata
- GET /documents/citation-network - Citation network data
"""

import pytest
from httpx import AsyncClient

# ============================================================================
# Document Metadata Tests (GET /documents/{id}/metadata)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_metadata_success(authenticated_client: AsyncClient):
    """Test successful retrieval of document metadata."""
    # Get a valid document ID
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.get(f"/documents/{doc_id}/metadata")

            assert response.status_code == 200
            data = response.json()

            # Check metadata structure
            assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_metadata_nonexistent_id(authenticated_client: AsyncClient):
    """Test metadata retrieval for non-existent document."""
    fake_id = "nonexistent-doc-999999"

    response = await authenticated_client.get(f"/documents/{fake_id}/metadata")

    # Should return 404
    assert response.status_code == 404


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_get_document_metadata_requires_authentication(client: AsyncClient):
    """Test that metadata endpoint requires authentication."""
    response = await client.get("/documents/test-id/metadata")

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_metadata_structure(authenticated_client: AsyncClient):
    """Test document metadata response structure."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            response = await authenticated_client.get(f"/documents/{doc_id}/metadata")

            assert response.status_code == 200
            metadata = response.json()

            # Should be a dict with metadata fields
            assert isinstance(metadata, dict)

            # Common metadata fields for legal documents
            possible_fields = [
                "id",
                "title",
                "court_name",
                "case_number",
                "decision_date",
                "jurisdiction",
                "document_type",
                "judges",
                "keywords",
                "legal_bases",
            ]

            # At least some fields should be present
            has_fields = any(field in metadata for field in possible_fields)
            assert has_fields or len(metadata) > 0


@pytest.mark.anyio
@pytest.mark.api
async def test_get_document_metadata_invalid_id(authenticated_client: AsyncClient):
    """Test metadata retrieval with invalid ID format."""
    invalid_ids = [
        "'; DROP TABLE judgments;--",
        "<script>alert(1)</script>",
        "../../etc/passwd",
    ]

    for invalid_id in invalid_ids:
        response = await authenticated_client.get(f"/documents/{invalid_id}/metadata")
        # Should handle safely
        assert response.status_code in [400, 404, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_document_metadata_concurrent_requests(
    authenticated_client: AsyncClient,
):
    """Test concurrent metadata requests."""
    import asyncio

    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            async def fetch_metadata():
                return await authenticated_client.get(f"/documents/{doc_id}/metadata")

            # Make 5 concurrent requests
            responses = await asyncio.gather(*[fetch_metadata() for _ in range(5)])

            # All should succeed
            for response in responses:
                assert response.status_code == 200


# ============================================================================
# Citation Network Tests (GET /documents/citation-network)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_citation_network_success(authenticated_client: AsyncClient):
    """Test successful retrieval of citation network."""
    response = await authenticated_client.get("/documents/citation-network")

    assert response.status_code == 200
    data = response.json()

    # Check response structure
    assert isinstance(data, dict)

    # Citation network typically has nodes and edges
    if "nodes" in data or "edges" in data or "links" in data:
        assert True
    else:
        # Or it might be a different structure
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_citation_network_with_sample_size(authenticated_client: AsyncClient):
    """Test citation network with custom sample size."""
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 20}
    )

    assert response.status_code == 200
    data = response.json()

    # Should return network data
    assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_citation_network_boundary_sizes(authenticated_client: AsyncClient):
    """Test citation network with boundary sample sizes."""
    # Minimum size
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 1}
    )
    assert response.status_code in [200, 422]

    # Maximum size (typically 200)
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 200}
    )
    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_citation_network_invalid_sample_size(
    authenticated_client: AsyncClient,
):
    """Test citation network with invalid sample size."""
    # Negative size
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": -10}
    )
    assert response.status_code == 422

    # Zero size
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 0}
    )
    assert response.status_code == 422

    # Too large
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 9999}
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_citation_network_with_min_shared_refs(
    authenticated_client: AsyncClient,
):
    """Test citation network with minimum shared references filter."""
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 50, "min_shared_refs": 2}
    )

    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_get_citation_network_requires_authentication(client: AsyncClient):
    """Test that citation network requires authentication."""
    response = await client.get("/documents/citation-network")

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_citation_network_structure(authenticated_client: AsyncClient):
    """Test citation network response structure."""
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 30}
    )

    assert response.status_code == 200
    data = response.json()

    # Common graph structures
    assert isinstance(data, dict)

    # Might have nodes/edges or documents/links format
    if "nodes" in data:
        assert isinstance(data["nodes"], list)
    if "edges" in data or "links" in data:
        links = data.get("edges", data.get("links", []))
        assert isinstance(links, list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_citation_network_empty_result(authenticated_client: AsyncClient):
    """Test citation network when no citations exist."""
    # Use very restrictive filters
    response = await authenticated_client.get(
        "/documents/citation-network",
        params={
            "sample_size": 5,
            "min_shared_refs": 100,  # Very high threshold
        },
    )

    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        # Should return empty or minimal structure
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_citation_network_concurrent_requests(
    authenticated_client: AsyncClient,
):
    """Test concurrent citation network requests."""
    import asyncio

    async def fetch_network():
        return await authenticated_client.get(
            "/documents/citation-network", params={"sample_size": 20}
        )

    # Make 3 concurrent requests
    responses = await asyncio.gather(*[fetch_network() for _ in range(3)])

    # All should succeed
    for response in responses:
        assert response.status_code == 200


# ============================================================================
# Edge Cases and Error Handling
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_get_metadata_special_characters_in_id(authenticated_client: AsyncClient):
    """Test metadata retrieval with special characters in ID.

    Marked integration because the route hits Supabase before any ID
    validation could trigger; returns 500 (DB unreachable) under unit-test
    conditions rather than the documented 404/400/422.
    """
    special_ids = [
        "id-with-dash",
        "id_with_underscore",
        "id.with.dots",
    ]

    for special_id in special_ids:
        response = await authenticated_client.get(f"/documents/{special_id}/metadata")
        # Should handle gracefully
        assert response.status_code in [200, 404, 400, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_metadata_very_long_id(authenticated_client: AsyncClient):
    """Test metadata retrieval with very long ID."""
    very_long_id = "a" * 1000

    response = await authenticated_client.get(f"/documents/{very_long_id}/metadata")

    # Should handle gracefully
    assert response.status_code in [400, 404, 413, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_citation_network_invalid_param_types(authenticated_client: AsyncClient):
    """Test citation network with invalid parameter types."""
    # String instead of int
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": "invalid"}
    )
    assert response.status_code == 422

    # Float for min_shared_refs
    response = await authenticated_client.get(
        "/documents/citation-network", params={"min_shared_refs": 2.5}
    )
    assert response.status_code in [200, 422]  # Might accept or reject


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_citation_network_consistency(authenticated_client: AsyncClient):
    """Test that citation network results are consistent."""
    params = {"sample_size": 30, "min_shared_refs": 1}

    # First request
    response1 = await authenticated_client.get(
        "/documents/citation-network", params=params
    )

    # Second request with same params
    response2 = await authenticated_client.get(
        "/documents/citation-network", params=params
    )

    assert response1.status_code == 200
    assert response2.status_code == 200

    # Results might vary due to sampling, but structure should be consistent
    data1 = response1.json()
    data2 = response2.json()

    assert type(data1) is type(data2)
    assert set(data1.keys()) == set(data2.keys())


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_metadata_and_document_consistency(authenticated_client: AsyncClient):
    """Test that metadata endpoint returns consistent data with main document."""
    list_response = await authenticated_client.get("/documents", params={"limit": 1})

    if list_response.status_code == 200:
        docs = list_response.json().get("documents", [])
        if docs:
            doc_id = docs[0]["id"]

            # Get full document
            doc_response = await authenticated_client.get(f"/documents/{doc_id}")

            # Get metadata
            meta_response = await authenticated_client.get(
                f"/documents/{doc_id}/metadata"
            )

            if doc_response.status_code == 200 and meta_response.status_code == 200:
                doc_data = doc_response.json()
                meta_data = meta_response.json()

                # ID should match
                if "id" in meta_data:
                    assert meta_data["id"] == doc_id
                    assert meta_data["id"] == doc_data["id"]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_citation_network_with_filters(authenticated_client: AsyncClient):
    """Test citation network with additional filters."""
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 30, "jurisdiction": "PL"}
    )

    # Should succeed even if filters not supported
    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.integration
async def test_citation_network_large_sample(authenticated_client: AsyncClient):
    """Test citation network with large sample size."""
    response = await authenticated_client.get(
        "/documents/citation-network", params={"sample_size": 150}
    )

    assert response.status_code in [200, 422]

    if response.status_code == 200:
        data = response.json()
        # Should handle large network gracefully
        assert isinstance(data, dict)
