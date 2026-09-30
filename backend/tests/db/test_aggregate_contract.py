"""Database contract for aggregate_extracted_data (#707).

Pins: (1) the cohort is list_extracted_filter_matches — totals agree with the
filter wrapper; (2) sampling is deterministic per seed and bounded by the
cohort; (3) every allowlisted field aggregates without error and with the
documented shape; (4) categorical "other"/null arithmetic; (5) grants.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import Counter

import pytest

from app.extraction_domain.aggregate_fields import (
    AGGREGABLE_FIELDS,
    DEFAULT_AGGREGATE_FIELDS,
)
from tests.db.test_extracted_filter_contract import _exec, _seed

pytestmark = pytest.mark.db


@pytest.fixture
def cohort(conn):
    token = f"agg-{uuid.uuid4()}"
    ids = []
    years: dict[str, str] = {}
    for i in range(12):
        year = f"20{10 + i // 3:02d}"
        ids.append(
            _seed(
                conn,
                token,
                "PL" if i % 2 == 0 else "UK",
                f"{year}-01-15",
                # real enum members: chk_judgments_base_appeal_outcome rejects anything else
                appeal_outcome=["outcome_conviction_quashed"]
                if i < 4
                else ["outcome_dismissed_or_refused"],
                convict_offences=["possession", "supply"]
                if i % 3 == 0
                else ["possession"],
                num_victims=i % 4,
                victim_age_offence=i * 0.5,
                did_offender_confess=(i % 2 == 0),
            )
        )
        years[ids[-1]] = year
    # one row outside the cohort keyword, must never be counted
    outsider = _seed(
        conn,
        "other-token",
        "PL",
        "2015-01-01",
        appeal_outcome=["outcome_conviction_quashed"],
    )
    yield {"token": token, "ids": ids, "years": years}
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


def _expected_sample(ids: list[str], seed: int, n: int) -> list[str]:
    """The SQL orders the cohort by md5(id::text || p_seed::text), then id."""

    def key(i: str) -> tuple[str, str]:
        digest = hashlib.md5(f"{i}{seed}".encode(), usedforsecurity=False)
        return digest.hexdigest(), i

    return sorted(ids, key=key)[:n]


def _year_values(sample: list[str], years: dict[str, str]) -> list[dict]:
    counts = Counter(years[i] for i in sample)
    return [{"value": y, "count": c} for y, c in sorted(counts.items())]


def test_sample_is_deterministic_per_seed_and_bounded(conn, cohort):
    f = {"keywords": [cohort["token"]]}
    a = _agg(conn, f, p_sample_size=5, p_seed=42)
    b = _agg(conn, f, p_sample_size=5, p_seed=42)
    assert a == b
    assert a["sample_n"] == 5 and a["total"] == 12 and a["seed"] == 42
    # pins the sampling formula, not just repeatability
    exp42 = _expected_sample(cohort["ids"], 42, 5)
    assert a["fields"]["decision_date"]["values"] == _year_values(
        exp42, cohort["years"]
    )
    exp43 = _expected_sample(cohort["ids"], 43, 5)
    c = _agg(conn, f, p_sample_size=5, p_seed=43)
    assert c["fields"]["decision_date"]["values"] == _year_values(
        exp43, cohort["years"]
    )
    if _year_values(exp42, cohort["years"]) != _year_values(exp43, cohort["years"]):
        assert a["fields"]["decision_date"] != c["fields"]["decision_date"]
    big = _agg(conn, f, p_sample_size=500, p_seed=1)
    assert big["sample_n"] == 12


def test_seed_required_with_sample_size(conn, cohort):
    with pytest.raises(Exception, match="p_seed"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_sample_size=3)


def test_null_top_n_is_rejected(conn, cohort):
    # NULL used to slip past the range guard and empty every categorical list
    with pytest.raises(Exception, match="p_top_n"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_top_n=None)


def test_too_many_fields_is_rejected(conn, cohort):
    with pytest.raises(Exception, match="p_fields"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_fields=["keywords"] * 51)


def test_empty_fields_list_is_rejected(conn, cohort):
    with pytest.raises(Exception, match="p_fields"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_fields=[])


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


def test_array_null_and_empty_elements_are_dropped(conn):
    token = f"agg-{uuid.uuid4()}"
    ids = [
        _seed(conn, token, "PL", "2020-01-01", convict_offences=["", None, "x"]),
        _seed(conn, token, "PL", "2020-01-01", convict_offences=["", None]),
    ]
    try:
        co = _agg(conn, {"keywords": [token]}, p_fields=["convict_offences"])
        co = co["fields"]["convict_offences"]
        assert co["values"] == [{"value": "x", "count": 1}]
        assert co["other"] == 0
        # a row left with no element counts as null, like '' on a scalar column
        assert co["covered"] == 1 and co["null"] == 1
    finally:
        _exec(
            conn,
            "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])",
            (ids,),
        )


def test_numeric_and_year_shapes(conn, cohort):
    out = _agg(
        conn,
        {"keywords": [cohort["token"]]},
        p_fields=[
            "num_victims",
            "victim_age_offence",
            "decision_date",
            "did_offender_confess",
        ],
    )
    nv = out["fields"]["num_victims"]
    assert nv["kind"] == "numeric" and nv["min"] == 0 and nv["max"] == 3
    assert sum(b["count"] for b in nv["buckets"]) == nv["covered"] == 12
    # integer column: one unit bucket per value, half-open integer bounds
    assert [b["lo"] for b in nv["buckets"]] == [0, 1, 2, 3]
    assert [b["hi"] for b in nv["buckets"]] == [1, 2, 3, 4]
    assert [b["count"] for b in nv["buckets"]] == [3, 3, 3, 3]
    assert all(
        isinstance(b["lo"], int | float) and isinstance(b["hi"], int | float)
        for b in nv["buckets"]
    )
    # non-integer column: 20 equal-width buckets, float bounds (0.275 not numeric scale)
    va = out["fields"]["victim_age_offence"]
    assert va["min"] == 0 and va["max"] == 5.5 and len(va["buckets"]) == 20
    assert va["buckets"][0] == {"lo": 0, "hi": 0.275, "count": 1}
    assert va["buckets"][-1]["hi"] == 5.5
    assert sum(b["count"] for b in va["buckets"]) == va["covered"] == 12
    yr = out["fields"]["decision_date"]
    assert yr["kind"] == "year"
    assert [v["value"] for v in yr["values"]] == ["2010", "2011", "2012", "2013"]
    assert [v["count"] for v in yr["values"]] == [3, 3, 3, 3]
    conf = out["fields"]["did_offender_confess"]
    assert conf["kind"] == "categorical" and conf["multi"] is False
    assert sorted(v["value"] for v in conf["values"]) == ["false", "true"]


def test_default_field_set_kinds(conn, cohort):
    out = _agg(conn, {"keywords": [cohort["token"]]}, p_fields=None)
    assert set(out["fields"]) == set(DEFAULT_AGGREGATE_FIELDS)
    assert {f: out["fields"][f]["kind"] for f in DEFAULT_AGGREGATE_FIELDS} == {
        "offender_gender": "categorical",
        "convict_offences": "categorical",
        "sentences_received": "categorical",
        "appeal_outcome": "categorical",
        "did_offender_confess": "categorical",
        "court_name": "categorical",
        "decision_date": "year",
    }


def test_empty_cohort_yields_zeroed_shapes(conn):
    token = f"agg-{uuid.uuid4()}"  # seeded by nobody: zero matches
    out = _agg(
        conn,
        {"keywords": [token]},
        p_fields=["victim_age_offence", "convict_offences"],
    )
    assert out["total"] == 0 and out["sample_n"] == 0
    assert out["fields"]["victim_age_offence"] == {
        "kind": "numeric",
        "buckets": [],
        "min": None,
        "max": None,
        "null": 0,
        "covered": 0,
    }
    assert out["fields"]["convict_offences"]["values"] == []


def test_all_null_numeric_field_yields_empty_buckets(conn):
    token = f"agg-{uuid.uuid4()}"
    ids = [
        _seed(conn, token, "PL", "2020-01-01"),
        _seed(conn, token, "PL", "2020-01-02"),
    ]
    try:
        out = _agg(conn, {"keywords": [token]}, p_fields=["victim_age_offence"])
        va = out["fields"]["victim_age_offence"]
        assert va["buckets"] == []
        assert va["min"] is None and va["max"] is None
        assert va["null"] == len(ids) and va["covered"] == 0
    finally:
        _exec(
            conn,
            "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])",
            (ids,),
        )


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
