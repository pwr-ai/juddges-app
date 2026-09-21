"""Shared filter set (Foundation): list_extracted_filter_matches + wrapper.

Behavioural, not structural: argument names are pinned in test_migration_chain.py;
here we prove (a) the shared function returns (id, jurisdiction) for every match,
(b) the three Foundation keys (jurisdiction, decision_date, collection_ids) filter,
(c) filter_documents_by_extracted_data is a behaviour-preserving wrapper.
Seeds are isolated by a per-test keyword token because the scratch DB is shared.
"""

from __future__ import annotations

import json
import uuid

import pytest

pytestmark = pytest.mark.db


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def _seed(conn, token: str, jurisdiction: str, decision_date: str, **base) -> str:
    jid = str(uuid.uuid4())
    columns = [
        "id",
        "case_number",
        "jurisdiction",
        "decision_date",
        "full_text",
        "base_extraction_status",
        "base_keywords",
    ]
    values: list = [
        jid,
        f"FND/{jid[:8]}",
        jurisdiction,
        decision_date,
        "contract fixture",
        "completed",
        [token],
    ]
    # explicit casts: psycopg sends str params with unknown OID; be explicit for uuid/date
    placeholders = ["%s::uuid", "%s", "%s", "%s::date", "%s", "%s", "%s::text[]"]
    for col, val in base.items():
        columns.append(f"base_{col}")
        values.append(val)
        placeholders.append("%s")
    _exec(
        conn,
        f"INSERT INTO public.judgments ({', '.join(columns)}) VALUES ({', '.join(placeholders)})",
        tuple(values),
    )
    return jid


@pytest.fixture
def corpus(conn):
    """2 PL (2016, 2019) + 2 UK (2021, 2023); uk_a is gender_female."""
    token = f"fnd-{uuid.uuid4()}"
    ids = {
        "pl_a": _seed(conn, token, "PL", "2016-03-01"),
        "pl_b": _seed(conn, token, "PL", "2019-11-30"),
        "uk_a": _seed(
            conn, token, "UK", "2021-07-15", offender_gender=["gender_female"]
        ),
        "uk_b": _seed(conn, token, "UK", "2023-01-02"),
    }
    yield token, ids
    _exec(
        conn,
        "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])",
        (list(ids.values()),),
    )


def _matches(
    conn, filters: dict, text_query: str | None = None
) -> set[tuple[str, str]]:
    rows = _exec(
        conn,
        "SELECT id::text, jurisdiction FROM public.list_extracted_filter_matches(%s::jsonb, %s)",
        (json.dumps(filters), text_query),
    )
    return {(r[0], r[1]) for r in rows}


def _ids(conn, filters: dict) -> set[str]:
    return {m[0] for m in _matches(conn, filters)}


def test_shared_function_returns_id_and_jurisdiction_for_every_match(conn, corpus):
    token, ids = corpus
    assert _matches(conn, {"keywords": [token]}) == {
        (ids["pl_a"], "PL"),
        (ids["pl_b"], "PL"),
        (ids["uk_a"], "UK"),
        (ids["uk_b"], "UK"),
    }


def test_jurisdiction_filters_to_named_countries(conn, corpus):
    token, ids = corpus
    assert _ids(conn, {"keywords": [token], "jurisdiction": ["UK"]}) == {
        ids["uk_a"],
        ids["uk_b"],
    }
    assert _ids(conn, {"keywords": [token], "jurisdiction": ["PL", "UK"]}) == set(
        ids.values()
    )


def test_decision_date_range_is_inclusive(conn, corpus):
    token, ids = corpus
    assert _ids(
        conn, {"keywords": [token], "decision_date": {"from": "2019-01-01"}}
    ) == {ids["pl_b"], ids["uk_a"], ids["uk_b"]}
    assert _ids(
        conn,
        {
            "keywords": [token],
            "decision_date": {"from": "2016-03-01", "to": "2016-03-01"},
        },
    ) == {ids["pl_a"]}


def test_decision_date_accepts_min_max_aliases_and_scalar(conn, corpus):
    token, ids = corpus
    assert _ids(
        conn,
        {
            "keywords": [token],
            "decision_date": {"min": "2016-01-01", "max": "2016-12-31"},
        },
    ) == {ids["pl_a"]}
    assert _ids(conn, {"keywords": [token], "decision_date": "2021-07-15"}) == {
        ids["uk_a"]
    }


def test_core_keys_combine_with_base_filters(conn, corpus):
    token, ids = corpus
    assert _ids(
        conn,
        {
            "keywords": [token],
            "jurisdiction": ["UK"],
            "offender_gender": ["gender_female"],
            "decision_date": {"from": "2020-01-01"},
        },
    ) == {ids["uk_a"]}


def test_collection_ids_key_restricts_to_membership(conn, corpus, make_user):
    token, ids = corpus
    user = make_user(str(uuid.uuid4()))
    cid = str(uuid.uuid4())
    _exec(
        conn,
        "INSERT INTO public.collections (id, user_id, name) VALUES (%s, %s, 'fnd')",
        (cid, user),
    )
    _exec(
        conn,
        "INSERT INTO public.collection_judgments (collection_id, judgment_id) VALUES (%s, %s)",
        (cid, ids["pl_a"]),
    )
    assert _matches(conn, {"keywords": [token], "collection_ids": [cid]}) == {
        (ids["pl_a"], "PL")
    }
    _exec(conn, "DELETE FROM public.collections WHERE id = %s", (cid,))


def test_wrapper_returns_the_same_rows_and_total_as_the_shared_function(conn, corpus):
    token, ids = corpus
    rows = _exec(
        conn,
        "SELECT id::text, jurisdiction, decision_date, total_count FROM "
        "public.filter_documents_by_extracted_data(%s::jsonb, NULL, 50, 0)",
        (json.dumps({"keywords": [token]}),),
    )
    assert {r[0] for r in rows} == _ids(conn, {"keywords": [token]})
    assert {r[3] for r in rows} == {4}
    dates = [r[2] for r in rows]
    assert dates == sorted(dates, reverse=True), (
        "ORDER BY decision_date DESC must be preserved"
    )


def test_wrapper_pagination_is_unchanged(conn, corpus):
    token, _ = corpus
    f = json.dumps({"keywords": [token]})
    page1 = _exec(
        conn,
        "SELECT id::text FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 3, 0)",
        (f,),
    )
    page2 = _exec(
        conn,
        "SELECT id::text FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 3, 3)",
        (f,),
    )
    assert len(page1) == 3 and len(page2) == 1
    assert not ({r[0] for r in page1} & {r[0] for r in page2})
