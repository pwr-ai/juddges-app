"""
Comprehensive end-to-end workflow tests for Schema & Extraction system.

Tests complete workflows:
- Create schema → Test → Extract → Export
- AI generation → Refinement → Test → Extract
- Bulk extraction workflow
- Schema versioning with extractions
- Error handling and recovery
"""

import pytest
from httpx import AsyncClient
import asyncio
import os


RUN_AI_TESTS = os.getenv("RUN_AI_TESTS", "").lower() in {"1", "true", "yes"}


@pytest.mark.integration
class TestCompleteSchemaWorkflow:
    """Test complete schema creation and usage workflow."""

    @pytest.mark.anyio
    async def test_schema_to_extraction_workflow(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_schema_data: dict,
        sample_document_text: str,
    ):
        """Test: Create schema → Test → Extract → Export."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        assert schema_response.status_code == 201
        schema_id = schema_response.json()["id"]

        # 2. Validate schema
        compile_response = await client.post(
            "/api/schemas/compile",
            json={"fields": sample_schema_data["fields"]},
            headers=auth_headers,
        )
        assert compile_response.status_code == 200

        # 3. Create extraction job
        extraction_response = await client.post(
            "/api/extractions",
            json={
                "schema_id": schema_id,
                "document_id": "test-doc-123",
                "config": {"mode": "auto"},
            },
            headers=auth_headers,
        )
        assert extraction_response.status_code == 201
        job_id = extraction_response.json().get("id") or extraction_response.json().get(
            "job_id"
        )

        # 4. Check extraction status
        status_response = await client.get(
            f"/api/extractions/{job_id}", headers=auth_headers
        )
        assert status_response.status_code == 200
        assert status_response.json()["status"] in [
            "pending",
            "processing",
            "completed",
            "failed",
        ]

        # 5. Export results
        export_response = await client.get(
            f"/api/extractions/{job_id}/export",
            params={"format": "json"},
            headers=auth_headers,
        )
        assert export_response.status_code in [200, 202]

    @pytest.mark.anyio
    async def test_schema_update_workflow(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test: Create → Update → Version history → Extract with updated."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Update schema
        update_response = await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Updated schema"},
            headers=auth_headers,
        )
        assert update_response.status_code == 200

        # 3. Check version history
        versions_response = await client.get(
            f"/api/schemas/db/{schema_id}/versions", headers=auth_headers
        )
        assert versions_response.status_code == 200
        versions = versions_response.json()
        assert len(versions) >= 2

        # 4. Extract with updated schema
        extraction_response = await client.post(
            "/api/extractions",
            json={"schema_id": schema_id, "document_id": "test-doc-456"},
            headers=auth_headers,
        )
        assert extraction_response.status_code == 201


@pytest.mark.integration
@pytest.mark.skipif(
    not RUN_AI_TESTS,
    reason="AI tests require RUN_AI_TESTS=1",
)
class TestAIGenerationWorkflow:
    """Test AI-powered schema generation workflows."""

    @pytest.mark.anyio
    async def test_ai_generation_to_extraction(
        self, client: AsyncClient, auth_headers: dict, sample_document_text: str
    ):
        """Test: AI generate → Refine → Test → Extract."""
        # 1. Start AI generation
        gen_response = await client.post(
            "/api/schemas/generate",
            json={
                "description": "Extract party names and dates from contracts",
                "sample_documents": [sample_document_text],
            },
            headers=auth_headers,
        )
        assert gen_response.status_code == 201
        session_id = gen_response.json()["session_id"]
        gen_response.json().get("schema")

        # 2. Refine schema
        refine_response = await client.post(
            f"/api/schemas/generate/{session_id}/refine",
            json={"refinement": "Also extract monetary amounts"},
            headers=auth_headers,
        )
        assert refine_response.status_code == 200

        # 3. Get final schema
        final_response = await client.get(
            f"/api/schemas/generate/{session_id}", headers=auth_headers
        )
        assert final_response.status_code == 200
        final_schema = final_response.json()["schema"]

        # 4. Create persistent schema
        schema_response = await client.post(
            "/api/schemas", json=final_schema, headers=auth_headers
        )
        assert schema_response.status_code == 201
        schema_id = schema_response.json()["id"]

        # 5. Use for extraction
        extraction_response = await client.post(
            "/api/extractions",
            json={"schema_id": schema_id, "document_id": "test-doc-789"},
            headers=auth_headers,
        )
        assert extraction_response.status_code == 201

    @pytest.mark.anyio
    async def test_simple_ai_generation_workflow(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test: Simple AI generation → Create schema → Extract."""
        # 1. Simple generation
        gen_response = await client.post(
            "/api/schema-generator/simple",
            json={"description": "Extract contract parties and dates"},
            headers=auth_headers,
        )
        assert gen_response.status_code == 200
        generated_schema = gen_response.json()["schema"]

        # 2. Create persistent schema
        schema_response = await client.post(
            "/api/schemas", json=generated_schema, headers=auth_headers
        )
        assert schema_response.status_code == 201

        # 3. Extract
        extraction_response = await client.post(
            "/api/extractions",
            json={
                "schema_id": schema_response.json()["id"],
                "document_id": "test-doc-123",
            },
            headers=auth_headers,
        )
        assert extraction_response.status_code == 201


@pytest.mark.integration
class TestBulkExtractionWorkflow:
    """Test bulk extraction workflows."""

    @pytest.mark.anyio
    async def test_bulk_extraction_complete_workflow(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test: Create schema → Bulk extract → Monitor → Export all."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Create bulk extraction
        bulk_response = await client.post(
            "/api/extractions/bulk",
            json={
                "schema_id": schema_id,
                "document_ids": [f"doc-{i}" for i in range(10)],
                "config": {"mode": "batch", "parallel": True},
            },
            headers=auth_headers,
        )
        assert bulk_response.status_code == 201
        bulk_job_id = bulk_response.json().get("job_id") or bulk_response.json().get(
            "id"
        )

        # 3. Monitor status
        status_response = await client.get(
            f"/api/extractions/{bulk_job_id}", headers=auth_headers
        )
        assert status_response.status_code == 200

        # 4. List all extractions for this schema
        list_response = await client.get(
            "/api/extractions", params={"schema_id": schema_id}, headers=auth_headers
        )
        assert list_response.status_code == 200

    @pytest.mark.anyio
    async def test_bulk_with_filtering_workflow(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test: Bulk extract → Filter results → Export filtered."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Bulk extraction
        bulk_response = await client.post(
            "/api/extractions/bulk",
            json={
                "schema_id": schema_id,
                "document_ids": [f"doc-{i}" for i in range(5)],
            },
            headers=auth_headers,
        )
        assert bulk_response.status_code == 201

        # 3. Filter results
        filter_response = await client.post(
            "/api/extractions/base-schema/filter",
            json={
                "filters": {"date_range": {"start": "2024-01-01", "end": "2024-12-31"}}
            },
            headers=auth_headers,
        )
        assert filter_response.status_code == 200


@pytest.mark.integration
class TestSchemaVersioningWorkflow:
    """Test schema versioning workflows."""

    @pytest.mark.anyio
    async def test_versioning_with_extractions(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test: Create → Extract → Update schema → Extract again → Compare."""
        # 1. Create schema v1
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Extract with v1
        extraction_v1 = await client.post(
            "/api/extractions",
            json={"schema_id": schema_id, "document_id": "test-doc-v1"},
            headers=auth_headers,
        )
        assert extraction_v1.status_code == 201

        # 3. Update schema (v2)
        update_response = await client.put(
            f"/api/schemas/{schema_id}",
            json={
                "fields": sample_schema_data["fields"]
                + [{"name": "new_field", "type": "string", "required": False}]
            },
            headers=auth_headers,
        )
        assert update_response.status_code == 200

        # 4. Extract with v2
        extraction_v2 = await client.post(
            "/api/extractions",
            json={"schema_id": schema_id, "document_id": "test-doc-v2"},
            headers=auth_headers,
        )
        assert extraction_v2.status_code == 201

        # 5. Compare versions
        compare_response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/compare",
            params={"from_version": 1, "to_version": 2},
            headers=auth_headers,
        )
        assert compare_response.status_code == 200

    @pytest.mark.anyio
    async def test_rollback_workflow(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test: Create → Update → Rollback → Extract with old version."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Update (creates v2)
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Bad update"},
            headers=auth_headers,
        )

        # 3. Rollback to v1
        rollback_response = await client.post(
            f"/api/schemas/db/{schema_id}/versions/1/rollback", headers=auth_headers
        )
        assert rollback_response.status_code in [200, 201]

        # 4. Extract with rolled-back schema
        extraction_response = await client.post(
            "/api/extractions",
            json={"schema_id": schema_id, "document_id": "test-doc-rollback"},
            headers=auth_headers,
        )
        assert extraction_response.status_code == 201


@pytest.mark.integration
class TestErrorHandlingWorkflow:
    """Test error handling and recovery workflows."""

    @pytest.mark.anyio
    async def test_invalid_schema_extraction_workflow(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test handling extraction with invalid schema."""
        # 1. Try extraction with non-existent schema
        extraction_response = await client.post(
            "/api/extractions",
            json={"schema_id": "nonexistent-schema-999", "document_id": "test-doc-123"},
            headers=auth_headers,
        )

        # Should handle gracefully
        assert extraction_response.status_code in [201, 400, 404]

        if extraction_response.status_code == 201:
            job_id = extraction_response.json().get(
                "id"
            ) or extraction_response.json().get("job_id")

            # Check status shows error
            status_response = await client.get(
                f"/api/extractions/{job_id}", headers=auth_headers
            )
            if status_response.status_code == 200:
                assert status_response.json()["status"] in ["failed", "error"]

    @pytest.mark.anyio
    async def test_extraction_retry_workflow(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test: Failed extraction → Retry."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Create extraction (may fail)
        extraction_response = await client.post(
            "/api/extractions",
            json={"schema_id": schema_id, "document_id": "potentially-failing-doc"},
            headers=auth_headers,
        )
        job_id = extraction_response.json().get("id") or extraction_response.json().get(
            "job_id"
        )

        # 3. If failed, delete and retry
        status = await client.get(f"/api/extractions/{job_id}", headers=auth_headers)

        if status.json().get("status") == "failed":
            # Delete failed job
            await client.delete(f"/api/extractions/{job_id}", headers=auth_headers)

            # Retry
            retry_response = await client.post(
                "/api/extractions",
                json={"schema_id": schema_id, "document_id": "potentially-failing-doc"},
                headers=auth_headers,
            )
            assert retry_response.status_code == 201

    @pytest.mark.anyio
    async def test_concurrent_schema_updates_workflow(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test handling concurrent schema updates."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Concurrent updates
        update_tasks = [
            client.put(
                f"/api/schemas/{schema_id}",
                json={"description": f"Update {i}"},
                headers=auth_headers,
            )
            for i in range(3)
        ]

        results = await asyncio.gather(*update_tasks, return_exceptions=True)

        # At least some should succeed
        success_count = sum(
            1 for r in results if not isinstance(r, Exception) and r.status_code == 200
        )
        assert success_count > 0

        # 3. Check version history is consistent
        versions_response = await client.get(
            f"/api/schemas/db/{schema_id}/versions", headers=auth_headers
        )
        assert versions_response.status_code == 200


@pytest.mark.integration
class TestCompleteDataPipeline:
    """Test complete data pipeline from generation to export."""

    @pytest.mark.anyio
    async def test_full_pipeline(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test: Schema → Multiple extractions → Filter → Facets → Export."""
        # 1. Create schema
        schema_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = schema_response.json()["id"]

        # 2. Create multiple extractions
        extraction_ids = []
        for i in range(5):
            extraction_response = await client.post(
                "/api/extractions",
                json={"schema_id": schema_id, "document_id": f"doc-{i}"},
                headers=auth_headers,
            )
            if extraction_response.status_code == 201:
                job_id = extraction_response.json().get(
                    "id"
                ) or extraction_response.json().get("job_id")
                extraction_ids.append(job_id)

        assert len(extraction_ids) >= 1

        # 3. Get facets
        facets_response = await client.get(
            "/api/extractions/base-schema/facets", headers=auth_headers
        )
        assert facets_response.status_code == 200

        # 4. Filter results
        filter_response = await client.post(
            "/api/extractions/base-schema/filter",
            json={"filters": {}},
            headers=auth_headers,
        )
        assert filter_response.status_code == 200

        # 5. Export one extraction
        if extraction_ids:
            export_response = await client.get(
                f"/api/extractions/{extraction_ids[0]}/export",
                params={"format": "json"},
                headers=auth_headers,
            )
            assert export_response.status_code in [200, 202]
