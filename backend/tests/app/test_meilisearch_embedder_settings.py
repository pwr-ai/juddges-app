"""Regression tests for the bge-m3 embedder settings + setup guard (issue #200).

Hybrid search 400s with ``invalid_search_embedder`` unless the ``bge-m3``
embedder is both declared in ``MEILISEARCH_INDEX_SETTINGS`` *and* actually
registered on the live index. These tests lock the declaration in place and
exercise the post-apply verification guard that surfaces a silent gap.
"""

from unittest.mock import AsyncMock

import pytest

from app.services.meilisearch_config import (
    MEILISEARCH_INDEX_SETTINGS,
    setup_meilisearch_index,
    verify_embedder_registered,
)
from app.services.meilisearch_embeddings import EMBEDDER_DIMENSIONS, EMBEDDER_NAME


@pytest.mark.unit
def test_index_settings_declare_bge_m3_embedder():
    """The index settings must declare the userProvided bge-m3 embedder."""
    embedders = MEILISEARCH_INDEX_SETTINGS.get("embedders")
    assert embedders, "embedders block missing from MEILISEARCH_INDEX_SETTINGS"
    assert EMBEDDER_NAME in embedders, f"{EMBEDDER_NAME} embedder not declared"

    spec = embedders[EMBEDDER_NAME]
    assert spec["source"] == "userProvided"
    # Dimensions must match what the pipeline ships (single source of truth).
    assert spec["dimensions"] == EMBEDDER_DIMENSIONS


@pytest.mark.unit
def test_embedder_name_is_bge_m3():
    """Guard the hardcoded payload name in services/search.py against drift."""
    assert EMBEDDER_NAME == "bge-m3"
    assert EMBEDDER_DIMENSIONS == 1024


def _service_with_embedders(registered: dict) -> AsyncMock:
    svc = AsyncMock()
    svc.admin_configured = True
    svc.index_name = "judgments"
    svc.get_settings_embedders.return_value = registered
    return svc


@pytest.mark.unit
@pytest.mark.asyncio
async def test_verify_embedder_registered_true_when_present():
    svc = _service_with_embedders(
        {EMBEDDER_NAME: {"source": "userProvided", "dimensions": 1024}}
    )
    assert await verify_embedder_registered(svc) is True


@pytest.mark.unit
@pytest.mark.asyncio
async def test_verify_embedder_registered_false_when_absent():
    svc = _service_with_embedders({})
    assert await verify_embedder_registered(svc) is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_verify_embedder_registered_false_when_admin_missing():
    svc = AsyncMock()
    svc.admin_configured = False
    assert await verify_embedder_registered(svc) is False
    svc.get_settings_embedders.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_verify_embedder_registered_false_on_read_error():
    svc = AsyncMock()
    svc.admin_configured = True
    svc.get_settings_embedders.side_effect = RuntimeError("meili unreachable")
    assert await verify_embedder_registered(svc) is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_setup_applies_and_verifies_embedder():
    """Happy path: setup PATCHes embedders then reads them back as registered."""
    svc = AsyncMock()
    svc.admin_configured = True
    svc.index_name = "judgments"
    svc.index_exists.return_value = True
    svc.configure_index.return_value = {"taskUid": 1}
    svc.update_settings_embedders.return_value = {"taskUid": 2}
    svc.wait_for_task.return_value = {"status": "succeeded"}
    svc.get_settings_embedders.return_value = {
        EMBEDDER_NAME: {"source": "userProvided", "dimensions": 1024}
    }

    result = await setup_meilisearch_index(svc)

    assert result is True
    svc.update_settings_embedders.assert_awaited_once()
    # The embedder block PATCHed must be the declared one.
    sent = svc.update_settings_embedders.await_args.args[0]
    assert EMBEDDER_NAME in sent
    # Verification readback happened.
    svc.get_settings_embedders.assert_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_setup_still_succeeds_but_flags_missing_embedder(caplog):
    """If the embedder never lands, setup still returns True (safe settings
    applied) but the verification readback reports it missing so the gap is
    not silent — this is the core issue #200 guard."""
    svc = AsyncMock()
    svc.admin_configured = True
    svc.index_name = "judgments"
    svc.index_exists.return_value = True
    svc.configure_index.return_value = {"taskUid": 1}
    svc.update_settings_embedders.return_value = {"taskUid": 2}
    # Safe settings succeed; embedders task does not.
    svc.wait_for_task.side_effect = [
        {"status": "succeeded"},
        {"status": "failed", "error": "boom"},
    ]
    svc.get_settings_embedders.return_value = {}  # nothing registered

    result = await setup_meilisearch_index(svc)

    assert result is True  # safe settings still applied
    svc.get_settings_embedders.assert_awaited()
