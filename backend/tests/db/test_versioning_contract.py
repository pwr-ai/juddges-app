"""The version trigger fires and version numbers cannot collide (#482).

Both were proven once by hand. The concurrency one especially needs a standing
test, because the naive implementation — read `MAX(version_number)`, then insert
— looks correct, passes every single-threaded test, and only fails under load.
A single-statement `INSERT ... SELECT MAX+1` is not sufficient either: under READ
COMMITTED it cannot see an uncommitted sibling row. The advisory lock is what
makes it safe, so this asserts the lock's effect rather than its presence.
"""

from __future__ import annotations

import threading
import uuid

import pytest

pytestmark = pytest.mark.db


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def _new_schema(conn) -> str:
    schema_id = str(uuid.uuid4())
    _exec(
        conn,
        "INSERT INTO public.extraction_schemas "
        "(id, name, type, category, text) "
        "VALUES (%s, %s, 'custom', 'test', '{\"a\": 1}'::jsonb)",
        (schema_id, f"schema-{schema_id[:8]}"),
    )
    return schema_id


def _versions(conn, schema_id: str) -> list[tuple]:
    return _exec(
        conn,
        "SELECT version_number, change_type FROM public.schema_versions "
        "WHERE schema_id = %s ORDER BY version_number",
        (schema_id,),
    )


def test_inserting_a_schema_creates_version_one(conn) -> None:
    """Nothing in the application writes schema_versions; the trigger is the
    only thing that populates history. Without it the table stays empty forever
    while looking correctly created."""
    schema_id = _new_schema(conn)
    rows = _versions(conn, schema_id)
    assert [r[0] for r in rows] == [1], f"expected exactly version 1, got {rows}"


def test_updating_a_schema_appends_the_next_version(conn) -> None:
    schema_id = _new_schema(conn)
    _exec(
        conn,
        "UPDATE public.extraction_schemas SET text = '{\"a\": 2}'::jsonb WHERE id = %s",
        (schema_id,),
    )
    assert [r[0] for r in _versions(conn, schema_id)] == [1, 2]


def test_the_snapshot_holds_the_value_from_its_own_version(conn) -> None:
    """A snapshot that reflects the current row rather than the historical one
    makes rollback a no-op while every count still looks right."""
    schema_id = _new_schema(conn)
    _exec(
        conn,
        "UPDATE public.extraction_schemas SET text = '{\"a\": 99}'::jsonb WHERE id = %s",
        (schema_id,),
    )
    snapshots = _exec(
        conn,
        "SELECT version_number, schema_snapshot FROM public.schema_versions "
        "WHERE schema_id = %s ORDER BY version_number",
        (schema_id,),
    )
    first = dict(snapshots)[1]
    assert first == {"a": 1}, f"version 1 snapshot was overwritten: {first}"


def _create_document_version(cur, document_id: str, content_hash: str):
    cur.execute(
        """
        SELECT version_number FROM public.create_document_version(
            p_document_id => %s,
            p_title => 't',
            p_full_text => 'body',
            p_summary => NULL,
            p_content_hash => %s,
            p_change_description => 'concurrent',
            p_change_type => 'amendment',
            p_created_by => 'system',
            p_extracted_data => '{}'::jsonb
        )
        """,
        (document_id, content_hash),
    )
    return cur.fetchone()[0]


def test_concurrent_callers_get_consecutive_version_numbers(
    migrated_database: str,
) -> None:
    """Two genuinely overlapping transactions must produce N and N+1.

    Constructed as a real race: A opens a transaction and allocates, and B calls
    while A is still uncommitted. Without the per-document advisory lock B would
    compute the same number as A and violate the unique constraint.
    """
    psycopg = pytest.importorskip("psycopg")
    document_id = f"doc-{uuid.uuid4().hex[:8]}"

    conn_a = psycopg.connect(migrated_database)
    conn_b = psycopg.connect(migrated_database)
    result: dict[str, object] = {}

    try:
        cur_a = conn_a.cursor()
        version_a = _create_document_version(cur_a, document_id, "hash-a")

        def run_b() -> None:
            try:
                with conn_b.cursor() as cur_b:
                    result["b"] = _create_document_version(cur_b, document_id, "hash-b")
                conn_b.commit()
            except Exception as exc:
                result["error"] = exc

        thread = threading.Thread(target=run_b)
        thread.start()
        # B is now blocked on the advisory lock A holds. If it were not blocked,
        # it would already have allocated the same number.
        thread.join(timeout=2)
        assert thread.is_alive(), (
            "the second caller did not block, so nothing serialises the "
            "allocation — a collision is only a matter of timing"
        )

        conn_a.commit()
        thread.join(timeout=15)
        assert not thread.is_alive(), "the second caller never completed"
    finally:
        conn_a.close()
        conn_b.close()

    assert "error" not in result, f"the second caller failed: {result.get('error')!r}"
    assert sorted([version_a, result["b"]]) == [version_a, version_a + 1], (
        f"expected consecutive versions, got {version_a} and {result['b']}"
    )


def test_duplicate_content_is_rejected_with_the_agreed_sqlstate(
    migrated_database: str,
) -> None:
    """`versioning.py` maps SQLSTATE P0409 back to its existing HTTP 409.

    A different code — or a plain unique violation — would surface as a 500.
    """
    psycopg = pytest.importorskip("psycopg")
    document_id = f"doc-{uuid.uuid4().hex[:8]}"

    with psycopg.connect(migrated_database, autocommit=True) as conn:
        with conn.cursor() as cur:
            _create_document_version(cur, document_id, "same-hash")
        # Caught as the base error and asserted on `sqlstate`: psycopg maps the
        # custom P0 class onto ProgrammingError, so pinning an exception type
        # would be pinning a driver detail rather than the contract.
        with pytest.raises(psycopg.Error) as exc_info, conn.cursor() as cur:
            _create_document_version(cur, document_id, "same-hash")

    assert exc_info.value.sqlstate == "P0409", (
        f"expected SQLSTATE P0409, got {exc_info.value.sqlstate}"
    )
