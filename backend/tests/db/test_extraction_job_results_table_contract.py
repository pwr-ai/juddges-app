"""extraction_job_results: per-row mirror of extraction_jobs.results.

The table is derived from the JSONB array by a trigger, so readers (paged RPC,
export, compare tally) can index into one job's results without detoasting the
whole array. These tests pin the mirror semantics: insert, append, in-place
change, shrink, NULL, cascade delete, the unchanged-row skip and privileges.
"""

from __future__ import annotations

import json
import uuid

import pytest

pytestmark = pytest.mark.db


def _item(i: int, status: str = "completed", **extra) -> dict:
    return {"document_id": f"doc-{i}", "status": status, **extra}


@pytest.fixture
def new_job(conn, make_user):
    def _new(results) -> str:
        owner = make_user(str(uuid.uuid4()))
        job_id = str(uuid.uuid4())
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.extraction_jobs (job_id, user_id, results) "
                "VALUES (%s, %s::uuid, %s::jsonb)",
                (job_id, owner, None if results is None else json.dumps(results)),
            )
        return job_id

    return _new


def _set_results(conn, job_id: str, results) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE public.extraction_jobs SET results = %s::jsonb WHERE job_id = %s",
            (None if results is None else json.dumps(results), job_id),
        )


def _rows(conn, job_id: str) -> list[tuple]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT position, document_id, bucket, item "
            "FROM public.extraction_job_results WHERE job_id = %s ORDER BY position",
            (job_id,),
        )
        return cur.fetchall()


def _xmin(conn, job_id: str, position: int) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT xmin::text FROM public.extraction_job_results "
            "WHERE job_id = %s AND position = %s",
            (job_id, position),
        )
        return cur.fetchone()[0]


def test_insert_mirrors_array_in_order_with_buckets(conn, new_job) -> None:
    statuses = ["completed", "FAILURE", "success", "pending", "partially_completed"]
    job_id = new_job([_item(i, s) for i, s in enumerate(statuses)])
    rows = _rows(conn, job_id)
    assert [r[0] for r in rows] == [1, 2, 3, 4, 5]
    assert [r[1] for r in rows] == [f"doc-{i}" for i in range(5)]
    assert [r[2] for r in rows] == [
        "completed",
        "failed",
        "completed",
        "other",
        "completed",
    ]
    assert rows[1][3] == _item(1, "FAILURE")


def test_null_results_insert_has_no_rows(conn, new_job) -> None:
    assert _rows(conn, new_job(None)) == []


def test_append_adds_rows_and_leaves_unchanged_rows_alone(conn, new_job) -> None:
    job_id = new_job([_item(0)])
    before = _xmin(conn, job_id, 1)
    # conn is autocommit, so the update below runs in a new transaction: a
    # rewritten row would carry a different xmin.
    _set_results(conn, job_id, [_item(0), _item(1, "failed")])
    rows = _rows(conn, job_id)
    assert [(r[0], r[2]) for r in rows] == [(1, "completed"), (2, "failed")]
    assert _xmin(conn, job_id, 1) == before


def test_changed_item_is_rewritten(conn, new_job) -> None:
    job_id = new_job([_item(0, "pending"), _item(1)])
    _set_results(
        conn, job_id, [_item(0, "completed", extracted_data={"a": 1}), _item(1)]
    )
    rows = _rows(conn, job_id)
    assert rows[0][2] == "completed"
    assert rows[0][3]["extracted_data"] == {"a": 1}


def test_shrink_and_null_drop_rows(conn, new_job) -> None:
    job_id = new_job([_item(i) for i in range(4)])
    _set_results(conn, job_id, [_item(0), _item(1)])
    assert [r[0] for r in _rows(conn, job_id)] == [1, 2]
    _set_results(conn, job_id, None)
    assert _rows(conn, job_id) == []


def test_non_array_results_are_treated_as_empty(conn, new_job) -> None:
    job_id = new_job([_item(0)])
    _set_results(conn, job_id, {"not": "an array"})
    assert _rows(conn, job_id) == []


def test_update_of_other_columns_does_not_touch_mirror(conn, new_job) -> None:
    job_id = new_job([_item(0)])
    before = _xmin(conn, job_id, 1)
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE public.extraction_jobs SET completed_documents = 1 WHERE job_id = %s",
            (job_id,),
        )
    assert _xmin(conn, job_id, 1) == before


def test_deleting_job_cascades(conn, new_job) -> None:
    job_id = new_job([_item(0), _item(1)])
    with conn.cursor() as cur:
        cur.execute("DELETE FROM public.extraction_jobs WHERE job_id = %s", (job_id,))
    assert _rows(conn, job_id) == []


def test_sync_function_rebuilds_from_stored_array(conn, new_job) -> None:
    job_id = new_job([_item(0), _item(1)])
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM public.extraction_job_results WHERE job_id = %s", (job_id,)
        )
        cur.execute("SELECT public.sync_extraction_job_results(%s)", (job_id,))
    assert [r[0] for r in _rows(conn, job_id)] == [1, 2]


def test_table_is_hidden_from_anon_and_authenticated(conn, as_role) -> None:
    for role in ("anon", "authenticated"):
        with pytest.raises(Exception, match="permission denied"):
            as_role(role, "SELECT 1 FROM public.extraction_job_results LIMIT 1")
    assert as_role("service_role", "SELECT count(*) FROM public.extraction_job_results")


def test_sync_functions_are_not_callable_by_clients(conn, as_role) -> None:
    for role in ("anon", "authenticated"):
        with pytest.raises(Exception, match="permission denied"):
            as_role(role, "SELECT public.sync_extraction_job_results('x')")
        with pytest.raises(Exception, match="permission denied"):
            as_role(
                role,
                "SELECT public.sync_extraction_job_results_from('x', '[]'::jsonb)",
            )


def test_service_role_reads_but_cannot_write_mirror(conn, as_role) -> None:
    with pytest.raises(Exception, match="permission denied"):
        as_role(
            "service_role",
            "DELETE FROM public.extraction_job_results WHERE job_id = 'x'",
        )
    with pytest.raises(Exception, match="permission denied"):
        as_role(
            "service_role",
            "SELECT public.sync_extraction_job_results_from('x', '[]'::jsonb)",
        )
    assert as_role("service_role", "SELECT public.sync_extraction_job_results('x')")
