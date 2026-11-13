"""Exercise real library setup outside the Data API, including schema drift."""

from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from langchain_community.cache import SQLAlchemyMd5Cache
from langchain_core.outputs import Generation
from sqlalchemy import create_engine

from app.core.private_database import PRIVATE_DATABASE_OPTIONS

pytestmark = pytest.mark.db

RUNTIME_TABLES = (
    "checkpoints",
    "checkpoint_migrations",
    "checkpoint_blobs",
    "checkpoint_writes",
    "full_llm_cache",
    "full_md5_llm_cache",
)


@pytest.mark.parametrize("role", ("anon", "authenticated", "service_role"))
def test_rollback_implementation_is_owner_only(conn, role):
    assert not conn.execute(
        "SELECT has_function_privilege(%s, 'public._rollback_to_version_impl(uuid,integer)', 'EXECUTE')",
        (role,),
    ).fetchone()[0]


@pytest.mark.parametrize("table", RUNTIME_TABLES)
def test_runtime_state_is_not_in_public(conn, table):
    assert (
        conn.execute("SELECT to_regclass(%s)", (f"public.{table}",)).fetchone()[0]
        is None
    )
    assert (
        conn.execute(
            "SELECT to_regclass(%s)", (f"juddges_private.{table}",)
        ).fetchone()[0]
        is not None
    )


@pytest.mark.parametrize("role", ("anon", "authenticated", "service_role"))
def test_api_roles_cannot_enter_private_schema(conn, role):
    for privilege in ("USAGE", "CREATE"):
        assert not conn.execute(
            "SELECT has_schema_privilege(%s, 'juddges_private', %s)",
            (role, privilege),
        ).fetchone()[0]


def test_real_cache_setup_keeps_data_and_creates_nothing_public(
    migrated_database, conn
):
    engine = create_engine(
        migrated_database.replace("postgresql://", "postgresql+psycopg://", 1),
        connect_args={"options": PRIVATE_DATABASE_OPTIONS},
    )
    prompt = f"private-cache-contract-{uuid4()}"
    model = "contract-model"
    try:
        cache = SQLAlchemyMd5Cache(engine)
        cache.update(prompt, model, [Generation(text="private response")])
        restarted_cache = SQLAlchemyMd5Cache(engine)
        assert restarted_cache.lookup(prompt, model) == [
            Generation(text="private response")
        ]
        for table in RUNTIME_TABLES:
            assert (
                conn.execute("SELECT to_regclass(%s)", (f"public.{table}",)).fetchone()[
                    0
                ]
                is None
            )
    finally:
        conn.execute(
            "DELETE FROM juddges_private.full_md5_llm_cache WHERE prompt = %s",
            (prompt,),
        )
        engine.dispose()


def test_future_library_tables_do_not_inherit_api_grants(conn):
    # Model a future library version creating a table after deployment. Unlike
    # public's Supabase defaults, private schema creation grants nothing to API
    # roles; no new library table can become a REST resource.
    with conn.transaction(force_rollback=True):
        conn.execute("CREATE TABLE juddges_private.runtime_contract_probe (id integer)")
        for role in ("anon", "authenticated", "service_role"):
            assert not conn.execute(
                "SELECT has_table_privilege(%s, 'juddges_private.runtime_contract_probe', 'SELECT')",
                (role,),
            ).fetchone()[0]


def test_missing_private_schema_never_falls_back_to_public(migrated_database):
    # The implicit pg_catalog lookup is safe; explicitly listing it in the
    # search_path would make it a CREATE target when the private schema is gone.
    with (
        psycopg.connect(
            migrated_database, options=PRIVATE_DATABASE_OPTIONS
        ) as connection,
        connection.transaction(force_rollback=True),
    ):
        connection.execute(
            "ALTER SCHEMA juddges_private RENAME TO runtime_schema_probe"
        )
        with pytest.raises(psycopg.errors.InvalidSchemaName), connection.transaction():
            connection.execute("CREATE TABLE runtime_missing_schema_probe (id integer)")


def test_migration_moves_existing_state_without_copying_or_loss(conn):
    migration = (
        Path(__file__).resolve().parents[3]
        / "supabase/migrations/20261113000002_move_runtime_state_to_private_schema.sql"
    ).read_text()
    with conn.transaction(force_rollback=True):
        original_oids = {}
        for table in RUNTIME_TABLES:
            original_oids[table] = conn.execute(
                "SELECT %s::regclass::oid", (f"juddges_private.{table}",)
            ).fetchone()[0]
            conn.execute(
                psycopg.sql.SQL(
                    "ALTER TABLE juddges_private.{} SET SCHEMA public"
                ).format(psycopg.sql.Identifier(table))
            )
        marker = str(uuid4())
        conn.execute(
            "INSERT INTO public.full_md5_llm_cache (id, prompt, response) VALUES (%s, %s, %s)",
            (marker, "private prompt", "private response"),
        )
        conn.execute(migration)
        for table, oid in original_oids.items():
            assert (
                conn.execute(
                    "SELECT %s::regclass::oid", (f"juddges_private.{table}",)
                ).fetchone()[0]
                == oid
            )
            assert (
                conn.execute("SELECT to_regclass(%s)", (f"public.{table}",)).fetchone()[
                    0
                ]
                is None
            )
        assert (
            conn.execute(
                "SELECT response FROM juddges_private.full_md5_llm_cache WHERE id = %s",
                (marker,),
            ).fetchone()[0]
            == "private response"
        )
