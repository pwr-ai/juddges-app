"""Turn per-jurisdiction facet rows into a `CompareResponse` (Spec C).

One RPC call per comparable field: `get_extracted_facet_counts_by_jurisdiction`
(migration 20260921000001) filters through `list_extracted_filter_matches`,
groups by `judgments.jurisdiction` and returns, per jurisdiction, one row per
distinct value plus `total`/`covered`. A jurisdiction with matches but no
filled value yields a single summary row with `value IS NULL`.

Contracts this module relies on but does not enforce:

* **Ownership of `filters["collection_ids"]`** is the router's job. The
  service runs with the service-role client, which bypasses RLS, so it
  forwards the filter verbatim and trusts that the caller
  (`app.compare.router`, via `check_collection_ids_ownership`) has already
  verified every id belongs to the requesting user.
* **`jurisdiction` in `filters`** is dropped, not honoured (`strip_ignored`,
  shared with pair creation in `app.extraction_domain.filter_ids`); the
  response echoes it in `ignored_filter_keys`.

What it does enforce: the RPC is only ever called for fields in the base
comparable registry (`app.compare.fields.base_compare_fields`). The RPC has no
LIMIT, so a free-text field (keywords, convict_offences) would return one row
per distinct value, and an unknown name RAISEs in SQL. Anything else raises
`FieldNotComparableError` (a `ValueError`, so the router's 400 path applies).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from loguru import logger

from app.compare.fields import FieldSpec, base_compare_fields
from app.compare.layout import JURISDICTIONS, build_field, coverage_ratio
from app.compare.models import CompareField, CompareResponse, CoverageStat
from app.extraction_domain.filter_ids import IGNORED_FILTER_KEYS, strip_ignored

__all__ = [
    "FACET_RPC",
    "IGNORED_FILTER_KEYS",
    "CompareService",
    "FieldNotComparableError",
    "rows_to_coverage_and_counts",
    "strip_ignored",
]

# Pinned against the migrations by
# tests/app/test_compare_service.py::test_facet_rpc_name_matches_a_declared_migration_function
# (the AST guard in test_db_contract_static.py only sees inline literals).
FACET_RPC = "get_extracted_facet_counts_by_jurisdiction"


class FieldNotComparableError(ValueError):
    """A requested field is not in the base comparable registry."""

    def __init__(self, fields: list[str]) -> None:
        super().__init__(f"Not comparable base fields: {', '.join(fields)}")
        self.fields = fields


def _comparable_base_names() -> frozenset[str]:
    return frozenset(s.field for s in base_compare_fields())


def _ensure_base_fields(names: list[str]) -> None:
    """Raise unless every name is in the base comparable registry."""
    allowed = _comparable_base_names()
    bad = [n for n in names if n not in allowed]
    if bad:
        raise FieldNotComparableError(bad)


def _ensure_comparable(specs: list[FieldSpec]) -> None:
    """Raise unless every spec is a base-registry field served by the base RPC.

    The by-jurisdiction RPC resolves `field_path` via `_base_field_to_column`,
    so a `schema:<id>` spec cannot be served by it even if its name collides
    with a base field.
    """
    allowed = _comparable_base_names()
    bad = [s.field for s in specs if s.source != "base" or s.field not in allowed]
    if bad:
        raise FieldNotComparableError(bad)


def rows_to_coverage_and_counts(
    rows: list[dict[str, Any]],
) -> tuple[dict[str, CoverageStat], dict[str, dict[str, int]]]:
    """Split RPC rows into coverage per jurisdiction and {jurisdiction: {value: count}}.

    Every row of a jurisdiction repeats the same `total`/`covered`; summary rows
    (`value IS NULL`) carry only those. BIGINT columns are coerced with `int()`
    in case the client hands them back as strings.
    """
    coverage: dict[str, CoverageStat] = {}
    counts: dict[str, dict[str, int]] = defaultdict(dict)
    for row in rows:
        j = str(row["jurisdiction"])
        total, covered = int(row["total"]), int(row["covered"])
        coverage[j] = CoverageStat(
            covered=covered, total=total, ratio=coverage_ratio(covered, total)
        )
        value = row.get("value")
        if value is not None:
            counts[j][str(value)] = int(row["count"])
    return coverage, dict(counts)


class CompareService:
    """Compose the facet RPC with the layout policy into a `CompareResponse`."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def facet_rows(
        self, filters: dict[str, Any], field: str, text_query: str | None
    ) -> list[dict[str, Any]]:
        """Raw RPC rows for one base field. `filters` is forwarded as given."""
        _ensure_base_fields([field])
        return self._rows(filters, field, text_query)

    def _rows(
        self, filters: dict[str, Any], field: str, text_query: str | None
    ) -> list[dict[str, Any]]:
        response = self._client.rpc(
            FACET_RPC,
            {"p_filters": filters, "field_path": field, "p_text_query": text_query},
        ).execute()
        return list(response.data or [])

    def compare(
        self,
        filters: dict[str, Any],
        text_query: str | None,
        specs: list[FieldSpec],
    ) -> CompareResponse:
        """One RPC call per spec; totals come from the per-jurisdiction summary.

        `filters` is not mutated; `jurisdiction` is stripped and reported.
        Raises `FieldNotComparableError` before any RPC call if a spec is not
        a base comparable field.
        """
        _ensure_comparable(specs)
        clean, ignored = strip_ignored(filters)
        totals: dict[str, int] = dict.fromkeys(JURISDICTIONS, 0)
        fields: list[CompareField] = []
        for spec in specs:
            rows = self._rows(clean, spec.field, text_query)
            coverage, counts = rows_to_coverage_and_counts(rows)
            for j, stat in coverage.items():
                if j in totals:
                    # Same filter for every field, so identical each time.
                    totals[j] = stat.total
            fields.append(build_field(spec, coverage, counts))
        logger.info(
            "compare: {} fields, totals={}, ignored={}", len(fields), totals, ignored
        )
        return CompareResponse(
            totals=totals,
            fields=fields,
            ignored_filter_keys=ignored,
            filters=clean,
            text_query=text_query,
        )
