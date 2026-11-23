"""POST /documents/batch must not fetch full_text when the caller asks only for light fields."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.judgments_pkg import get_documents_batch
from app.models import BatchDocumentsRequest

ROW = {
    "id": "11111111-1111-1111-1111-111111111111",
    "title": "Wyrok",
    "case_number": "I C 1/20",
    "summary": "s",
}


def _db(rows=None) -> MagicMock:
    db = MagicMock()
    db.get_documents_by_ids = AsyncMock(
        return_value=rows if rows is not None else [dict(ROW)]
    )
    return db


async def _call(db: MagicMock, **kwargs):
    with patch("app.judgments_pkg.get_vector_db", return_value=db):
        return await get_documents_batch(
            BatchDocumentsRequest(document_ids=[ROW["id"]], **kwargs)
        )


@pytest.mark.anyio
@pytest.mark.unit
async def test_light_return_properties_skip_full_text():
    db = _db()
    resp = await _call(db, return_properties=["document_id", "title", "summary"])

    db.get_documents_by_ids.assert_awaited_once_with(
        [ROW["id"]], include_full_text=False
    )
    assert resp.documents[0].document_id == ROW["id"]
    assert resp.documents[0].title == "Wyrok"


@pytest.mark.anyio
@pytest.mark.unit
async def test_no_return_properties_keeps_full_documents():
    db = _db()
    await _call(db)

    db.get_documents_by_ids.assert_awaited_once_with(
        [ROW["id"]], include_full_text=True
    )


@pytest.mark.anyio
@pytest.mark.unit
async def test_empty_return_properties_keeps_full_documents():
    db = _db()
    await _call(db, return_properties=[])

    db.get_documents_by_ids.assert_awaited_once_with(
        [ROW["id"]], include_full_text=True
    )


@pytest.mark.anyio
@pytest.mark.unit
async def test_return_properties_with_full_text_keeps_full_documents():
    db = _db()
    await _call(db, return_properties=["document_id", "full_text"])

    db.get_documents_by_ids.assert_awaited_once_with(
        [ROW["id"]], include_full_text=True
    )


@pytest.mark.anyio
@pytest.mark.unit
async def test_include_base_fields_needs_full_projection():
    db = _db()
    await _call(db, return_properties=["document_id"], include_base_fields=True)

    db.get_documents_by_ids.assert_awaited_once_with(
        [ROW["id"]], include_full_text=True
    )


@pytest.mark.anyio
@pytest.mark.unit
async def test_return_vectors_needs_full_projection():
    db = _db()
    await _call(db, return_properties=["document_id"], return_vectors=True)

    db.get_documents_by_ids.assert_awaited_once_with(
        [ROW["id"]], include_full_text=True
    )
