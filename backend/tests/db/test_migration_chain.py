"""The migration chain applies, and produces the objects the code expects (#482).

Before this suite the chain was only ever proven by hand, in containers that no
longer exist. A migration that stopped applying, or an object quietly renamed,
would reach production unnoticed.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.db


EXPECTED_TABLES = {
    "chats",
    "messages",
    "extraction_jobs",
    "extraction_schemas",
    "schema_versions",
    "schema_fields",
    "blog_posts",
    "blog_tags",
    "blog_categories",
    "blog_likes",
    "blog_bookmarks",
    "saved_searches",
    "document_versions",
    "audit_logs",
    "publications",
    "publication_schemas",
    "publication_collections",
    "publication_extraction_jobs",
    "collection_pairs",
}


def _scalar(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return row[0] if row else None


def _row(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def test_chain_applied_and_expected_tables_exist(conn) -> None:
    """The fixture applying the chain is itself the first assertion.

    If any migration errored, `migrated_database` fails and every test in this
    tier reports it.
    """
    present = {
        row[0]
        for row in _rows(
            conn,
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public'",
        )
    }
    missing = sorted(EXPECTED_TABLES - present)
    assert not missing, f"migrations applied but these tables are absent: {missing}"


def _rows(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def test_rls_is_enabled_on_every_user_owned_table(conn) -> None:
    """A table holding user rows with RLS off is readable by every signed-in user.

    Checked separately from the policy tests: `relrowsecurity` being off would
    make an isolation test fail in a confusing way, so assert the switch first.
    """
    unprotected = [
        row[0]
        for row in _rows(
            conn,
            """
            SELECT c.relname FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND c.relname = ANY(%s) AND NOT c.relrowsecurity
            """,
            (sorted(EXPECTED_TABLES),),
        )
    ]
    assert not unprotected, f"RLS is disabled on {unprotected}"


# PostgREST resolves RPC arguments BY NAME, so a renamed parameter is a 404 even
# though the function still exists. These names are a wire contract with the
# callers listed beside each.
EXPECTED_RPC_ARGS = {
    # frontend/app/api/schemas/[id]/versions/route.ts, .../[version]/rollback,
    # backend/app/schemas_pkg/versioning.py
    "rollback_to_version": ["p_schema_id", "p_version_number"],
    # backend/app/api/consent.py — the consent update endpoints
    "update_user_consent": [
        "p_user_id",
        "p_consent_type",
        "p_accepted",
        "p_version",
    ],
    # backend/app/versioning.py, both call sites
    "create_document_version": [
        "p_document_id",
        "p_title",
        "p_full_text",
        "p_summary",
        "p_content_hash",
        "p_change_description",
        "p_change_type",
        "p_created_by",
        "p_extracted_data",
        "p_reject_duplicate_content",
    ],
    # backend/app/extraction_domain/results_router.py:483 — jurisdiction/decision_date/
    # collection_ids travel INSIDE p_filters, so this list must never grow (a second
    # overload makes PostgREST answer 300 for every caller).
    "filter_documents_by_extracted_data": [
        "p_filters",
        "p_text_query",
        "p_limit",
        "p_offset",
    ],
    # backend/app/extraction_domain/filter_ids.py, backend/app/compare/service.py,
    # backend/app/collection_pairs.py
    "list_extracted_filter_matches": ["p_filters", "p_text_query"],
    # backend/app/compare/service.py
    "get_extracted_facet_counts_by_jurisdiction": [
        "p_filters",
        "field_path",
        "p_text_query",
    ],
    # backend/app/extraction_domain/results_router.py — POST /base-schema/aggregate (#707)
    "aggregate_extracted_data": [
        "p_filters",
        "p_text_query",
        "p_fields",
        "p_sample_size",
        "p_seed",
        "p_top_n",
    ],
}


@pytest.mark.parametrize(("function", "expected"), sorted(EXPECTED_RPC_ARGS.items()))
def test_rpc_exists_with_the_argument_names_postgrest_matches_by(
    conn, function: str, expected: list[str]
) -> None:
    # `RETURNS TABLE (...)` appends each output column to proargnames/proargmodes
    # as a trailing OUT parameter, so a function like `list_extracted_filter_matches`
    # mixes caller-facing IN names with result-shape OUT names in the same arrays.
    # PostgREST resolves RPC calls by the IN names only (the JSON payload keys),
    # so that is what this wire contract pins; filter OUT names out rather than
    # asserting on the mixed array.
    row = _row(
        conn,
        """
        SELECT p.proargnames, p.proargmodes FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = %s
        """,
        (function,),
    )
    assert row is not None, f"{function} does not exist after the migrations"
    names, modes = row
    modes = modes if modes is not None else ["i"] * len(names)
    in_names = [name for name, mode in zip(names, modes, strict=True) if mode == "i"]
    assert in_names == expected, (
        f"{function} argument names drifted: {in_names} != {expected}. "
        "PostgREST matches by name, so this is a 404 for every caller."
    )


@pytest.mark.parametrize("function", sorted(EXPECTED_RPC_ARGS))
def test_rpc_has_exactly_one_overload(conn, function: str) -> None:
    """CREATE OR REPLACE with a changed parameter list adds an overload instead of
    replacing the function; PostgREST then cannot pick one and answers 300."""
    count = _scalar(
        conn,
        "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'public' AND p.proname = %s",
        (function,),
    )
    assert count == 1, f"{function} has {count} overloads; expected exactly 1"


def test_blog_rpcs_exist(conn) -> None:
    """Both blog RPCs ship in migrations that could not apply until #451."""
    for function in ("list_public_blog_posts", "get_public_blog_post"):
        assert _scalar(
            conn,
            "SELECT count(*) FROM pg_proc p JOIN pg_namespace n "
            "ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname=%s",
            (function,),
        ), f"{function} is missing"


EXPECTED_FKS = [
    # PostgREST resolves embedded resources through real foreign keys; without
    # these the publications endpoints answer 400, not an empty list.
    ("publication_schemas", "schema_id", "extraction_schemas", "id"),
    ("publication_collections", "collection_id", "collections", "id"),
    # Deliberately targets the TEXT UNIQUE `job_id`, not the uuid primary key.
    ("publication_extraction_jobs", "job_id", "extraction_jobs", "job_id"),
]


@pytest.mark.parametrize(("table", "column", "target", "target_column"), EXPECTED_FKS)
def test_publication_embed_foreign_keys_exist(
    conn, table: str, column: str, target: str, target_column: str
) -> None:
    found = _rows(
        conn,
        """
        SELECT kcu.column_name, ccu.table_name, ccu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public' AND tc.table_name = %s
          AND kcu.column_name = %s
        """,
        (table, column),
    )
    assert found, f"{table}.{column} has no foreign key"
    assert (target, target_column) in {(r[1], r[2]) for r in found}, (
        f"{table}.{column} points at {found}, expected {target}.{target_column}"
    )
