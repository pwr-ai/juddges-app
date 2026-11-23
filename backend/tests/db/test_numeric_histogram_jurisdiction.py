"""get_numeric_field_histogram(field, bucket_count, p_jurisdiction): scoping.

The scratch DB is shared between tests, so assertions compare the histogram
against a direct COUNT over the same jurisdiction instead of absolute numbers.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.db


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


@pytest.fixture
def victims(conn):
    ids = []
    for jurisdiction, n in [("PL", 1), ("PL", 2), ("PL", 2), ("UK", 5), ("UK", 9)]:
        jid = str(uuid.uuid4())
        ids.append(jid)
        _exec(
            conn,
            "INSERT INTO public.judgments (id, case_number, jurisdiction, decision_date,"
            " full_text, base_extraction_status, base_num_victims)"
            " VALUES (%s::uuid, %s, %s, '2020-01-01'::date, 'x', 'completed', %s)",
            (jid, f"HIST/{jid[:8]}", jurisdiction, n),
        )
    yield
    _exec(conn, "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])", (ids,))


def _hist_total(conn, jurisdiction):
    rows = _exec(
        conn,
        "SELECT cnt FROM public.get_numeric_field_histogram(%s, %s, %s)",
        ("num_victims", 5, jurisdiction),
    )
    return sum(r[0] for r in rows)


def _direct_total(conn, jurisdiction):
    where = "" if jurisdiction is None else f"AND jurisdiction = '{jurisdiction}'"
    return _exec(
        conn,
        "SELECT count(*) FROM public.judgments WHERE base_extraction_status = 'completed'"
        f" AND base_num_victims IS NOT NULL {where}",
    )[0][0]


@pytest.mark.parametrize("jurisdiction", [None, "PL", "UK"])
def test_histogram_total_matches_scope(conn, victims, jurisdiction) -> None:
    assert _hist_total(conn, jurisdiction) == _direct_total(conn, jurisdiction)


def test_histogram_scopes_differ_between_jurisdictions(conn, victims) -> None:
    assert _hist_total(conn, "PL") < _hist_total(conn, None)
    assert _hist_total(conn, "UK") < _hist_total(conn, None)


def test_two_arg_call_still_works(conn, victims) -> None:
    rows = _exec(
        conn,
        "SELECT cnt FROM public.get_numeric_field_histogram(%s, %s)",
        ("num_victims", 5),
    )
    assert sum(r[0] for r in rows) == _direct_total(conn, None)


def test_unknown_jurisdiction_raises(conn) -> None:
    with pytest.raises(Exception, match="Unknown jurisdiction"):
        _exec(
            conn,
            "SELECT * FROM public.get_numeric_field_histogram(%s, %s, %s)",
            ("num_victims", 5, "DE"),
        )
