"""Live-DB integration tests for the chunk-ranked search_judgments_hybrid (#320).

The main /documents/search path fuses a vector branch + FTS text branch via RRF.
This migration changes the vector branch to rank documents by their best-matching
CHUNK (not the weak document embedding) and to return that matched chunk's text.

Tests assert the fix-specific behaviour:
  - the vector-matched top result's snippet is a REAL chunk of the document
    (not the boilerplate summary the old function returned);
  - a topic query surfaces relevant docs and excludes same-language hard negatives;
  - the call stays within a latency bound (HNSW, no seq scan).

Gated by RUN_INTEGRATION_TESTS=1. A module fixture applies the migration inside a
rolled-back transaction (prod untouched). Set HYBRID_SKIP_MIGRATION=1 to run
against the live function (used to watch tests fail red against the pre-fix one).
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest
import yaml

psycopg = pytest.importorskip("psycopg")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION_TESTS") != "1",
        reason="Set RUN_INTEGRATION_TESTS=1 to run live-DB search tests",
    ),
]

TOPK = 10
GOLDEN_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "search_golden.yaml"
MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260715000003_hybrid_rank_by_best_chunk.sql"
)


def _golden() -> list[dict]:
    return yaml.safe_load(GOLDEN_PATH.read_text())["queries"]


@pytest.fixture(scope="module")
def conn():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    c = psycopg.connect(db_url)
    if os.getenv("HYBRID_SKIP_MIGRATION") != "1":
        with c.cursor() as cur:
            cur.execute(MIGRATION_PATH.read_text())
    yield c
    c.rollback()
    c.close()


@pytest.fixture(scope="module")
def embed():
    try:
        from juddges_search.embeddings import embed_texts
    except Exception as e:
        pytest.skip(f"embedder unavailable: {e}")

    def _embed(text: str) -> str:
        vec = embed_texts([text])[0]
        return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"

    return _embed


def _hybrid(conn, embed, query: str, language: str, limit: int = TOPK):
    vec = embed(query)
    with conn.cursor() as cur:
        cur.execute("SET LOCAL statement_timeout = '20s'")
        cur.execute(
            "SELECT id, chunk_text, chunk_type, vector_score "
            "FROM public.search_judgments_hybrid("
            "query_embedding := %s::vector, search_text := %s, "
            "search_language := %s, result_limit := %s)",
            (vec, query, language, limit),
        )
        return cur.fetchall()


def test_top_result_snippet_is_a_real_chunk_not_summary(conn, embed):
    """The vector-ranked top result must return the matched chunk text — i.e. a
    row that actually exists in document_chunks — not the document summary the
    pre-fix function returned. This is the headline behaviour of #320."""
    rows = _hybrid(
        conn, embed, "jazda w stanie nietrzeźwości prowadzenie pojazdu", "polish"
    )
    assert rows, "no results"
    doc_id, chunk_text, _ctype, _vs = rows[0]
    with conn.cursor() as cur:
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM public.document_chunks "
            "WHERE document_id = %s AND chunk_text = %s)",
            (doc_id, chunk_text),
        )
        is_real_chunk = cur.fetchone()[0]
        cur.execute("SELECT summary FROM public.judgments WHERE id = %s", (doc_id,))
        summary = cur.fetchone()[0]
    assert is_real_chunk, (
        "top result snippet is not a document_chunks row — vector branch is not "
        "returning the matched chunk (pre-fix behaviour returned the summary)"
    )
    assert chunk_text != summary, "snippet equals the boilerplate summary"


@pytest.mark.parametrize("case", _golden(), ids=lambda c: c["id"])
def test_hard_negatives_excluded_via_endpoint(conn, embed, case):
    rows = _hybrid(conn, embed, case["query"], case["language"])
    assert rows, f"{case['id']}: no results"
    returned = {str(r[0]) for r in rows[:TOPK]}
    leak = returned & set(case["negative_ids"])
    assert not leak, f"{case['id']}: hard-negative(s) leaked into top-{TOPK}: {leak}"


def test_hybrid_latency_within_budget(conn, embed):
    t0 = time.perf_counter()
    rows = _hybrid(conn, embed, "wymiar kary pozbawienia wolności", "polish", limit=20)
    elapsed = time.perf_counter() - t0
    assert rows, "no results"
    assert elapsed < 8.0, (
        f"hybrid search took {elapsed:.1f}s (seq scan / not index-backed?)"
    )
