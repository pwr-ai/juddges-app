"""GDPR consent recording and audit archival behave as their callers assume (#484).

Both functions are new, and both are the kind of thing that is easy to write in a
way that looks right and quietly loses data: a consent update that overwrites an
unrelated consent's date, or an archival pass that deletes instead of marking.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.db

CONSENT_TYPES = [
    "professional_acknowledgment",
    "terms",
    "privacy_policy",
    "data_processing",
    "marketing",
]

# The column names per consent type, spelled out rather than derived. They are
# irregular in the real schema — professional acknowledgment uses
# `..._date`/`..._version` while terms and privacy policy use
# `..._accepted_date`/`..._accepted_version` — so any rule that generates them is
# wrong for at least one type. Taken verbatim from `_USER_CONSENT_COLS`.
CONSENT_COLUMNS = {
    "professional_acknowledgment": (
        "professional_acknowledgment_accepted",
        "professional_acknowledgment_date",
        "professional_acknowledgment_version",
    ),
    "terms": ("terms_accepted", "terms_accepted_date", "terms_accepted_version"),
    "privacy_policy": (
        "privacy_policy_accepted",
        "privacy_policy_accepted_date",
        "privacy_policy_accepted_version",
    ),
    "data_processing": (
        "data_processing_consent",
        "data_processing_consent_date",
        None,
    ),
    "marketing": ("marketing_consent", "marketing_consent_date", None),
}


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def _update_consent(conn, user_id, consent_type, accepted, version=None):
    return _exec(
        conn,
        "SELECT public.update_user_consent("
        "p_user_id => %s, p_consent_type => %s, p_accepted => %s, p_version => %s)",
        (user_id, consent_type, accepted, version),
    )


@pytest.fixture
def user(conn, make_user):
    return make_user(str(uuid.uuid4()))


@pytest.mark.parametrize("consent_type", CONSENT_TYPES)
def test_first_consent_creates_the_row_and_sets_its_columns(
    conn, user, consent_type: str
) -> None:
    """The endpoints select the row immediately after calling the RPC, so the
    upsert has to create it — there is no separate insert path."""
    _update_consent(conn, user, consent_type, True, "v1.0")

    accepted_col, date_col, _ = CONSENT_COLUMNS[consent_type]
    rows = _exec(
        conn,
        f"SELECT {accepted_col}, {date_col} "
        "FROM public.user_consent WHERE user_id = %s",
        (user,),
    )
    assert rows, "no user_consent row was created"
    accepted, when = rows[0]
    assert accepted is True
    assert when is not None, "acceptance did not record a date"


def test_history_entries_carry_exactly_the_keys_the_api_model_requires(
    conn, user
) -> None:
    """`consent.py` does `ConsentHistoryEntry(**entry)`.

    `version` has no default on that model, so it must be present even when null;
    an entry missing it makes the history endpoint raise rather than answer.
    """
    _update_consent(conn, user, "terms", True, "v2.0")
    _update_consent(conn, user, "marketing", False, None)

    history = _exec(
        conn,
        "SELECT consent_history FROM public.user_consent WHERE user_id = %s",
        (user,),
    )[0][0]

    assert len(history) == 2, f"expected two entries, got {history}"
    for entry in history:
        assert set(entry) == {"consent_type", "accepted", "version", "timestamp"}, (
            f"entry keys drifted from ConsentHistoryEntry: {sorted(entry)}"
        )
    assert history[0]["consent_type"] == "terms"
    assert history[0]["version"] == "v2.0"
    assert history[1]["version"] is None, "version must be present as null, not absent"
    assert history[1]["accepted"] is False


def test_one_consent_does_not_write_another_consents_columns(conn, user) -> None:
    """Assert the state after EACH call, not only at the end.

    A first version of this test set terms, then privacy policy, then checked the
    final row — and passed even with the terms branch deliberately writing the
    privacy-policy columns, because the later call overwrote them with the same
    values. Checking immediately after the first call is what actually catches a
    copy-paste across branches.
    """
    _update_consent(conn, user, "terms", True, "v1.0")

    others = _exec(
        conn,
        "SELECT privacy_policy_accepted, privacy_policy_accepted_date, "
        "privacy_policy_accepted_version, professional_acknowledgment_accepted, "
        "data_processing_consent, marketing_consent "
        "FROM public.user_consent WHERE user_id = %s",
        (user,),
    )[0]
    assert others == (False, None, None, False, False, False), (
        f"accepting terms also wrote another consent's columns: {others}"
    )


def test_updating_one_consent_leaves_the_others_untouched(conn, user) -> None:
    """The failure this guards is a CASE-per-column implementation that touches
    every column on every call and wipes unrelated acceptance dates."""
    _update_consent(conn, user, "terms", True, "v1.0")
    _update_consent(conn, user, "privacy_policy", True, "v3.0")

    row = _exec(
        conn,
        "SELECT terms_accepted, terms_accepted_version, terms_accepted_date, "
        "privacy_policy_accepted, privacy_policy_accepted_version, "
        "marketing_consent, marketing_consent_date "
        "FROM public.user_consent WHERE user_id = %s",
        (user,),
    )[0]

    assert row[0] is True and row[1] == "v1.0" and row[2] is not None, (
        "the second update clobbered the first consent"
    )
    assert row[3] is True and row[4] == "v3.0"
    assert row[5] is False and row[6] is None, "an untouched consent was modified"


def test_revoking_clears_the_date_and_version(conn, user) -> None:
    """A revoked consent that keeps its acceptance date reads as still accepted."""
    _update_consent(conn, user, "terms", True, "v1.0")
    _update_consent(conn, user, "terms", False, None)

    row = _exec(
        conn,
        "SELECT terms_accepted, terms_accepted_date, terms_accepted_version "
        "FROM public.user_consent WHERE user_id = %s",
        (user,),
    )[0]
    assert row == (False, None, None), f"revocation left stale state: {row}"

    history = _exec(
        conn,
        "SELECT consent_history FROM public.user_consent WHERE user_id = %s",
        (user,),
    )[0][0]
    assert len(history) == 2, "the revocation was not recorded in history"
    assert history[1]["accepted"] is False


def test_unknown_consent_type_is_rejected(conn, user) -> None:
    """Otherwise a typo appends history for a consent no column tracks."""
    import psycopg

    with pytest.raises(psycopg.Error) as exc_info:
        _update_consent(conn, user, "not_a_consent", True, "v1.0")
    assert exc_info.value.sqlstate == "P0422", (
        f"expected SQLSTATE P0422, got {exc_info.value.sqlstate}"
    )

    assert not _exec(
        conn, "SELECT 1 FROM public.user_consent WHERE user_id = %s", (user,)
    ), "a rejected consent type still created a row"


def _insert_audit_log(conn, retention_until: str | None) -> str:
    row_id = str(uuid.uuid4())
    _exec(
        conn,
        "INSERT INTO public.audit_logs (id, user_id, action_type, retention_until) "
        "VALUES (%s, %s, 'query', %s)",
        (row_id, "user-hash", retention_until),
    )
    return row_id


def test_archival_marks_only_expired_rows_and_returns_the_count(conn) -> None:
    expired = _insert_audit_log(conn, "2020-01-01T00:00:00Z")
    future = _insert_audit_log(conn, "2999-01-01T00:00:00Z")

    archived = _exec(conn, "SELECT public.archive_expired_audit_logs()")[0][0]
    assert archived >= 1

    states = dict(
        _exec(
            conn,
            "SELECT id::text, archived_at FROM public.audit_logs WHERE id = ANY(%s)",
            ([expired, future],),
        )
    )
    assert states[expired] is not None, "an expired row was not marked"
    assert states[future] is None, "a row still within retention was marked"


def test_archival_never_deletes(conn) -> None:
    """`RetentionService` documents this: audit logs must survive for compliance
    and deletion requires manual approval after archival."""
    expired = _insert_audit_log(conn, "2020-01-01T00:00:00Z")
    _exec(conn, "SELECT public.archive_expired_audit_logs()")

    assert (
        _exec(conn, "SELECT count(*) FROM public.audit_logs WHERE id = %s", (expired,))[
            0
        ][0]
        == 1
    ), "archival deleted the row"


def test_archival_is_idempotent(conn) -> None:
    """Beat or an operator may run it twice; the second pass must report zero
    rather than re-stamping rows and losing the original archival time."""
    _insert_audit_log(conn, "2020-01-01T00:00:00Z")
    first = _exec(conn, "SELECT public.archive_expired_audit_logs()")[0][0]
    second = _exec(conn, "SELECT public.archive_expired_audit_logs()")[0][0]

    assert first >= 1
    assert second == 0, f"the second pass re-archived {second} rows"


def test_every_audit_log_has_a_retention_date(conn) -> None:
    """`retention_until` is NOT NULL, so "no expiry set" is not representable.

    Written after trying to insert NULL and being rejected. The function still
    guards `retention_until IS NOT NULL` as belt and braces, and this records why
    that branch is currently unreachable rather than leaving it looking like dead
    code — if the column ever becomes nullable, this fails and asks for the case
    to be covered.
    """
    nullable = _exec(
        conn,
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_name = 'audit_logs' AND column_name = 'retention_until'",
    )[0][0]
    assert nullable == "NO", (
        "retention_until became nullable; archive_expired_audit_logs now needs a "
        "test for rows with no expiry set"
    )


def test_a_user_cannot_read_another_users_consent(conn, as_user, make_user) -> None:
    """Consent records are personal data; one user must not see another's.

    `user_consent` is not in the generic owner-scoped list checked elsewhere, so
    it needs its own assertion — and it carries exactly the data GDPR entitles a
    subject to, which is also the data they are not entitled to about anyone else.
    """
    owner = make_user(str(uuid.uuid4()))
    other = make_user(str(uuid.uuid4()))
    _update_consent(conn, owner, "terms", True, "v1.0")

    seen_by_owner = as_user(
        owner, "SELECT count(*) FROM public.user_consent WHERE user_id = %s", (owner,)
    )
    seen_by_other = as_user(
        other, "SELECT count(*) FROM public.user_consent WHERE user_id = %s", (owner,)
    )

    assert seen_by_owner[0][0] == 1, "the owner cannot read their own consent record"
    assert seen_by_other[0][0] == 0, "another user can read someone else's consent"


def test_clients_cannot_write_consent_directly(conn, as_user, make_user) -> None:
    """Every change must go through the RPC so the history entry cannot be skipped.

    A direct UPDATE that succeeded would produce a consent record whose
    `consent_history` does not match its columns — the one thing this table exists
    to prevent.
    """
    owner = make_user(str(uuid.uuid4()))
    _update_consent(conn, owner, "terms", True, "v1.0")

    import contextlib

    import psycopg

    # Either layer may deny — no write policy, or no privilege. Suppressing the
    # privilege error keeps the assertion about the observable outcome (the row
    # did not change) rather than about which layer stopped it.
    with contextlib.suppress(psycopg.errors.InsufficientPrivilege):
        as_user(
            owner,
            "UPDATE public.user_consent SET marketing_consent = true "
            "WHERE user_id = %s",
            (owner,),
        )

    assert (
        _exec(
            conn,
            "SELECT marketing_consent FROM public.user_consent WHERE user_id = %s",
            (owner,),
        )[0][0]
        is False
    ), "a client wrote consent directly, bypassing the history append"
