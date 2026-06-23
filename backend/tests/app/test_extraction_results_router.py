"""Unit tests for app.extraction_domain.results_router module.

Tests cover: export endpoint (format validation, authorization, data flow),
base schema extraction, filter, facets, definition, and filter-options endpoints.

Auth note: results_router was migrated from X-User-ID header auth to Supabase
Bearer JWT (issue #233). Endpoint tests that require user identity install the
JWT override via _install_jwt_user_override() from conftest and send
``Authorization: Bearer <token>`` instead of ``X-User-ID``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.extraction_domain.nl_filter_generator import BaseSchemaFilter
from tests.app.conftest import _install_jwt_user_override

_USER_001 = "00000000-0000-4000-a000-000000000001"
_USER_099 = "00000000-0000-4000-a000-000000000099"
_BEARER_HEADERS = {"Authorization": "Bearer fake-jwt-token"}


# =============================================================================
# GET /extractions/{job_id}/export
# =============================================================================


class TestExportExtractionResults:
    @pytest.mark.unit
    async def test_invalid_format_returns_400(self, client, valid_api_headers) -> None:
        _install_jwt_user_override(_USER_001)
        response = await client.get(
            "/extractions/job-1/export?format=pdf",
            headers={**valid_api_headers, **_BEARER_HEADERS},
        )
        assert response.status_code == 400

    @pytest.mark.unit
    async def test_supabase_unavailable_returns_503(
        self, client, valid_api_headers
    ) -> None:
        _install_jwt_user_override(_USER_001)
        with patch("app.extraction_domain.results_router.supabase", None):
            response = await client.get(
                "/extractions/job-1/export?format=csv",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 503

    @pytest.mark.unit
    async def test_job_not_found_returns_404(self, client, valid_api_headers) -> None:
        _install_jwt_user_override(_USER_001)
        mock_response = MagicMock()
        mock_response.data = None

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.results_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions/job-missing/export?format=csv",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 404

    @pytest.mark.unit
    async def test_access_denied_returns_403(self, client, valid_api_headers) -> None:
        """User 099 (attacker) tries to export a job that belongs to other-user.

        The attacker authenticates as _USER_099 via JWT; the job in the DB has
        a different user_id. The handler must deny access with 403.
        """
        _install_jwt_user_override(_USER_099)
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
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 403

    @pytest.mark.unit
    async def test_no_results_returns_400(self, client, valid_api_headers) -> None:
        _install_jwt_user_override(_USER_001)
        mock_response = MagicMock()
        mock_response.data = {
            "job_id": "job-1",
            "user_id": _USER_001,
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
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 400

    @pytest.mark.unit
    async def test_export_csv_success(self, client, valid_api_headers) -> None:
        """Test successful CSV export with completed results."""
        _install_jwt_user_override(_USER_001)
        mock_job_response = MagicMock()
        mock_job_response.data = {
            "job_id": "job-1",
            "user_id": _USER_001,
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
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            assert "text/csv" in response.headers["content-type"]
            assert "attachment" in response.headers.get("content-disposition", "")


# =============================================================================
# POST /extractions/base-schema  (auth gate added by issue #250 Part 3)
# =============================================================================


class TestBaseSchemaExtractionAuth:
    """Part 3 of issue #250: extract_with_base_schema must require Bearer JWT.

    The endpoint writes back to shared ``judgments`` rows, so caller identity
    must be established before any mutations occur.
    """

    @pytest.mark.unit
    async def test_unauthenticated_request_rejected(
        self, client, valid_api_headers
    ) -> None:
        """POST /extractions/base-schema without Bearer JWT must be rejected (401/403)."""
        # No JWT override installed → get_current_user raises 401
        response = await client.post(
            "/extractions/base-schema",
            json={"document_ids": ["doc-1"]},
            headers=valid_api_headers,
        )
        assert response.status_code in (401, 403), (
            f"Expected 401/403 for unauthenticated base-schema extraction, "
            f"got {response.status_code}. Bearer JWT is required on this write endpoint."
        )

    @pytest.mark.unit
    async def test_authenticated_request_reaches_handler(
        self, client, valid_api_headers
    ) -> None:
        """A Bearer-authenticated request passes the auth gate and reaches the handler."""
        _install_jwt_user_override(_USER_001)

        # Supabase unavailable → handler returns 503 after auth passes.
        with patch("app.extraction_domain.results_router.supabase", None):
            response = await client.post(
                "/extractions/base-schema",
                json={"document_ids": ["doc-1"]},
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )

        assert response.status_code not in (401, 403, 422), (
            f"Bearer auth path returned {response.status_code}; "
            f"expected the handler to be reached. Body: {response.text[:300]}"
        )


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


# =============================================================================
# POST /extractions/base-schema/nl-filter  (issue #141: opt-in NL -> filter)
# =============================================================================


class TestNlToFilter:
    @pytest.mark.unit
    async def test_requires_bearer_jwt(self, client, valid_api_headers) -> None:
        """Without a Bearer JWT the endpoint must be rejected."""
        response = await client.post(
            "/extractions/base-schema/nl-filter",
            headers=valid_api_headers,
            json={"query": "robbery cases involving a knife"},
        )
        assert response.status_code in (401, 403)

    @pytest.mark.unit
    async def test_success_returns_filters_and_text_query(
        self, client, valid_api_headers
    ) -> None:
        """Happy path: returns the same {filters, text_query} shape the filter
        endpoint accepts, and logs the request to search_analytics."""
        _install_jwt_user_override(_USER_001)

        translated = BaseSchemaFilter(
            co_def_acc_num={"min": 2},
            did_offender_confess=True,
        )

        with (
            patch(
                "app.extraction_domain.results_router.generate_base_schema_filter",
                new=AsyncMock(return_value=translated),
            ),
            patch(
                "app.extraction_domain.results_router.record_search_query"
            ) as mock_record,
        ):
            response = await client.post(
                "/extractions/base-schema/nl-filter",
                headers={**valid_api_headers, **_BEARER_HEADERS},
                json={"query": "at least 2 co-defendants where the offender confessed"},
            )

        assert response.status_code == 200
        data = response.json()
        assert set(data.keys()) == {"filters", "text_query"}
        assert data["filters"]["did_offender_confess"] is True
        assert data["filters"]["co_def_acc_num"] == {"min": 2}
        assert data["text_query"] is None
        # Telemetry: every request is logged to search_analytics.
        mock_record.assert_called_once()

    @pytest.mark.unit
    async def test_text_query_split_from_filters(
        self, client, valid_api_headers
    ) -> None:
        """Free-text questions populate text_query, not p_filters."""
        _install_jwt_user_override(_USER_001)

        translated = BaseSchemaFilter(text_query="robbery knife")

        with (
            patch(
                "app.extraction_domain.results_router.generate_base_schema_filter",
                new=AsyncMock(return_value=translated),
            ),
            patch("app.extraction_domain.results_router.record_search_query"),
        ):
            response = await client.post(
                "/extractions/base-schema/nl-filter",
                headers={**valid_api_headers, **_BEARER_HEADERS},
                json={"query": "robbery cases involving a knife"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["text_query"] == "robbery knife"
        assert data["filters"] == {}

    @pytest.mark.unit
    async def test_validation_error_returns_422(
        self, client, valid_api_headers
    ) -> None:
        """LLM hallucination of an unknown enum -> Pydantic ValidationError ->
        the endpoint surfaces 422 so the dialog can ask for simpler phrasing."""
        _install_jwt_user_override(_USER_001)

        def _raise_validation_error(*_args, **_kwargs):
            raise ValidationError.from_exception_data("BaseSchemaFilter", [])

        with patch(
            "app.extraction_domain.results_router.generate_base_schema_filter",
            new=AsyncMock(side_effect=_raise_validation_error),
        ):
            response = await client.post(
                "/extractions/base-schema/nl-filter",
                headers={**valid_api_headers, **_BEARER_HEADERS},
                json={"query": "something the model cannot map"},
            )

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "NL_FILTER_INVALID"
