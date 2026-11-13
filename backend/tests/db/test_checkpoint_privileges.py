"""Runtime-created LangGraph tables must never expose private agent state."""

from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from langgraph.checkpoint.base import empty_checkpoint
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg.rows import dict_row

from app.core.private_database import PRIVATE_DATABASE_OPTIONS

pytestmark = pytest.mark.db

TABLES = (
    "checkpoint_migrations",
    "checkpoints",
    "checkpoint_blobs",
    "checkpoint_writes",
)
MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20261113000002_move_runtime_state_to_private_schema.sql"
)


@pytest.mark.parametrize("table", TABLES)
@pytest.mark.parametrize("role", ("anon", "authenticated", "service_role"))
def test_checkpoint_tables_deny_api_access(conn, as_role, table, role):
    for privilege in (
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "REFERENCES",
        "TRIGGER",
    ):
        assert not conn.execute(
            "SELECT has_table_privilege(%s, %s, %s)",
            (role, f"juddges_private.{table}", privilege),
        ).fetchone()[0], f"{role} holds {privilege} on {table}"

    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        as_role(role, f"SELECT * FROM juddges_private.{table} LIMIT 0")


@pytest.mark.parametrize("table", TABLES)
def test_checkpoint_tables_have_rls_without_api_policies(conn, table):
    assert conn.execute(
        "SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class "
        "WHERE oid = %s::regclass",
        (f"juddges_private.{table}",),
    ).fetchone()[0]
    assert (
        conn.execute(
            "SELECT count(*) FROM pg_policies WHERE schemaname = 'juddges_private' AND tablename = %s",
            (table,),
        ).fetchone()[0]
        == 0
    )


def test_langgraph_setup_and_state_survive_security_migration(migrated_database):
    """Exercise real library DDL and persistence, including blobs and writes.

    Setup must work with pre-created tables and repeated backend startups.
    Reapplying hardening over populated tables must preserve existing state.
    """
    with psycopg.connect(
        migrated_database,
        autocommit=True,
        row_factory=dict_row,
        options=PRIVATE_DATABASE_OPTIONS,
    ) as connection:
        saver = PostgresSaver(connection)
        saver.setup()
        thread_id = f"rls-contract-{uuid4()}"
        config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
        checkpoint = empty_checkpoint()
        checkpoint["channel_values"] = {"messages": ["private agent state"]}
        checkpoint["channel_versions"] = {"messages": "1"}
        try:
            saved = saver.put(
                config,
                checkpoint,
                {"source": "input", "step": 0, "parents": {}},
                {"messages": "1"},
            )
            saver.put_writes(saved, [("messages", "private pending write")], "task-1")
            before = saver.get_tuple(saved)
            assert before is not None
            assert before.checkpoint["channel_values"] == checkpoint["channel_values"]
            assert before.pending_writes

            connection.execute(MIGRATION.read_text())
            saver.setup()
            assert saver.get_tuple(saved) == before
        finally:
            saver.delete_thread(thread_id)
