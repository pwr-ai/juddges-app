"""Right-to-erasure request records behave as `RetentionService` assumes (#504).

The one behaviour worth more than the rest: erasing the subject must not erase the
receipt. A `CASCADE` here would destroy the only record that a deletion was
requested and what it removed, at exactly the moment that record starts to matter.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

pytestmark = pytest.mark.db

REQUEST_TYPES = ["full_deletion", "partial_deletion", "anonymization"]
STATUSES = ["pending", "in_progress", "completed", "failed"]


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def _create_request(conn, user_id, request_type="full_deletion", data_types=None):
    """Mirror the insert payload at retention_service.py:263 field for field.

    Including `created_at`, which the service supplies itself as
    `datetime.now(UTC).isoformat()` rather than leaning on the column default. The
    column has to accept that string, so the test sends it in the same form —
    letting the default fill it in here would leave the one part of the payload
    the client actually formats untested.
    """
    return _exec(
        conn,
        "INSERT INTO public.data_deletion_requests "
        "(user_id, request_type, data_types, reason, status, created_at) "
        "VALUES (%s, %s, %s, %s, 'pending', %s) RETURNING id",
        (
            user_id,
            request_type,
            data_types if data_types is not None else [],
            "no longer using the service",
            datetime.now(UTC).isoformat(),
        ),
    )[0][0]


@pytest.fixture
def user(conn, make_user):
    return make_user(str(uuid.uuid4()))


def test_the_insert_the_service_performs_succeeds(conn, user) -> None:
    """`request_data_deletion` raises a 500 if the insert returns no rows."""
    request_id = _create_request(
        conn, user, "partial_deletion", ["audit_logs", "analytics", "feedback"]
    )
    row = _exec(
        conn,
        "SELECT user_id, request_type, data_types, status, created_at, "
        "started_at, completed_at, deletion_summary "
        "FROM public.data_deletion_requests WHERE id = %s",
        (request_id,),
    )[0]

    assert str(row[0]) == user
    assert row[1] == "partial_deletion"
    assert row[2] == ["audit_logs", "analytics", "feedback"]
    assert row[3] == "pending", "a new request must start pending"
    assert row[4] is not None
    assert row[5] is None and row[6] is None, "a new request is not yet started"
    assert row[7] == {}, "deletion_summary must default to an empty object"


def test_the_projection_the_service_reads_selects_every_column(conn, user) -> None:
    """`process_deletion_request` selects exactly these five; a missing one is a
    PostgREST 400 rather than a clear error."""
    request_id = _create_request(conn, user)
    row = _exec(
        conn,
        "SELECT id, user_id, request_type, data_types, status "
        "FROM public.data_deletion_requests WHERE id = %s",
        (request_id,),
    )
    assert row, "the projection retention_service uses does not resolve"


def test_the_three_status_transitions_the_service_writes(conn, user) -> None:
    """in_progress with started_at and processed_by, then completed with
    completed_at and deletion_summary, or failed with error_message."""
    request_id = _create_request(conn, user)

    _exec(
        conn,
        "UPDATE public.data_deletion_requests "
        "SET status = 'in_progress', started_at = now(), processed_by = %s "
        "WHERE id = %s",
        ("operator-1", request_id),
    )
    _exec(
        conn,
        "UPDATE public.data_deletion_requests "
        "SET status = 'completed', completed_at = now(), deletion_summary = %s "
        "WHERE id = %s",
        ('{"audit_logs": "deleted 12 records"}', request_id),
    )

    row = _exec(
        conn,
        "SELECT status, started_at, completed_at, processed_by, deletion_summary "
        "FROM public.data_deletion_requests WHERE id = %s",
        (request_id,),
    )[0]
    assert row[0] == "completed"
    assert row[1] is not None and row[2] is not None
    assert row[3] == "operator-1"
    assert row[4] == {"audit_logs": "deleted 12 records"}

    _exec(
        conn,
        "UPDATE public.data_deletion_requests "
        "SET status = 'failed', error_message = %s WHERE id = %s",
        ("upstream timeout", request_id),
    )
    assert _exec(
        conn,
        "SELECT status, error_message FROM public.data_deletion_requests WHERE id = %s",
        (request_id,),
    )[0] == ("failed", "upstream timeout")


@pytest.mark.parametrize("request_type", REQUEST_TYPES)
def test_every_request_type_the_api_accepts_is_storable(
    conn, user, request_type: str
) -> None:
    """A CHECK narrower than `DataDeletionRequest`'s Literal turns a valid request
    into a 500."""
    assert _create_request(conn, user, request_type)


@pytest.mark.parametrize("status", STATUSES)
def test_every_status_the_service_sets_is_storable(conn, user, status: str) -> None:
    request_id = _create_request(conn, user)
    _exec(
        conn,
        "UPDATE public.data_deletion_requests SET status = %s WHERE id = %s",
        (status, request_id),
    )
    assert (
        _exec(
            conn,
            "SELECT status FROM public.data_deletion_requests WHERE id = %s",
            (request_id,),
        )[0][0]
        == status
    )


def test_an_unknown_status_is_rejected(conn, user) -> None:
    """Otherwise a typo parks a request in a state nothing processes."""
    import psycopg

    request_id = _create_request(conn, user)
    with pytest.raises(psycopg.errors.CheckViolation):
        _exec(
            conn,
            "UPDATE public.data_deletion_requests SET status = 'nearly_done' "
            "WHERE id = %s",
            (request_id,),
        )


def test_deleting_the_user_keeps_the_request_record(conn, user) -> None:
    """The point of the table.

    A full deletion removes the auth user this request is about. If the row
    cascaded away, the only record that the erasure was requested — and
    `deletion_summary`, the only account of what was removed — would vanish at
    exactly the moment it starts to matter. `user_id` is nulled instead.
    """
    request_id = _create_request(conn, user)
    _exec(
        conn,
        "UPDATE public.data_deletion_requests SET status = 'completed', "
        "deletion_summary = %s WHERE id = %s",
        ('{"audit_logs": "deleted 3 records"}', request_id),
    )

    _exec(conn, "DELETE FROM auth.users WHERE id = %s", (user,))

    rows = _exec(
        conn,
        "SELECT user_id, status, deletion_summary "
        "FROM public.data_deletion_requests WHERE id = %s",
        (request_id,),
    )
    assert rows, "deleting the user destroyed the record of their erasure request"
    user_id, status, summary = rows[0]
    assert user_id is None, "user_id should be nulled, not left dangling"
    assert status == "completed"
    assert summary == {"audit_logs": "deleted 3 records"}, (
        "the account of what was deleted must survive the deletion"
    )


def test_a_user_cannot_read_another_users_deletion_request(
    conn, as_user, make_user
) -> None:
    owner = make_user(str(uuid.uuid4()))
    other = make_user(str(uuid.uuid4()))
    request_id = _create_request(conn, owner)

    seen_by_owner = as_user(
        owner,
        "SELECT count(*) FROM public.data_deletion_requests WHERE id = %s",
        (request_id,),
    )
    seen_by_other = as_user(
        other,
        "SELECT count(*) FROM public.data_deletion_requests WHERE id = %s",
        (request_id,),
    )
    assert seen_by_owner[0][0] == 1, "the subject cannot see their own request"
    assert seen_by_other[0][0] == 0, "another user can read someone else's request"


def test_a_client_cannot_mark_its_own_erasure_complete(
    conn, as_user, make_user
) -> None:
    """The status must only be advanced by the processing pass.

    A client that could set `completed` would record its erasure as honoured
    without anything having been erased.

    Two layers hold this, so the test checks both. RLS alone makes the UPDATE
    match zero rows (no write policy exists), which is silent — indistinguishable
    from a write that was allowed but found nothing. So the privileges are
    asserted directly as well: a later `GRANT UPDATE ... TO authenticated` paired
    with a permissive policy is the realistic drift, and only the privilege
    assertion catches the first half of it before the second half lands.
    """
    import contextlib

    import psycopg

    owner = make_user(str(uuid.uuid4()))
    request_id = _create_request(conn, owner)

    with contextlib.suppress(psycopg.errors.InsufficientPrivilege):
        as_user(
            owner,
            "UPDATE public.data_deletion_requests SET status = 'completed' "
            "WHERE id = %s",
            (request_id,),
        )

    assert (
        _exec(
            conn,
            "SELECT status FROM public.data_deletion_requests WHERE id = %s",
            (request_id,),
        )[0][0]
        == "pending"
    ), "a client advanced its own deletion request"

    granted = [
        privilege
        for privilege in ("INSERT", "UPDATE", "DELETE")
        if _exec(
            conn,
            "SELECT has_table_privilege('authenticated', "
            "'public.data_deletion_requests', %s)",
            (privilege,),
        )[0][0]
    ]
    assert not granted, (
        f"authenticated holds {granted} on data_deletion_requests; only the "
        "service role may create or advance a request"
    )
    assert (
        _exec(
            conn,
            "SELECT has_table_privilege('anon', 'public.data_deletion_requests', 'SELECT')",
        )[0][0]
        is False
    ), "anon can read deletion requests"
