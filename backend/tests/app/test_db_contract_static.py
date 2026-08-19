"""Static contract between the code's database calls and the migrations (#483).

Two production incidents in this repo shared a shape that no test could see,
because the tests mock Supabase and CI has no database:

* #470 merged code calling the RPC ``create_document_version`` before its
  migration was applied. Five required checks were green; version snapshots
  were broken in production until the migration was pushed separately.
* ``publications_db.py`` embedded ``extraction_jobs(… schema_name …)``, a column
  that does not exist. PostgREST answers that with ``400 42703``. It survived
  because nothing ever issued the query.

Both are decidable without a database: the names the code asks for either appear
in ``supabase/migrations/`` or they do not. That is what this module checks.

It is deliberately static. The `db`-marked suite (#482) exercises the real
database; this catches the same class of mistake at authoring time, in the unit
tier, on every PR, with no service container.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
PY_ROOTS = [REPO_ROOT / "backend" / "app", REPO_ROOT / "backend" / "packages"]
TS_ROOTS = [REPO_ROOT / "frontend" / "app", REPO_ROOT / "frontend" / "lib"]

# RPCs the code calls that no migration declares — and that do not exist in the
# production database either (checked against pg_proc). Every entry carries a
# reason; the exit route for all of them is #484. An allowlist without a reason
# and a ticket is just a muted test.
#
# Adding to this set is not a fix. It records a known gap so that *new* drift
# still fails, which is the whole point of the guard.
# Empty, and that is the goal state: every RPC the code calls is declared by a
# migration. The last two entries — update_user_consent and
# archive_expired_audit_logs — were removed when #484 implemented them.
#
# Adding an entry here is not a fix. It records a known gap so that *new* drift
# still fails, and it needs a reason and a ticket. Two companion tests keep it
# honest in both directions: an entry that gains a migration, and an entry whose
# call site disappears, both fail.
#
# Spelled `set()` rather than `{}`: a brace block containing only comments is an
# empty *dict*, which makes the set operations below raise instead of pass.
KNOWN_MISSING_RPCS: set[str] = set()

# Tables that live outside `supabase/migrations/` by design.
NON_MIGRATION_TABLES = {
    # Supabase-managed schemas, reached via .schema("vault") / auth.
    "decrypted_secrets",
    "users",
}


# ---------------------------------------------------------------------------
# What the migrations declare
# ---------------------------------------------------------------------------

_FUNCTION_RE = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)",
    re.IGNORECASE,
)
_CREATE_TABLE_RE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\((.*?)\n\s*\);",
    re.IGNORECASE | re.DOTALL,
)
_ADD_COLUMN_RE = re.compile(
    r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+"
    r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)",
    re.IGNORECASE,
)
# Lines inside a CREATE TABLE body that declare a constraint, not a column.
_NOT_A_COLUMN = re.compile(
    r"^\s*(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|EXCLUDE|LIKE)\b",
    re.IGNORECASE,
)


def _migration_sql() -> str:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    assert files, f"no migrations found under {MIGRATIONS_DIR}"
    return "\n".join(f.read_text() for f in files)


def _declared_functions(sql: str) -> set[str]:
    return {m.group(1).lower() for m in _FUNCTION_RE.finditer(sql)}


def _declared_columns(sql: str) -> dict[str, set[str]]:
    """Map table -> column names, from CREATE TABLE bodies plus ADD COLUMN."""
    tables: dict[str, set[str]] = {}
    for match in _CREATE_TABLE_RE.finditer(sql):
        table = match.group(1).lower()
        columns = tables.setdefault(table, set())
        depth = 0
        for raw_line in match.group(2).splitlines():
            line = raw_line.strip()
            if not line or line.startswith("--"):
                continue
            # Only the outermost level declares columns; a CHECK or a default
            # can span nested parentheses.
            if depth == 0 and not _NOT_A_COLUMN.match(line):
                name = re.match(r"([a-z_][a-z0-9_]*)", line, re.IGNORECASE)
                if name:
                    columns.add(name.group(1).lower())
            depth += line.count("(") - line.count(")")
    for match in _ADD_COLUMN_RE.finditer(sql):
        tables.setdefault(match.group(1).lower(), set()).add(match.group(2).lower())
    return tables


# ---------------------------------------------------------------------------
# What the code asks for
# ---------------------------------------------------------------------------


def _python_files() -> list[Path]:
    files: list[Path] = []
    for root in PY_ROOTS:
        files.extend(
            p
            for p in root.rglob("*.py")
            if "__pycache__" not in p.parts and "/tests/" not in str(p)
        )
    return files


def _string_arg(node: ast.Call) -> str | None:
    if node.args and isinstance(node.args[0], ast.Constant):
        value = node.args[0].value
        if isinstance(value, str):
            return value
    return None


def _collect_python_calls(method: str) -> list[tuple[str, Path, int]]:
    """Every `<recv>.<method>("literal")` in the backend, with its location."""
    found: list[tuple[str, Path, int]] = []
    for path in _python_files():
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:  # pragma: no cover - a syntax error fails elsewhere
            continue
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == method
            ):
                literal = _string_arg(node)
                if literal is not None:
                    found.append((literal, path, node.lineno))
    return found


_TS_RPC_RE = re.compile(r"""\.rpc\(\s*['"]([a-z_][a-z0-9_]*)['"]""")
# supabase-js names the table in `.from("t")`, where PostgREST-py uses `.table("t")`.
_TS_FROM_RE = re.compile(r"""\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]""")
# Comment lines. `lib/supabase/index.ts` documents usage as `supabase.from('table')`
# in its header block, which the regex above cannot tell from a real call site.
# Only whole-line comments are skipped; a trailing `// .from('x')` would still be
# collected, which fails loudly rather than hiding drift, so it is left alone.
_TS_COMMENT_RE = re.compile(r"^\s*(?:\*|//|/\*)")


def _collect_ts(pattern: re.Pattern[str]) -> list[tuple[str, Path, int]]:
    found: list[tuple[str, Path, int]] = []
    for root in TS_ROOTS:
        for path in list(root.rglob("*.ts")) + list(root.rglob("*.tsx")):
            if "node_modules" in path.parts or "generated" in path.parts:
                continue
            for lineno, line in enumerate(path.read_text().splitlines(), start=1):
                if _TS_COMMENT_RE.match(line):
                    continue
                for match in pattern.finditer(line):
                    found.append((match.group(1), path, lineno))
    return found


def _collect_ts_rpcs() -> list[tuple[str, Path, int]]:
    return _collect_ts(_TS_RPC_RE)


def _collect_ts_tables() -> list[tuple[str, Path, int]]:
    return _collect_ts(_TS_FROM_RE)


def _rel(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_migrations_are_parseable() -> None:
    """Guard the guard: if parsing silently yields nothing, everything "passes"."""
    sql = _migration_sql()
    functions = _declared_functions(sql)
    columns = _declared_columns(sql)

    assert len(functions) > 20, f"only parsed {len(functions)} functions"
    assert len(columns) > 20, f"only parsed {len(columns)} tables"
    # Spot-check one table whose columns are exercised by the embed test below.
    assert {"id", "job_id", "status", "schema_id"} <= columns["extraction_jobs"]


@pytest.mark.unit
def test_every_rpc_the_code_calls_is_declared_by_a_migration() -> None:
    """A `.rpc(...)` name absent from the migrations is a guaranteed runtime 404.

    PostgREST resolves RPCs by name, so this is decidable statically — and it is
    exactly how #470 shipped broken.
    """
    declared = _declared_functions(_migration_sql())
    called = _collect_python_calls("rpc") + _collect_ts_rpcs()
    assert called, "found no .rpc() call sites — the collector is broken"

    missing = [
        f"{_rel(path)}:{lineno} calls rpc({name!r})"
        for name, path, lineno in called
        if name not in declared and name not in KNOWN_MISSING_RPCS
    ]
    assert not missing, (
        "these RPCs are called but declared by no migration, so they 404 at "
        "runtime:\n  " + "\n  ".join(sorted(missing))
    )


@pytest.mark.unit
def test_allowlisted_rpcs_are_still_actually_called() -> None:
    """Retire allowlist entries once their call site is gone.

    The other direction of rot, and the one that bit this file first: five
    entries survived here after #484 removed the code that called them, so the
    allowlist was granting an exemption nothing needed. An exemption for a name
    the code no longer mentions is dead configuration that makes the real
    exemptions harder to audit.
    """
    called = {name for name, _, _ in _collect_python_calls("rpc") + _collect_ts_rpcs()}
    orphaned = sorted(KNOWN_MISSING_RPCS - called)
    assert not orphaned, (
        f"{orphaned} are allowlisted but no longer called anywhere — remove them "
        "from KNOWN_MISSING_RPCS"
    )


@pytest.mark.unit
def test_allowlisted_rpcs_are_still_actually_missing() -> None:
    """Retire allowlist entries once their migration lands.

    Without this, the allowlist quietly becomes permission to keep calling
    something that now exists under a different name.
    """
    declared = _declared_functions(_migration_sql())
    stale = sorted(KNOWN_MISSING_RPCS & declared)
    assert not stale, (
        f"{stale} now exist in the migrations — remove them from "
        "KNOWN_MISSING_RPCS so real drift is caught again"
    )


@pytest.mark.unit
def test_every_table_the_code_queries_is_declared_by_a_migration() -> None:
    """A `.table("x")` / `.from("x")` name no migration declares is a `PGRST205`.

    This is the guard that was missing while ~33 tables the code queried had no
    `CREATE TABLE` anywhere — `extraction_jobs` among them, which is why the
    extraction endpoint failed on its very first insert. The RPC test above
    covered function names only, so a table name absent from the schema sailed
    through the unit tier unchallenged.

    Same reasoning as the RPC check: PostgREST resolves the table by name, so the
    name either appears in `supabase/migrations/` or the request 404s. Deciding
    that needs no database.
    """
    declared = set(_declared_columns(_migration_sql()))
    queried = _collect_python_calls("table") + _collect_ts_tables()
    assert queried, "found no .table()/.from() call sites — the collector is broken"

    missing = [
        f"{_rel(path)}:{lineno} queries table {name!r}"
        for name, path, lineno in queried
        if name.lower() not in declared and name.lower() not in NON_MIGRATION_TABLES
    ]
    assert not missing, (
        "these tables are queried but declared by no migration, so PostgREST "
        "answers PGRST205 at runtime:\n  " + "\n  ".join(sorted(set(missing)))
    )


# `table(cols)`, tolerating PostgREST's join hints (`judgments!inner(...)`).
# Without consuming the hint the regex would capture `inner` as the table name.
_EMBED_RE = re.compile(r"([a-z_][a-z0-9_]*)(?:![a-z]+)?\(([^()]*)\)")


@pytest.mark.unit
def test_postgrest_embeds_reference_columns_that_exist() -> None:
    """An embed naming a column the table lacks is a `400 42703`.

    This is the `extraction_jobs(… schema_name …)` bug: the column was never on
    the table, every call to that endpoint failed, and no test noticed because
    none issued the query.
    """
    columns = _declared_columns(_migration_sql())
    problems: list[str] = []

    for literal, path, lineno in _collect_python_calls("select"):
        for table, cols in _EMBED_RE.findall(literal):
            table = table.lower()
            if table in NON_MIGRATION_TABLES:
                continue
            if table not in columns:
                problems.append(f"{_rel(path)}:{lineno} embeds unknown table {table!r}")
                continue
            for col in cols.split(","):
                col = col.strip()
                if not col or col == "*":
                    continue
                # PostgREST aliasing: `alias:real_column` — validate the target.
                name = (col.split(":", 1)[-1] if ":" in col else col).strip()
                # `metadata->>language` and similar operate on a real column.
                name = re.split(r"->>?|::", name)[0].strip().lower()
                if name and name not in columns[table]:
                    problems.append(
                        f"{_rel(path)}:{lineno} embeds {table}({name}) "
                        "but that column does not exist"
                    )

    assert not problems, (
        "PostgREST embeds referencing columns or tables no migration declares "
        "(each is a 400 at runtime):\n  " + "\n  ".join(sorted(set(problems)))
    )
