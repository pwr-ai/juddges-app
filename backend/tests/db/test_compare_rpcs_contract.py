"""get_extracted_facet_counts_by_jurisdiction: per-jurisdiction facet counts (Task 2).

Sibling of get_extracted_facet_counts(field_path), which stays untouched — this
RPC groups by public.judgments.jurisdiction and adds coverage (filled / total)
per jurisdiction, filtering through the shared public.list_extracted_filter_matches.
Seeds are isolated by a per-test keyword token because the scratch DB is shared.

Note: the corpus below uses base_case_name (free TEXT, no CHECK) rather than the
brief's base_plea_point for the "empty string is not covered" scenario —
base_plea_point has an enum CHECK constraint (police_presence | ... | dont_know)
that rejects '' outright, so seeding it there would fail at INSERT, not at the
RPC under test.
"""

from __future__ import annotations

import json
import uuid

import pytest

pytestmark = pytest.mark.db


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def _seed(conn, token: str, jurisdiction: str, decision_date: str, **base) -> str:
    jid = str(uuid.uuid4())
    columns = [
        "id",
        "case_number",
        "jurisdiction",
        "decision_date",
        "full_text",
        "base_extraction_status",
        "base_keywords",
    ]
    values: list = [
        jid,
        f"CMP/{jid[:8]}",
        jurisdiction,
        decision_date,
        "compare fixture",
        "completed",
        [token],
    ]
    # explicit casts: psycopg sends str params with unknown OID; be explicit for uuid/date
    placeholders = ["%s::uuid", "%s", "%s", "%s::date", "%s", "%s", "%s::text[]"]
    for col, val in base.items():
        columns.append(f"base_{col}")
        values.append(val)
        placeholders.append("%s")
    _exec(
        conn,
        f"INSERT INTO public.judgments ({', '.join(columns)}) VALUES ({', '.join(placeholders)})",
        tuple(values),
    )
    return jid


@pytest.fixture
def corpus(conn):
    """2 PL + 2 UK judgments exercising array/boolean/scalar-text facet fields.

    appeal_outcome (array): pl_a one value, pl_b NULL; uk_a two values, uk_b one.
    did_offender_confess (bool): pl_a true, pl_b false; uk_a true, uk_b NULL.
    case_name (scalar text): pl_a filled, pl_b NULL; uk_a NULL, uk_b ''.
    """
    token = f"cmp-{uuid.uuid4()}"
    ids = {
        "pl_a": _seed(
            conn,
            token,
            "PL",
            "2016-03-01",
            appeal_outcome=["outcome_dismissed_or_refused"],
            did_offender_confess=True,
            case_name="Case A",
        ),
        "pl_b": _seed(
            conn,
            token,
            "PL",
            "2019-11-30",
            did_offender_confess=False,
        ),
        "uk_a": _seed(
            conn,
            token,
            "UK",
            "2021-07-15",
            appeal_outcome=["outcome_conviction_quashed", "outcome_other"],
            did_offender_confess=True,
        ),
        "uk_b": _seed(
            conn,
            token,
            "UK",
            "2023-01-02",
            appeal_outcome=["outcome_dismissed_or_refused"],
            case_name="",
        ),
    }
    yield token, ids
    _exec(
        conn,
        "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])",
        (list(ids.values()),),
    )


def _facets(conn, filters: dict, field: str, text_query: str | None = None):
    rows = _exec(
        conn,
        "SELECT jurisdiction, value, count, total, covered, coverage "
        "FROM public.get_extracted_facet_counts_by_jurisdiction(%s::jsonb, %s, %s) "
        "ORDER BY jurisdiction, value NULLS LAST",
        (json.dumps(filters), field, text_query),
    )
    return [tuple(r) for r in rows]


def test_array_field_counts_each_element_per_jurisdiction(conn, corpus):
    token, _ = corpus
    rows = _facets(conn, {"keywords": [token]}, "appeal_outcome")
    by = {(r[0], r[1]): r for r in rows}
    # PL: pl_a has one value, pl_b has NULL -> total 2, covered 1
    assert by[("PL", "outcome_dismissed_or_refused")][2:5] == (1, 2, 1)
    assert float(by[("PL", "outcome_dismissed_or_refused")][5]) == 0.5
    # UK: uk_a two elements, uk_b one -> counts 1/1/1, total 2, covered 2
    assert by[("UK", "outcome_conviction_quashed")][2:5] == (1, 2, 2)
    assert by[("UK", "outcome_other")][2:5] == (1, 2, 2)
    assert by[("UK", "outcome_dismissed_or_refused")][2:5] == (1, 2, 2)
    assert float(by[("UK", "outcome_other")][5]) == 1.0


def test_boolean_field_values_are_text_true_false(conn, corpus):
    token, _ = corpus
    rows = _facets(conn, {"keywords": [token]}, "did_offender_confess")
    values = {(r[0], r[1]): r[2] for r in rows}
    assert values[("PL", "true")] == 1 and values[("PL", "false")] == 1
    assert values[("UK", "true")] == 1
    assert ("UK", "false") not in values
    uk = next(r for r in rows if r[0] == "UK")
    assert uk[3:5] == (2, 1)  # total 2, covered 1 (uk_b is NULL)


def test_scalar_text_field_treats_empty_string_as_not_covered(conn, corpus):
    token, _ = corpus
    rows = _facets(conn, {"keywords": [token]}, "case_name")
    pl = [r for r in rows if r[0] == "PL"]
    uk = [r for r in rows if r[0] == "UK"]
    assert pl == [("PL", "Case A", 1, 2, 1, pl[0][5])]
    # UK has no filled case_name (one NULL, one ''): a single summary row
    assert len(uk) == 1
    assert uk[0][1] is None and uk[0][2] is None
    assert uk[0][3:5] == (2, 0)
    assert float(uk[0][5]) == 0.0


def test_jurisdiction_with_no_matches_yields_no_rows(conn, corpus):
    token, _ = corpus
    rows = _facets(
        conn, {"keywords": [token], "jurisdiction": ["PL"]}, "appeal_outcome"
    )
    assert {r[0] for r in rows} == {"PL"}


def test_unknown_field_raises(conn, corpus):
    token, _ = corpus
    with pytest.raises(Exception, match="Unknown extracted field"):
        _facets(conn, {"keywords": [token]}, "no_such_field")
