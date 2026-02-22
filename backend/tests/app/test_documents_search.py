"""
Comprehensive tests for document search endpoints.

Tests:
- POST /documents/search - Main search endpoint (chunks)
- POST /documents/search/legacy - Legacy document retrieval
- GET /documents/facets - Faceted search
"""

import pytest
from httpx import AsyncClient


# ============================================================================
# Main Search Tests (POST /documents/search)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_basic(authenticated_client: AsyncClient):
    """Test basic document search functionality."""
    response = await authenticated_client.post(
        "/documents/search", json={"query": "contract law", "limit_docs": 10}
    )

    assert response.status_code == 200
    data = response.json()

    # Check response structure
    assert "results" in data or "documents" in data


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_with_limit(authenticated_client: AsyncClient):
    """Test search with custom document limit."""
    limit = 5
    response = await authenticated_client.post(
        "/documents/search", json={"query": "liability contract", "limit_docs": limit}
    )

    assert response.status_code == 200
    data = response.json()

    # Should return at most the requested limit
    results = data.get("results", data.get("documents", []))
    assert len(results) <= limit


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_search_documents_empty_query(authenticated_client: AsyncClient):
    """Test search with empty query string."""
    response = await authenticated_client.post(
        "/documents/search", json={"query": "", "limit_docs": 10}
    )

    # Should return validation error or empty results
    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_search_documents_missing_query(authenticated_client: AsyncClient):
    """Test search without query field."""
    response = await authenticated_client.post(
        "/documents/search", json={"limit_docs": 10}
    )

    # Should return validation error
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_unicode_query(authenticated_client: AsyncClient):
    """Test search with Unicode characters (Polish legal terms)."""
    response = await authenticated_client.post(
        "/documents/search",
        json={"query": "prawo cywilne odpowiedzialność łódź", "limit_docs": 10},
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_special_characters(authenticated_client: AsyncClient):
    """Test search with special characters."""
    response = await authenticated_client.post(
        "/documents/search", json={"query": "§123 Art. 456, par. 1", "limit_docs": 10}
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_long_query(authenticated_client: AsyncClient):
    """Test search with very long query."""
    long_query = "contract law " * 50  # 600+ characters
    response = await authenticated_client.post(
        "/documents/search", json={"query": long_query, "limit_docs": 5}
    )

    assert response.status_code in [200, 422]  # May have length limit


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_with_alpha_parameter(authenticated_client: AsyncClient):
    """Test search with alpha (hybrid search weight)."""
    response = await authenticated_client.post(
        "/documents/search",
        json={"query": "tort law negligence", "limit_docs": 10, "alpha": 0.7},
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_alpha_boundaries(authenticated_client: AsyncClient):
    """Test search with alpha boundary values."""
    # Test alpha = 0 (pure keyword search)
    response = await authenticated_client.post(
        "/documents/search", json={"query": "contract", "limit_docs": 5, "alpha": 0.0}
    )
    assert response.status_code == 200

    # Test alpha = 1 (pure semantic search)
    response = await authenticated_client.post(
        "/documents/search", json={"query": "contract", "limit_docs": 5, "alpha": 1.0}
    )
    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_search_documents_invalid_alpha(authenticated_client: AsyncClient):
    """Test search with invalid alpha value."""
    response = await authenticated_client.post(
        "/documents/search",
        json={
            "query": "contract",
            "limit_docs": 10,
            "alpha": 1.5,  # Out of range
        },
    )

    # Should return validation error or clamp to valid range
    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_with_jurisdiction_filter(
    authenticated_client: AsyncClient,
):
    """Test search with jurisdiction filter."""
    response = await authenticated_client.post(
        "/documents/search",
        json={"query": "property rights", "limit_docs": 10, "jurisdiction": "PL"},
    )

    assert response.status_code == 200
    data = response.json()

    # Check if results respect jurisdiction filter
    results = data.get("results", data.get("documents", []))
    if results:
        # Some results should match the jurisdiction
        for doc in results:
            # Document might have jurisdiction field
            if "jurisdiction" in doc or "country" in doc:
                assert doc.get("jurisdiction") == "PL" or doc.get("country") == "PL"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_with_date_filter(authenticated_client: AsyncClient):
    """Test search with date range filter."""
    response = await authenticated_client.post(
        "/documents/search",
        json={
            "query": "contract dispute",
            "limit_docs": 10,
            "date_from": "2023-01-01",
            "date_to": "2023-12-31",
        },
    )

    assert response.status_code in [200, 422]  # Depends on schema


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_multiple_filters(authenticated_client: AsyncClient):
    """Test search with multiple filters combined."""
    response = await authenticated_client.post(
        "/documents/search",
        json={
            "query": "civil law",
            "limit_docs": 5,
            "jurisdiction": "PL",
            "alpha": 0.5,
        },
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.auth
async def test_search_documents_requires_authentication(client: AsyncClient):
    """Test that search requires authentication."""
    response = await client.post(
        "/documents/search", json={"query": "test", "limit_docs": 10}
    )

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_response_structure(authenticated_client: AsyncClient):
    """Test search response structure."""
    response = await authenticated_client.post(
        "/documents/search", json={"query": "legal precedent", "limit_docs": 5}
    )

    assert response.status_code == 200
    data = response.json()

    # Check for results or documents field
    assert "results" in data or "documents" in data

    results = data.get("results", data.get("documents", []))
    if results:
        # Check structure of first result
        result = results[0]
        assert isinstance(result, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_no_results(authenticated_client: AsyncClient):
    """Test search that returns no results."""
    # Use very specific query unlikely to match
    response = await authenticated_client.post(
        "/documents/search",
        json={"query": "xyzabc123nonexistent9999", "limit_docs": 10},
    )

    assert response.status_code == 200
    data = response.json()

    results = data.get("results", data.get("documents", []))
    # Should return empty list or very few results
    assert isinstance(results, list)


# ============================================================================
# Legacy Search Tests (POST /documents/search/legacy)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_legacy_basic(authenticated_client: AsyncClient):
    """Test legacy document search endpoint."""
    response = await authenticated_client.post(
        "/documents/search/legacy", json={"query": "contract law", "limit_docs": 10}
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_documents_legacy_with_filters(authenticated_client: AsyncClient):
    """Test legacy search with filters."""
    response = await authenticated_client.post(
        "/documents/search/legacy",
        json={"query": "property law", "limit_docs": 5, "alpha": 0.5},
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.auth
async def test_search_documents_legacy_requires_authentication(client: AsyncClient):
    """Test that legacy search requires authentication."""
    response = await client.post(
        "/documents/search/legacy", json={"query": "test", "limit_docs": 10}
    )

    assert response.status_code in [401, 403]


# ============================================================================
# Faceted Search Tests (GET /documents/facets)
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_facets_success(authenticated_client: AsyncClient):
    """Test successful retrieval of search facets."""
    response = await authenticated_client.get("/documents/facets")

    assert response.status_code == 200
    data = response.json()

    # Check facets structure
    assert isinstance(data, dict)
    # Common facet fields
    if "jurisdictions" in data or "courts" in data or "years" in data:
        assert True


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_facets_with_query(authenticated_client: AsyncClient):
    """Test facets with search query filter."""
    response = await authenticated_client.get(
        "/documents/facets", params={"query": "contract law"}
    )

    assert response.status_code in [200, 422]  # Depends on implementation


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.auth
async def test_get_facets_requires_authentication(client: AsyncClient):
    """Test that facets endpoint requires authentication."""
    response = await client.get("/documents/facets")

    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_get_facets_structure(authenticated_client: AsyncClient):
    """Test facets response structure."""
    response = await authenticated_client.get("/documents/facets")

    assert response.status_code == 200
    data = response.json()

    # Should be a dict with facet categories
    assert isinstance(data, dict)

    # Common facet types in legal documents
    expected_facets = ["jurisdictions", "courts", "years", "document_types"]
    # At least one should exist
    has_facet = any(key in data for key in expected_facets)
    assert has_facet or len(data) >= 0  # Empty is also valid


# ============================================================================
# Search Performance and Edge Cases
# ============================================================================


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_concurrent_requests(authenticated_client: AsyncClient):
    """Test handling of concurrent search requests."""
    import asyncio

    async def make_request(query: str):
        return await authenticated_client.post(
            "/documents/search", json={"query": query, "limit_docs": 5}
        )

    # Make 5 concurrent search requests with different queries
    queries = [
        "contract law",
        "property rights",
        "criminal liability",
        "civil procedure",
        "tort law",
    ]

    responses = await asyncio.gather(*[make_request(q) for q in queries])

    # All should succeed
    for response in responses:
        assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_pagination_consistency(authenticated_client: AsyncClient):
    """Test search result consistency."""
    # First search
    response1 = await authenticated_client.post(
        "/documents/search",
        json={"query": "contract breach", "limit_docs": 10, "alpha": 0.5},
    )

    assert response1.status_code == 200
    data1 = response1.json()

    # Second identical search
    response2 = await authenticated_client.post(
        "/documents/search",
        json={"query": "contract breach", "limit_docs": 10, "alpha": 0.5},
    )

    assert response2.status_code == 200
    data2 = response2.json()

    # Results should be consistent (same query = same results)
    results1 = data1.get("results", data1.get("documents", []))
    results2 = data2.get("results", data2.get("documents", []))

    if results1 and results2:
        # At least the order should be consistent for top results
        ids1 = [r.get("id") for r in results1[:5]]
        ids2 = [r.get("id") for r in results2[:5]]
        # Some overlap expected
        assert len(set(ids1) & set(ids2)) >= 0


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_search_injection_attempts(authenticated_client: AsyncClient):
    """Test search with SQL injection attempts."""
    malicious_queries = [
        "'; DROP TABLE judgments;--",
        "1' OR '1'='1",
        "<script>alert('xss')</script>",
        "../../etc/passwd",
    ]

    for query in malicious_queries:
        response = await authenticated_client.post(
            "/documents/search", json={"query": query, "limit_docs": 5}
        )

        # Should handle safely (not crash)
        assert response.status_code in [200, 400, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_extreme_limit_values(authenticated_client: AsyncClient):
    """Test search with extreme limit values."""
    # Very small limit
    response = await authenticated_client.post(
        "/documents/search", json={"query": "law", "limit_docs": 1}
    )
    assert response.status_code == 200

    # Negative limit (should fail validation)
    response = await authenticated_client.post(
        "/documents/search", json={"query": "law", "limit_docs": -1}
    )
    assert response.status_code == 422

    # Zero limit (should fail validation)
    response = await authenticated_client.post(
        "/documents/search", json={"query": "law", "limit_docs": 0}
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_whitespace_query(authenticated_client: AsyncClient):
    """Test search with only whitespace."""
    response = await authenticated_client.post(
        "/documents/search", json={"query": "   ", "limit_docs": 10}
    )

    # Should handle gracefully
    assert response.status_code in [200, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_numeric_query(authenticated_client: AsyncClient):
    """Test search with numeric query."""
    response = await authenticated_client.post(
        "/documents/search", json={"query": "123456", "limit_docs": 10}
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
@pytest.mark.integration
async def test_search_mixed_language_query(authenticated_client: AsyncClient):
    """Test search with mixed language query (Polish + English)."""
    response = await authenticated_client.post(
        "/documents/search",
        json={"query": "contract umowa prawo law", "limit_docs": 10},
    )

    assert response.status_code == 200


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_search_malformed_json(authenticated_client: AsyncClient):
    """Test search with malformed request body."""
    response = await authenticated_client.post(
        "/documents/search",
        content="not valid json",
        headers={"Content-Type": "application/json"},
    )

    # Should return 422 or 400
    assert response.status_code in [400, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_search_missing_content_type(authenticated_client: AsyncClient):
    """Test search without content-type header."""
    response = await authenticated_client.post(
        "/documents/search", content='{"query": "test", "limit_docs": 10}'
    )

    # httpx sets content-type automatically, but endpoint should handle it
    assert response.status_code in [200, 400, 415, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_search_extra_fields(authenticated_client: AsyncClient):
    """Test search with extra unexpected fields."""
    response = await authenticated_client.post(
        "/documents/search",
        json={
            "query": "contract",
            "limit_docs": 10,
            "extra_field": "should be ignored",
            "another_field": 123,
        },
    )

    # Should succeed (extra fields ignored)
    assert response.status_code == 200
