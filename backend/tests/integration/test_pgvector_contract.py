"""Contract tests for pgvector embedding column + HNSW index.

Verifies that the deployed schema matches the dimension declared in
EMBEDDING_DIMENSION env var (default 1024) and that the HNSW index exists.
Skipped unless RUN_INTEGRATION_TESTS=1 and SUPABASE_DB_URL is set.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import psycopg
import pytest

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.integration

DB_URL = os.environ.get("SUPABASE_DB_URL", "")
EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIMENSION", "1024"))


@pytest.fixture
def db() -> Iterator[psycopg.Connection]:
    if not DB_URL:
        pytest.skip("SUPABASE_DB_URL not set")
    with psycopg.connect(DB_URL) as conn:
        yield conn


def test_judgments_embedding_column_has_expected_dimension(db):
    """The pgvector column on judgments must match EMBEDDING_DIMENSION."""
    with db.cursor() as cur:
        cur.execute(
            "SELECT atttypmod FROM pg_attribute "
            "WHERE attrelid = 'judgments'::regclass AND attname = 'embedding'"
        )
        row = cur.fetchone()
        assert row is not None, "embedding column not found on judgments"
        # pgvector encodes dimension in atttypmod
        assert row[0] == EMBEDDING_DIM, (
            f"vector dim {row[0]} != configured EMBEDDING_DIMENSION ({EMBEDDING_DIM})"
        )


def test_hnsw_index_exists_on_judgments_embedding(db):
    """An HNSW index must exist on judgments.embedding for semantic search."""
    with db.cursor() as cur:
        cur.execute(
            "SELECT indexname, indexdef FROM pg_indexes "
            "WHERE tablename = 'judgments' "
            "AND indexdef ILIKE '%hnsw%embedding%'"
        )
        rows = cur.fetchall()
        assert rows, "No HNSW index on judgments.embedding found"
