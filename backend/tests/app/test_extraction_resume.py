"""Resume semantics for the extraction task.

An interrupted job must not pay OpenAI twice for work it already finished,
and a failure late in the task must not erase what succeeded before it.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


@pytest.mark.unit
def test_a_late_failure_preserves_completed_results():
    """A failure after some documents succeeded must not overwrite them.

    Regression guard for workers.py:771-797, which built a FAILED entry for
    every requested document and overwrote the whole results column with it.
    """
    from app.workers import _merge_failure_into_results

    already_done = [
        {"document_id": "doc-1", "status": "completed", "extracted_data": {"a": 1}},
        {"document_id": "doc-2", "status": "completed", "extracted_data": {"a": 2}},
    ]
    merged = _merge_failure_into_results(
        existing=already_done,
        document_ids=["doc-1", "doc-2", "doc-3"],
        collection_id="col-1",
        error_message="RuntimeError: llm unavailable",
    )

    by_id = {row["document_id"]: row for row in merged}
    assert by_id["doc-1"]["status"] == "completed"
    assert by_id["doc-1"]["extracted_data"] == {"a": 1}
    assert by_id["doc-2"]["status"] == "completed"
    assert by_id["doc-3"]["status"] == "failed"
    assert by_id["doc-3"]["error_message"] == "RuntimeError: llm unavailable"


@pytest.mark.unit
def test_a_failure_with_nothing_done_marks_everything_failed():
    from app.workers import _merge_failure_into_results

    merged = _merge_failure_into_results(
        existing=[],
        document_ids=["doc-1", "doc-2"],
        collection_id="col-1",
        error_message="RuntimeError: boom",
    )

    assert {row["document_id"] for row in merged} == {"doc-1", "doc-2"}
    assert all(row["status"] == "failed" for row in merged)


@pytest.mark.unit
def test_loader_returns_only_completed_entries(monkeypatch):
    """Failed documents must come back for another attempt, completed ones must not."""
    from app import workers

    stored = [
        {"document_id": "doc-1", "status": "completed", "extracted_data": {"a": 1}},
        {"document_id": "doc-2", "status": "failed", "error_message": "timeout"},
    ]
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"results": stored}]
    )
    monkeypatch.setattr(workers, "supabase_client", supabase)

    completed = workers._load_completed_results("job-1")

    assert [row["document_id"] for row in completed] == ["doc-1"]


@pytest.mark.unit
def test_loader_is_empty_when_the_job_has_no_results(monkeypatch):
    from app import workers

    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"results": None}]
    )
    monkeypatch.setattr(workers, "supabase_client", supabase)

    assert workers._load_completed_results("job-1") == []


@pytest.mark.unit
def test_loader_survives_a_missing_supabase_client(monkeypatch):
    """A resume must degrade to a full run, never crash the task."""
    from app import workers

    monkeypatch.setattr(workers, "supabase_client", None)
    assert workers._load_completed_results("job-1") == []


class _ResumeSupabase:
    """Column-aware Supabase double for the task-level resume test.

    Routes ``select`` by the column requested so the task's several distinct
    reads (attempts, results, cancel_requested_at) each get a sensible answer
    regardless of call order, and every ``update`` succeeds.
    """

    def __init__(self, stored_results: list[dict]) -> None:
        self._stored_results = stored_results
        self._op: str | None = None
        self._col: str | None = None

    def table(self, _name):
        return self

    def select(self, col):
        self._op = "select"
        self._col = col
        return self

    def update(self, _payload):
        self._op = "update"
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._op == "update":
            return MagicMock(data=[{"id": "ok"}])
        if self._col == "results":
            return MagicMock(data=[{"results": self._stored_results}])
        if self._col == "attempts":
            return MagicMock(data=[])
        if self._col == "cancel_requested_at":
            return MagicMock(data=[{"cancel_requested_at": None}])
        return MagicMock(data=[])


def _resolved(value):
    """Wrap a value in an already-finished awaitable for run_until_complete."""

    async def _coro():
        return value

    return _coro()


@pytest.mark.unit
def test_resumed_job_skips_completed_and_retries_failed_documents(
    monkeypatch, celery_eager
):
    """The task that matters most: a redelivered attempt must not re-bill the
    LLM for a document already recorded COMPLETED, but must retry one
    recorded FAILED, since that failure may have been transient.
    """
    from app import workers
    from app.models import DocumentExtractionRequest

    # These names are patched on `app.workers`, not on their defining modules:
    # workers.py imports them with `from ... import x`, so it holds its own
    # reference and patching the source module has no effect on the task body.
    full_text_by_id = {"d1": "text-d1", "d2": "text-d2", "d3": "text-d3"}

    def _docs(ids):
        return _resolved(
            [
                type(
                    "Doc",
                    (),
                    {"full_text": full_text_by_id[doc_id], "document_id": doc_id},
                )()
                for doc_id in ids
            ]
        )

    monkeypatch.setattr(workers, "get_documents_by_id", _docs)
    monkeypatch.setattr(workers, "get_llm", MagicMock())
    monkeypatch.setattr(workers, "prepare_schema_from_db", MagicMock())

    extractor = MagicMock()
    processed_full_texts: list[str] = []

    def _extract(payload):
        processed_full_texts.append(payload["full_text"])
        return _resolved({"case_number": "AB-1/2026"})

    extractor.extract_information_with_structured_output.side_effect = _extract
    monkeypatch.setattr(
        workers, "InformationExtractor", MagicMock(return_value=extractor)
    )

    stored_results = [
        {
            "document_id": "d1",
            "status": "completed",
            "extracted_data": {"case_number": "prior-run"},
        },
        {
            "document_id": "d2",
            "status": "failed",
            "error_message": "timeout",
        },
    ]
    monkeypatch.setattr(workers, "supabase_client", _ResumeSupabase(stored_results))
    monkeypatch.setattr(workers, "_cancellation_requested", lambda _job_id: False)

    request = DocumentExtractionRequest(
        collection_id="col-1",
        document_ids=["d1", "d2", "d3"],
        extraction_context="ctx",
        user_schema={"type": "object", "description": "d", "required": []},
        prompt_id="p",
    )
    outcome = workers.extract_information_from_documents_task.apply(
        kwargs={"request": request}
    )

    assert outcome.successful()
    assert extractor.extract_information_with_structured_output.call_count == 2, (
        "only the two non-completed documents should be re-sent to the LLM "
        "-- asserting the final completed_documents count alone would still "
        "pass if all three had been re-extracted"
    )
    assert processed_full_texts == ["text-d2", "text-d3"], (
        "d1 (completed) must be skipped; d2 (failed) must be retried"
    )

    results_by_id = {row["document_id"]: row for row in outcome.result}
    assert len(outcome.result) == 3
    assert results_by_id["d1"]["extracted_data"] == {"case_number": "prior-run"}, (
        "the completed document's stored result must be carried through unchanged"
    )
    assert results_by_id["d2"]["status"] == "completed", "the retry succeeded"
    assert results_by_id["d3"]["status"] == "completed"


@pytest.mark.unit
def test_malformed_stored_rows_never_crash_the_reader(monkeypatch):
    """A row with no document_id must be dropped, not raise.

    Both callers key this list by document_id and one of them runs inside the
    outer failure handler, where a KeyError would escape a handler that is
    already handling a failure -- the job would die without persisting and
    task_acks_late would redeliver it into an unbounded crash loop.
    """
    from app import workers

    stored = [
        {"document_id": "doc-1", "status": "completed"},
        {"status": "completed"},  # no document_id
        {"document_id": None, "status": "completed"},  # unusable document_id
        "not-a-dict-at-all",
        {"document_id": "doc-2", "status": "failed"},
    ]
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"results": stored}]
    )
    monkeypatch.setattr(workers, "supabase_client", supabase)

    usable = workers._fetch_job_results_from_supabase("job-1")

    assert [row["document_id"] for row in usable] == ["doc-1", "doc-2"]
    assert [row["document_id"] for row in workers._load_completed_results("job-1")] == [
        "doc-1"
    ]


@pytest.mark.unit
def test_merge_survives_malformed_existing_rows():
    """The late-failure merge must not raise on a row lacking document_id."""
    from app.workers import _merge_failure_into_results

    merged = _merge_failure_into_results(
        existing=[
            {"document_id": "doc-1", "status": "completed", "extracted_data": {"a": 1}},
            {"status": "completed"},
            "not-a-dict-at-all",
        ],
        document_ids=["doc-1", "doc-2"],
        collection_id="col-1",
        error_message="worker lost",
    )

    by_id = {row["document_id"]: row for row in merged}
    assert by_id["doc-1"]["status"] == "completed"
    assert by_id["doc-1"]["extracted_data"] == {"a": 1}
    assert by_id["doc-2"]["status"] == "failed"
