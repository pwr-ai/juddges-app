"""Unit tests for app.extraction_domain.jobs_router module.

Tests cover: helper functions (pure logic), endpoint happy paths,
error handling, and authorization via mocked dependencies.

Auth note: jobs_router was migrated from X-User-ID header auth to Supabase
Bearer JWT (issue #233). Endpoint tests that require user identity install the
JWT override via _install_jwt_user_override() from conftest and send
``Authorization: Bearer <token>`` instead of ``X-User-ID``.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

import app.extraction_domain.shared as shared_module
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
from app.extraction_domain.shared import _validate_documents
from app.models import DocumentExtractionResponse
from tests.app.conftest import _install_jwt_user_override

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

_USER_001 = "00000000-0000-4000-a000-000000000001"
_USER_099 = "00000000-0000-4000-a000-000000000099"
_BEARER_HEADERS = {"Authorization": "Bearer fake-jwt-token"}


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
        """Test retrieving a pending job (ownership check degrades when DB is down)."""
        _install_jwt_user_override(_USER_001)
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
                "/extractions/job-123",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "PENDING"

    @pytest.mark.unit
    async def test_in_progress_job(self, client, valid_api_headers) -> None:
        """Test retrieving an in-progress job owned by the caller."""
        _install_jwt_user_override(_USER_001)
        mock_result = MagicMock()
        mock_result.state = "STARTED"
        mock_result.ready.return_value = False
        mock_result.info = {"completed_documents": 5}

        owner_row = MagicMock()
        owner_row.data = {"user_id": _USER_001}
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = owner_row

        with (
            patch(
                "app.extraction_domain.jobs_router.AsyncResult",
                return_value=mock_result,
            ),
            patch(
                "app.extraction_domain.jobs_router.update_job_status_in_supabase",
                return_value=True,
            ),
            patch("app.extraction_domain.jobs_router.supabase", mock_supabase),
        ):
            response = await client.get(
                "/extractions/job-456",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "IN_PROGRESS"

    @pytest.mark.unit
    async def test_get_job_owned_by_another_user_is_forbidden(
        self, client, valid_api_headers
    ) -> None:
        """A user must not read another user's extraction job (IDOR, #233 follow-up)."""
        _install_jwt_user_override(_USER_001)
        owner_row = MagicMock()
        owner_row.data = {"user_id": _USER_099}
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = owner_row

        with (
            patch("app.extraction_domain.jobs_router.supabase", mock_supabase),
            patch("app.extraction_domain.jobs_router.AsyncResult") as mock_async,
        ):
            response = await client.get(
                "/extractions/job-belongs-to-other",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 403
            # Ownership is rejected before any Celery result is fetched.
            mock_async.assert_not_called()


class TestCancelExtractionJobEndpoint:
    """Tests for DELETE /extractions/{job_id} endpoint."""

    @pytest.mark.unit
    async def test_cancel_running_job(self, client, valid_api_headers) -> None:
        """Test cancelling a running job."""
        _install_jwt_user_override(_USER_001)
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
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "cancelled"
            mock_celery_app.control.revoke.assert_called_once()

    @pytest.mark.unit
    async def test_cancel_completed_job(self, client, valid_api_headers) -> None:
        """Test cancelling an already completed job."""
        _install_jwt_user_override(_USER_001)
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
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "already_completed"

    @pytest.mark.unit
    async def test_cancel_not_found_job(self, client, valid_api_headers) -> None:
        """Test cancelling a job that doesn't exist."""
        _install_jwt_user_override(_USER_001)
        mock_result = MagicMock()
        mock_result.state = "PENDING"
        mock_result.info = None

        with patch(
            "app.extraction_domain.jobs_router.AsyncResult",
            return_value=mock_result,
        ):
            response = await client.delete(
                "/extractions/job-missing",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "not_found"

    @pytest.mark.unit
    async def test_cancel_job_owned_by_another_user_returns_403(
        self, client, valid_api_headers
    ) -> None:
        """Part 2 of issue #250: cancel must 403 when the job belongs to another user.

        User 099 (attacker) is authenticated; the job in the DB belongs to
        user 001.  The ownership check must fire BEFORE revoke() is called.
        """
        _install_jwt_user_override(_USER_099)

        # Task is running (STARTED, not ready) so we reach the revoke path.
        mock_result = MagicMock()
        mock_result.state = "STARTED"
        mock_result.info = {"some": "info"}
        mock_result.ready.return_value = False

        owner_row = MagicMock()
        owner_row.data = {"user_id": _USER_001}  # job belongs to user 001
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = owner_row

        with (
            patch(
                "app.extraction_domain.jobs_router.AsyncResult",
                return_value=mock_result,
            ),
            patch("app.extraction_domain.jobs_router.supabase", mock_supabase),
            patch("app.extraction_domain.jobs_router.celery_app") as mock_celery_app,
        ):
            response = await client.delete(
                "/extractions/job-belongs-to-user-001",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )

        assert response.status_code == 403
        # revoke() must NOT have been called
        mock_celery_app.control.revoke.assert_not_called()


class TestDeleteExtractionJobEndpoint:
    """Tests for DELETE /extractions/{job_id}/delete endpoint."""

    @pytest.mark.unit
    async def test_delete_own_job(self, client, valid_api_headers) -> None:
        """Test deleting a job owned by the user."""
        _install_jwt_user_override(_USER_001)
        mock_job_response = MagicMock()
        mock_job_response.data = {"user_id": _USER_001}

        mock_delete_response = MagicMock()
        mock_delete_response.data = [{"job_id": "job-1"}]

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_job_response
        mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_delete_response

        with patch("app.extraction_domain.jobs_router.supabase", mock_supabase):
            response = await client.delete(
                "/extractions/job-1/delete",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "deleted"

    @pytest.mark.unit
    async def test_delete_other_users_job_returns_403(
        self, client, valid_api_headers
    ) -> None:
        """Test that deleting another user's job returns 403.

        User 099 (the attacker) is authenticated as themselves via JWT.
        The job in the DB belongs to user 001. The handler must deny access.
        """
        # Attacker is authenticated as _USER_099, job belongs to a different user
        _install_jwt_user_override(_USER_099)
        mock_job_response = MagicMock()
        mock_job_response.data = {"user_id": "other-user"}

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_job_response

        with patch("app.extraction_domain.jobs_router.supabase", mock_supabase):
            response = await client.delete(
                "/extractions/job-1/delete",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 403

    @pytest.mark.unit
    async def test_delete_supabase_unavailable(self, client, valid_api_headers) -> None:
        """Test that unavailable Supabase returns 503."""
        _install_jwt_user_override(_USER_001)
        with patch("app.extraction_domain.jobs_router.supabase", None):
            response = await client.delete(
                "/extractions/job-1/delete",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 503


class TestListExtractionJobsEndpoint:
    """Tests for GET /extractions endpoint.

    Part 1 of issue #250: list_extraction_jobs now queries the extraction_jobs
    Supabase table filtered by user_id, replacing the previous Celery global
    inspect API that exposed every user's in-flight tasks.
    """

    @pytest.mark.unit
    async def test_list_jobs_supabase_unavailable_returns_503(
        self, client, valid_api_headers
    ) -> None:
        """Returns 503 when Supabase is not configured."""
        _install_jwt_user_override(_USER_001)

        with patch("app.extraction_domain.jobs_router.supabase", None):
            response = await client.get(
                "/extractions",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 503

    @pytest.mark.unit
    async def test_list_jobs_returns_only_caller_jobs(
        self, client, valid_api_headers
    ) -> None:
        """DB query is scoped to the authenticated user_id — other users' jobs are excluded.

        Verifies that the eq("user_id", ...) filter is applied with the caller's
        user id, not with a different user's id or with no filter at all.
        """
        _install_jwt_user_override(_USER_001)

        mock_db_response = MagicMock()
        mock_db_response.data = [
            {
                "job_id": "job-owned-by-001",
                "collection_id": "col-1",
                "status": "COMPLETED",
                "created_at": "2025-01-01T00:00:00+00:00",
                "updated_at": "2025-01-01T01:00:00+00:00",
                "total_documents": 5,
                "completed_documents": 5,
            }
        ]
        mock_db_response.count = 1

        # Capture the user_id passed to the DB filter.
        captured_user_id: list[str] = []

        class _ChainMock:
            def select(self, *a, **kw):
                return self

            def eq(self, col, val):
                if col == "user_id":
                    captured_user_id.append(val)
                return self

            def order(self, *a, **kw):
                return self

            def range(self, *a, **kw):
                return self

            def execute(self):
                return mock_db_response

        mock_supabase = MagicMock()
        mock_supabase.table.return_value = _ChainMock()

        with patch("app.extraction_domain.jobs_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )

        assert response.status_code == 200
        data = response.json()
        assert len(data["jobs"]) == 1
        assert data["jobs"][0]["task_id"] == "job-owned-by-001"
        assert data["total"] == 1
        # The query was scoped to the caller's user_id.
        assert _USER_001 in captured_user_id

    @pytest.mark.unit
    async def test_list_jobs_empty_when_no_jobs(
        self, client, valid_api_headers
    ) -> None:
        """Returns empty list and total=0 when the user has no jobs in the DB."""
        _install_jwt_user_override(_USER_001)

        mock_db_response = MagicMock()
        mock_db_response.data = []
        mock_db_response.count = 0

        mock_supabase = MagicMock()
        (
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value
        ) = mock_db_response

        with patch("app.extraction_domain.jobs_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["jobs"] == []
            assert data["total"] == 0

    @pytest.mark.unit
    async def test_list_jobs_status_filter_passed_to_db(
        self, client, valid_api_headers
    ) -> None:
        """status= query param is forwarded as a DB-level filter, not applied in Python."""
        _install_jwt_user_override(_USER_001)

        mock_db_response = MagicMock()
        mock_db_response.data = []
        mock_db_response.count = 0

        captured_status_filter: list[str] = []

        class _ChainMock:
            def select(self, *a, **kw):
                return self

            def eq(self, col, val):
                if col == "status":
                    captured_status_filter.append(val)
                return self

            def order(self, *a, **kw):
                return self

            def range(self, *a, **kw):
                return self

            def execute(self):
                return mock_db_response

        mock_supabase = MagicMock()
        mock_supabase.table.return_value = _ChainMock()

        with patch("app.extraction_domain.jobs_router.supabase", mock_supabase):
            response = await client.get(
                "/extractions?status=COMPLETED",
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )

        assert response.status_code == 200
        assert "COMPLETED" in captured_status_filter


class TestValidateDocumentsMaxCap:
    """Tests for the MAX_DOCUMENTS_PER_JOB cap in _validate_documents."""

    @pytest.mark.unit
    def test_rejects_documents_exceeding_cap(self, monkeypatch) -> None:
        """_validate_documents raises 400 when document count exceeds cap."""
        monkeypatch.setattr(shared_module, "MAX_DOCUMENTS_PER_JOB", 3)
        with pytest.raises(HTTPException) as exc_info:
            _validate_documents(["d1", "d2", "d3", "d4"], "col-1")
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "TOO_MANY_DOCUMENTS"

    @pytest.mark.unit
    def test_accepts_documents_at_cap(self, monkeypatch) -> None:
        """_validate_documents accepts exactly MAX_DOCUMENTS_PER_JOB documents."""
        monkeypatch.setattr(shared_module, "MAX_DOCUMENTS_PER_JOB", 3)
        result = _validate_documents(["d1", "d2", "d3"], "col-1")
        assert result == ["d1", "d2", "d3"]

    @pytest.mark.unit
    def test_enforce_cap_rejects_full_mode_overflow(self, monkeypatch) -> None:
        """_enforce_max_documents caps the full-mode path (used where document_ids
        may legitimately be omitted) without requiring a non-empty list."""
        monkeypatch.setattr(shared_module, "MAX_DOCUMENTS_PER_JOB", 3)
        with pytest.raises(HTTPException) as exc_info:
            shared_module._enforce_max_documents(["d1", "d2", "d3", "d4"], "col-1")
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "TOO_MANY_DOCUMENTS"

    @pytest.mark.unit
    def test_enforce_cap_allows_empty_and_within_cap(self, monkeypatch) -> None:
        """_enforce_max_documents is a no-op for empty/None and within-cap lists."""
        monkeypatch.setattr(shared_module, "MAX_DOCUMENTS_PER_JOB", 3)
        shared_module._enforce_max_documents(None, "col-1")
        shared_module._enforce_max_documents([], "col-1")
        shared_module._enforce_max_documents(["d1", "d2", "d3"], "col-1")
