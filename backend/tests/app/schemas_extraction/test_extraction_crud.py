"""
Comprehensive tests for Extraction CRUD operations.

Tests cover:
- Create extraction job (POST /api/extractions)
- Create extraction from DB (POST /api/extractions/db)
- Get extraction job (GET /api/extractions/{id})
- List extraction jobs (GET /api/extractions)
- Delete/cancel extraction (DELETE /api/extractions/{id})
- Bulk extraction (POST /api/extractions/bulk)
"""

import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestExtractionCreation:
    """Test extraction job creation."""

    @pytest.mark.anyio
    async def test_create_extraction_job(
        self, client: AsyncClient, auth_headers: dict, sample_extraction_request: dict
    ):
        """Test creating an extraction job."""
        response = await client.post(
            "/api/extractions", json=sample_extraction_request, headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data or "job_id" in data
        assert "status" in data

    @pytest.mark.anyio
    async def test_create_extraction_with_schema_id(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test extraction with valid schema ID."""
        # Create schema first
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # Create extraction
        extraction_data = {"schema_id": schema_id, "document_id": "test-doc-123"}

        response = await client.post(
            "/api/extractions", json=extraction_data, headers=auth_headers
        )

        assert response.status_code == 201

    @pytest.mark.anyio
    async def test_create_extraction_with_config(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test extraction with custom configuration."""
        extraction_data = {
            "schema_id": "test-schema-123",
            "document_id": "test-doc-456",
            "config": {
                "mode": "auto",
                "confidence_threshold": 0.8,
                "max_tokens": 4000,
                "temperature": 0.3,
            },
        }

        response = await client.post(
            "/api/extractions", json=extraction_data, headers=auth_headers
        )

        assert response.status_code == 201

    @pytest.mark.anyio
    async def test_create_extraction_missing_schema_id(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test extraction fails without schema_id."""
        extraction_data = {"document_id": "test-doc-123"}

        response = await client.post(
            "/api/extractions", json=extraction_data, headers=auth_headers
        )

        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_create_extraction_missing_document_id(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test extraction fails without document_id."""
        extraction_data = {"schema_id": "test-schema-123"}

        response = await client.post(
            "/api/extractions", json=extraction_data, headers=auth_headers
        )

        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_create_extraction_without_auth(
        self, client: AsyncClient, sample_extraction_request: dict
    ):
        """Test extraction creation fails without auth."""
        response = await client.post("/api/extractions", json=sample_extraction_request)

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_create_extraction_invalid_schema_id(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test extraction with non-existent schema."""
        extraction_data = {
            "schema_id": "nonexistent-schema-999",
            "document_id": "test-doc-123",
        }

        response = await client.post(
            "/api/extractions", json=extraction_data, headers=auth_headers
        )

        # Should fail or accept but mark as failed
        assert response.status_code in [201, 400, 404]


@pytest.mark.integration
class TestExtractionFromDB:
    """Test creating extractions from database."""

    @pytest.mark.anyio
    async def test_create_extraction_db(self, client: AsyncClient, auth_headers: dict):
        """Test creating extraction from DB."""
        extraction_data = {
            "schema_id": "test-schema-123",
            "document_id": "test-doc-456",
            "config": {"mode": "auto"},
        }

        response = await client.post(
            "/api/extractions/db", json=extraction_data, headers=auth_headers
        )

        assert response.status_code == 201

    @pytest.mark.anyio
    async def test_create_extraction_db_with_collection(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test extraction with collection ID."""
        extraction_data = {
            "schema_id": "test-schema-123",
            "collection_id": "test-collection-789",
        }

        response = await client.post(
            "/api/extractions/db", json=extraction_data, headers=auth_headers
        )

        assert response.status_code in [201, 400, 404]


@pytest.mark.integration
class TestBulkExtraction:
    """Test bulk extraction operations."""

    @pytest.mark.anyio
    async def test_create_bulk_extraction(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_bulk_extraction_request: dict,
    ):
        """Test creating bulk extraction job."""
        response = await client.post(
            "/api/extractions/bulk",
            json=sample_bulk_extraction_request,
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert "job_id" in data or "bulk_job_id" in data
        assert "total_documents" in data or "count" in data

    @pytest.mark.anyio
    async def test_bulk_extraction_multiple_documents(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test bulk extraction with multiple documents."""
        bulk_data = {
            "schema_id": "test-schema-123",
            "document_ids": [f"doc-{i}" for i in range(10)],
            "config": {"mode": "batch"},
        }

        response = await client.post(
            "/api/extractions/bulk", json=bulk_data, headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()

        if "total_documents" in data:
            assert data["total_documents"] == 10

    @pytest.mark.anyio
    async def test_bulk_extraction_with_collection(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test bulk extraction from collection."""
        bulk_data = {
            "schema_id": "test-schema-123",
            "collection_id": "test-collection-456",
        }

        response = await client.post(
            "/api/extractions/bulk", json=bulk_data, headers=auth_headers
        )

        assert response.status_code in [201, 404]

    @pytest.mark.anyio
    async def test_bulk_extraction_empty_documents(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test bulk extraction with empty document list."""
        bulk_data = {"schema_id": "test-schema-123", "document_ids": []}

        response = await client.post(
            "/api/extractions/bulk", json=bulk_data, headers=auth_headers
        )

        assert response.status_code in [400, 422]

    @pytest.mark.anyio
    async def test_bulk_extraction_parallel_config(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test bulk extraction with parallel processing."""
        bulk_data = {
            "schema_id": "test-schema-123",
            "document_ids": [f"doc-{i}" for i in range(5)],
            "config": {"parallel": True, "max_workers": 3},
        }

        response = await client.post(
            "/api/extractions/bulk", json=bulk_data, headers=auth_headers
        )

        assert response.status_code == 201


@pytest.mark.integration
class TestExtractionRetrieval:
    """Test retrieving extraction jobs."""

    @pytest.mark.anyio
    async def test_get_extraction_job(self, client: AsyncClient, auth_headers: dict):
        """Test retrieving an extraction job."""
        # Create extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = (
            create_response.json()["id"]
            if "id" in create_response.json()
            else create_response.json()["job_id"]
        )

        # Get it
        response = await client.get(f"/api/extractions/{job_id}", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "status" in data

    @pytest.mark.anyio
    async def test_get_nonexistent_extraction(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test retrieving non-existent extraction."""
        response = await client.get(
            "/api/extractions/nonexistent-job-999", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_get_extraction_with_results(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test extraction includes results when complete."""
        # Create extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = (
            create_response.json()["id"]
            if "id" in create_response.json()
            else create_response.json()["job_id"]
        )

        # Get it
        response = await client.get(f"/api/extractions/{job_id}", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()

        # Check for results if completed
        if data.get("status") == "completed":
            assert "results" in data or "extracted_data" in data

    @pytest.mark.anyio
    async def test_get_extraction_without_auth(
        self, client: AsyncClient, mock_extraction_id: str
    ):
        """Test retrieval fails without auth."""
        response = await client.get(f"/api/extractions/{mock_extraction_id}")

        assert response.status_code in [401, 403]


@pytest.mark.integration
class TestExtractionListing:
    """Test listing extraction jobs."""

    @pytest.mark.anyio
    async def test_list_extraction_jobs(self, client: AsyncClient, auth_headers: dict):
        """Test listing all extraction jobs."""
        # Create a few extractions
        for i in range(3):
            await client.post(
                "/api/extractions",
                json={"schema_id": "test-schema-123", "document_id": f"doc-{i}"},
                headers=auth_headers,
            )

        # List them
        response = await client.get("/api/extractions", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "items" in data

    @pytest.mark.anyio
    async def test_list_extractions_pagination(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing with pagination."""
        response = await client.get(
            "/api/extractions",
            params={"page": 1, "page_size": 10},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_list_extractions_by_schema(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test filtering extractions by schema."""
        response = await client.get(
            "/api/extractions",
            params={"schema_id": "test-schema-123"},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_list_extractions_by_status(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test filtering extractions by status."""
        response = await client.get(
            "/api/extractions", params={"status": "completed"}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_list_extractions_without_auth(self, client: AsyncClient):
        """Test listing fails without auth."""
        response = await client.get("/api/extractions")

        assert response.status_code in [401, 403]


@pytest.mark.integration
class TestExtractionDeletion:
    """Test deleting/canceling extraction jobs."""

    @pytest.mark.anyio
    async def test_delete_extraction_job(self, client: AsyncClient, auth_headers: dict):
        """Test deleting an extraction job."""
        # Create extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = (
            create_response.json()["id"]
            if "id" in create_response.json()
            else create_response.json()["job_id"]
        )

        # Delete it
        response = await client.delete(
            f"/api/extractions/{job_id}", headers=auth_headers
        )

        assert response.status_code in [200, 204]

    @pytest.mark.anyio
    async def test_cancel_running_extraction(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test canceling a running extraction."""
        # Create extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = (
            create_response.json()["id"]
            if "id" in create_response.json()
            else create_response.json()["job_id"]
        )

        # Cancel it
        response = await client.delete(
            f"/api/extractions/{job_id}", headers=auth_headers
        )

        assert response.status_code in [200, 204]

        # Verify status changed
        get_response = await client.get(
            f"/api/extractions/{job_id}", headers=auth_headers
        )

        if get_response.status_code == 200:
            data = get_response.json()
            assert data["status"] in ["cancelled", "canceled", "deleted"]

    @pytest.mark.anyio
    async def test_delete_nonexistent_extraction(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting non-existent extraction."""
        response = await client.delete(
            "/api/extractions/nonexistent-job-999", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_delete_extraction_without_auth(
        self, client: AsyncClient, mock_extraction_id: str
    ):
        """Test deletion fails without auth."""
        response = await client.delete(f"/api/extractions/{mock_extraction_id}")

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_delete_completed_extraction(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting completed extraction."""
        # Create and potentially complete extraction
        create_response = await client.post(
            "/api/extractions",
            json={"schema_id": "test-schema-123", "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        job_id = (
            create_response.json()["id"]
            if "id" in create_response.json()
            else create_response.json()["job_id"]
        )

        # Delete it
        response = await client.delete(
            f"/api/extractions/{job_id}", headers=auth_headers
        )

        # Should succeed regardless of status
        assert response.status_code in [200, 204]
