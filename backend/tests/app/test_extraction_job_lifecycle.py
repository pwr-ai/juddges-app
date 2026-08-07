"""Lifecycle guarantees for extraction jobs (#437).

The failure modes covered here are all invisible in a happy-path run: a row
written after the task was queued, a double-click billing the LLM twice, a job
left at STARTED because its worker was killed, and a cancellation that never
reaches the running task.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.count = len(data) if isinstance(data, list) else None


class _Query:
    """Chainable stand-in for the PostgREST builder.

    Records the operation it was built from so tests can assert on the shape of
    the call rather than on a nest of MagicMock attributes.
    """

    def __init__(self, recorder: FakeSupabase, table: str, op: str, payload: Any):
        self._recorder = recorder
        self._table = table
        self._op = op
        self._payload = payload
        self._filters: dict[str, Any] = {}

    def select(self, *args, **kwargs):
        self._op = "select"
        self._payload = args[0] if args else None
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def in_(self, column, values):
        self._filters[column] = values
        return self

    def lt(self, column, value):
        self._filters[f"{column}__lt"] = value
        return self

    def limit(self, _n):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a):
        return self

    def single(self):
        return self

    def execute(self):
        self._recorder.calls.append(
            {
                "table": self._table,
                "op": self._op,
                "payload": self._payload,
                "filters": self._filters,
            }
        )
        return _Result(self._recorder.next_result(self._op))


class FakeSupabase:
    """Minimal Supabase double that records every executed operation in order."""

    def __init__(self, results: dict[str, list[Any]] | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self._results = {k: list(v) for k, v in (results or {}).items()}

    def next_result(self, op: str) -> Any:
        queue = self._results.get(op)
        if queue:
            return queue.pop(0)
        return []

    def table(self, name):
        return _Query(self, name, "table", None)

    def ops(self) -> list[str]:
        return [c["op"] for c in self.calls]

    def first(self, op: str) -> dict[str, Any]:
        for call in self.calls:
            if call["op"] == op:
                return call
        raise AssertionError(f"no {op} was executed; got {self.ops()}")


def _request(**overrides):
    from app.models import DocumentExtractionRequest

    payload = {
        "collection_id": "col-1",
        "document_ids": ["doc-2", "doc-1"],
        "extraction_context": "ctx",
        "user_schema": {"name": "n", "description": "d", "text": "t"},
        "prompt_id": "info_extraction",
        "language": "pl",
    }
    payload.update(overrides)
    return DocumentExtractionRequest(**payload)


# --------------------------------------------------------------------------
# Ordering: the row must exist before the message does
# --------------------------------------------------------------------------


@pytest.mark.unit
def test_job_row_is_inserted_before_the_task_is_enqueued(monkeypatch):
    """The worker writes progress from its first document, so the row must
    already be there. Enqueueing first is a race the worker wins."""
    from app.extraction_domain import shared

    fake = FakeSupabase()
    monkeypatch.setattr(shared, "supabase", fake)

    order: list[str] = []
    original_execute = _Query.execute

    def tracking_execute(self):
        if self._op == "insert":
            order.append("insert")
        return original_execute(self)

    monkeypatch.setattr(_Query, "execute", tracking_execute)
    monkeypatch.setattr(
        shared.extract_information_from_documents_task,
        "apply_async",
        lambda *a, **k: order.append("enqueue"),
    )

    job_id = shared._submit_extraction_task(_request(), user_id="user-1")

    assert order == ["insert", "enqueue"], (
        "the tracking row must be committed before the broker can hand the task "
        f"to a worker; got {order}"
    )
    insert = fake.first("insert")
    assert insert["payload"]["job_id"] == job_id
    assert insert["payload"]["status"] == "PENDING"
    assert insert["payload"]["total_documents"] == 2


@pytest.mark.unit
def test_enqueued_task_id_matches_the_persisted_row(monkeypatch):
    """The row and the Celery task must share an id, or status polling looks up
    a job that does not exist."""
    from app.extraction_domain import shared

    fake = FakeSupabase()
    monkeypatch.setattr(shared, "supabase", fake)

    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        shared.extract_information_from_documents_task,
        "apply_async",
        lambda *a, **k: captured.update(k),
    )

    job_id = shared._submit_extraction_task(_request(), user_id="user-1")

    assert captured["task_id"] == job_id
    assert fake.first("insert")["payload"]["job_id"] == job_id


@pytest.mark.unit
def test_failed_enqueue_does_not_leave_a_pending_row(monkeypatch):
    """A row stuck at PENDING with no message behind it is indistinguishable
    from a job legitimately waiting for a worker."""
    from celery import exceptions as celery_exceptions
    from fastapi import HTTPException

    from app.extraction_domain import shared

    fake = FakeSupabase()
    monkeypatch.setattr(shared, "supabase", fake)

    def broker_down(*_a, **_k):
        raise celery_exceptions.OperationalError("broker unreachable")

    monkeypatch.setattr(
        shared.extract_information_from_documents_task, "apply_async", broker_down
    )

    with pytest.raises(HTTPException) as exc:
        shared._submit_extraction_task(_request(), user_id="user-1")

    assert exc.value.status_code == 503
    cleanup = fake.first("update")
    assert cleanup["payload"]["status"] == "FAILURE"
    assert "unavailable" in cleanup["payload"]["error_message"].lower()


# --------------------------------------------------------------------------
# Idempotency
# --------------------------------------------------------------------------


@pytest.mark.unit
def test_identical_resubmit_reuses_the_inflight_job(monkeypatch):
    """A double-clicked submit must not pay for the same extraction twice."""
    from app.extraction_domain import shared

    fake = FakeSupabase(results={"select": [[{"job_id": "already-running"}]]})
    monkeypatch.setattr(shared, "supabase", fake)

    enqueued: list[Any] = []
    monkeypatch.setattr(
        shared.extract_information_from_documents_task,
        "apply_async",
        lambda *a, **k: enqueued.append(k),
    )

    job_id = shared._submit_extraction_task(_request(), user_id="user-1")

    assert job_id == "already-running"
    assert enqueued == [], "no second task may be queued for an in-flight job"
    assert "insert" not in fake.ops()


@pytest.mark.unit
def test_idempotency_key_ignores_document_order():
    """The same documents in a different order is the same work."""
    from app.extraction_domain.shared import build_idempotency_key

    assert build_idempotency_key(
        _request(document_ids=["a", "b", "c"])
    ) == build_idempotency_key(_request(document_ids=["c", "a", "b"]))


@pytest.mark.unit
def test_idempotency_key_separates_different_work():
    """A different schema or document set is a different job."""
    from app.extraction_domain.shared import build_idempotency_key

    base = build_idempotency_key(_request())
    assert base != build_idempotency_key(_request(document_ids=["doc-1"]))
    assert base != build_idempotency_key(
        _request(user_schema={"name": "other", "description": "d", "text": "t2"})
    )
    assert base != build_idempotency_key(_request(language="en"))


# --------------------------------------------------------------------------
# Worker claim, heartbeat, cooperative cancel
# --------------------------------------------------------------------------


@pytest.mark.unit
def test_claim_marks_started_and_counts_attempts(monkeypatch):
    """A redelivered job is only visible through the attempt counter."""
    from app import workers

    fake = FakeSupabase(results={"select": [[{"attempts": 2}]]})
    monkeypatch.setattr(workers, "supabase_client", fake)

    workers._claim_job("job-1", total_documents=5)

    update = fake.first("update")
    assert update["payload"]["status"] == "STARTED"
    assert update["payload"]["attempts"] == 3, "attempt count must increment"
    assert update["payload"]["total_documents"] == 5
    assert update["payload"]["heartbeat_at"]


@pytest.mark.unit
def test_progress_write_advances_the_heartbeat(monkeypatch):
    """The reaper needs a timestamp only the worker writes."""
    from app import workers

    fake = FakeSupabase(results={"update": [[{"job_id": "job-1"}]]})
    monkeypatch.setattr(workers, "supabase_client", fake)

    workers._update_job_results_in_supabase(
        job_id="job-1", results=[{"status": "completed"}], completed_documents=1
    )

    payload = fake.first("update")["payload"]
    assert payload["heartbeat_at"]
    assert payload["status"] == "STARTED"
    assert "completed_at" not in payload, "a mid-run write must not look terminal"


@pytest.mark.unit
def test_terminal_write_stamps_completion(monkeypatch):
    """A terminal row without completed_at still reads as running."""
    from app import workers

    fake = FakeSupabase(results={"update": [[{"job_id": "job-1"}]]})
    monkeypatch.setattr(workers, "supabase_client", fake)

    workers._update_job_results_in_supabase(
        job_id="job-1",
        results=[],
        completed_documents=0,
        status="FAILURE",
        error_message="boom",
    )

    payload = fake.first("update")["payload"]
    assert payload["completed_at"]
    assert payload["error_message"] == "boom"


@pytest.mark.unit
@pytest.mark.parametrize(
    ("row", "expected"),
    [
        ([{"cancel_requested_at": "2026-08-07T10:00:00+00:00"}], True),
        ([{"cancel_requested_at": None}], False),
        ([], False),
    ],
)
def test_cancellation_flag_is_read_from_the_job_row(monkeypatch, row, expected):
    from app import workers

    fake = FakeSupabase(results={"select": [row]})
    monkeypatch.setattr(workers, "supabase_client", fake)

    assert workers._cancellation_requested("job-1") is expected


@pytest.mark.unit
def test_unreadable_cancel_flag_does_not_abort_the_job(monkeypatch):
    """A database blip must not kill a job that is minutes into real work."""
    from app import workers

    class Exploding(FakeSupabase):
        def table(self, name):
            raise RuntimeError("connection reset")

    monkeypatch.setattr(workers, "supabase_client", Exploding())

    assert workers._cancellation_requested("job-1") is False


@pytest.mark.unit
def test_running_task_stops_at_a_document_boundary_when_cancelled(
    monkeypatch, celery_eager
):
    """Cancellation keeps the documents already extracted.

    The alternative — SIGTERM on the prefork child — discards the in-flight
    document and, under task_acks_late, has the whole job redelivered.
    """
    from unittest.mock import MagicMock

    from app import workers
    from app.models import DocumentExtractionRequest

    # These names are patched on `app.workers`, not on their defining modules:
    # workers.py imports them with `from ... import x`, so it holds its own
    # reference and patching the source module has no effect on the task body.
    def _docs(ids):
        return _completed(
            [
                type("Doc", (), {"full_text": "text", "document_id": doc_id})()
                for doc_id in ids
            ]
        )

    monkeypatch.setattr(workers, "get_documents_by_id", _docs)
    monkeypatch.setattr(workers, "get_llm", MagicMock())
    monkeypatch.setattr(workers, "prepare_schema_from_db", MagicMock())
    extractor = MagicMock()
    extractor.extract_information_with_structured_output.side_effect = (
        lambda *_a, **_k: _completed({"case_number": "AB-1/2026"})
    )
    monkeypatch.setattr(
        workers, "InformationExtractor", MagicMock(return_value=extractor)
    )
    monkeypatch.setattr(workers, "supabase_client", FakeSupabase())
    # Cancelled from the very first check, i.e. after document 1 of 3.
    monkeypatch.setattr(workers, "_cancellation_requested", lambda _job_id: True)

    terminal_writes: list[dict[str, Any]] = []
    monkeypatch.setattr(
        workers,
        "_update_job_results_in_supabase",
        lambda **kw: terminal_writes.append(kw) or True,
    )

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
    assert len(outcome.result) == 1, "must stop after the first document, not finish"
    final = terminal_writes[-1]
    assert final["status"] == "FAILURE"
    assert "cancelled by user" in final["error_message"].lower()
    assert final["completed_documents"] == 1, "partial progress must be preserved"


def _completed(value):
    """Wrap a value in an already-finished awaitable for run_until_complete."""

    async def _coro():
        return value

    return _coro()


# --------------------------------------------------------------------------
# Stale job reaper
# --------------------------------------------------------------------------


@pytest.mark.unit
def test_reaper_fails_jobs_whose_worker_stopped_reporting(monkeypatch):
    """An unpolled job with a dead worker used to sit at STARTED forever."""
    from app.tasks import maintenance

    fake = FakeSupabase(
        results={
            "select": [
                [
                    {
                        "job_id": "dead-job",
                        "completed_documents": 4,
                        "total_documents": 10,
                        "attempts": 2,
                    }
                ]
            ]
        }
    )
    monkeypatch.setattr("app.core.supabase.supabase_client", fake)

    outcome = maintenance.reap_stale_extraction_jobs.apply().result

    assert outcome["status"] == "completed"
    assert outcome["job_ids"] == ["dead-job"]

    scan = fake.first("select")
    assert scan["filters"]["status"] == "STARTED"
    cutoff = datetime.fromisoformat(scan["filters"]["heartbeat_at__lt"])
    assert cutoff < datetime.now(UTC) - timedelta(
        seconds=maintenance.STALE_JOB_THRESHOLD_SECONDS - 60
    ), "the scan must only consider jobs silent for longer than the threshold"

    update = fake.first("update")
    assert update["payload"]["status"] == "FAILURE"
    assert "4 of 10" in update["payload"]["error_message"]
    # Re-checking the status in the WHERE clause keeps the reaper from
    # overwriting a job that finished between the scan and the write.
    assert update["filters"]["status"] == "STARTED"


@pytest.mark.unit
def test_reaper_leaves_healthy_jobs_alone(monkeypatch):
    from app.tasks import maintenance

    fake = FakeSupabase(results={"select": [[]]})
    monkeypatch.setattr("app.core.supabase.supabase_client", fake)

    outcome = maintenance.reap_stale_extraction_jobs.apply().result

    assert outcome == {"status": "completed", "reaped": 0, "job_ids": []}
    assert "update" not in fake.ops()


@pytest.mark.unit
def test_reaper_is_scheduled() -> None:
    """A reaper nobody runs is not a reaper."""
    from app.workers import celery_app

    tasks = {e["task"] for e in celery_app.conf.beat_schedule.values()}
    assert "maintenance.reap_stale_extraction_jobs" in tasks
