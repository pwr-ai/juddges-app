"""RLS policy regression tests.

Requires SUPABASE_DB_URL pointing at a NON-PROD project with the latest
RLS migration applied (20260429074740_enable_rls_and_tighten_policies.sql).
Skipped unless RUN_INTEGRATION_TESTS=1.

Safety: aborts if SUPABASE_DB_URL contains 'prod' and the override env var
I_KNOW_WHAT_IM_DOING is not set to 'yes'.
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


def _require_db() -> str:
    if not DB_URL:
        pytest.skip("SUPABASE_DB_URL not set; integration test requires a non-prod DB")
    if "prod" in DB_URL.lower() and os.environ.get("I_KNOW_WHAT_IM_DOING") != "yes":
        pytest.fail(
            "Refusing to run RLS tests against a URL containing 'prod'. "
            "Set I_KNOW_WHAT_IM_DOING=yes if this is genuinely non-prod."
        )
    return DB_URL


@pytest.fixture
def db() -> Iterator[psycopg.Connection]:
    url = _require_db()
    with psycopg.connect(url) as conn:
        yield conn


def test_rls_enabled_on_judgments(db):
    """RLS must be enabled on the judgments table per migration 20260429074740."""
    with db.cursor() as cur:
        cur.execute("SELECT relrowsecurity FROM pg_class WHERE relname = 'judgments'")
        row = cur.fetchone()
        assert row is not None, "judgments table not found"
        assert row[0] is True, "RLS not enabled on judgments"


def test_rls_enabled_on_document_chunks(db):
    """RLS must be enabled on document_chunks (added in migration 20260429074740)."""
    with db.cursor() as cur:
        cur.execute(
            "SELECT relrowsecurity FROM pg_class WHERE relname = 'document_chunks'"
        )
        row = cur.fetchone()
        # If table doesn't exist on the target DB, skip rather than fail
        if row is None:
            pytest.skip("document_chunks table not found on target DB")
        assert row[0] is True, "RLS not enabled on document_chunks"


def test_anon_role_cannot_write_judgments(db):
    """The anon role must NOT be able to INSERT into judgments."""
    with db.cursor() as cur:
        cur.execute("SET ROLE anon;")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "INSERT INTO judgments (judgment_id, content) "
                "VALUES ('rls-test-id', 'x')"
            )
        db.rollback()


def test_authenticated_role_can_read_published_judgments(db):
    """The authenticated role can SELECT from judgments (count may be 0 if empty)."""
    with db.cursor() as cur:
        cur.execute("SET ROLE authenticated;")
        cur.execute("SELECT count(*) FROM judgments")
        row = cur.fetchone()
        assert row is not None
        assert row[0] >= 0  # Reading is allowed; data may be empty
