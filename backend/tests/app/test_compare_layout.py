"""Coverage/tier policy for the PL-UK comparison (Spec C AC2).

The threshold and hide rules live here, in one place, so the JSON response and
the CSV export cannot disagree. No DB, no HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.compare.layout import (
    LOW_COVERAGE_THRESHOLD,
    build_field,
    coverage_ratio,
    share,
    tier_for,
)
from app.compare.models import CoverageStat

pytestmark = pytest.mark.unit


@dataclass(frozen=True)
class _Spec:
    field: str = "appeal_outcome"
    label: str = "Appeal Outcome"
    kind: str = "enum_array"
    source: str = "base"


def _cov(pl: tuple[int, int], uk: tuple[int, int]) -> dict[str, CoverageStat]:
    return {
        "PL": CoverageStat(covered=pl[0], total=pl[1], ratio=coverage_ratio(*pl)),
        "UK": CoverageStat(covered=uk[0], total=uk[1], ratio=coverage_ratio(*uk)),
    }


def test_threshold_is_eighty_percent():
    assert LOW_COVERAGE_THRESHOLD == 0.80


def test_coverage_ratio_is_none_when_total_is_zero():
    assert coverage_ratio(0, 0) is None
    assert coverage_ratio(3, 4) == 0.75


def test_share_uses_covered_as_denominator():
    assert share(1, 4) == 0.25
    assert share(1, 0) is None


def test_primary_when_both_jurisdictions_at_or_above_threshold():
    assert tier_for(_cov((80, 100), (198, 200))) == ("primary", [])


def test_partial_when_either_jurisdiction_below_threshold():
    assert tier_for(_cov((153, 200), (198, 200))) == ("partial", [])
    assert tier_for(_cov((200, 200), (159, 200))) == ("partial", [])


def test_unavailable_names_the_jurisdiction_with_zero_coverage():
    assert tier_for(_cov((200, 200), (0, 300))) == ("unavailable", ["UK"])
    assert tier_for(_cov((0, 200), (0, 300))) == ("unavailable", ["PL", "UK"])


def test_unavailable_when_a_jurisdiction_matched_nothing():
    assert tier_for(_cov((10, 10), (0, 0))) == ("unavailable", ["UK"])


def test_empty_when_nothing_matched_anywhere():
    assert tier_for(_cov((0, 0), (0, 0))) == ("empty", ["PL", "UK"])


def test_build_field_aligns_values_across_jurisdictions_and_orders_by_total_count():
    field = build_field(
        _Spec(),
        _cov((2, 2), (2, 2)),
        {"PL": {"a": 2}, "UK": {"a": 1, "b": 1}},
    )
    assert [v.value for v in field.values] == ["a", "b"]
    a, b = field.values
    assert a.counts == {"PL": 2, "UK": 1} and a.shares == {"PL": 1.0, "UK": 0.5}
    assert b.counts == {"PL": 0, "UK": 1} and b.shares == {"PL": 0.0, "UK": 0.5}
    assert field.tier == "primary" and field.missing_in == []


def test_build_field_share_is_none_where_nothing_is_covered():
    field = build_field(_Spec(), _cov((0, 5), (1, 1)), {"UK": {"a": 1}})
    assert field.tier == "unavailable" and field.missing_in == ["PL"]
    assert field.values[0].shares == {"PL": None, "UK": 1.0}
