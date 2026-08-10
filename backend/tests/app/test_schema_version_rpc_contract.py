"""Guard tests: the schema-version DB objects match their Python/SQL callers.

Two names in `supabase/migrations/20260810000005_add_schema_version_rpc_and_trigger.sql`
are load-bearing and fail *silently or late* when they drift (see #453):

* `rollback_to_version(p_schema_id, p_version_number)` — PostgREST resolves RPC
  arguments by NAME. Renaming an argument (or the function) turns
  `versioning.py`'s rollback endpoint into a 404 that no type checker catches.
* `create_schema_version_trigger` — `backend/scripts/bulk_insert_pl.sql` disables
  and re-enables it by name; a rename makes the seed script abort on line 5.

These are text assertions on purpose: the objects live in SQL, so there is
nothing importable to check, and the alternative (a live database) belongs in
integration tests.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION = (
    REPO_ROOT
    / "supabase/migrations/20260810000005_add_schema_version_rpc_and_trigger.sql"
)
VERSIONING = REPO_ROOT / "backend/app/schemas_pkg/versioning.py"
BULK_INSERT = REPO_ROOT / "backend/scripts/bulk_insert_pl.sql"

TRIGGER_NAME = "create_schema_version_trigger"
RPC_ARGS = ("p_schema_id", "p_version_number")


@pytest.fixture(scope="module")
def migration_sql() -> str:
    assert MIGRATION.is_file(), f"missing migration: {MIGRATION}"
    return MIGRATION.read_text(encoding="utf-8")


def test_migration_defines_the_rollback_rpc_with_the_argument_names_callers_send(
    migration_sql: str,
) -> None:
    signature = re.search(
        r"CREATE OR REPLACE FUNCTION\s+public\.rollback_to_version\s*\((?P<args>[^)]*)\)",
        migration_sql,
        re.IGNORECASE,
    )
    assert signature is not None, "public.rollback_to_version is not defined"

    args = signature.group("args")
    for arg in RPC_ARGS:
        assert re.search(rf"\b{arg}\b", args), (
            f"rollback_to_version is missing the {arg!r} argument; PostgREST "
            "matches RPC arguments by name, so callers would get a 404"
        )


def test_backend_caller_uses_exactly_those_rpc_argument_names() -> None:
    """The Python side of the same contract, so a rename breaks one test, not prod."""
    source = VERSIONING.read_text(encoding="utf-8")
    call = re.search(
        r"\.rpc\(\s*\"rollback_to_version\"\s*,\s*\{(?P<payload>[^}]*)\}",
        source,
        re.DOTALL,
    )
    assert call is not None, f"{VERSIONING} no longer calls the rollback RPC"

    payload = call.group("payload")
    sent = set(re.findall(r"\"(\w+)\"\s*:", payload))
    assert sent == set(RPC_ARGS), (
        f"versioning.py sends {sorted(sent)} but the RPC declares {sorted(RPC_ARGS)}"
    )


def test_rollback_rpc_returns_the_new_version_id(migration_sql: str) -> None:
    """Both rollback routes surface the result as `new_version_id`."""
    assert re.search(
        r"FUNCTION\s+public\.rollback_to_version\s*\([^)]*\)\s*RETURNS\s+uuid",
        migration_sql,
        re.IGNORECASE,
    ), "rollback_to_version must RETURN uuid (the new schema_versions row id)"


def test_migration_creates_the_trigger_name_the_seed_script_disables(
    migration_sql: str,
) -> None:
    assert re.search(rf"CREATE TRIGGER\s+{TRIGGER_NAME}\b", migration_sql), (
        f"{TRIGGER_NAME} is not created"
    )
    assert re.search(rf"DROP TRIGGER IF EXISTS\s+{TRIGGER_NAME}\b", migration_sql), (
        "the trigger must be dropped-if-exists first so the migration is idempotent"
    )
    assert f"DISABLE TRIGGER {TRIGGER_NAME}" in BULK_INSERT.read_text(
        encoding="utf-8"
    ), f"{BULK_INSERT} no longer references {TRIGGER_NAME}"


def test_trigger_fires_after_insert_or_update_on_extraction_schemas(
    migration_sql: str,
) -> None:
    """AFTER, not BEFORE: a BEFORE INSERT trigger cannot satisfy the
    schema_versions -> extraction_schemas foreign key."""
    assert re.search(
        rf"CREATE TRIGGER\s+{TRIGGER_NAME}\s+AFTER INSERT OR UPDATE\s+ON\s+"
        r"public\.extraction_schemas",
        migration_sql,
    )


def test_security_definer_functions_pin_an_empty_search_path(
    migration_sql: str,
) -> None:
    """A SECURITY DEFINER function with a mutable search_path is an escalation
    hole; 20260623000001 pinned every other one the same way."""
    code = "\n".join(
        line
        for line in migration_sql.splitlines()
        if not line.lstrip().startswith("--")
    )
    bodies = [
        b
        for b in re.split(r"(?=CREATE OR REPLACE FUNCTION)", code)
        if b.startswith("CREATE")
    ]
    definers = [b for b in bodies if "SECURITY DEFINER" in b]
    assert len(definers) == 2, (
        "expected exactly the version trigger and rollback_to_version to be "
        f"SECURITY DEFINER, found {len(definers)}"
    )
    for body in definers:
        name = re.search(r"FUNCTION\s+(public\.\w+)", body)
        assert "SET search_path = ''" in body, (
            f"{name.group(1) if name else '<unknown>'} is SECURITY DEFINER "
            "without a pinned search_path"
        )


def test_rollback_rpc_is_not_executable_by_anon(migration_sql: str) -> None:
    assert (
        "REVOKE ALL ON FUNCTION public.rollback_to_version(uuid, integer) FROM PUBLIC"
        in migration_sql
    ), "the implicit PUBLIC EXECUTE grant must be revoked (covers anon)"
    grant = re.search(
        r"GRANT EXECUTE ON FUNCTION public\.rollback_to_version\(uuid, integer\)\s*"
        r"TO\s+(?P<roles>[^;]+);",
        migration_sql,
    )
    assert grant is not None, "rollback_to_version has no EXECUTE grant"
    roles = {r.strip() for r in grant.group("roles").split(",")}
    assert roles == {"authenticated", "service_role"}, (
        f"unexpected EXECUTE grantees for rollback_to_version: {sorted(roles)}"
    )
