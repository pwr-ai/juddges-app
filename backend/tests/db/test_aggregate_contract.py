"""Database contract for aggregate_extracted_data (#707).

Pins: (1) the cohort is list_extracted_filter_matches — totals agree with the
filter wrapper; (2) sampling is deterministic per seed and bounded by the
cohort; (3) every allowlisted field aggregates without error and with the
documented shape; (4) categorical "other"/null arithmetic; (5) grants.
"""

from __future__ import annotations

import json
import uuid

import pytest

from app.extraction_domain.aggregate_fields import AGGREGABLE_FIELDS
from tests.db.test_extracted_filter_contract import _exec, _seed

pytestmark = pytest.mark.db


@pytest.fixture
def cohort(conn):
    token = f"agg-{uuid.uuid4()}"
    ids = []
    for i in range(12):
        ids.append(
            _seed(
                conn,
                token,
                "PL" if i % 2 == 0 else "UK",
                f"20{10 + i // 3:02d}-01-15",
                # real enum members: chk_judgments_base_appeal_outcome rejects anything else
                appeal_outcome=["outcome_conviction_quashed"]
                if i < 4
                else ["outcome_dismissed_or_refused"],
                convict_offences=["possession", "supply"]
                if i % 3 == 0
                else ["possession"],
                num_victims=i % 4,
                did_offender_confess=(i % 2 == 0),
            )
        )
    # one row outside the cohort keyword, must never be counted
    outsider = _seed(
        conn,
        "other-token",
        "PL",
        "2015-01-01",
        appeal_outcome=["outcome_conviction_quashed"],
    )
    yield {"token": token, "ids": ids}
    _exec(
        conn,
        "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])",
        ([*ids, outsider],),
    )


def _agg(conn, filters, **kw):
    params = {
        "p_filters": json.dumps(filters),
        "p_text_query": None,
        "p_fields": None,
        "p_sample_size": None,
        "p_seed": None,
        "p_top_n": 20,
    }
    params.update(kw)
    row = _exec(
        conn,
        "SELECT public.aggregate_extracted_data(%(p_filters)s::jsonb, %(p_text_query)s, "
        "%(p_fields)s::text[], %(p_sample_size)s, %(p_seed)s, %(p_top_n)s)",
        params,
    )
    return row[0][0]


def _wrapper_total(conn, filters):
    rows = _exec(
        conn,
        "SELECT total_count FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 1, 0)",
        (json.dumps(filters),),
    )
    return rows[0][0] if rows else 0


def test_total_equals_filter_wrapper_total(conn, cohort):
    for filters in (
        {"keywords": [cohort["token"]]},
        {"keywords": [cohort["token"]], "jurisdiction": ["PL"]},
        {
            "keywords": [cohort["token"]],
            "appeal_outcome": ["outcome_conviction_quashed"],
        },
        {
            "keywords": [cohort["token"]],
            "decision_date": {"from": "2011-01-01", "to": "2012-12-31"},
        },
    ):
        assert _agg(conn, filters)["total"] == _wrapper_total(conn, filters)


def test_sample_is_deterministic_per_seed_and_bounded(conn, cohort):
    f = {"keywords": [cohort["token"]]}
    a = _agg(conn, f, p_sample_size=5, p_seed=42)
    b = _agg(conn, f, p_sample_size=5, p_seed=42)
    c = _agg(conn, f, p_sample_size=5, p_seed=43)
    assert a == b
    assert a["sample_n"] == 5 and a["total"] == 12 and a["seed"] == 42
    assert (
        a["fields"] != c["fields"]
        or a["fields"]["decision_date"] != c["fields"]["decision_date"]
    )
    big = _agg(conn, f, p_sample_size=500, p_seed=1)
    assert big["sample_n"] == 12


def test_seed_required_with_sample_size(conn, cohort):
    with pytest.raises(Exception, match="p_seed"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_sample_size=3)


def test_every_allowlisted_field_aggregates(conn, cohort):
    out = _agg(
        conn, {"keywords": [cohort["token"]]}, p_fields=sorted(AGGREGABLE_FIELDS)
    )
    assert set(out["fields"]) == AGGREGABLE_FIELDS
    for name, agg in out["fields"].items():
        assert agg["kind"] in {"categorical", "numeric", "year"}, name
        assert agg["null"] + agg["covered"] == out["sample_n"], name


def test_unknown_field_is_rejected(conn, cohort):
    with pytest.raises(Exception, match="not aggregable"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_fields=["full_text"])


def test_categorical_other_and_null_arithmetic(conn, cohort):
    out = _agg(
        conn,
        {"keywords": [cohort["token"]]},
        p_fields=["convict_offences", "appeal_outcome"],
        p_top_n=1,
    )
    co = out["fields"]["convict_offences"]
    assert co["multi"] is True
    assert [v["value"] for v in co["values"]] == ["possession"]
    assert co["values"][0]["count"] == 12
    assert co["other"] == 4  # "supply" on rows 0,3,6,9 folded into other
    assert co["null"] == 0 and co["covered"] == 12
    ao = out["fields"]["appeal_outcome"]
    assert ao["values"] == [{"value": "outcome_dismissed_or_refused", "count": 8}]
    assert ao["other"] == 4


def test_numeric_and_year_shapes(conn, cohort):
    out = _agg(
        conn,
        {"keywords": [cohort["token"]]},
        p_fields=["num_victims", "decision_date", "did_offender_confess"],
    )
    nv = out["fields"]["num_victims"]
    assert nv["kind"] == "numeric" and nv["min"] == 0 and nv["max"] == 3
    assert sum(b["count"] for b in nv["buckets"]) == nv["covered"] == 12
    yr = out["fields"]["decision_date"]
    assert yr["kind"] == "year"
    assert [v["value"] for v in yr["values"]] == ["2010", "2011", "2012", "2013"]
    assert [v["count"] for v in yr["values"]] == [3, 3, 3, 3]
    conf = out["fields"]["did_offender_confess"]
    assert conf["kind"] == "categorical" and conf["multi"] is False
    assert sorted(v["value"] for v in conf["values"]) == ["false", "true"]


def test_grants_exclude_anon_and_public(conn):
    rows = _exec(
        conn,
        """
        SELECT grantee FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = 'aggregate_extracted_data'
        """,
    )
    grantees = {r[0] for r in rows}
    assert "authenticated" in grantees and "service_role" in grantees
    assert "anon" not in grantees and "PUBLIC" not in grantees
