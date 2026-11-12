"""Precedents `court_names` / `legal_bases` filters against real vector rows (#734).

The rows here come out of the real `SupabaseVectorDB.search_by_vector` mapping
(with a mocked RPC), not hand-built dicts: the bug was that those rows never
carry `court_name` or `legal_bases`, so filtering them matched nothing.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from juddges_search.db.documents_db import (
    _JUDGMENT_FILTER_COLS,
    SupabaseVectorDB,
)

from app.precedents import PrecedentFilters, _apply_filters, _attach_filter_fields

UUID_A = "11111111-1111-1111-1111-111111111111"
UUID_B = "22222222-2222-2222-2222-222222222222"

RPC_ROWS: list[dict[str, Any]] = [
    {
        "id": UUID_A,
        "case_number": "III CSK 245/22",
        "title": "A v B",
        "summary": "s",
        "jurisdiction": "PL",
        "decision_date": "2022-11-15",
        "similarity": 0.81,
    },
    {
        "id": UUID_B,
        "case_number": "[2023] EWCA Civ 1234",
        "title": "R v B",
        "summary": "s",
        "jurisdiction": "UK",
        "decision_date": "2023-04-02",
        "similarity": 0.62,
    },
]

FILTER_ROWS: list[dict[str, Any]] = [
    {"id": UUID_A, "court_name": "Sąd Najwyższy", "cited_legislation": ["Art. 415 KC"]},
    {"id": UUID_B, "court_name": "Court of Appeal", "cited_legislation": None},
]


def _db() -> SupabaseVectorDB:
    db = SupabaseVectorDB.__new__(SupabaseVectorDB)
    client = MagicMock()
    client.rpc.return_value.execute.return_value = MagicMock(data=RPC_ROWS)
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=FILTER_ROWS
    )
    db.client = client
    return db


async def _filter(
    db: SupabaseVectorDB, filters: PrecedentFilters
) -> list[dict[str, Any]]:
    rows = await db.search_by_vector(query_embedding=[0.1])
    rows = await _attach_filter_fields(db, rows, filters)
    return _apply_filters(rows, filters)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_vector_rows_alone_lack_filter_keys() -> None:
    """Pins the precondition: the RPC mapping never carries these keys."""
    rows = await _db().search_by_vector(query_embedding=[0.1])
    assert all("court_name" not in r and "legal_bases" not in r for r in rows)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_court_names_filter_matches_real_data() -> None:
    result = await _filter(_db(), PrecedentFilters(court_names=["court of appeal"]))
    assert [r["document_id"] for r in result] == [UUID_B]


@pytest.mark.asyncio
@pytest.mark.unit
async def test_legal_bases_filter_matches_cited_legislation() -> None:
    result = await _filter(_db(), PrecedentFilters(legal_bases=["art. 415 kc"]))
    assert [r["document_id"] for r in result] == [UUID_A]


@pytest.mark.asyncio
@pytest.mark.unit
async def test_filter_fetch_is_one_round_trip_with_slim_projection() -> None:
    db = _db()
    await _filter(db, PrecedentFilters(court_names=["Sąd Najwyższy"]))

    db.client.table.return_value.select.assert_called_once_with(_JUDGMENT_FILTER_COLS)
    db.client.table.return_value.select.return_value.in_.assert_called_once_with(
        "id", [UUID_A, UUID_B]
    )
    assert "full_text" not in _JUDGMENT_FILTER_COLS


@pytest.mark.asyncio
@pytest.mark.unit
async def test_no_lookup_when_filters_do_not_need_it() -> None:
    db = MagicMock()
    db.get_filter_fields_by_ids = AsyncMock()
    rows = [{"document_id": UUID_A}]

    assert (
        await _attach_filter_fields(db, rows, PrecedentFilters(language="pl")) is rows
    )
    db.get_filter_fields_by_ids.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_lookup_failure_is_503_not_an_empty_result() -> None:
    db = MagicMock()
    db.get_filter_fields_by_ids = AsyncMock(side_effect=RuntimeError("boom"))

    with pytest.raises(HTTPException) as exc:
        await _attach_filter_fields(
            db, [{"document_id": UUID_A}], PrecedentFilters(court_names=["x"])
        )
    assert exc.value.status_code == 503
