"""The LangChain LLM cache is not reachable from PostgREST.

`full_llm_cache` / `full_md5_llm_cache` are created by SQLAlchemy at backend
boot, not by a migration, which is how they reached production with RLS off and
anon holding ALL. The first test pins the two tables; the last is the gate that
would have caught them — any table in `public` with RLS off fails, whoever
created it.

`service_role` is in the role list on purpose: it is BYPASSRLS, so for that
role the grant is the only boundary there is.

These assert the privilege, not its effect: with RLS on and no policy, a client
write is denied silently and a "the row did not change" assertion passes either
way.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.db

CACHE_TABLES = ("full_llm_cache", "full_md5_llm_cache")


@pytest.mark.parametrize("table", CACHE_TABLES)
@pytest.mark.parametrize("role", ("anon", "authenticated", "service_role"))
@pytest.mark.parametrize("priv", ("SELECT", "INSERT", "UPDATE", "DELETE"))
def test_llm_cache_is_unreachable_from_api_roles(conn, table, role, priv):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT has_table_privilege(%s, %s, %s)",
            (role, f"public.{table}", priv),
        )
        assert cur.fetchone()[0] is False, f"{role} holds {priv} on {table}"


@pytest.mark.parametrize("table", CACHE_TABLES)
def test_llm_cache_has_rls_enabled(conn, table):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT relrowsecurity FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relname = %s",
            (table,),
        )
        row = cur.fetchone()
        assert row is not None, f"{table} missing — the migration must create it"
        assert row[0] is True


def test_every_public_table_has_rls_enabled(conn):
    """Supabase lints this as `rls_disabled_in_public`; fail in CI instead."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT c.relname FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') "
            "AND NOT c.relrowsecurity ORDER BY 1"
        )
        assert [r[0] for r in cur.fetchall()] == []
