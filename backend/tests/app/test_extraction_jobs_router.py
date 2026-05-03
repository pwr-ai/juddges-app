"""Unit tests for app.extraction_domain.jobs_router module.

Tests cover: helper functions (pure logic), endpoint happy paths,
error handling, and authorization via mocked dependencies.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.extraction_domain.jobs_router import (
    _build_resubmit_request_from_job,
    _count_processed_documents,
    _deserialize_existing_results,
    _in_progress_batch_response,
    _is_metadata_result_payload,
    _is_task_not_captured_error,
    _is_worker_unavailable_message,
    _parse_task_results,
    _pending_batch_response,
    _worker_unavailable_error,
)
from app.models import DocumentExtractionResponse

# =============================================================================
# Pure helper functions
# =============================================================================


class TestPendingBatchResponse:
    @pytest.mark.unit
    def test_structure(self) -> None:
        resp = _pending_batch_response("job-1")
        assert resp.task_id == "job-1"
        assert resp.status == "PENDING"
        assert resp.results is None


class TestInProgressBatchResponse:
    @pytest.mark.unit
    def test_structure(self) -> None:
        resp = _in_progress_batch_response("job-2")
        assert resp.task_id == "job-2"
        assert resp.status == "IN_PROGRESS"
        assert resp.results is None


class TestWorkerUnavailableError:
    @pytest.mark.unit
    def test_is_http_exception_503(self) -> None:
        err = _worker_unavailable_error()
        assert isinstance(err, HTTPException)
        assert err.status_code == 503


class TestIsWorkerUnavailableMessage:
    @pytest.mark.unit
    @pytest.mark.parametrize(
        "msg,expected",
        [
            ("Worker process not responding", True),
            ("Celery broker down", True),
            ("Connection refused", True),
            ("timeout waiting for response", True),
            ("not available", True),
            ("backend connection lost", True),
            ("All documents processed", False),
            ("Task succeeded", False),
        ],
    )
    def test_message_detection(self, msg: str, expected: bool) -> None:
        assert _is_worker_unavailable_message(msg) is expected


class TestIsTaskNotCapturedError:
    @pytest.mark.unit
    def test_not_found_error(self) -> None:
        err = Exception("Task result not found in backend")
        assert _is_task_not_captured_error(err) is True

    @pytest.mark.unit
    def test_does_not_exist(self) -> None:
        err = Exception("Task does not exist")
        assert _is_task_not_captured_error(err) is True

    @pytest.mark.unit
    def test_pending(self) -> None:
        err = Exception("Task is still pending")
        assert _is_task_not_captured_error(err) is True

    @pytest.mark.unit
    def test_other_error(self) -> None:
        err = Exception("Some random failure")
        assert _is_task_not_captured_error(err) is False


class TestIsMetadataResultPayload:
    @pytest.mark.unit
    def test_metadata_with_started_at(self) -> None:
        assert _is_metadata_result_payload({"started_at": "2025-01-01"}) is True

    @pytest.mark.unit
    def test_metadata_with_elapsed_time(self) -> None:
        assert _is_metadata_result_payload({"elapsed_time_seconds": 10}) is True

    @pytest.mark.unit
    def test_metadata_with_exc_type(self) -> None:
        assert _is_metadata_result_payload({"exc_type": "RuntimeError"}) is True

    @pytest.mark.unit
    def test_not_metadata_dict(self) -> None:
        assert _is_metadata_result_payload({"status": "completed"}) is False

    @pytest.mark.unit
    def test_list_input(self) -> None:
        assert _is_metadata_result_payload([{"status": "completed"}]) is False

    @pytest.mark.unit
    def test_none_input(self) -> None:
        assert _is_metadata_result_payload(None) is False


# =============================================================================
# _parse_task_results
# =============================================================================


class TestParseTaskResults:
    @pytest.mark.unit
    def test_valid_results(self) -> None:
        results = [
            {
                "collection_id": "c1",
                "document_id": "d1",
                "status": "completed",
                "created_at": "2025-01-01",
                "updated_at": "2025-01-01",
            },
        ]
        responses, normalized = _parse_task_results(results)
        assert len(responses) == 1
        assert isinstance(responses[0], DocumentExtractionResponse)
        assert len(normalized) == 1

    @pytest.mark.unit
    def test_non_list_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Expected list"):
            _parse_task_results({"key": "value"})

    @pytest.mark.unit
    def test_non_dict_item_raises_type_error(self) -> None:
        with pytest.raises(TypeError, match="must be a dict"):
            _parse_task_results(["not-a-dict"])


# =============================================================================
# _count_processed_documents
# =============================================================================


class TestCountProcessedDocuments:
    @pytest.mark.unit
    def test_all_completed(self) -> None:
        results = [
            {"status": "completed"},
            {"status": "completed"},
        ]
        assert _count_processed_documents(results) == 2

    @pytest.mark.unit
    def test_mixed(self) -> None:
        results = [
            {"status": "completed"},
            {"status": "failed"},
            {"status": "pending"},
        ]
        assert _count_processed_documents(results) == 2

    @pytest.mark.unit
    def test_none(self) -> None:
        assert _count_processed_documents(None) is None

    @pytest.mark.unit
    def test_empty_list(self) -> None:
        assert _count_processed_documents([]) is None


# =============================================================================
# _deserialize_existing_results
# =============================================================================


class TestDeserializeExistingResults:
    @pytest.mark.unit
    def test_none_returns_none(self) -> None:
        assert _deserialize_existing_results(None) is None

    @pytest.mark.unit
    def test_empty_returns_none(self) -> None:
        assert _deserialize_existing_results([]) is None

    @pytest.mark.unit
    def test_dict_items_deserialized(self) -> None:
        results = [
            {
                "collection_id": "c1",
                "document_id": "d1",
                "status": "completed",
                "created_at": "2025-01-01",
                "updated_at": "2025-01-01",
            }
        ]
        deserialized = _deserialize_existing_results(results)
        assert len(deserialized) == 1
        assert isinstance(deserialized[0], DocumentExtractionResponse)


# =============================================================================
# _build_resubmit_request_from_job
# =============================================================================


class TestBuildResubmitRequestFromJob:
    @pytest.mark.unit
    def test_builds_request(self) -> None:
        # schema_id must be None when user_schema is provided (model validator)
        job_data = {
            "collection_id": "col-1",
            "schema_id": None,
            "document_ids": ["doc-1"],
            "language": "pl",
            "extraction_context": "Extract info",
            "prompt_id": "info_extraction",
        }
        schema_data = {
            "name": "TestSchema",
            "description": "A schema",
            "text": "schema text",
        }
        request = _build_resubmit_request_from_job(job_data, schema_data)
        assert request.collection_id == "col-1"
        assert request.document_ids == ["doc-1"]
        assert request.user_schema["name"] == "TestSchema"


# =============================================================================
# Endpoint integration tests (via ASGI transport)
# =============================================================================


class TestCreateExtractionJobEndpoint:
    """Tests for POST /extractions endpoint."""

    @pytest.mark.unit
    async def test_create_job_simple_request(self, client, valid_api_headers) -> None:
        """Test creating an extraction job with a simple request."""
        mock_task = MagicMock()
        mock_task.id = "task-123"

        with (
            patch(
                "app.extraction_domain.shared.extract_information_from_documents_task"
            ) as mock_celery,
            patch("app.extraction_domain.shared.supabase", MagicMock()),
        ):
            mock_celery.delay.return_value = mock_task
            # Mock _fetch_schema_from_db since we provide a UUID schema_id
            with patch(
                "app.extraction_domain.jobs_router._fetch_schema_from_db",
                return_value={
                    "field": {"type": "string", "description": "test", "required": True}
                },
            ):
                response = await client.post(
                    "/extractions",
                    json={
                        "collection_id": "col-1",
                        "schema_id": "550e8400-e29b-41d4-a716-446655440000",
                        "document_ids": ["doc-1", "doc-2"],
                        "extraction_context": "Extract legal info",
                    },
                    headers=valid_api_headers,
                )
                assert response.status_code == 202
                data = response.json()
                assert data["status"] == "accepted"

    @pytest.mark.unit
    async def test_create_job_empty_documents(self, client, valid_api_headers) -> None:
        """Test that empty document list returns 400."""
        response = await client.post(
            "/extractions",
            json={
                "collection_id": "col-1",
                "schema_id": "my-schema",
                "document_ids": [],
                "extraction_context": "Extract info",
            },
            headers=valid_api_headers,
        )
        assert response.status_code == 400

    @pytest.mark.unit
    async def test_create_job_missing_collection_id(
        self, client, valid_api_headers
    ) -> None:
        """Test validation for missing collection_id."""
        response = await client.post(
            "/extractions",
            json={
                "schema_id": "my-schema",
                "document_ids": ["doc-1"],
                "extraction_context": "Extract info",
            },
            headers=valid_api_headers,
        )
        assert response.status_code == 422


class TestGetExtractionJobEndpoint:
    """Tests for GET /extractions/{job_id} endpoint."""

    @pytest.mark.unit
    async def test_pending_job(self, client, valid_api_headers) -> None:
        """Test retrieving a pending job."""
        mock_result = MagicMock()
        mock_result.state = "PENDING"
        mock_result.info = None

        with (
            patch(
                "app.extraction_domain.jobs_router.AsyncResult",
                return_value=mock_result,
            ),
            patch("app.extraction_domain.jobs_router.supabase", None),
        ):
            response = await client.get(
                "/extractions/job-123", headers=valid_api_headers
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "PENDING"

    @pytest.mark.unit
    async def test_in_progress_job(self, client, valid_api_headers) -> None:
        """Test retrieving an in-progress job."""
        mock_result = MagicMock()
        mock_result.state = "STARTED"
        mock_result.ready.return_value = False
        mock_result.info = {"completed_documents": 5}

        with (
            patch(
                "app.extraction_domain.jobs_router.AsyncResult",
                return_value=mock_result,
            ),
            patch(
                "app.extraction_domain.jobs_router.update_job_status_in_supabase",
                return_value=True,
            ),
        ):
            response = await client.get(
                "/extractions/job-456", headers=valid_api_headers
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "IN_PROGRESS"


class TestCancelExtractionJobEndpoint:
    """Tests for DELETE /extractions/{job_id} endpoint."""

    @pytest.mark.unit
    async def test_cancel_running_job(self, client, valid_api_headers) -> None:
        """Test cancelling a running job."""
        mock_result = MagicMock()
        mock_result.state = "STARTED"
        mock_result.info = {"some": "info"}
        mock_result.ready.return_value = False

        with (
            patch(
                "app.extraction_domain.jobs_router.AsyncResult",
                return_value=mock_result,
            ),
            patch("app.extraction_domain.jobs_router.celery_app") as mock_celery_app,
        ):
            response = await client.delete(
                "/extractions/job-789",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000001",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "cancelled"
            mock_celery_app.control.revoke.assert_called_once()

    @pytest.mark.unit
    async def test_cancel_completed_job(self, client, valid_api_headers) -> None:
        """Test cancelling an already completed job."""
        mock_result = MagicMock()
        mock_result.state = "SUCCESS"
        mock_result.info = {"data": "results"}
        mock_result.ready.return_value = True

        with patch(
            "app.extraction_domain.jobs_router.AsyncResult",
            return_value=mock_result,
        ):
            response = await client.delete(
                "/extractions/job-done",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000001",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "already_completed"

    @pytest.mark.unit
    async def test_cancel_not_found_job(self, client, valid_api_headers) -> None:
        """Test cancelling a job that doesn't exist."""
        mock_result = MagicMock()
        mock_result.state = "PENDING"
        mock_result.info = None

        with patch(
            "app.extraction_domain.jobs_router.AsyncResult",
            return_value=mock_result,
        ):
            response = await client.delete(
                "/extractions/job-missing",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000001",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "not_found"


class TestDeleteExtractionJobEndpoint:
    """Tests for DELETE /extractions/{job_id}/delete endpoint."""

    @pytest.mark.unit
    async def test_delete_own_job(self, client, valid_api_headers) -> None:
        """Test deleting a job owned by the user."""
        mock_job_response = MagicMock()
        mock_job_response.data = {"user_id": "00000000-0000-4000-a000-000000000001"}

        mock_delete_response = MagicMock()
        mock_delete_response.data = [{"job_id": "job-1"}]

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_job_response
        mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_delete_response

        with patch("app.extraction_domain.jobs_router.supabase", mock_supabase):
            response = await client.delete(
                "/extractions/job-1/delete",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000001",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "deleted"

    @pytest.mark.unit
    async def test_delete_other_users_job_returns_403(
        self, client, valid_api_headers
    ) -> None:
        """Test that deleting another user's job returns 403."""
        mock_job_response = MagicMock()
        mock_job_response.data = {"user_id": "other-user"}

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_job_response

        with patch("app.extraction_domain.jobs_router.supabase", mock_supabase):
            response = await client.delete(
                "/extractions/job-1/delete",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000099",
                },
            )
            assert response.status_code == 403

    @pytest.mark.unit
    async def test_delete_supabase_unavailable(self, client, valid_api_headers) -> None:
        """Test that unavailable Supabase returns 503."""
        with patch("app.extraction_domain.jobs_router.supabase", None):
            response = await client.delete(
                "/extractions/job-1/delete",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000001",
                },
            )
            assert response.status_code == 503


class TestListExtractionJobsEndpoint:
    """Tests for GET /extractions endpoint."""

    @pytest.mark.unit
    async def test_list_jobs_no_workers(self, client, valid_api_headers) -> None:
        """Test listing jobs when no workers are available returns 500 (generic handler)."""
        mock_celery_app = MagicMock()
        mock_celery_app.control.inspect.return_value = None

        with patch("app.extraction_domain.jobs_router.celery_app", mock_celery_app):
            response = await client.get(
                "/extractions",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000001",
                },
            )
            # The inner 503 HTTPException is caught by the outer `except Exception`
            # and re-wrapped as a 500 error
            assert response.status_code == 500

    @pytest.mark.unit
    async def test_list_jobs_empty(self, client, valid_api_headers) -> None:
        """Test listing jobs when no extraction jobs are running."""
        mock_inspect = MagicMock()
        mock_inspect.active.return_value = {}
        mock_inspect.scheduled.return_value = {}
        mock_inspect.reserved.return_value = {}

        mock_celery_app = MagicMock()
        mock_celery_app.control.inspect.return_value = mock_inspect

        with patch("app.extraction_domain.jobs_router.celery_app", mock_celery_app):
            response = await client.get(
                "/extractions",
                headers={
                    **valid_api_headers,
                    "X-User-ID": "00000000-0000-4000-a000-000000000001",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["jobs"] == []
            assert data["total"] == 0
