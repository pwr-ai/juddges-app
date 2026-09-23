"""Cohort assembly for the precedents endpoint (#724, spec §7.1)."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.precedents import (
    COHORT_MATCH_COUNT,
    FindPrecedentsResponse,
    PrecedentCohortItem,
    _build_cohort,
    _empty_precedents_response,
)

UUID_A = "11111111-1111-1111-1111-111111111111"
UUID_B = "22222222-2222-2222-2222-222222222222"

SIMILAR_RESULTS: list[dict[str, Any]] = [
    {"document_id": UUID_A, "similarity": 0.81},
    {"document_id": UUID_B, "similarity": 0.62},
]

COHORT_ROWS: list[dict[str, Any]] = [
    {
        "id": UUID_B,
        "case_number": "[2023] EWCA Civ 1234",
        "title": "R v B",
        "jurisdiction": "UK",
        "court_name": "Court of Appeal",
        "decision_date": "2023-04-02",
        "base_appeal_outcome": ["outcome_appeal_dismissed"],
        "base_sentences_received": None,
        "base_convict_offences": ["theft", "burglary"],
    },
    {
        "id": UUID_A,
        "case_number": "III CSK 245/22",
        "title": "A v B",
        "jurisdiction": "PL",
        "court_name": "Sąd Najwyższy",
        "decision_date": "2022-11-15",
        "base_appeal_outcome": [],
        "base_sentences_received": ["2 years"],
        "base_convict_offences": None,
    },
]


def _db_with_cohort(rows: list[dict[str, Any]]) -> MagicMock:
    db = MagicMock()
    db.get_cohort_fields_by_ids = AsyncMock(return_value=rows)
    return db


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_preserves_similarity_order_not_row_order() -> None:
    cohort = await _build_cohort(_db_with_cohort(COHORT_ROWS), SIMILAR_RESULTS)

    assert [item.document_id for item in cohort] == [UUID_A, UUID_B]
    assert cohort[0].similarity_score == pytest.approx(0.81)
    assert cohort[1].similarity_score == pytest.approx(0.62)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_maps_base_columns_to_unprefixed_names() -> None:
    cohort = await _build_cohort(_db_with_cohort(COHORT_ROWS), SIMILAR_RESULTS)

    assert cohort[0].sentences_received == ["2 years"]
    assert cohort[0].appeal_outcome == []
    assert cohort[0].convict_offences == []  # NULL becomes an empty list
    assert cohort[1].appeal_outcome == ["outcome_appeal_dismissed"]
    assert cohort[1].case_number == "[2023] EWCA Civ 1234"
    assert cohort[1].court_name == "Court of Appeal"
    assert cohort[1].decision_date == "2023-04-02"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_drops_candidates_without_a_row() -> None:
    cohort = await _build_cohort(_db_with_cohort([COHORT_ROWS[1]]), SIMILAR_RESULTS)

    assert [item.document_id for item in cohort] == [UUID_A]


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cohort_of_no_candidates_makes_no_db_call() -> None:
    db = _db_with_cohort(COHORT_ROWS)

    assert await _build_cohort(db, []) == []
    db.get_cohort_fields_by_ids.assert_not_called()


@pytest.mark.unit
def test_cohort_match_count_is_one_hundred() -> None:
    assert COHORT_MATCH_COUNT == 100


@pytest.mark.unit
def test_empty_response_carries_an_empty_cohort() -> None:
    response = _empty_precedents_response("q", None)

    assert isinstance(response, FindPrecedentsResponse)
    assert response.cohort == []


@pytest.mark.unit
def test_cohort_item_defaults_missing_arrays_to_empty() -> None:
    item = PrecedentCohortItem(document_id=UUID_A, similarity_score=0.5)

    assert item.appeal_outcome == []
    assert item.sentences_received == []
    assert item.convict_offences == []
    assert item.case_number is None
