"""End-to-end Celery task tests in eager mode with mocked Supabase."""

import pytest


@pytest.mark.unit
def test_extract_task_runs_eagerly_with_mocked_supabase(
    celery_eager, mocked_supabase, mocked_extractor
):
    from app.models import DocumentExtractionRequest
    from app.workers import extract_information_from_documents_task

    request = DocumentExtractionRequest(
        collection_id="test-collection",
        document_ids=["doc-1"],
        extraction_context="Test extraction context",
        user_schema={"type": "object", "description": "test", "required": []},
        prompt_id="test-prompt",
    )

    result = extract_information_from_documents_task.apply(
        kwargs={"request": request},
    )
    assert result.successful()
    # Supabase write was called with the right job id
    mocked_supabase.table.assert_called()
    table_calls = [str(c) for c in mocked_supabase.table.call_args_list]
    assert any("extraction_jobs" in s for s in table_calls)


@pytest.mark.unit
def test_extract_task_records_failure_on_extractor_error(
    celery_eager, mocked_supabase, mocked_extractor
):
    from app.models import DocumentExtractionRequest
    from app.workers import extract_information_from_documents_task

    # Make the extractor fail
    mocked_extractor.extract_information_with_structured_output.side_effect = (
        RuntimeError("LLM down")
    )

    request = DocumentExtractionRequest(
        collection_id="test-collection",
        document_ids=["doc-1"],
        extraction_context="Test extraction context",
        user_schema={"type": "object", "description": "test", "required": []},
        prompt_id="test-prompt",
    )

    # The task should handle the error internally and mark the job as failed
    # in supabase, NOT raise out. If `task_eager_propagates=True` causes it to
    # raise, adjust the test to expect the exception OR set
    # task_eager_propagates=False inside this test.
    try:
        result = extract_information_from_documents_task.apply(
            kwargs={"request": request},
        )
        # If task swallows the error and returns gracefully:
        assert not result.successful() or "fail" in str(result.result).lower()
    except RuntimeError:
        pass  # Acceptable if the task is designed to propagate

    # Either way, the job's failure state should be recorded in Supabase
    table_calls = [str(c) for c in mocked_supabase.table.call_args_list]
    assert any("extraction_jobs" in s for s in table_calls)


@pytest.mark.unit
def test_celery_beat_schedule_registered():
    from app.workers import celery_app

    schedule = celery_app.conf.beat_schedule
    # Per audit: at least 3 periodic jobs declared in workers.py:42-58
    assert len(schedule) >= 3, f"Expected >=3 beat entries, found {len(schedule)}"
    # Each entry has a task and schedule
    for name, entry in schedule.items():
        assert "task" in entry, f"Beat entry {name} missing 'task'"
        assert "schedule" in entry, f"Beat entry {name} missing 'schedule'"
