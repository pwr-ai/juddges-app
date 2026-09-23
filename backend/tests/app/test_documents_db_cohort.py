"""Unit tests for the precedents-cohort lookups on SupabaseVectorDB (#724).

The Supabase client is a MagicMock: these tests pin the column projection and
the filter calls, which is what the cohort's payload size depends on.
"""

from typing import Any
from unittest.mock import MagicMock

import pytest
from juddges_search.db.documents_db import (
    _JUDGMENT_COHORT_COLS,
    SupabaseVectorDB,
)

UUID_A = "11111111-1111-1111-1111-111111111111"
UUID_B = "22222222-2222-2222-2222-222222222222"


def _db_with_rows(rows: list[dict[str, Any]]) -> tuple[SupabaseVectorDB, MagicMock]:
    """A SupabaseVectorDB whose client returns `rows`, without touching env vars."""
    db = SupabaseVectorDB.__new__(SupabaseVectorDB)
    client = MagicMock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=rows
    )
    client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=rows
    )
    db.client = client
    return db, client


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_projection_excludes_full_text() -> None:
    db, client = _db_with_rows([{"id": UUID_A, "case_number": "III CSK 245/22"}])

    await db.get_cohort_fields_by_ids([UUID_A])

    client.table.assert_called_with("judgments")
    client.table.return_value.select.assert_called_with(_JUDGMENT_COHORT_COLS)
    assert "full_text" not in _JUDGMENT_COHORT_COLS
    assert "embedding" not in _JUDGMENT_COHORT_COLS
    for column in (
        "base_appeal_outcome",
        "base_sentences_received",
        "base_convict_offences",
    ):
        assert column in _JUDGMENT_COHORT_COLS


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_is_one_round_trip_and_dedupes() -> None:
    rows = [
        {"id": UUID_A, "case_number": "III CSK 245/22"},
        {"id": UUID_B, "case_number": "[2023] EWCA Civ 1234"},
        {"id": UUID_A, "case_number": "III CSK 245/22"},
    ]
    db, client = _db_with_rows(rows)

    result = await db.get_cohort_fields_by_ids([UUID_A, UUID_B, UUID_A])

    assert [row["id"] for row in result] == [UUID_A, UUID_B]
    assert client.table.return_value.select.return_value.in_.call_count == 1
    client.table.return_value.select.return_value.in_.assert_called_with(
        "id", [UUID_A, UUID_B, UUID_A]
    )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_skips_non_uuid_ids_and_empty_input() -> None:
    db, client = _db_with_rows([])

    assert await db.get_cohort_fields_by_ids([]) == []
    assert await db.get_cohort_fields_by_ids(["not-a-uuid"]) == []
    client.table.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_propagates_unexpected_client_error() -> None:
    db = SupabaseVectorDB.__new__(SupabaseVectorDB)
    client = MagicMock()
    client.table.side_effect = RuntimeError("boom")
    db.client = client

    with pytest.raises(RuntimeError):
        await db.get_cohort_fields_by_ids([UUID_A])


@pytest.mark.asyncio
@pytest.mark.unit
async def test_case_number_lookup_returns_first_row() -> None:
    db, client = _db_with_rows(
        [{"id": UUID_A, "case_number": "III CSK 245/22", "title": "T"}]
    )

    row = await db.get_document_by_case_number("III CSK 245/22")

    assert row is not None and row["id"] == UUID_A
    client.table.return_value.select.return_value.eq.assert_called_with(
        "case_number", "III CSK 245/22"
    )
    client.table.return_value.select.return_value.eq.return_value.limit.assert_called_with(
        1
    )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_case_number_lookup_returns_none_when_missing() -> None:
    db, _ = _db_with_rows([])

    assert await db.get_document_by_case_number("III CSK 999/99") is None
