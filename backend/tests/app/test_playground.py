"""
Unit tests for app.playground module.

Tests cover:
- Pydantic model validation
- _fetch_schema_with_version helper
- _save_playground_run helper
"""

from unittest.mock import MagicMock, patch

import pytest

from app.playground import (
    PlaygroundExtractionRequest,
    PlaygroundExtractionResponse,
    PlaygroundTestRun,
    PlaygroundTiming,
    _fetch_schema_with_version,
    _save_playground_run,
)

# ===== Model Validation Tests =====


@pytest.mark.unit
class TestPlaygroundExtractionRequestModel:
    """Test PlaygroundExtractionRequest model."""

    def test_valid_request(self):
        req = PlaygroundExtractionRequest(
            schema_id="schema-uuid-1",
            document_id="doc-1",
        )
        assert req.schema_id == "schema-uuid-1"
        assert req.schema_version_id is None
        assert (
            req.extraction_context
            == "Extract structured information from the legal document."
        )
        assert req.language == "pl"

    def test_custom_language(self):
        req = PlaygroundExtractionRequest(
            schema_id="s1",
            document_id="d1",
            language="en",
        )
        assert req.language == "en"

    def test_with_all_fields(self):
        req = PlaygroundExtractionRequest(
            schema_id="s1",
            schema_version_id="sv1",
            document_id="d1",
            extraction_context="Custom context",
            additional_instructions="Be thorough",
            language="en",
        )
        assert req.additional_instructions == "Be thorough"


@pytest.mark.unit
class TestPlaygroundTimingModel:
    """Test PlaygroundTiming model."""

    def test_valid_timing(self):
        timing = PlaygroundTiming(
            total_ms=1500.5,
            document_fetch_ms=200.1,
            extraction_ms=1200.4,
            started_at="2024-01-01T00:00:00Z",
            completed_at="2024-01-01T00:00:01Z",
        )
        assert timing.total_ms == 1500.5
        assert timing.extraction_ms == 1200.4


@pytest.mark.unit
class TestPlaygroundExtractionResponseModel:
    """Test PlaygroundExtractionResponse model."""

    def test_success_response(self):
        resp = PlaygroundExtractionResponse(
            document_id="doc-1",
            schema_id="s1",
            schema_version=1,
            schema_version_id=None,
            status="success",
            extracted_data={"field": "value"},
            timing=PlaygroundTiming(
                total_ms=100,
                document_fetch_ms=10,
                extraction_ms=90,
                started_at="t1",
                completed_at="t2",
            ),
            schema_name="TestSchema",
            field_count=5,
        )
        assert resp.status == "success"
        assert resp.error_message is None

    def test_failed_response(self):
        resp = PlaygroundExtractionResponse(
            document_id="doc-1",
            schema_id="s1",
            schema_version=1,
            schema_version_id=None,
            status="failed",
            error_message="Something went wrong",
            timing=PlaygroundTiming(
                total_ms=50,
                document_fetch_ms=10,
                extraction_ms=0,
                started_at="t1",
                completed_at="t2",
            ),
            schema_name="TestSchema",
            field_count=0,
        )
        assert resp.status == "failed"
        assert resp.extracted_data is None


@pytest.mark.unit
class TestPlaygroundTestRunModel:
    """Test PlaygroundTestRun model."""

    def test_valid_run(self):
        run = PlaygroundTestRun(
            id="run-1",
            schema_id="s1",
            schema_version_id="sv1",
            document_id="doc-1",
            status="completed",
            execution_time_ms=500,
            created_at="2024-01-01T00:00:00Z",
        )
        assert run.execution_time_ms == 500

    def test_without_version_id(self):
        run = PlaygroundTestRun(
            id="run-2",
            schema_id="s1",
            schema_version_id=None,
            document_id="doc-1",
            status="failed",
            execution_time_ms=100,
            created_at="2024-01-01T00:00:00Z",
        )
        assert run.schema_version_id is None


# ===== _fetch_schema_with_version Tests =====


@pytest.mark.unit
class TestFetchSchemaWithVersion:
    """Test _fetch_schema_with_version helper."""

    @patch("app.playground.supabase", None)
    def test_no_supabase_raises_503(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            _fetch_schema_with_version("schema-1")
        assert exc_info.value.status_code == 503

    @patch("app.playground.supabase")
    def test_schema_not_found_raises_404(self, mock_supabase):
        mock_resp = MagicMock()
        mock_resp.data = None
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_resp

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            _fetch_schema_with_version("nonexistent-schema")
        assert exc_info.value.status_code == 404

    @patch("app.playground.supabase")
    def test_current_schema_returned(self, mock_supabase):
        mock_resp = MagicMock()
        mock_resp.data = {
            "name": "TestSchema",
            "description": "A test schema",
            "text": {"field1": "string"},
            "schema_version": 3,
        }
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_resp

        schema_dict, version_number, version_id = _fetch_schema_with_version("schema-1")
        assert schema_dict["name"] == "TestSchema"
        assert version_number == 3
        assert version_id is None

    @patch("app.playground.supabase")
    def test_specific_version_returned(self, mock_supabase):
        # Mock version query
        version_resp = MagicMock()
        version_resp.data = {
            "id": "ver-1",
            "schema_id": "schema-1",
            "version_number": 2,
            "schema_snapshot": {"field1": "int"},
            "field_snapshot": [],
        }

        # Mock schema name query
        schema_resp = MagicMock()
        schema_resp.data = {"name": "TestSchema", "description": "desc"}

        # Configure mock to return different responses for different table calls
        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "schema_versions":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = version_resp
            elif table_name == "extraction_schemas":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = schema_resp
            return mock_table

        mock_supabase.table.side_effect = table_side_effect

        schema_dict, version_number, version_id = _fetch_schema_with_version(
            "schema-1", "ver-1"
        )
        assert schema_dict["name"] == "TestSchema"
        assert version_number == 2
        assert version_id == "ver-1"

    @patch("app.playground.supabase")
    def test_version_not_found_raises_404(self, mock_supabase):
        version_resp = MagicMock()
        version_resp.data = None

        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = version_resp

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            _fetch_schema_with_version("schema-1", "nonexistent-version")
        assert exc_info.value.status_code == 404


# ===== _save_playground_run Tests =====


@pytest.mark.unit
class TestSavePlaygroundRun:
    """Test _save_playground_run helper."""

    @patch("app.playground.supabase", None)
    def test_no_supabase_returns_none(self):
        result = _save_playground_run(
            schema_id="s1",
            schema_version_id=None,
            document_id="d1",
            user_id="u1",
            extraction_result={},
            execution_time_ms=100,
            status="completed",
        )
        assert result is None

    @patch("app.playground.supabase")
    def test_successful_save(self, mock_supabase):
        mock_resp = MagicMock()
        mock_resp.data = [{"id": "run-123"}]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = (
            mock_resp
        )

        result = _save_playground_run(
            schema_id="s1",
            schema_version_id="sv1",
            document_id="d1",
            user_id="u1",
            extraction_result={"key": "value"},
            execution_time_ms=500,
            status="completed",
        )
        assert result == "run-123"

    @patch("app.playground.supabase")
    def test_empty_response_returns_none(self, mock_supabase):
        mock_resp = MagicMock()
        mock_resp.data = []
        mock_supabase.table.return_value.insert.return_value.execute.return_value = (
            mock_resp
        )

        result = _save_playground_run(
            schema_id="s1",
            schema_version_id=None,
            document_id="d1",
            user_id="u1",
            extraction_result={},
            execution_time_ms=100,
            status="failed",
        )
        assert result is None

    @patch("app.playground.supabase")
    def test_exception_returns_none(self, mock_supabase):
        mock_supabase.table.side_effect = Exception("DB error")

        result = _save_playground_run(
            schema_id="s1",
            schema_version_id=None,
            document_id="d1",
            user_id="u1",
            extraction_result={},
            execution_time_ms=100,
            status="failed",
        )
        assert result is None

    @patch("app.playground.supabase")
    def test_none_extraction_result_defaults_to_empty_dict(self, mock_supabase):
        """When extraction_result is None, should use empty dict."""
        mock_resp = MagicMock()
        mock_resp.data = [{"id": "run-1"}]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = (
            mock_resp
        )

        _save_playground_run(
            schema_id="s1",
            schema_version_id=None,
            document_id="d1",
            user_id="u1",
            extraction_result=None,
            execution_time_ms=100,
            status="failed",
        )

        # Verify the inserted data uses empty dict
        call_args = mock_supabase.table.return_value.insert.call_args
        inserted_data = call_args[0][0]
        assert inserted_data["extraction_result"] == {}
