"""Unit tests for the suggestions index rebuild swap step."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.tasks import suggestions_index as mod


def _svc(name: str, exists: bool = True) -> MagicMock:
    svc = MagicMock()
    svc.index_name = name
    svc.admin_configured = True
    svc.delete_index = AsyncMock(return_value={"taskUid": 9})
    svc.upsert_documents = AsyncMock(return_value={"taskUid": 1})
    svc.wait_for_task = AsyncMock(return_value={"status": "succeeded"})
    svc.swap_indexes = AsyncMock(return_value={"taskUid": 2})
    svc.index_exists = AsyncMock(return_value=exists)
    svc.create_index = AsyncMock(return_value={"taskUid": 3})
    return svc


@pytest.fixture
def wired(monkeypatch):
    staging = _svc("suggestions_new")
    live = _svc("suggestions", exists=False)
    monkeypatch.setattr(
        mod,
        "_admin_service",
        lambda name: live if name == "suggestions" else staging,
    )
    monkeypatch.setattr(mod, "_live_index_name", lambda: "suggestions")
    monkeypatch.setattr(mod, "supabase_client", object())
    monkeypatch.setattr(mod, "_fetch_corpus_rows", lambda b, m: [{"id": "1"}])
    monkeypatch.setattr(mod, "get_popular_queries", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        mod, "build_suggestion_documents", lambda rows, popular_queries: [{"id": "a"}]
    )
    monkeypatch.setattr(mod, "setup_suggestions_meilisearch_index", AsyncMock())
    return staging, live


async def _run():
    return await mod._rebuild_suggestions_index(
        batch_size=10, max_rows=10, popular_days=7, popular_limit=10
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_missing_live_index_is_created_then_swapped(wired):
    staging, live = wired
    result = await _run()
    live.create_index.assert_awaited_once_with(primary_key="id")
    live.wait_for_task.assert_awaited_once_with(3, max_wait=30.0)
    staging.swap_indexes.assert_awaited_once_with("suggestions", "suggestions_new")
    assert result["status"] == "completed"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_existing_live_index_is_not_created(wired):
    staging, live = wired
    live.index_exists.return_value = True
    result = await _run()
    live.create_index.assert_not_awaited()
    staging.swap_indexes.assert_awaited_once()
    assert result["status"] == "completed"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_exception_returns_failed(wired):
    staging, live = wired
    live.create_index.side_effect = RuntimeError("boom")
    result = await _run()
    assert result == {"status": "failed", "reason": "create_live_index"}
    staging.swap_indexes.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_task_failure_returns_failed(wired):
    staging, live = wired
    live.wait_for_task.return_value = {"status": "failed", "error": {"m": "x"}}
    result = await _run()
    assert result == {"status": "failed", "reason": "create_live_index"}
    staging.swap_indexes.assert_not_awaited()
