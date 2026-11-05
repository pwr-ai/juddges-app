"""Database contract for `search_judgments_by_embedding`'s HNSW recall (#733).

`hnsw.ef_search` bounds how many rows a single HNSW index scan can yield, and
its default is 40. The RPC used to leave it unset, so `match_count => 100`
silently returned 40 rows in production. These tests pin that the RPC raises
ef_search to cover `match_count`, and that it still orders by the raw
`embedding <=> query_embedding` expression the judgments HNSW index is built on
(unlike `document_chunks`, the judgments index is full-precision `vector`, not
`halfvec`).
"""

from __future__ import annotations

import random
import uuid

import pytest

from tests.db.test_extracted_filter_contract import _exec

pytestmark = pytest.mark.db

DIM = 1024
# Comfortably above the ef_search default of 40, below the RPC's floor of 100.
ROW_COUNT = 120


def _vec(seed: int) -> str:
    rng = random.Random(seed)
    return "[" + ",".join(f"{rng.uniform(-1, 1):.5f}" for _ in range(DIM)) + "]"


@pytest.fixture
def embedded_judgments(conn):
    ids = [str(uuid.uuid4()) for _ in range(ROW_COUNT)]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO public.judgments"
            " (id, case_number, jurisdiction, decision_date, full_text, embedding)"
            " VALUES (%s::uuid, %s, 'PL', '2020-01-01'::date, 'ef_search fixture', %s::vector)",
            [(jid, f"EF/{jid[:8]}", _vec(i)) for i, jid in enumerate(ids)],
        )
    yield ids
    _exec(conn, "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])", (ids,))


def _rpc_count(conn, match_count: int) -> int:
    """Call the RPC with the HNSW index forced, as on a production-sized table.

    On a 120-row table the planner would otherwise pick a seq scan, which has
    no ef_search ceiling and would hide the bug.
    """
    _exec(conn, "SET enable_seqscan = off")
    try:
        rows = _exec(
            conn,
            "SELECT count(*) FROM public.search_judgments_by_embedding(%s::vector, -1.0, %s)",
            (_vec(0), match_count),
        )
    finally:
        _exec(conn, "RESET enable_seqscan")
    return rows[0][0]


def test_rpc_body_sets_ef_search(conn):
    (body,) = _exec(
        conn,
        "SELECT pg_get_functiondef('public.search_judgments_by_embedding'::regproc)",
    )[0]
    flat = " ".join(body.split())
    assert (
        "set_config( 'hnsw.ef_search'" in flat or "set_config('hnsw.ef_search'" in flat
    )
    assert "ORDER BY j.embedding <=> query_embedding" in flat


def test_rpc_returns_more_than_ef_search_default(conn, embedded_judgments):
    assert _rpc_count(conn, 100) == 100


def test_rpc_returns_whole_table_when_match_count_exceeds_floor(
    conn, embedded_judgments
):
    # match_count above the 100 floor: ef_search must follow match_count.
    assert _rpc_count(conn, 200) == ROW_COUNT


def test_rpc_returns_nearest_first(conn, embedded_judgments):
    rows = _exec(
        conn,
        "SELECT id FROM public.search_judgments_by_embedding(%s::vector, -1.0, 5)",
        (_vec(7),),
    )
    assert str(rows[0][0]) == embedded_judgments[7]


def test_ef_search_does_not_leak_out_of_rpc(conn, embedded_judgments):
    # set_config(..., true) is transaction-local; autocommit ends it with the call.
    _rpc_count(conn, 100)
    assert _exec(conn, "SHOW hnsw.ef_search")[0][0] == "40"
