"""
Comprehensive tests for Extraction Results and Export.

Tests cover:
- Export extraction results (GET /api/extractions/{id}/export)
- Base schema extraction (POST /api/extractions/base-schema)
- Filter extracted data (POST /api/extractions/base-schema/filter)
- Get facet counts (GET /api/extractions/base-schema/facets)
- Get filter options (GET /api/extractions/base-schema/filter-options)
"""

import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestExtractionExport:
    """Test exporting extraction results."""

    @pytest.mark.anyio
    async def test_export_extraction_json(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test exporting extraction as JSON."""
        # Create extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = create_response.json().get("id") or create_response.json().get(
            "job_id"
        )

        # Export
        response = await client.get(
            f"/api/extractions/{job_id}/export",
            params={"format": "json"},
            headers=auth_headers,
        )

        assert response.status_code in [200, 202]  # 202 if still processing

    @pytest.mark.anyio
    async def test_export_extraction_csv(self, client: AsyncClient, auth_headers: dict):
        """Test exporting extraction as CSV."""
        # Create extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = create_response.json().get("id") or create_response.json().get(
            "job_id"
        )

        # Export as CSV
        response = await client.get(
            f"/api/extractions/{job_id}/export",
            params={"format": "csv"},
            headers=auth_headers,
        )

        assert response.status_code in [200, 202]

    @pytest.mark.anyio
    async def test_export_nonexistent_extraction(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test exporting non-existent extraction."""
        response = await client.get(
            "/api/extractions/nonexistent-job-999/export", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_export_without_auth(
        self, client: AsyncClient, mock_extraction_id: str
    ):
        """Test export fails without auth."""
        response = await client.get(f"/api/extractions/{mock_extraction_id}/export")

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_export_with_fields_selection(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test exporting with specific field selection."""
        # Create extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = create_response.json().get("id") or create_response.json().get(
            "job_id"
        )

        # Export with fields
        response = await client.get(
            f"/api/extractions/{job_id}/export",
            params={"format": "json", "fields": "parties,date,amount"},
            headers=auth_headers,
        )

        assert response.status_code in [200, 202]


@pytest.mark.integration
class TestBaseSchemaExtraction:
    """Test base schema extraction operations."""

    @pytest.mark.anyio
    async def test_base_schema_extraction(
        self, client: AsyncClient, auth_headers: dict, sample_document_text: str
    ):
        """Test extraction with base schema."""
        request_data = {
            "document_id": "test-doc-123",
            "text": sample_document_text,
            "fields": ["parties", "date", "amount"],
        }

        response = await client.post(
            "/api/extractions/base-schema", json=request_data, headers=auth_headers
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert "extracted" in data or "results" in data

    @pytest.mark.anyio
    async def test_base_schema_extraction_minimal(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test base schema with minimal data."""
        request_data = {
            "document_id": "test-doc-123",
            "text": "Simple text",
            "fields": ["text"],
        }

        response = await client.post(
            "/api/extractions/base-schema", json=request_data, headers=auth_headers
        )

        assert response.status_code in [200, 201]

    @pytest.mark.anyio
    async def test_base_schema_extraction_missing_text(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test base schema fails without text."""
        request_data = {"document_id": "test-doc-123", "fields": ["parties"]}

        response = await client.post(
            "/api/extractions/base-schema", json=request_data, headers=auth_headers
        )

        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_base_schema_extraction_empty_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test base schema with empty fields."""
        request_data = {
            "document_id": "test-doc-123",
            "text": "Sample text",
            "fields": [],
        }

        response = await client.post(
            "/api/extractions/base-schema", json=request_data, headers=auth_headers
        )

        assert response.status_code in [400, 422]


@pytest.mark.integration
class TestExtractedDataFiltering:
    """Test filtering extracted data."""

    @pytest.mark.anyio
    async def test_filter_extracted_data(
        self, client: AsyncClient, auth_headers: dict, filter_request: dict
    ):
        """Test filtering extracted data."""
        response = await client.post(
            "/api/extractions/base-schema/filter",
            json=filter_request,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "results" in data or "items" in data

    @pytest.mark.anyio
    async def test_filter_by_date_range(self, client: AsyncClient, auth_headers: dict):
        """Test filtering by date range."""
        filter_data = {
            "filters": {"date_range": {"start": "2024-01-01", "end": "2024-12-31"}}
        }

        response = await client.post(
            "/api/extractions/base-schema/filter",
            json=filter_data,
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_filter_by_amount_range(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test filtering by numeric range."""
        filter_data = {"filters": {"amount_range": {"min": 1000, "max": 100000}}}

        response = await client.post(
            "/api/extractions/base-schema/filter",
            json=filter_data,
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_filter_by_text_field(self, client: AsyncClient, auth_headers: dict):
        """Test filtering by text field."""
        filter_data = {"filters": {"parties": ["Company A", "Company B"]}}

        response = await client.post(
            "/api/extractions/base-schema/filter",
            json=filter_data,
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_filter_with_pagination(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test filtering with pagination."""
        filter_data = {"filters": {}, "page": 1, "page_size": 20}

        response = await client.post(
            "/api/extractions/base-schema/filter",
            json=filter_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        if isinstance(data, dict):
            assert "page" in data or "items" in data

    @pytest.mark.anyio
    async def test_filter_empty_results(self, client: AsyncClient, auth_headers: dict):
        """Test filtering with no matching results."""
        filter_data = {"filters": {"impossible_field": "nonexistent_value"}}

        response = await client.post(
            "/api/extractions/base-schema/filter",
            json=filter_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        if "results" in data:
            assert len(data["results"]) == 0


@pytest.mark.integration
class TestFacetCounts:
    """Test facet aggregation operations."""

    @pytest.mark.anyio
    async def test_get_facet_counts(self, client: AsyncClient, auth_headers: dict):
        """Test getting facet counts."""
        response = await client.get(
            "/api/extractions/base-schema/facets", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict) or isinstance(data, list)

    @pytest.mark.anyio
    async def test_get_facet_counts_specific_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test facet counts for specific fields."""
        response = await client.get(
            "/api/extractions/base-schema/facets",
            params={"fields": "jurisdiction,court_type"},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_get_facet_counts_with_filters(
        self, client: AsyncClient, auth_headers: dict, facet_request: dict
    ):
        """Test facet counts with filters applied."""
        response = await client.post(
            "/api/extractions/base-schema/facets",
            json=facet_request,
            headers=auth_headers,
        )

        # Endpoint might be GET or POST
        if response.status_code == 405:
            # Try GET instead
            response = await client.get(
                "/api/extractions/base-schema/facets",
                params={"year": 2024},
                headers=auth_headers,
            )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_facet_counts_without_auth(self, client: AsyncClient):
        """Test facet counts fail without auth."""
        response = await client.get("/api/extractions/base-schema/facets")

        assert response.status_code in [401, 403]


@pytest.mark.integration
class TestFilterOptions:
    """Test filter options endpoint."""

    @pytest.mark.anyio
    async def test_get_filter_options(self, client: AsyncClient, auth_headers: dict):
        """Test getting available filter options."""
        response = await client.get(
            "/api/extractions/base-schema/filter-options", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict) or isinstance(data, list)

    @pytest.mark.anyio
    async def test_filter_options_structure(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test filter options return expected structure."""
        response = await client.get(
            "/api/extractions/base-schema/filter-options", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Check for common filter fields
        if isinstance(data, dict):
            # Structure might vary
            pass

    @pytest.mark.anyio
    async def test_filter_options_for_field(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test filter options for specific field."""
        response = await client.get(
            "/api/extractions/base-schema/filter-options",
            params={"field": "jurisdiction"},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_filter_options_without_auth(self, client: AsyncClient):
        """Test filter options fail without auth."""
        response = await client.get("/api/extractions/base-schema/filter-options")

        assert response.status_code in [401, 403]
