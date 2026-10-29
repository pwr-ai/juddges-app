"""Database contract for the halfvec HNSW index on document_chunks.

Pins: (1) the chunk vector index is the halfvec expression index and the
full-precision one is gone; (2) the ORDER BY both chunk RPCs use matches that
expression, so the planner can pick the index; (3) both RPCs still return the
nearest chunk's document first.
"""

from __future__ import annotations

import random
import uuid

import pytest

from tests.db.test_extracted_filter_contract import _exec

pytestmark = pytest.mark.db

DIM = 1024
HALFVEC_ORDER = "embedding::halfvec(1024) <=> query_embedding::halfvec(1024)"


def _vec(seed: int) -> str:
    rng = random.Random(seed)
    return "[" + ",".join(f"{rng.uniform(-1, 1):.5f}" for _ in range(DIM)) + "]"


@pytest.fixture
def chunked_docs(conn):
    ids = []
    for i in range(3):
        jid = str(uuid.uuid4())
        _exec(
            conn,
            "INSERT INTO public.judgments (id, case_number, jurisdiction, decision_date, full_text)"
            " VALUES (%s::uuid, %s, 'PL', '2020-01-01'::date, 'contract fixture')",
            (jid, f"HV/{jid[:8]}"),
        )
        _exec(
            conn,
            "INSERT INTO public.document_chunks (document_id, chunk_index, chunk_text, language, embedding)"
            " VALUES (%s::uuid, 0, %s, 'pl', %s::vector)",
            (jid, f"fragment {i}", _vec(i)),
        )
        ids.append(jid)
    yield ids
    _exec(conn, "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])", (ids,))


def test_chunk_vector_index_is_halfvec(conn):
    rows = _exec(
        conn,
        "SELECT indexname, indexdef FROM pg_indexes"
        " WHERE schemaname = 'public' AND tablename = 'document_chunks' AND indexdef ILIKE '%%hnsw%%'",
    )
    assert [r[0] for r in rows] == ["idx_document_chunks_embedding_halfvec"]
    assert "halfvec_cosine_ops" in rows[0][1]


@pytest.mark.parametrize(
    "rpc", ["search_chunks_by_embedding", "search_judgments_hybrid"]
)
def test_rpc_orders_by_index_expression(conn, rpc):
    (body,) = _exec(conn, f"SELECT pg_get_functiondef('public.{rpc}'::regproc)")[0]
    assert f"ORDER BY c.{HALFVEC_ORDER}" in body
    assert "ORDER BY c.embedding <=> query_embedding\n" not in body


def test_planner_uses_halfvec_index(conn, chunked_docs):
    _exec(conn, "SET enable_seqscan = off")
    try:
        plan = _exec(
            conn,
            "EXPLAIN SELECT document_id FROM public.document_chunks c"
            " ORDER BY c.embedding::halfvec(1024) <=> %s::vector::halfvec(1024) LIMIT 10",
            (_vec(0),),
        )
    finally:
        _exec(conn, "RESET enable_seqscan")
    assert "idx_document_chunks_embedding_halfvec" in "\n".join(r[0] for r in plan)


def test_chunk_rpc_returns_nearest_first(conn, chunked_docs):
    rows = _exec(
        conn,
        "SELECT document_id FROM public.search_chunks_by_embedding(%s::vector, -1.0, 3)",
        (_vec(1),),
    )
    assert str(rows[0][0]) == chunked_docs[1]


def test_hybrid_rpc_returns_nearest_first(conn, chunked_docs):
    rows = _exec(
        conn,
        "SELECT id FROM public.search_judgments_hybrid(query_embedding => %s::vector,"
        " similarity_threshold => -1.0, result_limit => 3)",
        (_vec(2),),
    )
    assert str(rows[0][0]) == chunked_docs[2]
