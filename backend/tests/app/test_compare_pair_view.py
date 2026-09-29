"""GET /compare/pairs/{pair_id} — base fields over the pair's membership plus
the extension-schema tally from `extraction_jobs.results` (Spec C AC4).

Runs through the ASGI app: the Bearer user is synthetic (`authenticated_client`),
the pairs DB is a stub overriding `get_collection_pairs_db`, and the Supabase
client is a `FakeSupabaseClient` (facet RPC + `extraction_jobs` /
`extraction_schemas` table reads) patched on `app.compare.router.supabase_client`.
"""

from __future__ import annotations

import threading
from typing import Any
from unittest.mock import patch

import pytest

from app.collection_pairs import get_collection_pairs_db
from app.compare.fields import FieldSpec, base_compare_fields
from app.compare.schema_tally import (
    JOB_STATUS_SUCCESS,
    latest_success_jobs,
    schema_properties,
    tally_schema_fields,
    value_tokens,
)
from app.compare.service import FACET_RPC
from app.server import app
from tests.app._fakes import FakeSupabaseClient, TableQuery

pytestmark = [pytest.mark.unit]

PAIR = "33333333-3333-4333-8333-333333333333"
OTHER_PAIR = "33333333-3333-4333-8333-333333333334"
PL_COL = "44444444-4444-4444-8444-444444444444"
UK_COL = "55555555-5555-4555-8555-555555555555"
SCHEMA = "66666666-6666-4666-8666-666666666666"
SCHEMA_B = "66666666-6666-4666-8666-666666666667"
JOB_PL = "77777777-7777-4777-8777-777777777771"
JOB_UK = "77777777-7777-4777-8777-777777777772"

S1 = f"schema:{SCHEMA}"


def _results(*items: dict[str, Any], status: str = "completed") -> list[dict]:
    return [
        {"document_id": f"d{i}", "status": status, "extracted_data": data}
        for i, data in enumerate(items)
    ]


# --- tally_schema_fields ------------------------------------------------------


def test_tally_counts_enum_boolean_and_array_values_with_coverage():
    specs = [
        FieldSpec("verdict", "Verdict", "enum", source=S1),
        FieldSpec("appealed", "Appealed", "boolean", source=S1),
        FieldSpec("grounds", "Grounds", "enum_array", source=S1),
    ]
    fields = tally_schema_fields(
        {
            "PL": _results(
                {"verdict": "guilty", "appealed": True, "grounds": ["a", "b"]},
                {"verdict": "", "appealed": None, "grounds": []},
            ),
            "UK": _results(
                {"verdict": "acquitted", "appealed": False, "grounds": ["a"]}
            ),
        },
        specs,
    )
    verdict, appealed, grounds = fields
    assert verdict.coverage["PL"].covered == 1 and verdict.coverage["PL"].total == 2
    assert verdict.coverage["UK"].covered == 1 and verdict.coverage["UK"].total == 1
    assert {v.value: v.counts for v in verdict.values} == {
        "guilty": {"PL": 1, "UK": 0},
        "acquitted": {"PL": 0, "UK": 1},
    }
    assert {v.value: v.counts for v in appealed.values} == {
        "true": {"PL": 1, "UK": 0},
        "false": {"PL": 0, "UK": 1},
    }
    assert {v.value: v.counts for v in grounds.values} == {
        "a": {"PL": 1, "UK": 1},
        "b": {"PL": 1, "UK": 0},
    }
    assert grounds.coverage["PL"].covered == 1  # the empty list is not covered
    assert verdict.source == S1
    assert verdict.tier == "partial"  # PL covered 1 of 2 is under the 80 % rule
    assert {v.value: v.shares for v in appealed.values} == {
        "true": {"PL": 1.0, "UK": 0.0},
        "false": {"PL": 0.0, "UK": 1.0},
    }


def test_tally_skips_documents_that_did_not_complete():
    fields = tally_schema_fields(
        {
            "PL": _results({"verdict": "guilty"}, status="failed")
            + _results({"verdict": "guilty"}, status="pending"),
            "UK": [],
        },
        [FieldSpec("verdict", "Verdict", "enum", source=S1)],
    )
    assert fields[0].coverage["PL"].total == 0
    assert fields[0].tier == "empty"
    assert fields[0].values == []


def test_tally_treats_marker_strings_as_not_filled():
    """Same emptiness rule as the sample review / dataset export (`is_empty_value`)."""
    fields = tally_schema_fields(
        {"PL": _results({"verdict": "n/a"}, {"verdict": "unknown"}), "UK": []},
        [FieldSpec("verdict", "Verdict", "enum", source=S1)],
    )
    assert fields[0].coverage["PL"].covered == 0
    assert fields[0].coverage["PL"].total == 2
    assert fields[0].values == []


def test_tally_counts_each_array_value_once_per_document():
    fields = tally_schema_fields(
        {"PL": _results({"grounds": ["a", "a", ""]}), "UK": []},
        [FieldSpec("grounds", "Grounds", "enum_array", source=S1)],
    )
    assert [(v.value, v.counts["PL"]) for v in fields[0].values] == [("a", 1)]
    assert fields[0].coverage["PL"].covered == 1


def test_tally_reads_status_case_insensitively_and_tolerates_missing_data():
    rows = [
        {"document_id": "a", "status": "COMPLETED", "extracted_data": {"v": "x"}},
        {"document_id": "b", "status": "Success"},  # no extracted_data at all
        {"document_id": "c", "status": "partially_completed", "extracted_data": None},
    ]
    fields = tally_schema_fields(
        {"PL": rows, "UK": []}, [FieldSpec("v", "V", "enum", source=S1)]
    )
    assert fields[0].coverage["PL"].total == 3
    assert fields[0].coverage["PL"].covered == 1


@pytest.mark.parametrize(
    ("value", "kind", "expected"),
    [
        (True, "boolean", ["true"]),
        (False, "boolean", ["false"]),
        ("False", "boolean", ["false"]),  # a stringified boolean is not truthy-True
        ("guilty", "enum", ["guilty"]),
        (3, "enum", ["3"]),
        (["a", "b", "a", None, "n/a"], "enum_array", ["a", "b"]),
        ("a", "enum_array", ["a"]),  # scalar where a list was expected
    ],
)
def test_value_tokens(value, kind, expected):
    assert value_tokens(value, kind) == expected


# --- schema_properties --------------------------------------------------------


def test_schema_properties_accepts_json_schema_and_internal_formats():
    prop = {"type": "string", "enum": ["a"]}
    assert schema_properties({"properties": {"f": prop}}) == {"f": prop}
    # Internal flat format used by the schema editor: {field: {type, ...}}.
    assert schema_properties({"f": prop}) == {"f": prop}
    # Simplified {field: "description"} has no typed fields to compare.
    assert schema_properties({"f": "a description"}) == {}
    assert schema_properties(None) == {}
    assert schema_properties("not a dict") == {}


# --- latest_success_jobs ------------------------------------------------------


def test_latest_success_jobs_scopes_the_query_and_keeps_the_newest_per_collection():
    rows = [
        {
            "id": "new-pl",
            "job_id": "t-new-pl",
            "collection_id": PL_COL,
            "schema_id": SCHEMA,
            "completed_at": "2026-09-20T10:00:00Z",
        },
        {
            "id": "old-pl",
            "job_id": "t-old-pl",
            "collection_id": PL_COL,
            "schema_id": SCHEMA_B,
            "completed_at": "2026-09-19T10:00:00Z",
        },
        {
            "id": "uk",
            "job_id": "t-uk",
            "collection_id": UK_COL,
            "schema_id": SCHEMA,
            "completed_at": "2026-09-18T10:00:00Z",
        },
    ]
    client = FakeSupabaseClient(table_handlers={"extraction_jobs": rows})
    jobs = latest_success_jobs(client, [PL_COL, UK_COL], user_id="u1")
    assert {c: j["id"] for c, j in jobs.items()} == {PL_COL: "new-pl", UK_COL: "uk"}

    (query,) = client.table_calls
    assert query.table == "extraction_jobs"
    assert "results" not in query.select  # metadata only; results fetched later
    assert query.filter_values("in", "collection_id") == [[PL_COL, UK_COL]]
    assert query.filter_values("eq", "status") == [JOB_STATUS_SUCCESS]
    assert query.filter_values("eq", "user_id") == ["u1"]
    assert query.filter_values("not.is", "schema_id") == ["null"]
    # nullsfirst=False: a NULL completed_at (shouldn't happen for a SUCCESS
    # row, but costs nothing to guard) must never sort ahead of a real one.
    assert query.order == [("completed_at", True, False)]


# --- endpoint -----------------------------------------------------------------


def _pair_row(user_id: str) -> dict[str, Any]:
    return {
        "id": PAIR,
        "user_id": user_id,
        "name": "Fraud",
        "filters": {"appellant": ["offender"], "jurisdiction": ["PL"]},
        "text_query": "fraud",
        "pl_collection_id": PL_COL,
        "uk_collection_id": UK_COL,
        "created_at": "2026-09-21T00:00:00Z",
        "updated_at": "2026-09-21T00:00:00Z",
    }


class _StubPairsDb:
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows
        self.calls: list[tuple[str, str]] = []

    async def find_pair(self, pair_id: str, user_id: str):
        self.calls.append((pair_id, user_id))
        return next(
            (r for r in self.rows if r["id"] == pair_id and r["user_id"] == user_id),
            None,
        )


@pytest.fixture
def pairs_db(mock_user):
    db = _StubPairsDb([_pair_row(mock_user["id"])])
    app.dependency_overrides[get_collection_pairs_db] = lambda: db
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_collection_pairs_db, None)


def _facet_rows(_params: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "jurisdiction": "PL",
            "value": "x",
            "count": 3,
            "total": 3,
            "covered": 3,
            "coverage": 1.0,
        },
        {
            "jurisdiction": "UK",
            "value": "x",
            "count": 2,
            "total": 2,
            "covered": 2,
            "coverage": 1.0,
        },
    ]


def _job(job_id: str, collection_id: str, schema_id: str | None, results) -> dict:
    return {
        "id": job_id,
        "job_id": f"celery-{job_id[-1]}",
        "collection_id": collection_id,
        "schema_id": schema_id,
        "status": JOB_STATUS_SUCCESS,
        "completed_at": "2026-09-20T10:00:00Z",
        "results": results,
    }


def _jobs_handler(jobs: list[dict]):
    """Serve the metadata query and the per-id results query from one list."""

    def _handle(query: TableQuery) -> list[dict]:
        ids = query.filter_values("in", "id")
        if ids:
            return [j for j in jobs if j["id"] in ids[0]]
        return [
            {k: v for k, v in j.items() if k != "results"}
            for j in jobs
            if j["collection_id"] in query.filter_values("in", "collection_id")[0]
            and j["schema_id"] is not None
        ]

    return _handle


def _schema_rows(schema_id: str = SCHEMA) -> list[dict]:
    return [
        {
            "id": schema_id,
            "name": "Verdicts",
            "text": {
                "properties": {
                    "verdict": {
                        "type": "string",
                        "title": "Verdict",
                        "enum": ["guilty", "acquitted"],
                    },
                    "summary": {"type": "string"},  # free text: not comparable
                }
            },
        }
    ]


def _client(jobs: list[dict], schemas: list[dict] | None = None) -> FakeSupabaseClient:
    return FakeSupabaseClient(
        rpc_handlers={FACET_RPC: _facet_rows},
        table_handlers={
            "extraction_jobs": _jobs_handler(jobs),
            "extraction_schemas": _schema_rows() if schemas is None else schemas,
        },
    )


_MATCHING_JOBS = [
    _job(JOB_PL, PL_COL, SCHEMA, _results({"verdict": "guilty"}, {"verdict": ""})),
    _job(JOB_UK, UK_COL, SCHEMA, _results({"verdict": "acquitted"})),
]


@pytest.mark.anyio
async def test_pair_requires_bearer_user(client, valid_api_headers, pairs_db):
    response = await client.get(f"/compare/pairs/{PAIR}", headers=valid_api_headers)
    assert response.status_code in (401, 403)


@pytest.mark.anyio
async def test_pair_view_merges_base_and_extension_fields(
    authenticated_client, pairs_db, mock_user
):
    fake = _client(_MATCHING_JOBS)
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["pair"] == {
        "id": PAIR,
        "name": "Fraud",
        "pl_collection_id": PL_COL,
        "uk_collection_id": UK_COL,
    }
    # Base fields run over the pair's membership only: the stored filter and
    # text query are not re-applied (membership already reflects them).
    assert body["filters"] == {"collection_ids": [PL_COL, UK_COL]}
    assert body["text_query"] is None
    assert body["ignored_filter_keys"] == []
    assert body["totals"] == {"PL": 3, "UK": 2}
    assert [f["field"] for f in body["fields"]] == [
        s.field for s in base_compare_fields()
    ]
    assert {f["source"] for f in body["fields"]} == {"base"}
    assert all(
        call[1]["p_filters"] == {"collection_ids": [PL_COL, UK_COL]}
        and call[1]["p_text_query"] is None
        for call in fake.calls
    )
    assert len(fake.calls) == len(base_compare_fields())

    ext = body["extension"]
    assert body["extension_reason"] is None
    assert ext["schema_id"] == SCHEMA
    assert ext["schema_name"] == "Verdicts"
    assert ext["source"] == S1
    assert ext["jobs"] == {
        "PL": {"job_id": "celery-1", "completed_at": "2026-09-20T10:00:00Z"},
        "UK": {"job_id": "celery-2", "completed_at": "2026-09-20T10:00:00Z"},
    }
    assert ext["totals"] == {"PL": 2, "UK": 1}
    assert [f["field"] for f in ext["fields"]] == ["verdict"]
    verdict = ext["fields"][0]
    assert verdict["source"] == S1 and verdict["label"] == "Verdict"
    assert {v["value"]: v["counts"] for v in verdict["values"]} == {
        "guilty": {"PL": 1, "UK": 0},
        "acquitted": {"PL": 0, "UK": 1},
    }
    assert verdict["coverage"]["PL"] == {"covered": 1, "total": 2, "ratio": 0.5}

    # Job selection is scoped to the caller; the schema is resolved before the
    # heavy `results` read, which fetches only the two chosen jobs.
    meta, schema, results = fake.table_calls
    assert meta.table == "extraction_jobs"
    assert meta.filter_values("eq", "user_id") == [mock_user["id"]]
    assert schema.table == "extraction_schemas"
    assert schema.filter_values("eq", "id") == [SCHEMA]
    assert results.table == "extraction_jobs"
    assert results.select == "id, results"
    assert sorted(results.filter_values("in", "id")[0]) == sorted([JOB_PL, JOB_UK])
    assert pairs_db.calls == [(PAIR, mock_user["id"])]


@pytest.mark.anyio
async def test_pair_view_404_for_foreign_or_unknown_pair_without_touching_data(
    authenticated_client, pairs_db
):
    fake = _client(_MATCHING_JOBS)
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{OTHER_PAIR}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Collection pair not found"
    assert fake.calls == [] and fake.table_calls == []


@pytest.mark.anyio
async def test_pair_view_404_for_malformed_id_without_db_lookup(
    authenticated_client, pairs_db
):
    fake = _client(_MATCHING_JOBS)
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get("/compare/pairs/not-a-uuid")
    assert response.status_code == 404
    assert pairs_db.calls == []
    assert fake.calls == [] and fake.table_calls == []


@pytest.mark.anyio
async def test_pair_view_extension_null_when_schemas_differ(
    authenticated_client, pairs_db
):
    jobs = [
        _job(JOB_PL, PL_COL, SCHEMA, _results({"verdict": "guilty"})),
        _job(JOB_UK, UK_COL, SCHEMA_B, _results({"verdict": "acquitted"})),
    ]
    fake = _client(jobs)
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["extension"] is None
    assert body["extension_reason"] == "schema_mismatch"
    assert len(body["fields"]) == len(base_compare_fields())
    # No results download and no schema lookup when the sides disagree.
    assert [q.table for q in fake.table_calls] == ["extraction_jobs"]


@pytest.mark.anyio
async def test_pair_view_extension_null_when_a_side_has_no_job(
    authenticated_client, pairs_db
):
    fake = _client([_job(JOB_PL, PL_COL, SCHEMA, _results({"verdict": "guilty"}))])
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 200, response.text
    assert response.json()["extension"] is None
    assert response.json()["extension_reason"] == "no_job_uk"

    fake = _client([])
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.json()["extension_reason"] == "no_jobs"


@pytest.mark.anyio
async def test_pair_view_extension_null_when_schema_row_is_gone(
    authenticated_client, pairs_db
):
    fake = _client(_MATCHING_JOBS, schemas=[])
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 200, response.text
    assert response.json()["extension"] is None
    assert response.json()["extension_reason"] == "schema_not_found"


@pytest.mark.anyio
async def test_pair_view_extension_with_no_comparable_fields_is_empty_not_null(
    authenticated_client, pairs_db
):
    schemas = [{"id": SCHEMA, "name": "Notes", "text": {"summary": "free text"}}]
    fake = _client(_MATCHING_JOBS, schemas=schemas)
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 200, response.text
    ext = response.json()["extension"]
    assert ext["schema_name"] == "Notes" and ext["fields"] == []
    assert ext["totals"] == {"PL": 2, "UK": 1}


@pytest.mark.anyio
async def test_pair_view_degrades_to_base_fields_when_the_jobs_query_fails(
    authenticated_client, pairs_db
):
    def _boom(_query: TableQuery):
        raise RuntimeError("extraction_jobs unavailable")

    fake = FakeSupabaseClient(
        rpc_handlers={FACET_RPC: _facet_rows},
        table_handlers={"extraction_jobs": _boom},
    )
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["totals"] == {"PL": 3, "UK": 2}
    assert body["extension"] is None
    assert body["extension_reason"] == "extension_failed"


@pytest.mark.anyio
async def test_pair_view_500_when_the_facet_rpc_fails(authenticated_client, pairs_db):
    def _boom(_params):
        raise RuntimeError("boom")

    fake = FakeSupabaseClient(rpc_handlers={FACET_RPC: _boom})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "COMPARE_FAILED"


@pytest.mark.anyio
async def test_pair_view_503_without_database(authenticated_client, pairs_db):
    with patch("app.compare.router.supabase_client", None):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "DATABASE_UNAVAILABLE"
    assert pairs_db.calls == []


@pytest.mark.anyio
async def test_pair_view_runs_blocking_reads_off_the_event_loop(
    authenticated_client, pairs_db
):
    loop_thread = threading.get_ident()
    seen: list[int] = []

    def _rows(params):
        seen.append(threading.get_ident())
        return _facet_rows(params)

    def _jobs(query):
        seen.append(threading.get_ident())
        return _jobs_handler(_MATCHING_JOBS)(query)

    fake = FakeSupabaseClient(
        rpc_handlers={FACET_RPC: _rows},
        table_handlers={"extraction_jobs": _jobs, "extraction_schemas": _schema_rows()},
    )
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.get(f"/compare/pairs/{PAIR}")
    assert response.status_code == 200, response.text
    assert seen and all(t != loop_thread for t in seen)
