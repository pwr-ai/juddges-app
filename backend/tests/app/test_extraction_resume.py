"""Resume semantics for the extraction task.

An interrupted job must not pay OpenAI twice for work it already finished,
and a failure late in the task must not erase what succeeded before it.
"""

from __future__ import annotations

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
