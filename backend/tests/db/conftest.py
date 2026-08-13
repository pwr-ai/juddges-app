"""Fixtures for the database-contract tier (#482).

These tests need a real Postgres because they assert things only a database can
answer: that the migration chain applies, that RLS actually isolates users, that
an RPC exists with the argument names PostgREST matches by, that a trigger fires,
and that concurrent callers do not collide.

They are deliberately wired to their OWN environment variable rather than
`DATABASE_URL`. `.env` in this repo points `DATABASE_URL` at the production
Supabase project, and this suite creates roles, applies migrations and inserts
rows. Reusing that variable would put one careless `pytest` between a developer
and production.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

DB_URL_ENV = "DB_CONTRACT_DATABASE_URL"
REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
BOOTSTRAP_SQL = Path(__file__).parent / "bootstrap_supabase.sql"

# Hosts that must never be the target. This suite is destructive by nature.
FORBIDDEN_HOST_FRAGMENTS = ("supabase.co", "supabase.in", "pooler.supabase")


def _database_url() -> str:
    url = os.getenv(DB_URL_ENV, "").strip()
    if not url:
        pytest.skip(
            f"{DB_URL_ENV} is not set; start a throwaway Postgres and point it "
            "there (see the Database Contract job in .github/workflows/ci.yml)"
        )
    lowered = url.lower()
    for fragment in FORBIDDEN_HOST_FRAGMENTS:
        if fragment in lowered:
            raise pytest.UsageError(
                f"{DB_URL_ENV} points at {fragment!r}. This suite applies "
                "migrations and inserts rows; it must only ever target a "
                "throwaway database."
            )
    return url


def _psql(url: str, *args: str, sql_file: Path | None = None, sql: str | None = None):
    """Apply SQL with `psql`, which is what actually runs the chain in CI.

    Deliberately `psql` rather than psycopg: the migrations contain `\\echo`,
    dollar-quoted bodies and multi-statement files that a driver would have to
    split by hand, and splitting is exactly where a home-grown runner diverges
    from how Supabase applies them.
    """
    cmd = ["psql", url, "-v", "ON_ERROR_STOP=1", "-X", "-q", *args]
    if sql_file is not None:
        cmd += ["-f", str(sql_file)]
    if sql is not None:
        cmd += ["-c", sql]
    # S603: the argument vector is fixed here; `url` comes from an env var that
    # `_database_url` has already validated, and every path is repo-controlled.
    return subprocess.run(  # noqa: S603
        cmd, capture_output=True, text=True, check=False
    )


def migration_files() -> list[Path]:
    """The chain, in the order Supabase applies it: filename order.

    Filename order is not authoring order — the blog tables migration is
    deliberately backdated so it precedes the two blog RPC migrations that build
    functions on top of those tables.
    """
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    assert files, f"no migrations found under {MIGRATIONS_DIR}"
    return files


SCRATCH_DB = "juddges_db_contract"


def _with_database(url: str, dbname: str) -> str:
    """Swap the database component of a libpq URL."""
    head, _, tail = url.rpartition("/")
    query = ""
    if "?" in tail:
        _, _, query = tail.partition("?")
        query = f"?{query}"
    return f"{head}/{dbname}{query}"


@pytest.fixture(scope="session")
def migrated_database() -> str:
    """Create a scratch database, bootstrap it, then apply the whole chain once.

    Session-scoped: applying ~60 migrations per test would dominate the runtime,
    and every assertion here is a read or an isolated insert.

    The chain runs against a database this fixture drops and recreates, rather
    than whatever `DB_CONTRACT_DATABASE_URL` points at directly. That is not
    tidiness — the chain is deliberately NOT re-runnable
    (`20260805000001_jurisdiction_dashboard_stats.sql` renames a function), so
    applying it to an already-migrated database fails. Without the drop, this
    suite would pass on a fresh container and fail on every subsequent run,
    which is the worst possible local experience. Found by running it twice.
    """
    admin_url = _database_url()

    # `postgres` is the maintenance database every Postgres image ships with;
    # DROP DATABASE cannot run while connected to its own target.
    maintenance = _with_database(admin_url, "postgres")
    for statement in (
        f"DROP DATABASE IF EXISTS {SCRATCH_DB} WITH (FORCE)",
        f"CREATE DATABASE {SCRATCH_DB}",
    ):
        result = _psql(maintenance, sql=statement)
        assert result.returncode == 0, (
            f"could not prepare the scratch database:\n{result.stderr}"
        )

    url = _with_database(admin_url, SCRATCH_DB)

    bootstrap = _psql(url, sql_file=BOOTSTRAP_SQL)
    assert bootstrap.returncode == 0, (
        f"bootstrap failed:\n{bootstrap.stdout}\n{bootstrap.stderr}"
    )

    failures: list[str] = []
    for path in migration_files():
        result = _psql(url, sql_file=path)
        if result.returncode != 0:
            failures.append(f"{path.name}:\n{result.stderr.strip()}")
            # Later migrations depend on earlier ones; continuing would produce
            # a cascade of noise that hides the first real failure.
            break

    assert not failures, "migration chain failed:\n" + "\n".join(failures)
    return url


@pytest.fixture
def conn(migrated_database: str):
    """A psycopg connection with autocommit, as the superuser (service-role-like)."""
    psycopg = pytest.importorskip("psycopg")
    with psycopg.connect(migrated_database, autocommit=True) as connection:
        yield connection


@pytest.fixture
def as_user(conn):
    """Run a query impersonating an authenticated user, with RLS enforced.

    Mirrors how Supabase presents a request: the `authenticated` role plus the
    JWT subject in a session GUC that `auth.uid()` reads.
    """

    def _run(user_id: str | None, sql: str, params: tuple = ()):
        with conn.cursor() as cur:
            cur.execute("BEGIN")
            try:
                cur.execute("SET LOCAL ROLE authenticated")
                cur.execute(
                    "SELECT set_config('request.jwt.claim.sub', %s, true)",
                    (user_id or "",),
                )
                cur.execute(sql, params)
                return cur.fetchall() if cur.description else []
            finally:
                cur.execute("COMMIT")

    return _run


@pytest.fixture
def as_role(conn):
    """Run a query as an arbitrary role (`anon`, `service_role`)."""

    def _run(role: str, sql: str, params: tuple = ()):
        with conn.cursor() as cur:
            cur.execute("BEGIN")
            try:
                cur.execute(f"SET LOCAL ROLE {role}")
                cur.execute(sql, params)
                return cur.fetchall() if cur.description else []
            finally:
                cur.execute("COMMIT")

    return _run


@pytest.fixture
def make_user(conn):
    """Insert an auth.users row and return its id."""
    created: list[str] = []

    def _make(user_id: str) -> str:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO auth.users (id, email) VALUES (%s, %s) "
                "ON CONFLICT (id) DO NOTHING",
                (user_id, f"{user_id}@example.test"),
            )
        created.append(user_id)
        return user_id

    return _make
