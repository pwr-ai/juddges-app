"""RLS actually isolates users, and the admin tables stay shut (#482).

Every policy in the new migrations was proven once by hand. These assert it on
every PR — and assert it *for the right reason*: the bootstrap grants
anon/authenticated ALL privileges exactly as Supabase does, so a passing test
here means the policy denied access, not that the role never had any.

`frontend/hooks/useChatLogic.ts` writes chats and messages through the browser
Supabase client with the user's own JWT, and deletes messages by `id` with no
`user_id` filter. RLS is the authorization boundary for those writes, not a
defensive extra.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.db

USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


@pytest.fixture
def users(conn, make_user):
    make_user(USER_A)
    make_user(USER_B)
    return USER_A, USER_B


def _seed_owned_row(conn, table: str, owner: str) -> str:
    """Insert one row owned by `owner`, as the superuser, and return its id.

    Seeding bypasses RLS on purpose: the point is to then read it back as each
    user and see which of them the policy admits.
    """
    row_id = str(uuid.uuid4())
    if table == "chats":
        _exec(
            conn,
            "INSERT INTO public.chats (id, user_id, title) VALUES (%s, %s, %s)",
            (row_id, owner, "owned"),
        )
    elif table == "messages":
        chat_id = _seed_owned_row(conn, "chats", owner)
        _exec(
            conn,
            "INSERT INTO public.messages (id, chat_id, user_id, role, content) "
            "VALUES (%s, %s, %s, 'user', 'hello')",
            (row_id, chat_id, owner),
        )
    elif table == "extraction_schemas":
        _exec(
            conn,
            "INSERT INTO public.extraction_schemas "
            "(id, name, type, category, text, user_id) "
            "VALUES (%s, %s, 'custom', 'test', '{}'::jsonb, %s)",
            (row_id, f"schema-{row_id[:8]}", owner),
        )
    elif table == "schema_fields":
        _exec(
            conn,
            "INSERT INTO public.schema_fields "
            "(id, session_id, field_path, field_name, field_type, user_id) "
            "VALUES (%s, %s, 'a', 'a', 'string', %s)",
            (row_id, f"session-{row_id[:8]}", owner),
        )
    elif table == "saved_searches":
        _exec(
            conn,
            "INSERT INTO public.saved_searches (id, user_id, name) "
            "VALUES (%s, %s, 'my search')",
            (row_id, owner),
        )
    elif table in ("blog_likes", "blog_bookmarks"):
        post_id = str(uuid.uuid4())
        # `category` and `status` are NOT NULL; `status` has a CHECK, so the
        # value has to be one the migration admits.
        _exec(
            conn,
            "INSERT INTO public.blog_posts "
            "(id, slug, title, excerpt, content, category, status) "
            "VALUES (%s, %s, 't', 'e', 'c', 'general', 'published')",
            (post_id, f"slug-{post_id[:8]}"),
        )
        _exec(
            conn,
            f"INSERT INTO public.{table} (id, post_id, user_id) VALUES (%s, %s, %s)",
            (row_id, post_id, owner),
        )
    else:  # pragma: no cover - a new table must be added deliberately
        raise AssertionError(f"no seed defined for {table}")
    return row_id


OWNER_SCOPED_TABLES = [
    "chats",
    "messages",
    "extraction_schemas",
    "schema_fields",
    "saved_searches",
    "blog_likes",
    "blog_bookmarks",
]


@pytest.mark.parametrize("table", OWNER_SCOPED_TABLES)
def test_owner_sees_their_row_and_the_other_user_does_not(
    conn, as_user, users, table: str
) -> None:
    owner, other = users
    row_id = _seed_owned_row(conn, table, owner)

    seen_by_owner = as_user(
        owner, f"SELECT count(*) FROM public.{table} WHERE id = %s", (row_id,)
    )
    seen_by_other = as_user(
        other, f"SELECT count(*) FROM public.{table} WHERE id = %s", (row_id,)
    )

    assert seen_by_owner[0][0] == 1, f"{table}: the owner cannot read their own row"
    assert seen_by_other[0][0] == 0, (
        f"{table}: another authenticated user can read someone else's row"
    )


@pytest.mark.parametrize("table", OWNER_SCOPED_TABLES)
def test_another_user_cannot_delete_someone_elses_row(
    conn, as_user, users, table: str
) -> None:
    """A read-only policy check would miss a permissive USING clause on DELETE."""
    owner, other = users
    row_id = _seed_owned_row(conn, table, owner)

    as_user(other, f"DELETE FROM public.{table} WHERE id = %s", (row_id,))

    survivors = _exec(
        conn, f"SELECT count(*) FROM public.{table} WHERE id = %s", (row_id,)
    )
    assert survivors[0][0] == 1, f"{table}: another user deleted the owner's row"


LOCKED_DOWN_TABLES = ["document_versions", "audit_logs"]


@pytest.mark.parametrize("table", LOCKED_DOWN_TABLES)
@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_admin_tables_are_unreadable_by_client_roles(
    conn, as_role, table: str, role: str
) -> None:
    """`audit_logs` holds prompt text, hashed IPs and user agents.

    Both tables are written only by the backend under the service role. RLS is
    enabled with no permissive policy AND privileges are revoked, so either layer
    alone would deny — assert the observable outcome rather than one mechanism.
    """
    import psycopg

    try:
        rows = as_role(role, f"SELECT count(*) FROM public.{table}")
    except psycopg.errors.InsufficientPrivilege:
        return  # denied at the privilege layer, which is the stronger outcome
    assert rows[0][0] == 0, (
        f"{role} can read {table}; it must be reachable only by the service role"
    )


@pytest.mark.parametrize("table", LOCKED_DOWN_TABLES)
def test_service_role_can_still_read_the_admin_tables(
    conn, as_role, table: str
) -> None:
    """The lock-down must not have broken the path that legitimately reads them."""
    rows = as_role("service_role", f"SELECT count(*) FROM public.{table}")
    assert rows and rows[0][0] >= 0
