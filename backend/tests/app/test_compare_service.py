"""CompareService: one facet RPC call per comparable field -> CompareResponse.

No DB, no HTTP. Rows are shaped exactly like
`get_extracted_facet_counts_by_jurisdiction` returns them (migration
20260921000001): a summary row per jurisdiction has `value IS NULL` and
`count IS NULL` and carries `total`/`covered` only.
"""

from __future__ import annotations

import pytest

from app.compare.fields import FieldSpec, base_compare_fields
from app.compare.service import (
    FACET_RPC,
    CompareService,
    FieldNotComparableError,
    rows_to_coverage_and_counts,
)
from app.extraction_domain.filter_ids import strip_ignored
from tests.app._fakes import FakeRpcClient
from tests.app.test_db_contract_static import _declared_functions, _migration_sql

pytestmark = pytest.mark.unit


def _row(
    j: str, value: str | None, count: int | None, total: int, covered: int
) -> dict:
    return {
        "jurisdiction": j,
        "value": value,
        "count": count,
        "total": total,
        "covered": covered,
        "coverage": None if total == 0 else round(covered / total, 4),
    }


def _client(rows_by_field: dict[str, list[dict]]) -> FakeRpcClient:
    return FakeRpcClient({FACET_RPC: lambda p: rows_by_field.get(p["field_path"], [])})


def test_facet_rpc_name_matches_a_declared_migration_function():
    """`client.rpc(FACET_RPC, ...)` passes a module constant, which the AST
    guard in test_db_contract_static.py cannot see; pin it here instead."""
    assert FACET_RPC == "get_extracted_facet_counts_by_jurisdiction"
    assert FACET_RPC in _declared_functions(_migration_sql())


def test_service_reexports_strip_ignored_from_filter_ids():
    from app.compare import service

    assert service.strip_ignored is strip_ignored


def test_rows_to_coverage_and_counts_handles_summary_rows():
    rows = [
        _row("PL", "a", 3, 5, 4),
        _row("PL", "b", 1, 5, 4),
        _row("UK", None, None, 7, 0),  # matched 7, none filled
    ]
    coverage, counts = rows_to_coverage_and_counts(rows)
    assert (coverage["PL"].covered, coverage["PL"].total, coverage["PL"].ratio) == (
        4,
        5,
        0.8,
    )
    assert (coverage["UK"].covered, coverage["UK"].total, coverage["UK"].ratio) == (
        0,
        7,
        0.0,
    )
    assert counts == {"PL": {"a": 3, "b": 1}}


def test_rows_to_coverage_and_counts_coerces_bigint_strings():
    """PostgREST serialises BIGINT as JSON numbers, but some clients hand back
    strings; ints are what the models and `coverage_ratio` expect."""
    coverage, counts = rows_to_coverage_and_counts(
        [
            {
                "jurisdiction": "PL",
                "value": "x",
                "count": "2",
                "total": "4",
                "covered": "3",
            }
        ]
    )
    assert (coverage["PL"].covered, coverage["PL"].total) == (3, 4)
    assert counts == {"PL": {"x": 2}}


def test_compare_calls_rpc_once_per_field_and_builds_totals():
    client = _client(
        {
            "appeal_outcome": [
                _row("PL", "x", 2, 2, 2),
                _row("UK", "x", 1, 3, 3),
                _row("UK", "y", 2, 3, 3),
            ],
            "plea_point": [
                _row("PL", None, None, 2, 0),
                _row("UK", "before_trial", 3, 3, 3),
            ],
        }
    )
    specs = [
        FieldSpec("appeal_outcome", "Appeal Outcome", "enum_array"),
        FieldSpec("plea_point", "Plea Point", "enum"),
    ]
    resp = CompareService(client).compare(
        {"jurisdiction": ["UK"], "appellant": ["offender"]}, "fraud", specs
    )

    assert [c[0] for c in client.calls] == [FACET_RPC] * 2
    assert client.calls[0][1] == {
        "p_filters": {"appellant": ["offender"]},
        "field_path": "appeal_outcome",
        "p_text_query": "fraud",
    }
    assert client.calls[1][1]["field_path"] == "plea_point"
    assert resp.totals == {"PL": 2, "UK": 3}
    assert resp.ignored_filter_keys == ["jurisdiction"]
    assert resp.filters == {"appellant": ["offender"]}
    assert resp.text_query == "fraud"
    assert resp.jurisdictions == ["PL", "UK"]
    outcome, plea = resp.fields
    assert outcome.field == "appeal_outcome" and outcome.source == "base"
    assert outcome.tier == "primary"
    assert [v.value for v in outcome.values] == ["x", "y"]
    assert outcome.values[0].counts == {"PL": 2, "UK": 1}
    assert plea.tier == "unavailable" and plea.missing_in == ["PL"]


def test_compare_with_no_matches_reports_zero_totals_and_empty_fields():
    client = _client({"appeal_outcome": []})
    resp = CompareService(client).compare(
        {}, None, [FieldSpec("appeal_outcome", "Appeal Outcome", "enum_array")]
    )
    assert resp.totals == {"PL": 0, "UK": 0}
    assert resp.fields[0].tier == "empty"
    assert resp.fields[0].values == []
    assert resp.ignored_filter_keys == []


def test_compare_with_no_specs_makes_no_rpc_calls():
    client = _client({})
    resp = CompareService(client).compare({"appellant": ["offender"]}, None, [])
    assert client.calls == []
    assert resp.totals == {"PL": 0, "UK": 0} and resp.fields == []


def test_compare_passes_collection_ids_through_untouched():
    """Ownership of `collection_ids` is the router's job; the service forwards
    the filter verbatim so the RPC scopes to those collections."""
    client = _client({"appeal_outcome": [_row("PL", "x", 1, 1, 1)]})
    filters = {"collection_ids": ["c1"], "jurisdiction": ["PL"]}
    CompareService(client).compare(
        filters, None, [FieldSpec("appeal_outcome", "Appeal Outcome", "enum_array")]
    )
    assert client.calls[0][1]["p_filters"] == {"collection_ids": ["c1"]}
    assert filters == {"collection_ids": ["c1"], "jurisdiction": ["PL"]}  # not mutated


def test_compare_refuses_fields_outside_the_comparable_registry():
    """Free-text fields (keywords, convict_offences) would return one row per
    distinct value with no LIMIT, and unknown names RAISE in SQL. The service
    never calls the RPC for them, whatever spec the caller hands in."""
    client = _client({})
    specs = [
        FieldSpec("appeal_outcome", "Appeal Outcome", "enum_array"),
        FieldSpec("keywords", "Keywords", "enum_array"),
        FieldSpec("not_a_field", "Nope", "enum"),
    ]
    with pytest.raises(FieldNotComparableError) as exc:
        CompareService(client).compare({}, None, specs)
    assert exc.value.fields == ["keywords", "not_a_field"]
    assert "keywords" in str(exc.value) and "not_a_field" in str(exc.value)
    assert client.calls == []


def test_compare_refuses_non_base_sources_for_the_base_rpc():
    """The by-jurisdiction RPC resolves `field_path` through
    `_base_field_to_column`, so a schema:<id> spec cannot be served by it even
    if its name collides with a base field."""
    client = _client({})
    spec = FieldSpec(
        "appeal_outcome", "Appeal Outcome", "enum_array", source="schema:abc"
    )
    with pytest.raises(FieldNotComparableError):
        CompareService(client).compare({}, None, [spec])
    assert client.calls == []


def test_facet_rows_validates_the_field_before_calling_the_rpc():
    client = _client({"appeal_outcome": [_row("PL", "x", 1, 1, 1)]})
    service = CompareService(client)
    assert service.facet_rows({}, "appeal_outcome", None) == [_row("PL", "x", 1, 1, 1)]
    with pytest.raises(FieldNotComparableError):
        service.facet_rows({}, "keywords", None)
    assert [c[1]["field_path"] for c in client.calls] == ["appeal_outcome"]


def test_every_base_registry_field_is_accepted():
    """The whitelist is the registry itself, not a second hand-maintained list."""
    client = _client({})
    specs = base_compare_fields()
    resp = CompareService(client).compare({}, None, specs)
    assert len(resp.fields) == len(specs) == len(client.calls)
    assert [c[1]["field_path"] for c in client.calls] == [s.field for s in specs]
    assert all(f.tier == "empty" for f in resp.fields)


def test_field_not_comparable_error_is_a_value_error():
    """The router maps ValueError from select_base_fields to 400; this error
    must take the same path."""
    assert issubclass(FieldNotComparableError, ValueError)
