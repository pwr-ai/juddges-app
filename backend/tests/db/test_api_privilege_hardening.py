"""Effective grants for public API objects must fail closed."""

from uuid import uuid4

import psycopg
import pytest

pytestmark = pytest.mark.db


def _scalar(conn, sql, params=()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()[0]


def _has_function(conn, role, signature):
    return _scalar(
        conn, "SELECT has_function_privilege(%s, %s, 'EXECUTE')", (role, signature)
    )


def test_profile_role_cannot_be_changed_by_authenticated_user(conn):
    assert not _scalar(
        conn,
        "SELECT has_table_privilege('authenticated', 'public.profiles', 'UPDATE')",
    )
    assert not _scalar(
        conn,
        "SELECT has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')",
    )
    for column in (
        "full_name",
        "avatar_url",
        "organization",
        "department",
        "preferences",
        "metadata",
    ):
        assert _scalar(
            conn,
            "SELECT has_column_privilege('authenticated', 'public.profiles', %s, 'UPDATE')",
            (column,),
        )


@pytest.mark.parametrize(
    "signature",
    (
        "public.update_user_consent(uuid,text,boolean,text)",
        "public.create_document_version(text,text,text,text,text,text,text,text,jsonb,boolean)",
        "public.archive_expired_audit_logs()",
        "public.get_user_topic_clicks(uuid,integer,integer)",
        "public.get_trending_topics(integer,integer)",
    ),
)
def test_backend_only_rpcs_are_not_callable_by_api_roles(conn, signature):
    assert _scalar(
        conn,
        "SELECT NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a "
        "WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') "
        "FROM pg_proc p "
        "WHERE oid = %s::regprocedure",
        (signature,),
    )
    for role in ("anon", "authenticated"):
        assert not _has_function(conn, role, signature), (
            f"{role} can execute {signature}"
        )
    assert _has_function(conn, "service_role", signature)


def test_rollback_rpc_requires_authenticated_owner_or_service_role(conn):
    signature = "public.rollback_to_version(uuid,integer)"
    assert _scalar(
        conn,
        "SELECT NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a "
        "WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') "
        "FROM pg_proc p "
        "WHERE oid = %s::regprocedure",
        (signature,),
    )
    assert not _has_function(conn, "anon", signature)
    assert _has_function(conn, "authenticated", signature)
    assert _has_function(conn, "service_role", signature)
    assert _scalar(
        conn,
        "SELECT proconfig @> ARRAY['search_path=\"\"']::text[] FROM pg_proc "
        "WHERE oid = %s::regprocedure",
        (signature,),
    )


@pytest.mark.parametrize(
    "function",
    (
        "public.rollback_to_version(uuid,integer)",
        "public.get_user_topic_clicks(uuid,integer,integer)",
        "public.get_trending_topics(integer,integer)",
    ),
)
def test_security_definer_analytics_and_rollback_pin_search_path(conn, function):
    assert _scalar(
        conn,
        "SELECT prosecdef AND proconfig @> ARRAY['search_path=\"\"']::text[] "
        "FROM pg_proc WHERE oid = %s::regprocedure",
        (function,),
    )


def test_new_public_functions_do_not_default_to_api_execution(conn):
    """The migration's default privilege change is effective for future DDL."""
    with conn.cursor() as cur:
        cur.execute(
            "CREATE FUNCTION public._privilege_contract_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'"
        )
        try:
            for role in ("anon", "authenticated"):
                assert not _has_function(
                    conn, role, "public._privilege_contract_probe()"
                )
        finally:
            cur.execute("DROP FUNCTION public._privilege_contract_probe()")


def test_new_public_tables_do_not_default_to_api_access(conn):
    with conn.cursor() as cur:
        cur.execute("CREATE TABLE public._privilege_table_probe (id integer)")
        try:
            for role in ("anon", "authenticated"):
                assert not _scalar(
                    conn,
                    "SELECT has_table_privilege(%s, 'public._privilege_table_probe', 'SELECT')",
                    (role,),
                )
        finally:
            cur.execute("DROP TABLE public._privilege_table_probe")


def test_profile_owner_can_edit_safe_field_but_not_role(conn, as_user, make_user):
    user_id = make_user("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    as_user(
        user_id,
        "UPDATE public.profiles SET full_name = 'Updated' WHERE id = %s",
        (user_id,),
    )
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        as_user(
            user_id,
            "UPDATE public.profiles SET role = 'admin' WHERE id = %s",
            (user_id,),
        )
    assert (
        _scalar(conn, "SELECT role FROM public.profiles WHERE id = %s", (user_id,))
        == "user"
    )


def test_rollback_is_owner_scoped_and_anonymous_denied(
    conn, as_user, as_role, make_user
):
    owner = make_user("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    other = make_user("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    schema_id = str(uuid4())
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO public.extraction_schemas (id,name,type,category,text,user_id) "
            "VALUES (%s,'security-test','custom','test','{}',%s)",
            (schema_id, owner),
        )
    assert as_user(owner, "SELECT public.rollback_to_version(%s, 1)", (schema_id,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        as_user(other, "SELECT public.rollback_to_version(%s, 1)", (schema_id,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        as_role("anon", "SELECT public.rollback_to_version(%s, 1)", (schema_id,))

    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        as_user(None, "SELECT public.rollback_to_version(%s, 1)", (schema_id,))

    system_schema_id = str(uuid4())
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO public.extraction_schemas (id,name,type,category,text,user_id) "
            "VALUES (%s,'security-system','system','test','{}',NULL)",
            (system_schema_id,),
        )
        cur.execute("BEGIN")
        cur.execute("SET LOCAL ROLE service_role")
        cur.execute("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
        cur.execute(
            "SELECT public.rollback_to_version(%s, 1)",
            (system_schema_id,),
        )
        cur.execute("COMMIT")


def test_sensitive_rpcs_are_backend_only_but_service_role_still_works(
    conn, as_role, make_user
):
    user_id = make_user("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
    calls = (
        "SELECT public.update_user_consent(%s, 'terms', true, 'security-test')",
        "SELECT public.create_document_version('security-doc', 't', 'body', NULL, 'hash-security', NULL, 'initial', 'test', '{}'::jsonb, true)",
        "SELECT public.archive_expired_audit_logs()",
        "SELECT public.get_user_topic_clicks(%s, 30, 1)",
        "SELECT public.get_trending_topics(30, 1)",
    )
    for statement in calls:
        params = (
            (user_id,)
            if "update_user_consent" in statement
            or "get_user_topic_clicks" in statement
            else ()
        )
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            as_role("anon", statement, params)

    as_role(
        "service_role",
        "SELECT public.update_user_consent(%s, 'terms', true, 'security-test')",
        (user_id,),
    )
    assert _scalar(
        conn,
        "SELECT terms_accepted FROM public.user_consent WHERE user_id = %s",
        (user_id,),
    )
    as_role(
        "service_role",
        "SELECT public.create_document_version('security-doc-service', 't', 'body', NULL, 'hash-security-service', NULL, 'initial', 'test', '{}'::jsonb, true)",
    )
    as_role("service_role", "SELECT public.archive_expired_audit_logs()")
    as_role(
        "service_role", "SELECT public.get_user_topic_clicks(%s, 30, 1)", (user_id,)
    )
    as_role("service_role", "SELECT public.get_trending_topics(30, 1)")
