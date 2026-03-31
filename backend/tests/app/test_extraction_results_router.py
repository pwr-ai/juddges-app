"""Unit tests for app.extraction_domain.results_router module.

Tests cover: export endpoint (format validation, authorization, data flow),
base schema extraction, filter, facets, definition, and filter-options endpoints.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

# =============================================================================
# GET /extractions/{job_id}/export
# =============================================================================


class TestExportExtractionResults:
    @pytest.mark.unit
    async def test_invalid_format_returns_400(self, client, valid_api_headers) -> None:
        response = await client.get(
            "/extractions/job-1/export?format=pdf",
            headers={**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000001"},
        )
        assert response.status_code == 400

    @pytest.mark.unit
    async def test_supabase_unavailable_returns_503(
        self, client, valid_api_headers
    ) -> None:
        with patch("app.extraction_domain.results_router.supabase", None):
            response = await client.get(
                "/extractions/job-1/export?format=csv",
                headers={**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000001"},
            )
            assert response.status_code == 503

    @pytest.mark.unit
    async def test_job_not_found_returns_404(self, client, valid_api_headers) -> None:
        mock_response = MagicMock()
        mock_response.data = None

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions/job-missing/export?format=csv",
                headers={**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000001"},
            )
            assert response.status_code == 404

    @pytest.mark.unit
    async def test_access_denied_returns_403(self, client, valid_api_headers) -> None:
        mock_response = MagicMock()
        mock_response.data = {
            "job_id": "job-1",
            "user_id": "other-user",
            "collection_id": "col-1",
            "schema_id": None,
            "results": [{"status": "completed", "extracted_data": {"f": "v"}}],
            "status": "SUCCESS",
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions/job-1/export?format=csv",
                headers={**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000099"},
            )
            assert response.status_code == 403

    @pytest.mark.unit
    async def test_no_results_returns_400(self, client, valid_api_headers) -> None:
        mock_response = MagicMock()
        mock_response.data = {
            "job_id": "job-1",
            "user_id": "00000000-0000-4000-a000-000000000001",
            "collection_id": "col-1",
            "schema_id": None,
            "results": [],
            "status": "SUCCESS",
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions/job-1/export?format=csv",
                headers={**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000001"},
            )
            assert response.status_code == 400

    @pytest.mark.unit
    async def test_export_csv_success(self, client, valid_api_headers) -> None:
        """Test successful CSV export with completed results."""
        mock_job_response = MagicMock()
        mock_job_response.data = {
            "job_id": "job-1",
            "user_id": "00000000-0000-4000-a000-000000000001",
            "collection_id": "col-1",
            "schema_id": "schema-1",
            "results": [
                {
                    "document_id": "doc-1",
                    "status": "completed",
                    "completed_at": "2025-01-01",
                    "extracted_data": {"field_a": "value_a", "field_b": "value_b"},
                },
            ],
            "status": "SUCCESS",
        }

        mock_col_response = MagicMock()
        mock_col_response.data = {"name": "TestCollection"}

        mock_schema_response = MagicMock()
        mock_schema_response.data = {"name": "TestSchema"}

        mock_supabase = MagicMock()
        # First call for job data
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = [
            mock_job_response,
            mock_col_response,
            mock_schema_response,
        ]

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions/job-1/export?format=csv",
                headers={**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000001"},
            )
            assert response.status_code == 200
            assert "text/csv" in response.headers["content-type"]
            assert "attachment" in response.headers.get("content-disposition", "")


# =============================================================================
# POST /extractions/base-schema/filter
# =============================================================================


class TestFilterByExtractedData:
    @pytest.mark.unit
    async def test_supabase_unavailable(self, client, valid_api_headers) -> None:
        with patch("app.extraction_domain.results_router.supabase", None):
            response = await client.post(
                "/extractions/base-schema/filter",
                json={"filters": {}, "limit": 10, "offset": 0},
                headers=valid_api_headers,
            )
            assert response.status_code == 503

    @pytest.mark.unit
    async def test_filter_success(self, client, valid_api_headers) -> None:
        mock_response = MagicMock()
        mock_response.data = [
            {"id": "doc-1", "total_count": 1, "extracted_data": {}},
        ]

        mock_supabase = MagicMock()
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.post(
                "/extractions/base-schema/filter",
                json={"filters": {}, "limit": 10, "offset": 0},
                headers=valid_api_headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert "documents" in data
            assert data["total_count"] == 1

    @pytest.mark.unit
    async def test_filter_empty_results(self, client, valid_api_headers) -> None:
        mock_response = MagicMock()
        mock_response.data = None

        mock_supabase = MagicMock()
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.post(
                "/extractions/base-schema/filter",
                json={"filters": {}, "limit": 10, "offset": 0},
                headers=valid_api_headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["documents"] == []
            assert data["total_count"] == 0


# =============================================================================
# GET /extractions/base-schema/facets/{field}
# =============================================================================


class TestGetFacetCounts:
    @pytest.mark.unit
    async def test_supabase_unavailable(self, client, valid_api_headers) -> None:
        with patch("app.extraction_domain.results_router.supabase", None):
            response = await client.get(
                "/extractions/base-schema/facets/appellant",
                headers=valid_api_headers,
            )
            assert response.status_code == 503

    @pytest.mark.unit
    async def test_facet_counts_success(self, client, valid_api_headers) -> None:
        mock_response = MagicMock()
        mock_response.data = [
            {"value": "defendant", "count": 10},
            {"value": "plaintiff", "count": 5},
        ]

        mock_supabase = MagicMock()
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions/base-schema/facets/appellant",
                headers=valid_api_headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["field"] == "appellant"
            assert len(data["counts"]) == 2
            assert data["total"] == 15

    @pytest.mark.unit
    async def test_facet_counts_filters_null_values(
        self, client, valid_api_headers
    ) -> None:
        """Null/empty values should be filtered out."""
        mock_response = MagicMock()
        mock_response.data = [
            {"value": "defendant", "count": 10},
            {"value": None, "count": 3},
            {"value": "", "count": 2},
        ]

        mock_supabase = MagicMock()
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions/base-schema/facets/appellant",
                headers=valid_api_headers,
            )
            assert response.status_code == 200
            data = response.json()
            # Only "defendant" should remain (None and "" filtered out)
            assert len(data["counts"]) == 1


# =============================================================================
# GET /extractions/base-schema/definition
# =============================================================================


class TestGetBaseSchemaDefinition:
    @pytest.mark.unit
    async def test_definition_success(self, client, valid_api_headers) -> None:
        with patch(
            "app.extraction_domain.results_router.BaseSchemaExtractor"
        ) as mock_extractor_cls:
            mock_instance = MagicMock()
            mock_instance.get_schema_variant.side_effect = [
                {"title": "English Schema", "fields": {}},
                {"title": "Polish Schema", "fields": {}},
            ]
            mock_extractor_cls.return_value = mock_instance

            response = await client.get(
                "/extractions/base-schema/definition",
                headers=valid_api_headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["schema_key"] == "universal_legal_document_base_schema"
            assert "en" in data["available_locales"]
            assert "pl" in data["available_locales"]
            assert "en" in data["schemas"]
            assert "pl" in data["schemas"]


# =============================================================================
# GET /extractions/base-schema/filter-options
# =============================================================================


class TestGetFilterOptions:
    @pytest.mark.unit
    async def test_filter_options_success(self, client, valid_api_headers) -> None:
        with patch(
            "app.extraction_domain.results_router.BaseSchemaExtractor"
        ) as mock_extractor_cls:
            mock_instance = MagicMock()
            mock_instance.get_filter_config.return_value = [
                {
                    "field": "appellant",
                    "type": "string",
                    "filter_type": "facet",
                    "label": "Appellant",
                    "order": 1,
                    "description": "The appellant party",
                    "enum_values": ["defendant", "plaintiff"],
                },
            ]
            mock_extractor_cls.return_value = mock_instance

            response = await client.get(
                "/extractions/base-schema/filter-options",
                headers=valid_api_headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data["fields"]) == 1
            assert data["fields"][0]["field"] == "appellant"
