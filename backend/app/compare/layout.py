"""Coverage ratios, shares and display tiers for the comparison (Spec C AC2).

Single home for the 80 % rule and the 0 %-hide rule. The frontend renders the
`tier`/`missing_in` flags and never re-derives them; the CSV export reads the
same numbers.
"""

from __future__ import annotations

from typing import Protocol

from app.compare.models import CompareField, CompareValue, CoverageStat, Tier
from app.extraction_domain.completeness import coverage_ratio
from app.models import JURISDICTIONS

__all__ = [
    "JURISDICTIONS",
    "LOW_COVERAGE_THRESHOLD",
    "build_field",
    "coverage_ratio",
    "share",
    "tier_for",
]

LOW_COVERAGE_THRESHOLD = 0.80


class FieldSpecLike(Protocol):
    field: str
    label: str
    kind: str
    source: str


def share(count: int, covered: int) -> float | None:
    return None if covered == 0 else round(count / covered, 4)


def tier_for(coverage: dict[str, CoverageStat]) -> tuple[Tier, list[str]]:
    """Classify a field.

    empty       — no judgment matched in any jurisdiction
    unavailable — at least one jurisdiction has covered == 0 (hide chart, say why)
    partial     — every jurisdiction covered, but one is below the threshold (badge)
    primary     — all jurisdictions at or above the threshold
    """
    stats = [
        coverage.get(j, CoverageStat(covered=0, total=0, ratio=None))
        for j in JURISDICTIONS
    ]
    if all(s.total == 0 for s in stats):
        return "empty", list(JURISDICTIONS)
    missing = [j for j, s in zip(JURISDICTIONS, stats, strict=True) if s.covered == 0]
    if missing:
        return "unavailable", missing
    if any((s.ratio or 0.0) < LOW_COVERAGE_THRESHOLD for s in stats):
        return "partial", []
    return "primary", []


def build_field(
    spec: FieldSpecLike,
    coverage: dict[str, CoverageStat],
    counts: dict[str, dict[str, int]],
) -> CompareField:
    """Align value rows across jurisdictions and attach shares + tier.

    `counts` is {jurisdiction: {value: count}}; a value absent in one
    jurisdiction gets count 0 there. Values are ordered by summed count, then
    alphabetically, so the bar order is stable between PL and UK.
    """
    all_values = {v for per in counts.values() for v in per}
    ordered = sorted(
        all_values,
        key=lambda v: (-sum(per.get(v, 0) for per in counts.values()), v),
    )
    values = [
        CompareValue(
            value=v,
            counts={j: counts.get(j, {}).get(v, 0) for j in JURISDICTIONS},
            shares={
                j: share(
                    counts.get(j, {}).get(v, 0),
                    coverage.get(
                        j, CoverageStat(covered=0, total=0, ratio=None)
                    ).covered,
                )
                for j in JURISDICTIONS
            },
        )
        for v in ordered
    ]
    tier, missing = tier_for(coverage)
    return CompareField(
        field=spec.field,
        label=spec.label,
        source=spec.source,
        kind=spec.kind,  # type: ignore[arg-type]
        coverage={
            j: coverage.get(j, CoverageStat(covered=0, total=0, ratio=None))
            for j in JURISDICTIONS
        },
        tier=tier,
        missing_in=missing,
        values=values,
    )
