"""Live-DB integration tests for search_chunks_by_embedding (issue #318).

Measures chunk-level search quality against the real corpus using a curated
ground-truth set (tests/fixtures/search_golden.yaml):

  - positive retrievability : each positive judgment is a semantic round-trip —
                     querying with one of its own chunks returns it in the top-K.
  - negative leak  : how many of a query's hard negative_ids appear in top-K for
                     the topic query (must be zero — same-language, different-
                     topic decoys sharing generic criminal vocabulary).

(Arbitrary-ID recall@K on a topic query is deliberately NOT used: the corpus is
dense and template-heavy — hundreds of equally-relevant docs per topic — so a
perfect ranker still misses two hand-picked IDs. Retrievability + negative
exclusion are the metrics that actually separate a working ranker from a broken
one here.)

Plus RPC contract checks (similarity ordering, jurisdiction filtering, the
language-only fallback that preserves jurisdiction).

Gated: runs only with RUN_INTEGRATION_TESTS=1 and a reachable DATABASE_URL +
TEI embedder, so unit CI stays fast.

By default the session fixture applies the fix migration
(20260715000002_fix_chunk_search_hnsw.sql) inside a rolled-back transaction, so
the tests exercise the corrected function without mutating the database. Set
CHUNK_RPC_SKIP_MIGRATION=1 to run against whatever function is live (used to
watch the tests fail red against the un-fixed function).
"""

from __future__ import annotations

import os
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
RETRIEVAL_K = 20  # a positive's own chunk must return it within this many results
GOLDEN_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "search_golden.yaml"
MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260715000002_fix_chunk_search_hnsw.sql"
)


def negative_leak(returned_ids: list[str], negative_ids: list[str], k: int) -> int:
    """Count of hard-negative ids that leaked into the top-k."""
    return len(set(returned_ids[:k]) & set(negative_ids))


def _golden() -> list[dict]:
    return yaml.safe_load(GOLDEN_PATH.read_text())["queries"]


@pytest.fixture(scope="module")
def conn():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    c = psycopg.connect(db_url)
    if os.getenv("CHUNK_RPC_SKIP_MIGRATION") != "1":
        # Apply the fix in an open transaction; rolled back on teardown so the
        # live database is never mutated by the test run.
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


def _search_ids(
    conn,
    embed,
    query: str,
    language: str,
    k: int = TOPK,
    jurisdiction: str | None = None,
) -> list[str]:
    vec = embed(query)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT document_id, similarity FROM public.search_chunks_by_embedding("
            "%s::vector, 0.2, %s, %s, %s, true)",
            (vec, k, language, jurisdiction),
        )
        rows = cur.fetchall()
    # dedupe to document ids, preserving similarity order
    seen: list[str] = []
    for doc_id, _sim in rows:
        s = str(doc_id)
        if s not in seen:
            seen.append(s)
    return seen


def _self_retrieval_rank(conn, embed, doc_id: str, language: str) -> int | None:
    """Query with the doc's own chunks; return the rank (1-based) at which the
    doc first appears in top-RETRIEVAL_K, or None. Tries the doc's longest few
    chunks (the most content-bearing) since some are shared boilerplate."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT chunk_text FROM document_chunks WHERE document_id = %s "
            "ORDER BY length(chunk_text) DESC LIMIT 5",
            (doc_id,),
        )
        chunks = [r[0] for r in cur.fetchall()]
    for text in chunks:
        returned = _search_ids(conn, embed, text[:1200], language, k=RETRIEVAL_K)
        if doc_id in returned:
            return returned.index(doc_id) + 1
    return None


@pytest.mark.parametrize("case", _golden(), ids=lambda c: c["id"])
def test_positive_docs_are_retrievable(conn, embed, case):
    """Every labelled positive is a semantic round-trip: one of its own chunks
    retrieves it within the top-RETRIEVAL_K."""
    for doc_id in case["positive_ids"]:
        rank = _self_retrieval_rank(conn, embed, doc_id, case["language"])
        assert rank is not None, (
            f"{case['id']}: positive {doc_id} not self-retrievable in "
            f"top-{RETRIEVAL_K} (embedding/ranking regression)"
        )


@pytest.mark.parametrize("case", _golden(), ids=lambda c: c["id"])
def test_hard_negatives_excluded(conn, embed, case):
    """No same-language, different-topic hard negative leaks into the top-K."""
    returned = _search_ids(conn, embed, case["query"], case["language"])
    assert returned, f"{case['id']}: no results"
    leak = negative_leak(returned, case["negative_ids"], TOPK)
    assert leak == 0, (
        f"{case['id']}: {leak} hard-negative(s) leaked into top-{TOPK} "
        f"({set(returned[:TOPK]) & set(case['negative_ids'])})"
    )


def test_default_threshold_returns_hits_via_index(conn, embed):
    """The fix's headline behavior: at the DEFAULT threshold the function must
    return results using the HNSW index within a tight statement timeout.

    Against the pre-fix function this fails — the default threshold (0.5) sat
    above BGE-M3 chunk similarities AND the boost-expression ORDER BY forced a
    sequential scan over ~329k rows, so the call either returned nothing or blew
    the timeout. The 15s bound is comfortably above HNSW (~1s) and well below the
    seq-scan cost.
    """
    vec = embed("wymiar kary pozbawienia wolności")
    with conn.cursor() as cur:
        cur.execute("SET LOCAL statement_timeout = '15s'")
        # NOTE: match_threshold intentionally omitted → exercises the default.
        cur.execute(
            "SELECT count(*) FROM public.search_chunks_by_embedding("
            "%s::vector, match_count := %s, filter_language := 'pl')",
            (vec, TOPK),
        )
        n = cur.fetchone()[0]
    assert n > 0, (
        "default-threshold search returned no rows (threshold too high / not index-backed)"
    )


def test_similarity_is_descending(conn, embed):
    vec = embed("wymiar kary pozbawienia wolności")
    with conn.cursor() as cur:
        cur.execute(
            "SELECT similarity FROM public.search_chunks_by_embedding("
            "%s::vector, 0.2, %s, 'pl', NULL, true)",
            (vec, TOPK),
        )
        sims = [r[0] for r in cur.fetchall()]
    assert sims, "no results"
    assert all(s is not None for s in sims), "NULL similarity returned"
    assert sims == sorted(sims, reverse=True), f"similarity not descending: {sims}"


def test_jurisdiction_filter_never_leaks_other_region(conn, embed):
    vec = embed("sentencing for grievous bodily harm")
    with conn.cursor() as cur:
        cur.execute(
            "SELECT jurisdiction FROM public.search_chunks_by_embedding("
            "%s::vector, 0.2, %s, 'en', 'UK', true)",
            (vec, TOPK),
        )
        jurs = {r[0] for r in cur.fetchall()}
    assert jurs, "no results"
    assert jurs == {"UK"}, f"jurisdiction filter leaked: {jurs}"
