"""Unit tests for app.extraction_domain.shared module.

Tests cover: pure utility functions, validation helpers, job status mapping,
schema conversion, prompt file management, and Supabase interaction helpers.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

if TYPE_CHECKING:
    from pathlib import Path

import pytest
from fastapi import HTTPException

from app.extraction_domain.shared import (
    _check_supabase_available,
    _convert_simplified_schema,
    _create_extraction_response,
    _fetch_schema_from_db,
    _submit_extraction_task,
    _summarize_result_status,
    _validate_collection_id,
    _validate_documents,
    _validate_schema_id_required,
    archive_prompt,
    create_backup,
    get_archived_metadata_path,
    get_archived_prompt_path,
    get_current_user,
    get_metadata_file_path,
    get_prompt_file_path,
    is_system_prompt,
    is_uuid,
    load_prompt_metadata,
    prompt_exists,
    save_prompt_metadata,
    simplify_job_status,
    update_job_status_in_supabase,
    validate_jinja2_template,
)
from app.models import DocumentProcessingStatus, PromptMetadata

# =============================================================================
# simplify_job_status
# =============================================================================


class TestSimplifyJobStatus:
    """Tests for the simplify_job_status function."""

    @pytest.mark.unit
    @pytest.mark.parametrize(
        "celery_state,expected",
        [
            ("PENDING", "IN_PROGRESS"),
            ("STARTED", "IN_PROGRESS"),
            ("PROCESSING", "IN_PROGRESS"),
            ("RETRY", "IN_PROGRESS"),
        ],
    )
    def test_in_progress_states(self, celery_state: str, expected: str) -> None:
        assert simplify_job_status(celery_state) == expected

    @pytest.mark.unit
    @pytest.mark.parametrize(
        "celery_state,expected",
        [
            ("REVOKED", "CANCELLED"),
            ("CANCELLED", "CANCELLED"),
        ],
    )
    def test_cancelled_states(self, celery_state: str, expected: str) -> None:
        assert simplify_job_status(celery_state) == expected

    @pytest.mark.unit
    def test_success_no_results(self) -> None:
        assert simplify_job_status("SUCCESS") == "COMPLETED"

    @pytest.mark.unit
    def test_success_all_completed(self) -> None:
        results = [
            {"status": DocumentProcessingStatus.COMPLETED.value},
            {"status": DocumentProcessingStatus.COMPLETED.value},
        ]
        assert simplify_job_status("SUCCESS", results) == "COMPLETED"

    @pytest.mark.unit
    def test_success_all_failed(self) -> None:
        results = [
            {"status": DocumentProcessingStatus.FAILED.value},
            {"status": DocumentProcessingStatus.FAILED.value},
        ]
        assert simplify_job_status("SUCCESS", results) == "FAILED"

    @pytest.mark.unit
    def test_success_partial(self) -> None:
        results = [
            {"status": DocumentProcessingStatus.COMPLETED.value},
            {"status": DocumentProcessingStatus.FAILED.value},
        ]
        assert simplify_job_status("SUCCESS", results) == "PARTIALLY_COMPLETED"

    @pytest.mark.unit
    def test_failure_state(self) -> None:
        assert simplify_job_status("FAILURE") == "FAILED"

    @pytest.mark.unit
    def test_partial_failure_no_results(self) -> None:
        assert simplify_job_status("PARTIAL_FAILURE") == "PARTIALLY_COMPLETED"

    @pytest.mark.unit
    def test_completed_with_failures(self) -> None:
        assert simplify_job_status("COMPLETED_WITH_FAILURES") == "FAILED"

    @pytest.mark.unit
    def test_unknown_state_returned_as_is(self) -> None:
        assert simplify_job_status("SOME_UNKNOWN") == "SOME_UNKNOWN"

    @pytest.mark.unit
    def test_none_state(self) -> None:
        assert simplify_job_status(None) == "UNKNOWN"

    @pytest.mark.unit
    def test_empty_string(self) -> None:
        assert simplify_job_status("") == "UNKNOWN"

    @pytest.mark.unit
    def test_case_insensitive(self) -> None:
        assert simplify_job_status("pending") == "IN_PROGRESS"
        assert simplify_job_status("Revoked") == "CANCELLED"


# =============================================================================
# _summarize_result_status
# =============================================================================


class TestSummarizeResultStatus:
    @pytest.mark.unit
    def test_none_results(self) -> None:
        assert _summarize_result_status(None) is None

    @pytest.mark.unit
    def test_empty_results(self) -> None:
        assert _summarize_result_status([]) is None

    @pytest.mark.unit
    def test_all_completed(self) -> None:
        results = [{"status": "completed"}, {"status": "completed"}]
        assert _summarize_result_status(results) == "COMPLETED"

    @pytest.mark.unit
    def test_all_failed(self) -> None:
        results = [{"status": "failed"}, {"status": "failed"}]
        assert _summarize_result_status(results) == "FAILED"

    @pytest.mark.unit
    def test_mixed(self) -> None:
        results = [{"status": "completed"}, {"status": "failed"}]
        assert _summarize_result_status(results) == "PARTIALLY_COMPLETED"

    @pytest.mark.unit
    def test_non_dict_items_treated_as_non_failed(self) -> None:
        """Non-dict items should not count as failed."""
        results = ["some-string", {"status": "completed"}]
        assert _summarize_result_status(results) == "COMPLETED"


# =============================================================================
# is_uuid
# =============================================================================


class TestIsUuid:
    @pytest.mark.unit
    def test_valid_uuid(self) -> None:
        assert is_uuid("550e8400-e29b-41d4-a716-446655440000") is True

    @pytest.mark.unit
    def test_uppercase_uuid(self) -> None:
        assert is_uuid("550E8400-E29B-41D4-A716-446655440000") is True

    @pytest.mark.unit
    def test_invalid_uuid(self) -> None:
        assert is_uuid("not-a-uuid") is False

    @pytest.mark.unit
    def test_empty_string(self) -> None:
        assert is_uuid("") is False

    @pytest.mark.unit
    def test_partial_uuid(self) -> None:
        assert is_uuid("550e8400-e29b-41d4-a716") is False


# =============================================================================
# Validation helpers
# =============================================================================


class TestValidateDocuments:
    @pytest.mark.unit
    def test_valid_documents(self) -> None:
        result = _validate_documents(["doc-1", "doc-2"], "col-1")
        assert result == ["doc-1", "doc-2"]

    @pytest.mark.unit
    def test_empty_list_raises(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_documents([], "col-1")
        assert exc_info.value.status_code == 400

    @pytest.mark.unit
    def test_none_raises(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_documents(None, "col-1")
        assert exc_info.value.status_code == 400


class TestValidateSchemaIdRequired:
    @pytest.mark.unit
    def test_valid_schema_id(self) -> None:
        _validate_schema_id_required("schema-1")  # Should not raise

    @pytest.mark.unit
    def test_none_raises(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_schema_id_required(None)
        assert exc_info.value.status_code == 400

    @pytest.mark.unit
    def test_empty_string_raises(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_schema_id_required("")
        assert exc_info.value.status_code == 400


class TestCheckSupabaseAvailable:
    @pytest.mark.unit
    def test_available(self) -> None:
        with patch("app.extraction_domain.shared.supabase", MagicMock()):
            _check_supabase_available()  # Should not raise

    @pytest.mark.unit
    def test_unavailable(self) -> None:
        with patch("app.extraction_domain.shared.supabase", None):
            with pytest.raises(HTTPException) as exc_info:
                _check_supabase_available()
            assert exc_info.value.status_code == 503


class TestValidateCollectionId:
    @pytest.mark.unit
    def test_valid(self) -> None:
        _validate_collection_id("collection-1")  # Should not raise

    @pytest.mark.unit
    def test_none_raises(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_collection_id(None)
        assert exc_info.value.status_code == 400

    @pytest.mark.unit
    def test_empty_raises(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_collection_id("")
        assert exc_info.value.status_code == 400


# =============================================================================
# _convert_simplified_schema
# =============================================================================


class TestConvertSimplifiedSchema:
    @pytest.mark.unit
    def test_simplified_format(self) -> None:
        simple = {"field1": "description1", "field2": "description2"}
        result = _convert_simplified_schema(simple)
        assert result["field1"]["type"] == "string"
        assert result["field1"]["description"] == "description1"
        assert result["field1"]["required"] is True

    @pytest.mark.unit
    def test_full_format_unchanged(self) -> None:
        full = {"field1": {"type": "string", "description": "desc", "required": True}}
        result = _convert_simplified_schema(full)
        assert result == full

    @pytest.mark.unit
    def test_empty_dict(self) -> None:
        assert _convert_simplified_schema({}) == {}

    @pytest.mark.unit
    def test_non_dict_passthrough(self) -> None:
        assert _convert_simplified_schema("not-a-dict") == "not-a-dict"

    @pytest.mark.unit
    def test_none_passthrough(self) -> None:
        assert _convert_simplified_schema(None) is None


# =============================================================================
# _create_extraction_response
# =============================================================================


class TestCreateExtractionResponse:
    @pytest.mark.unit
    def test_response_structure(self) -> None:
        resp = _create_extraction_response("task-123")
        assert resp.task_id == "task-123"
        assert resp.status == "accepted"
        assert resp.message is not None


# =============================================================================
# _submit_extraction_task
# =============================================================================


class TestSubmitExtractionTask:
    @pytest.mark.unit
    def test_successful_submission(self) -> None:
        mock_task = MagicMock()
        mock_task.id = "task-abc"
        mock_request = MagicMock()
        mock_request.model_dump.return_value = {"key": "value"}

        with patch(
            "app.extraction_domain.shared.extract_information_from_documents_task"
        ) as mock_celery:
            mock_celery.delay.return_value = mock_task
            result = _submit_extraction_task(mock_request)
            assert result == "task-abc"

    @pytest.mark.unit
    def test_operational_error_raises_503(self) -> None:
        from celery import exceptions as celery_exceptions

        mock_request = MagicMock()
        mock_request.model_dump.return_value = {}

        with patch(
            "app.extraction_domain.shared.extract_information_from_documents_task"
        ) as mock_celery:
            mock_celery.delay.side_effect = celery_exceptions.OperationalError(
                "broker down"
            )
            with pytest.raises(HTTPException) as exc_info:
                _submit_extraction_task(mock_request)
            assert exc_info.value.status_code == 503

    @pytest.mark.unit
    def test_connection_error_raises_503(self) -> None:
        mock_request = MagicMock()
        mock_request.model_dump.return_value = {}

        with patch(
            "app.extraction_domain.shared.extract_information_from_documents_task"
        ) as mock_celery:
            mock_celery.delay.side_effect = ConnectionError("refused")
            with pytest.raises(HTTPException) as exc_info:
                _submit_extraction_task(mock_request)
            assert exc_info.value.status_code == 503

    @pytest.mark.unit
    def test_unexpected_error_raises_503(self) -> None:
        mock_request = MagicMock()
        mock_request.model_dump.return_value = {}

        with patch(
            "app.extraction_domain.shared.extract_information_from_documents_task"
        ) as mock_celery:
            mock_celery.delay.side_effect = RuntimeError("unexpected")
            with pytest.raises(HTTPException) as exc_info:
                _submit_extraction_task(mock_request)
            assert exc_info.value.status_code == 503


# =============================================================================
# _fetch_schema_from_db
# =============================================================================


class TestFetchSchemaFromDb:
    @pytest.mark.unit
    def test_success_text_only(self) -> None:
        mock_response = MagicMock()
        mock_response.data = {"text": "schema-text-content"}

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.shared.supabase", mock_supabase):
            result = _fetch_schema_from_db("schema-uuid")
            assert result == "schema-text-content"

    @pytest.mark.unit
    def test_success_with_metadata(self) -> None:
        mock_response = MagicMock()
        mock_response.data = {
            "name": "TestSchema",
            "description": "A test schema",
            "text": "schema-text",
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.shared.supabase", mock_supabase):
            result = _fetch_schema_from_db("schema-uuid", include_metadata=True)
            assert result["name"] == "TestSchema"
            assert result["text"] == "schema-text"

    @pytest.mark.unit
    def test_schema_not_found(self) -> None:
        mock_response = MagicMock()
        mock_response.data = None

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.shared.supabase", mock_supabase):
            with pytest.raises(HTTPException) as exc_info:
                _fetch_schema_from_db("missing-uuid")
            assert exc_info.value.status_code == 404

    @pytest.mark.unit
    def test_supabase_unavailable(self) -> None:
        with patch("app.extraction_domain.shared.supabase", None):
            with pytest.raises(HTTPException) as exc_info:
                _fetch_schema_from_db("any-uuid")
            assert exc_info.value.status_code == 503


# =============================================================================
# update_job_status_in_supabase
# =============================================================================


class TestUpdateJobStatusInSupabase:
    @pytest.mark.unit
    def test_successful_update(self) -> None:
        mock_response = MagicMock()
        mock_response.data = [{"job_id": "j1"}]

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.shared.supabase", mock_supabase):
            result = update_job_status_in_supabase("j1", "COMPLETED")
            assert result is True

    @pytest.mark.unit
    def test_no_rows_updated(self) -> None:
        mock_response = MagicMock()
        mock_response.data = []

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.shared.supabase", mock_supabase):
            result = update_job_status_in_supabase("j-missing", "COMPLETED")
            assert result is False

    @pytest.mark.unit
    def test_supabase_not_available(self) -> None:
        with patch("app.extraction_domain.shared.supabase", None):
            result = update_job_status_in_supabase("j1", "COMPLETED")
            assert result is False

    @pytest.mark.unit
    def test_exception_returns_false(self) -> None:
        mock_supabase = MagicMock()
        mock_supabase.table.side_effect = RuntimeError("db error")

        with patch("app.extraction_domain.shared.supabase", mock_supabase):
            result = update_job_status_in_supabase("j1", "COMPLETED")
            assert result is False

    @pytest.mark.unit
    @pytest.mark.parametrize(
        "simplified,expected_db",
        [
            ("IN_PROGRESS", "STARTED"),
            ("COMPLETED", "SUCCESS"),
            ("PARTIALLY_COMPLETED", "SUCCESS"),
            ("FAILED", "FAILURE"),
            ("CANCELLED", "FAILURE"),
        ],
    )
    def test_status_mapping(self, simplified: str, expected_db: str) -> None:
        mock_response = MagicMock()
        mock_response.data = [{"job_id": "j1"}]

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        with patch("app.extraction_domain.shared.supabase", mock_supabase):
            update_job_status_in_supabase("j1", simplified)
            # Verify the status passed in the update call
            update_call = mock_supabase.table.return_value.update
            update_data = update_call.call_args[0][0]
            assert update_data["status"] == expected_db


# =============================================================================
# Jinja2 template validation
# =============================================================================


class TestValidateJinja2Template:
    @pytest.mark.unit
    def test_valid_template(self) -> None:
        validate_jinja2_template("Hello {{ name }}, welcome to {{ place }}!")

    @pytest.mark.unit
    def test_invalid_template_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid Jinja2 template syntax"):
            validate_jinja2_template("{% if unclosed %}")

    @pytest.mark.unit
    def test_simple_string(self) -> None:
        validate_jinja2_template("Just a plain string")  # Should not raise


# =============================================================================
# Prompt file path helpers
# =============================================================================


class TestPromptFilePathHelpers:
    @pytest.mark.unit
    def test_get_prompt_file_path(self) -> None:
        path = get_prompt_file_path("my_prompt")
        assert path.name == "my_prompt.jinja2"

    @pytest.mark.unit
    def test_get_metadata_file_path(self) -> None:
        path = get_metadata_file_path("my_prompt")
        assert path.name == "my_prompt.json"

    @pytest.mark.unit
    def test_get_archived_prompt_path(self) -> None:
        path = get_archived_prompt_path("my_prompt")
        assert "archive" in str(path)
        assert path.name == "my_prompt.jinja2"

    @pytest.mark.unit
    def test_get_archived_metadata_path(self) -> None:
        path = get_archived_metadata_path("my_prompt")
        assert "archive" in str(path)
        assert path.name == "my_prompt.json"


# =============================================================================
# Prompt management helpers
# =============================================================================


class TestIsSystemPrompt:
    @pytest.mark.unit
    def test_system_prompt(self) -> None:
        assert is_system_prompt("info_extraction") is True

    @pytest.mark.unit
    def test_non_system_prompt(self) -> None:
        assert is_system_prompt("custom_prompt") is False


class TestPromptExists:
    @pytest.mark.unit
    def test_exists(self, tmp_path: Path) -> None:
        with patch(
            "app.extraction_domain.shared.get_prompt_file_path",
            return_value=tmp_path / "exists.jinja2",
        ):
            (tmp_path / "exists.jinja2").write_text("content")
            assert prompt_exists("exists") is True

    @pytest.mark.unit
    def test_not_exists(self, tmp_path: Path) -> None:
        with patch(
            "app.extraction_domain.shared.get_prompt_file_path",
            return_value=tmp_path / "missing.jinja2",
        ):
            assert prompt_exists("missing") is False


class TestLoadPromptMetadata:
    @pytest.mark.unit
    def test_load_existing_metadata(self, tmp_path: Path) -> None:
        metadata = {
            "prompt_id": "test",
            "description": "Test prompt",
            "variables": ["var1"],
            "created_at": "2025-01-01T00:00:00",
            "is_system": False,
        }
        metadata_file = tmp_path / "test.json"
        metadata_file.write_text(json.dumps(metadata))

        with patch(
            "app.extraction_domain.shared.get_metadata_file_path",
            return_value=metadata_file,
        ):
            result = load_prompt_metadata("test")
            assert result.prompt_id == "test"
            assert result.description == "Test prompt"

    @pytest.mark.unit
    def test_load_missing_returns_default(self, tmp_path: Path) -> None:
        with patch(
            "app.extraction_domain.shared.get_metadata_file_path",
            return_value=tmp_path / "nonexistent.json",
        ):
            result = load_prompt_metadata("custom_prompt")
            assert result.prompt_id == "custom_prompt"
            assert result.description == "System prompt"
            assert result.is_system is False

    @pytest.mark.unit
    def test_load_system_prompt_default(self, tmp_path: Path) -> None:
        with patch(
            "app.extraction_domain.shared.get_metadata_file_path",
            return_value=tmp_path / "nonexistent.json",
        ):
            result = load_prompt_metadata("info_extraction")
            assert result.is_system is True


class TestSavePromptMetadata:
    @pytest.mark.unit
    def test_save_metadata(self, tmp_path: Path) -> None:
        metadata = PromptMetadata(
            prompt_id="test",
            description="Test",
            variables=["v1"],
            created_at="2025-01-01",
        )
        metadata_file = tmp_path / "test.json"

        with patch(
            "app.extraction_domain.shared.get_metadata_file_path",
            return_value=metadata_file,
        ):
            save_prompt_metadata(metadata)
            assert metadata_file.exists()
            saved = json.loads(metadata_file.read_text())
            assert saved["prompt_id"] == "test"


class TestCreateBackup:
    @pytest.mark.unit
    def test_creates_backup_files(self, tmp_path: Path) -> None:
        # Create source files
        prompt_file = tmp_path / "test.jinja2"
        prompt_file.write_text("template content")
        metadata_file = tmp_path / "test.json"
        metadata_file.write_text('{"key": "value"}')

        with (
            patch(
                "app.extraction_domain.shared.get_prompt_file_path",
                return_value=prompt_file,
            ),
            patch(
                "app.extraction_domain.shared.get_metadata_file_path",
                return_value=metadata_file,
            ),
            patch("app.extraction_domain.shared.PROMPTS_DIR", tmp_path),
        ):
            create_backup("test")
            # Check that backup files were created
            backup_files = list(tmp_path.glob("test.jinja2.backup_*"))
            assert len(backup_files) == 1

    @pytest.mark.unit
    def test_no_backup_if_prompt_missing(self, tmp_path: Path) -> None:
        with patch(
            "app.extraction_domain.shared.get_prompt_file_path",
            return_value=tmp_path / "missing.jinja2",
        ):
            create_backup("missing")  # Should not raise


class TestArchivePrompt:
    @pytest.mark.unit
    def test_archives_prompt(self, tmp_path: Path) -> None:
        prompts_dir = tmp_path / "prompts"
        prompts_dir.mkdir()
        archive_dir = prompts_dir / "archive"

        prompt_file = prompts_dir / "test.jinja2"
        prompt_file.write_text("template")
        metadata_file = prompts_dir / "test.json"
        metadata_file.write_text("{}")

        with (
            patch(
                "app.extraction_domain.shared.get_prompt_file_path",
                return_value=prompt_file,
            ),
            patch(
                "app.extraction_domain.shared.get_metadata_file_path",
                return_value=metadata_file,
            ),
            patch(
                "app.extraction_domain.shared.get_archived_prompt_path",
                return_value=archive_dir / "test.jinja2",
            ),
            patch(
                "app.extraction_domain.shared.get_archived_metadata_path",
                return_value=archive_dir / "test.json",
            ),
            patch("app.extraction_domain.shared.PROMPTS_ARCHIVE_DIR", archive_dir),
        ):
            archive_prompt("test")
            assert (archive_dir / "test.jinja2").exists()
            assert (archive_dir / "test.json").exists()
            assert not prompt_file.exists()
            assert not metadata_file.exists()


# =============================================================================
# get_current_user dependency
# =============================================================================


class TestGetCurrentUser:
    @pytest.mark.unit
    def test_valid_uuid_user_id(self) -> None:
        """A valid UUID should be accepted and returned."""
        valid_uuid = "550e8400-e29b-41d4-a716-446655440000"
        result = get_current_user(x_user_id=valid_uuid)
        assert result == valid_uuid

    @pytest.mark.unit
    def test_empty_user_id_raises(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(x_user_id="")
        assert exc_info.value.status_code == 401

    @pytest.mark.unit
    def test_non_uuid_user_id_raises_422(self) -> None:
        """BUG-15 regression: arbitrary strings like 'user-123' must be rejected
        to prevent user impersonation via crafted X-User-ID headers."""
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(x_user_id="user-123")
        assert exc_info.value.status_code == 422
        assert "UUID" in exc_info.value.detail

    @pytest.mark.unit
    def test_sql_injection_attempt_rejected(self) -> None:
        """BUG-15 regression: injection payloads must not pass validation."""
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(x_user_id="'; DROP TABLE users; --")
        assert exc_info.value.status_code == 422

    @pytest.mark.unit
    def test_uppercase_uuid_accepted(self) -> None:
        """UUIDs should be accepted regardless of case."""
        upper_uuid = "550E8400-E29B-41D4-A716-446655440000"
        result = get_current_user(x_user_id=upper_uuid)
        assert result == upper_uuid
