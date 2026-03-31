"""Unit tests for app.workers module -- pure helper functions."""

import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers import _build_celery_failure_metadata, _calculate_task_timing_metrics

# ---------------------------------------------------------------------------
# _build_celery_failure_metadata
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildCeleryFailureMetadata:
    """Tests for _build_celery_failure_metadata helper."""

    def test_no_exception_no_extras(self):
        result = _build_celery_failure_metadata()
        assert result == {}

    def test_with_exception(self):
        exc = ValueError("bad value")
        result = _build_celery_failure_metadata(exception=exc)
        assert result["exc_type"] == "ValueError"
        assert result["exc_message"] == "bad value"

    def test_with_extras_only(self):
        result = _build_celery_failure_metadata(code="ERR", status=500)
        assert result["code"] == "ERR"
        assert result["status"] == 500
        assert "exc_type" not in result

    def test_with_exception_and_extras(self):
        exc = RuntimeError("oops")
        result = _build_celery_failure_metadata(
            exception=exc, code="RUNTIME", retries=3
        )
        assert result["exc_type"] == "RuntimeError"
        assert result["exc_message"] == "oops"
        assert result["code"] == "RUNTIME"
        assert result["retries"] == 3

    def test_custom_exception_type(self):
        class MyCustomError(Exception):
            pass

        exc = MyCustomError("custom msg")
        result = _build_celery_failure_metadata(exception=exc)
        assert result["exc_type"] == "MyCustomError"
        assert result["exc_message"] == "custom msg"

    def test_none_exception_explicit(self):
        result = _build_celery_failure_metadata(exception=None)
        assert "exc_type" not in result
        assert "exc_message" not in result


# ---------------------------------------------------------------------------
# _calculate_task_timing_metrics
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCalculateTaskTimingMetrics:
    """Tests for _calculate_task_timing_metrics helper."""

    def test_basic_calculation(self):
        # Simulate 100 seconds elapsed, 5 out of 10 done
        start = time.time() - 100
        result = _calculate_task_timing_metrics(
            job_start_time=start,
            completed_documents=5,
            total_documents=10,
        )
        assert result["elapsed_time"] >= 99  # allow small timing variance
        assert abs(result["avg_time_per_doc"] - 20.0) < 2.0
        assert result["remaining_documents"] == 5
        assert abs(result["estimated_time_remaining"] - 100.0) < 10.0

    def test_zero_completed(self):
        start = time.time() - 50
        result = _calculate_task_timing_metrics(
            job_start_time=start,
            completed_documents=0,
            total_documents=10,
        )
        assert result["avg_time_per_doc"] == 0
        assert result["estimated_time_remaining"] == 0
        assert result["remaining_documents"] == 10

    def test_all_completed(self):
        start = time.time() - 30
        result = _calculate_task_timing_metrics(
            job_start_time=start,
            completed_documents=10,
            total_documents=10,
        )
        assert result["remaining_documents"] == 0
        assert result["estimated_time_remaining"] == 0.0

    def test_single_document(self):
        start = time.time() - 5
        result = _calculate_task_timing_metrics(
            job_start_time=start,
            completed_documents=1,
            total_documents=1,
        )
        assert result["remaining_documents"] == 0

    def test_returns_all_expected_keys(self):
        start = time.time()
        result = _calculate_task_timing_metrics(
            job_start_time=start,
            completed_documents=3,
            total_documents=5,
        )
        expected_keys = {
            "elapsed_time",
            "avg_time_per_doc",
            "remaining_documents",
            "estimated_time_remaining",
        }
        assert expected_keys == set(result.keys())


# ---------------------------------------------------------------------------
# _update_job_results_in_supabase (mocked)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestUpdateJobResultsInSupabase:
    """Tests for _update_job_results_in_supabase with mocked Supabase client."""

    def test_returns_false_when_client_is_none(self, monkeypatch):
        monkeypatch.setattr("app.workers.supabase_client", None)
        from app.workers import _update_job_results_in_supabase

        result = _update_job_results_in_supabase(
            job_id="job-1",
            results=[{"doc": "data"}],
            completed_documents=1,
            status="STARTED",
        )
        assert result is False

    def test_returns_true_on_successful_update(self, monkeypatch):
        """Verify successful update returns True."""

        class MockResult:
            data = [{"job_id": "job-1"}]

        class MockQuery:
            def update(self, data):
                return self

            def eq(self, field, value):
                return self

            def execute(self):
                return MockResult()

        class MockClient:
            def table(self, name):
                return MockQuery()

        monkeypatch.setattr("app.workers.supabase_client", MockClient())
        from app.workers import _update_job_results_in_supabase

        result = _update_job_results_in_supabase(
            job_id="job-1",
            results=[],
            completed_documents=0,
            status="STARTED",
        )
        assert result is True

    def test_returns_false_when_no_rows_updated(self, monkeypatch):
        class MockResult:
            data = []

        class MockQuery:
            def update(self, data):
                return self

            def eq(self, field, value):
                return self

            def execute(self):
                return MockResult()

        class MockClient:
            def table(self, name):
                return MockQuery()

        monkeypatch.setattr("app.workers.supabase_client", MockClient())
        from app.workers import _update_job_results_in_supabase

        result = _update_job_results_in_supabase(
            job_id="missing-job",
            results=[],
            completed_documents=0,
        )
        assert result is False

    def test_returns_false_on_exception(self, monkeypatch):
        class MockClient:
            def table(self, name):
                raise ConnectionError("db down")

        monkeypatch.setattr("app.workers.supabase_client", MockClient())
        from app.workers import _update_job_results_in_supabase

        result = _update_job_results_in_supabase(
            job_id="job-1",
            results=[],
            completed_documents=0,
        )
        assert result is False


# ---------------------------------------------------------------------------
# Event loop reuse regression tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestEventLoopReuse:
    """Verify that extract_information_from_documents_task creates exactly one
    event loop per invocation, regardless of the number of documents processed.

    This is a regression test for BUG 7: asyncio.run() was called once per
    document, creating and destroying an event loop each time.
    """

    def _build_mock_request(self, doc_ids: list[str]) -> MagicMock:
        """Build a minimal mock DocumentExtractionRequest."""
        req = MagicMock()
        req.document_ids = doc_ids
        req.llm_name = "gpt-5-mini"
        req.llm_kwargs = {}
        req.user_schema = {"name": "test", "description": "test", "text": "{}"}
        req.schema_id = None
        req.language = "pl"
        req.extraction_context = "test context"
        req.additional_instructions = None
        req.collection_id = "col-1"
        req.prompt_id = "default"
        return req

    def _build_mock_task(self) -> MagicMock:
        """Build a minimal mock Celery Task (the 'self' argument)."""
        task = MagicMock()
        task.update_state = MagicMock()
        task.request = MagicMock()
        task.request.id = "task-123"
        task.request.retries = 0
        task.max_retries = 2
        return task

    @patch("app.workers._update_job_results_in_supabase", return_value=True)
    @patch("app.workers.InformationExtractor")
    @patch("app.workers.prepare_schema_from_db")
    @patch("app.workers.get_documents_by_id")
    @patch("app.workers.get_llm")
    @patch("app.workers.asyncio.new_event_loop")
    def test_single_event_loop_for_multiple_documents(
        self,
        mock_new_event_loop,
        mock_get_llm,
        mock_get_docs,
        mock_prepare_schema,
        mock_extractor_cls,
        mock_update_supabase,
    ):
        """The task must create exactly ONE event loop even when processing
        multiple documents."""
        # --- Arrange ---
        doc_ids = ["doc-1", "doc-2", "doc-3"]
        request = self._build_mock_request(doc_ids)
        task = self._build_mock_task()

        # Mock the event loop
        mock_loop = MagicMock()
        mock_new_event_loop.return_value = mock_loop

        # Mock documents returned by get_documents_by_id
        mock_docs = []
        for did in doc_ids:
            doc = SimpleNamespace(document_id=did, full_text=f"text for {did}")
            mock_docs.append(doc)
        mock_loop.run_until_complete.side_effect = [
            # First call: get_documents_by_id
            mock_docs,
            # Subsequent calls: extractor.extract_information_with_structured_output
            {"field": "value1"},
            {"field": "value2"},
            {"field": "value3"},
        ]

        # Mock LLM
        mock_llm = MagicMock()
        mock_llm.model_name = "gpt-5-mini"
        mock_get_llm.return_value = mock_llm

        # Mock schema preparation
        mock_prepare_schema.return_value = {"type": "object"}

        # Mock extractor
        mock_extractor = MagicMock()
        mock_extractor.extract_information_with_structured_output = AsyncMock()
        mock_extractor_cls.return_value = mock_extractor
        mock_extractor_cls.get_additional_instructions.return_value = "instructions"

        # --- Act ---
        from app.workers import extract_information_from_documents_task

        # Access the raw function past Celery's pydantic wrapper
        raw_fn = extract_information_from_documents_task.__wrapped__.__wrapped__
        result = raw_fn(task, request)

        # --- Assert ---
        # Exactly one event loop created
        mock_new_event_loop.assert_called_once()

        # Loop used for get_documents + 3 extractions = 4 calls total
        assert mock_loop.run_until_complete.call_count == 4

        # Loop closed exactly once
        mock_loop.close.assert_called_once()

        # All documents processed successfully
        assert len(result) == 3

    @patch("app.workers._update_job_results_in_supabase", return_value=True)
    @patch("app.workers.InformationExtractor")
    @patch("app.workers.prepare_schema_from_db")
    @patch("app.workers.get_documents_by_id")
    @patch("app.workers.get_llm")
    @patch("app.workers.asyncio.new_event_loop")
    def test_event_loop_closed_on_exception(
        self,
        mock_new_event_loop,
        mock_get_llm,
        mock_get_docs,
        mock_prepare_schema,
        mock_extractor_cls,
        mock_update_supabase,
    ):
        """The event loop must be closed even when the task raises an
        exception (e.g., schema validation failure)."""
        # --- Arrange ---
        request = self._build_mock_request(["doc-1"])
        task = self._build_mock_task()

        mock_loop = MagicMock()
        mock_new_event_loop.return_value = mock_loop

        # Documents fetched successfully
        mock_doc = SimpleNamespace(document_id="doc-1", full_text="text")
        mock_loop.run_until_complete.return_value = [mock_doc]

        # LLM initialises fine
        mock_llm = MagicMock()
        mock_llm.model_name = "gpt-5-mini"
        mock_get_llm.return_value = mock_llm

        # Schema preparation fails
        mock_prepare_schema.side_effect = ValueError("bad schema")

        # --- Act ---
        from app.workers import extract_information_from_documents_task

        # The task catches generic exceptions and returns failed results
        raw_fn = extract_information_from_documents_task.__wrapped__.__wrapped__
        raw_fn(task, request)

        # --- Assert ---
        mock_new_event_loop.assert_called_once()
        mock_loop.close.assert_called_once()

    @patch("app.workers._update_job_results_in_supabase", return_value=True)
    @patch("app.workers.InformationExtractor")
    @patch("app.workers.prepare_schema_from_db")
    @patch("app.workers.get_documents_by_id")
    @patch("app.workers.get_llm")
    @patch("app.workers.asyncio.new_event_loop")
    def test_single_event_loop_for_single_document(
        self,
        mock_new_event_loop,
        mock_get_llm,
        mock_get_docs,
        mock_prepare_schema,
        mock_extractor_cls,
        mock_update_supabase,
    ):
        """Even a single-document task must use exactly one event loop
        (not asyncio.run)."""
        # --- Arrange ---
        request = self._build_mock_request(["doc-1"])
        task = self._build_mock_task()

        mock_loop = MagicMock()
        mock_new_event_loop.return_value = mock_loop

        mock_doc = SimpleNamespace(document_id="doc-1", full_text="text")
        mock_loop.run_until_complete.side_effect = [
            [mock_doc],  # get_documents_by_id
            {"extracted": "data"},  # extraction
        ]

        mock_llm = MagicMock()
        mock_llm.model_name = "gpt-5-mini"
        mock_get_llm.return_value = mock_llm

        mock_prepare_schema.return_value = {"type": "object"}

        mock_extractor = MagicMock()
        mock_extractor_cls.return_value = mock_extractor
        mock_extractor_cls.get_additional_instructions.return_value = "instructions"

        # --- Act ---
        from app.workers import extract_information_from_documents_task

        # Access the raw function past Celery's pydantic wrapper
        raw_fn = extract_information_from_documents_task.__wrapped__.__wrapped__
        result = raw_fn(task, request)

        # --- Assert ---
        mock_new_event_loop.assert_called_once()
        # get_documents + 1 extraction = 2 calls
        assert mock_loop.run_until_complete.call_count == 2
        mock_loop.close.assert_called_once()
        assert len(result) == 1
