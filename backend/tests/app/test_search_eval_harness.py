"""Unit tests for the search-eval golden set, grading and runner plumbing (#831).

Nothing here touches Meilisearch: the service is a stub and the golden set is
validated offline.
"""

import copy
import json

import pytest

from evals.search.build_golden import cited_signatures, signature_key
from evals.search.cli import flag, production_marker
from evals.search.golden import (
    CATEGORIES,
    GOLDEN_SET_PATH,
    GoldenSetError,
    grade_hits,
    load_golden_set,
    normalize_case_number,
    parse_query,
)
from evals.search.run_eval import (
    Mode,
    build_summary,
    compare_to_baseline,
    evaluate_mode,
    parse_modes,
    score_query,
)

pytestmark = pytest.mark.unit


def _record(**overrides):
    rec = {
        "qid": "t-1",
        "query": "III Ca 1553/21",
        "jurisdiction": "PL",
        "language": "pl",
        "category": "case_number",
        "relevant": [
            {
                "id": "doc-a",
                "case_number": "III Ca 1553/21",
                "grade": 3,
                "source": "exact_case_number",
                "heuristic": False,
            },
            {
                "id": "doc-b",
                "case_number": "I C 1/20",
                "grade": 2,
                "source": "cites_case_number",
                "heuristic": True,
            },
        ],
    }
    rec.update(overrides)
    return rec


# ── committed golden set ───────────────────────────────────────────────────


def test_committed_golden_set_loads_and_covers_every_slice():
    queries = load_golden_set(GOLDEN_SET_PATH)
    assert len(queries) >= 30
    assert {q.category for q in queries} == CATEGORIES
    assert {q.jurisdiction for q in queries} == {"PL", "UK"}
    for category in CATEGORIES:
        for jurisdiction in ("PL", "UK"):
            assert any(
                q.category == category and q.jurisdiction == jurisdiction
                for q in queries
            ), f"no {category} query for {jurisdiction}"


def test_committed_golden_set_uses_graded_labels_and_marks_heuristics():
    queries = load_golden_set(GOLDEN_SET_PATH)
    grades = {r.grade for q in queries for r in q.relevant}
    assert grades == {1, 2, 3}
    for q in queries:
        for r in q.relevant:
            assert r.heuristic == (r.source != "exact_case_number"), q.qid
        if q.category == "case_number":
            # The query must be the case number of at least one grade-3 label.
            assert any(
                r.grade == 3
                and normalize_case_number(r.case_number)
                == normalize_case_number(q.query)
                for r in q.relevant
            ), q.qid


def test_issue_798_case_number_acceptance_query_is_pinned():
    queries = {q.query for q in load_golden_set(GOLDEN_SET_PATH)}
    assert "III Ca 1553/21" in queries


# ── parsing / validation ──────────────────────────────────────────────────


def test_parse_query_round_trip():
    q = parse_query(_record())
    assert q.grades == [3, 2]
    assert [r.grade for r in q.without_heuristic().relevant] == [3]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda r: r.pop("query"), "missing 'query'"),
        (lambda r: r.update(query="  "), "non-empty"),
        (lambda r: r.update(jurisdiction="DE"), "jurisdiction"),
        (lambda r: r.update(language="de"), "language"),
        (lambda r: r.update(category="vibes"), "category"),
        (lambda r: r.update(relevant=[]), "non-empty list"),
        (lambda r: r["relevant"][0].update(grade=5), "grade"),
        (lambda r: r["relevant"][0].update(source="gut_feeling"), "source"),
        (lambda r: r["relevant"][0].pop("heuristic"), "heuristic"),
        (
            lambda r: r["relevant"][0].update(id=None, case_number=None),
            "id or a case_number",
        ),
        (lambda r: r["relevant"][1].update(heuristic=False), "non-heuristic"),
    ],
)
def test_parse_query_rejects_malformed_records(mutate, message):
    rec = copy.deepcopy(_record())
    mutate(rec)
    with pytest.raises(GoldenSetError, match=message):
        parse_query(rec)


def test_load_golden_set_rejects_duplicate_qids(tmp_path):
    path = tmp_path / "g.jsonl"
    line = json.dumps(_record())
    path.write_text(f"{line}\n\n{line}\n", encoding="utf-8")
    with pytest.raises(GoldenSetError, match="duplicate qid"):
        load_golden_set(path)


def test_load_golden_set_reports_bad_json_with_line_number(tmp_path):
    path = tmp_path / "g.jsonl"
    path.write_text(json.dumps(_record()) + "\n{not json\n", encoding="utf-8")
    with pytest.raises(GoldenSetError, match=r"g\.jsonl:2"):
        load_golden_set(path)


# ── grading ───────────────────────────────────────────────────────────────


def test_normalize_case_number():
    assert normalize_case_number("  III  Ca 1553/21 ") == "iii ca 1553/21"
    assert normalize_case_number(None) == ""
    assert normalize_case_number("[2019] EWCA Crim 952") != normalize_case_number(
        "[2015] EWCA Crim 952"
    )


def test_grade_hits_by_id_and_case_number():
    q = parse_query(_record())
    hits = [
        {"id": "other", "case_number": "X 1/20"},
        {"id": "elsewhere", "case_number": "iii ca  1553/21"},  # case-number match
        {"id": "doc-b", "case_number": "I C 1/20"},  # id match
    ]
    assert grade_hits(hits, q) == [0, 3, 2]


def test_grade_hits_ids_only_skips_case_number_fallback():
    q = parse_query(_record())
    hits = [{"id": "elsewhere", "case_number": "III Ca 1553/21"}, {"id": "doc-b"}]
    assert grade_hits(hits, q, match_case_number=False) == [0, 2]


def test_grade_hits_never_credits_one_label_twice():
    q = parse_query(_record())
    hits = [
        {"id": "doc-a", "case_number": "III Ca 1553/21"},
        {"id": "copy", "case_number": "III Ca 1553/21"},  # duplicate indexing
    ]
    assert grade_hits(hits, q) == [3, 0]


def test_score_query_reports_strict_ndcg_only_with_non_heuristic_labels():
    q = parse_query(_record())
    grades, recall, ndcg, rr, strict = score_query(q, [{"id": "doc-b"}], k=10)
    assert grades == [2]
    assert rr == 1.0
    assert recall == pytest.approx(0.5)
    assert 0 < ndcg < 1
    assert strict == 0.0  # the exact judgment was not retrieved

    topical = parse_query(
        _record(
            category="topical",
            relevant=[
                {"id": "t", "grade": 1, "source": "keyword_tag", "heuristic": True}
            ],
        )
    )
    assert score_query(topical, [{"id": "t"}], k=10)[4] is None


# ── modes / runner ────────────────────────────────────────────────────────


def test_parse_modes():
    modes = parse_modes("keyword, semantic,hybrid:0.5")
    assert modes == [
        Mode("keyword", 0.0),
        Mode("semantic", 1.0),
        Mode("hybrid:0.5", 0.5),
    ]


@pytest.mark.parametrize(
    "spec", ["", "hybrid:0", "hybrid:1", "hybrid:1.5", "vector", "keyword,keyword"]
)
def test_parse_modes_rejects_bad_specs(spec):
    with pytest.raises(ValueError):
        parse_modes(spec)


class _StubService:
    """Answers documents_search from a fixed table; records calls."""

    def __init__(self, hits, search_mode_for_ratio):
        self.hits = hits
        self.search_mode_for_ratio = search_mode_for_ratio
        self.calls = []

    async def documents_search(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "hits": self.hits,
            "search_mode": self.search_mode_for_ratio(kwargs["semantic_ratio"]),
        }


async def test_evaluate_mode_scores_and_flags_keyword_fallback_as_degraded():
    q = parse_query(_record())
    service = _StubService(
        hits=[{"id": "doc-a", "case_number": "III Ca 1553/21"}],
        search_mode_for_ratio=lambda r: "keyword" if r == 0 else "keyword_fallback",
    )
    [kw] = await evaluate_mode(service, [q], Mode("keyword", 0.0), k=10, runs=2)
    [hy] = await evaluate_mode(
        service, [q], Mode("hybrid:0.5", 0.5), k=10, jurisdiction_filter=True
    )
    assert kw.mrr == 1.0
    assert not kw.degraded
    assert len(kw.latencies_ms) == 2
    assert hy.degraded
    assert service.calls[-1]["filters"] == 'jurisdiction = "PL"'
    assert service.calls[-1]["semantic_ratio"] == 0.5


async def test_evaluate_mode_records_errors_as_degraded_zero_scores():
    class _Boom:
        async def documents_search(self, **kwargs):
            raise RuntimeError("meili down")

    [out] = await evaluate_mode(
        _Boom(), [parse_query(_record())], Mode("keyword", 0.0), 10
    )
    assert out.degraded
    assert out.error and "meili down" in out.error
    assert (out.recall, out.ndcg, out.mrr) == (0.0, 0.0, 0.0)


async def test_build_summary_aggregates_per_mode_and_category():
    q = parse_query(_record())
    service = _StubService(
        hits=[{"id": "doc-a", "case_number": "III Ca 1553/21"}],
        search_mode_for_ratio=lambda r: "hybrid" if r else "keyword",
    )
    modes = [Mode("keyword", 0.0), Mode("semantic", 1.0)]
    outcomes = []
    for mode in modes:
        outcomes += await evaluate_mode(service, [q], mode, k=10)
    summary = build_summary(outcomes, modes)
    assert set(summary) == {"keyword", "semantic"}
    overall = summary["keyword"]["overall"]
    assert overall["queries"] == 1
    assert overall["mrr"] == 1.0
    assert overall["strict_ndcg"] == pytest.approx(1.0)
    assert overall["p50_ms"] is not None
    assert set(summary["keyword"]["by_category"]) == {"case_number"}
    assert set(summary["keyword"]["by_jurisdiction"]) == {"PL"}


def test_compare_to_baseline_flags_only_drops_beyond_tolerance():
    def block(ndcg, recall, mrr):
        return {"overall": {"ndcg": ndcg, "recall": recall, "mrr": mrr}}

    baseline = {
        "keyword": block(0.80, 0.90, 0.85),
        "hybrid:0.5": block(0.70, 0.70, 0.70),
    }
    current = {
        "keyword": block(0.79, 0.90, 0.85),  # -0.01: within tolerance
        "hybrid:0.5": block(0.60, 0.70, 0.75),  # -0.10 nDCG: regression
        "semantic": block(0.10, 0.10, 0.10),  # new mode: not compared
    }
    regressions = compare_to_baseline(current, baseline, max_drop=0.02)
    assert len(regressions) == 1
    assert regressions[0].startswith("hybrid:0.5: ndcg")


# ── CLI helpers / builder helpers ─────────────────────────────────────────


def test_flag_parsing():
    argv = ["--k", "5", "--modes=keyword", "--json"]
    assert flag(argv, "--k") == "5"
    assert flag(argv, "--modes") == "keyword"
    assert flag(argv, "--json") is None  # no value after it
    assert flag(argv, "--missing") is None


@pytest.mark.parametrize(
    ("env", "expected"),
    [
        ({"PYTHON_ENV": "production"}, "PYTHON_ENV"),
        ({"ENVIRONMENT": "Prod"}, "ENVIRONMENT"),
        ({"APP_ENV": " production "}, "APP_ENV"),
        ({"PYTHON_ENV": "development"}, None),
        ({}, None),
    ],
)
def test_production_marker(env, expected):
    assert production_marker(env) == expected


def test_signature_key_unifies_uk_citation_spellings():
    assert signature_key("[2018] EWCA Crim 2154") == signature_key(
        "[2018] EWCA 2154 (Crim)"
    )
    assert signature_key("[2018] EWCA Crim 2154") != signature_key(
        "[2018] EWCA Crim 2155"
    )
    assert signature_key("II  AKa 1/20") == signature_key("ii aka 1/20")


def test_cited_signatures_excludes_own_and_dedupes():
    text = (
        "Neutral Citation Number: [2018] EWCA 2154 (Crim) ... applying "
        "R v Hanson [2005] EWCA Crim 824 and again [2005]  EWCA Crim 824"
    )
    assert cited_signatures(text, "UK", "[2018] EWCA Crim 2154") == [
        "[2005] EWCA Crim 824"
    ]
    pl = "Sygn. akt II AKa 144/22 ... wyrok Sądu Okręgowego, sygn. akt III K 320/21"
    assert cited_signatures(pl, "PL", "II AKa 144/22") == ["III K 320/21"]
    assert cited_signatures(None, "PL", None) == []
