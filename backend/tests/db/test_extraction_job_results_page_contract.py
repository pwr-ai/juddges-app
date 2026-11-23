"""get_extraction_job_results_page: paginated slice of extraction_jobs.results.

The RPC slices the JSONB array inside Postgres so the job detail page never
pulls a ~15 MB array through PostgREST. These tests pin the return shape, the
ownership filter, the status buckets, ordering/clamping and the privileges.
"""

from __future__ import annotations

import json
import uuid

import pytest

pytestmark = pytest.mark.db

_PAGE = "public.get_extraction_job_results_page"


def _item(i: int, status: str) -> dict:
    return {"document_id": f"doc-{i}", "status": status}


@pytest.fixture
def seed_job(conn, make_user):
    def _seed(results, user_id: str | None = None) -> tuple[str, str]:
        owner = make_user(user_id or str(uuid.uuid4()))
        job_id = str(uuid.uuid4())
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.extraction_jobs (job_id, user_id, results) "
                "VALUES (%s, %s::uuid, %s::jsonb)",
                (job_id, owner, json.dumps(results)),
            )
        return job_id, owner

    return _seed


def _page(conn, job_id, user_id, offset=0, limit=50, status=None) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT {_PAGE}(%s, %s::uuid, %s, %s, %s)",
            (job_id, user_id, offset, limit, status),
        )
        return cur.fetchone()[0]


@pytest.fixture
def mixed_job(seed_job):
    statuses = ["completed", "failed", "SUCCESS", "failure", "pending", "completed"]
    return seed_job([_item(i, s) for i, s in enumerate(statuses)])


def test_shape_and_counts(conn, mixed_job) -> None:
    job_id, owner = mixed_job
    page = _page(conn, job_id, owner)
    assert page["found"] is True
    assert page["total"] == 6
    assert page["filtered_total"] == 6
    assert page["counts"] == {"completed": 3, "failed": 2, "other": 1}
    assert [i["document_id"] for i in page["items"]] == [f"doc-{i}" for i in range(6)]


def test_offset_limit_preserve_order(conn, mixed_job) -> None:
    job_id, owner = mixed_job
    page = _page(conn, job_id, owner, offset=2, limit=2)
    assert [i["document_id"] for i in page["items"]] == ["doc-2", "doc-3"]
    assert page["total"] == 6


def test_status_filter_buckets(conn, mixed_job) -> None:
    job_id, owner = mixed_job
    done = _page(conn, job_id, owner, status="completed")
    assert [i["document_id"] for i in done["items"]] == ["doc-0", "doc-2", "doc-5"]
    assert done["filtered_total"] == 3
    assert done["total"] == 6
    assert done["counts"] == {"completed": 3, "failed": 2, "other": 1}
    failed = _page(conn, job_id, owner, status="failed", offset=1, limit=5)
    assert [i["document_id"] for i in failed["items"]] == ["doc-3"]
    assert failed["filtered_total"] == 2


def test_clamps_offset_and_limit(conn, seed_job) -> None:
    job_id, owner = seed_job([_item(i, "completed") for i in range(250)])
    assert len(_page(conn, job_id, owner, offset=-5, limit=1000)["items"]) == 200
    page = _page(conn, job_id, owner, offset=0, limit=0)
    assert len(page["items"]) == 1


def test_other_user_and_missing_job_are_not_found(conn, mixed_job, make_user) -> None:
    job_id, _ = mixed_job
    stranger = make_user(str(uuid.uuid4()))
    for jid, uid in ((job_id, stranger), (str(uuid.uuid4()), stranger)):
        page = _page(conn, jid, uid)
        assert page["found"] is False
        assert page["items"] == []
        assert page["total"] == 0


def test_null_results_is_found_and_empty(conn, make_user) -> None:
    owner = make_user(str(uuid.uuid4()))
    job_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO public.extraction_jobs (job_id, user_id) VALUES (%s, %s::uuid)",
            (job_id, owner),
        )
    page = _page(conn, job_id, owner)
    assert page["found"] is True
    assert page["items"] == []
    assert page["total"] == 0


def test_only_service_role_can_execute(conn, as_role) -> None:
    args = "('x', gen_random_uuid(), 0, 1, NULL)"
    for role in ("anon", "authenticated"):
        with pytest.raises(Exception, match="permission denied"):
            as_role(role, f"SELECT {_PAGE}{args}")
    assert as_role("service_role", f"SELECT {_PAGE}{args}")
