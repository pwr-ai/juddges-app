"""One definition of "empty" and "completed" for extraction results (Foundation).

Used by the research-flow summary (field completeness), the dataset export and
the PL/UK schema tally — three consumers that previously carried three copies.
"""

from __future__ import annotations

import pytest

from app.extraction_domain.completeness import (
    COMPLETED_STATUSES,
    EMPTY_MARKERS,
    completed_rows,
    coverage_ratio,
    flatten,
    is_empty_value,
)

pytestmark = pytest.mark.unit


def test_completed_statuses_are_the_three_worker_values():
    assert {"completed", "success", "partially_completed"} == COMPLETED_STATUSES


@pytest.mark.parametrize(
    "value", ["", "  ", "N/A", "Not Available", "brak danych", "UNKNOWN", None, [], {}]
)
def test_empty_markers(value):
    assert is_empty_value(value)


@pytest.mark.parametrize(
    "value", [0, False, "0", ["x"], {"a": 1}, "Nie dotyczy sprawy", "gender_unknown"]
)
def test_non_empty_values(value):
    assert not is_empty_value(value)


def test_markers_are_lowercase_and_stripped_so_matching_is_exact():
    assert all(m == m.strip().lower() for m in EMPTY_MARKERS)


def test_flatten_uses_dotted_keys_and_keeps_empty_dicts_as_values():
    assert flatten({"a": 1, "b": {"c": "x", "d": {"e": None}}, "f": {}}) == {
        "a": 1,
        "b.c": "x",
        "b.d.e": None,
        "f": {},
    }


def test_completed_rows_is_case_insensitive_and_skips_failed():
    rows = [
        {"status": "completed"},
        {"status": "SUCCESS"},
        {"status": "failed"},
        {"status": None},
        {},
    ]
    assert completed_rows(rows) == [{"status": "completed"}, {"status": "SUCCESS"}]


def test_coverage_ratio():
    assert coverage_ratio(0, 0) is None
    assert coverage_ratio(3, 4) == 0.75
    assert coverage_ratio(153, 200) == 0.765
    assert coverage_ratio(2, 3) == 0.6667
