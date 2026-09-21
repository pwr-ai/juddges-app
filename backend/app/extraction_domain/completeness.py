"""What counts as an empty extracted value, and which result rows are "done".

Shared by: extraction_domain/summary.py (field completeness, plan A),
extraction_domain/dataset_export.py (plan A), compare/layout.py and
compare/schema_tally.py (plan C). One home so the sample review, the dataset
export and the PL/UK comparison cannot disagree about a "n/a".

Scope note: these markers apply to free-text LLM output in
extraction_jobs.results. The SQL `covered` in
get_extracted_facet_counts_by_jurisdiction treats only NULL / '' as empty,
because base_* columns are enum-coded and cannot contain "n/a".
"""

from __future__ import annotations

from typing import Any

COMPLETED_STATUSES: frozenset[str] = frozenset(
    {"completed", "success", "partially_completed"}
)

EMPTY_MARKERS: frozenset[str] = frozenset(
    {
        "",
        "n/a",
        "na",
        "not available",
        "none",
        "null",
        "unknown",
        "brak",
        "brak danych",
        "nie dotyczy",
        "not applicable",
    }
)


def is_empty_value(value: Any) -> bool:
    """Check if a value represents an empty or missing extraction result.

    None, empty strings, marker strings (case-insensitive after stripping),
    and empty collections are considered empty.
    Note: 0 and False are NOT empty.
    """
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in EMPTY_MARKERS
    if isinstance(value, list | dict):
        return len(value) == 0
    return False


def flatten(obj: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    """Flatten nested dicts to dotted-key representation.

    Empty dicts are kept as values, not recursively flattened.
    Example: {"a": 1, "b": {"c": "x"}} → {"a": 1, "b.c": "x"}
    """
    items: dict[str, Any] = {}
    for key, value in obj.items():
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict) and value:
            items.update(flatten(value, name))
        else:
            items[name] = value
    return items


def completed_rows(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter rows to those with a completed status.

    Status comparison is case-insensitive. Rows missing a 'status' key
    or with None/empty status are excluded.
    """
    return [
        r for r in results if str(r.get("status") or "").lower() in COMPLETED_STATUSES
    ]


def coverage_ratio(covered: int, total: int) -> float | None:
    """Calculate the proportion of covered items.

    Returns None if total is 0 to avoid division by zero.
    Result is rounded to 4 decimal places.
    """
    return None if total == 0 else round(covered / total, 4)
