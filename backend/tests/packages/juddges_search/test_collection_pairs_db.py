"""CollectionPairsDB: every query is scoped by user_id (service-role bypasses RLS).

Same fluent-client recorder as test_collections_db.py; no live Supabase.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from juddges_search.db.collection_pairs_db import CollectionPairsDB
from supabase import PostgrestAPIError

pytestmark = [pytest.mark.unit, pytest.mark.collections]

USER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
PAIR = "33333333-3333-4333-8333-333333333333"


class _FluentTable:
    _CHAIN_METHODS = {"select", "insert", "delete", "eq", "order", "limit"}

    def __init__(self, recorder: FakeSupabaseClient, name: str):
        self._recorder = recorder
        self._name = name
        self.chain: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    def __getattr__(self, item: str):
        if item in self._CHAIN_METHODS:

            def _record(*args: Any, **kwargs: Any) -> _FluentTable:
                self.chain.append((item, args, kwargs))
                return self

            return _record
        raise AttributeError(item)

    def execute(self) -> SimpleNamespace:
        return self._recorder._dispatch(self._name, self.chain)


class FakeSupabaseClient:
    def __init__(self) -> None:
        self.operations: list[tuple[str, list]] = []
        self._responder = lambda table, chain: SimpleNamespace(data=[])

    def set_responder(self, responder) -> None:
        self._responder = responder

    def table(self, name: str) -> _FluentTable:
        return _FluentTable(self, name)

    def _dispatch(self, name: str, chain):
        self.operations.append((name, list(chain)))
        return self._responder(name, chain)


def _eqs(chain) -> dict[str, Any]:
    return {args[0]: args[1] for op, args, _ in chain if op == "eq"}


def _ops(chain) -> list[str]:
    return [op for op, _, _ in chain]


def _row(**overrides) -> dict[str, Any]:
    row = {
        "id": PAIR,
        "user_id": USER,
        "name": "Fraud",
        "filters": {"appellant": ["offender"]},
        "text_query": "fraud",
        "pl_collection_id": "pl-col",
        "uk_collection_id": "uk-col",
        "created_at": "2026-09-21T00:00:00Z",
        "updated_at": "2026-09-21T00:00:00Z",
    }
    row.update(overrides)
    return row


@pytest.fixture
def fake_client() -> FakeSupabaseClient:
    return FakeSupabaseClient()


@pytest.fixture
def pairs_db(fake_client: FakeSupabaseClient) -> CollectionPairsDB:
    db = CollectionPairsDB.__new__(CollectionPairsDB)
    db.url = "http://fake.local"
    db.service_key = "fake-key"
    db.client = fake_client
    return db


async def test_create_pair_inserts_all_columns_and_returns_row(pairs_db, fake_client):
    fake_client.set_responder(lambda t, c: SimpleNamespace(data=[_row()]))
    row = await pairs_db.create_pair(
        USER, "Fraud", {"appellant": ["offender"]}, "fraud", "pl-col", "uk-col"
    )
    assert row["id"] == PAIR
    table, chain = fake_client.operations[0]
    assert table == "collection_pairs"
    assert _ops(chain) == ["insert"]
    assert chain[0][1][0] == {
        "user_id": USER,
        "name": "Fraud",
        "filters": {"appellant": ["offender"]},
        "text_query": "fraud",
        "pl_collection_id": "pl-col",
        "uk_collection_id": "uk-col",
    }


async def test_create_pair_maps_postgrest_error_to_http(pairs_db, fake_client):
    def _boom(_t, _c):
        raise PostgrestAPIError(
            {
                "message": "duplicate key value violates unique constraint",
                "code": "23505",
            }
        )

    fake_client.set_responder(_boom)
    with pytest.raises(HTTPException) as exc:
        await pairs_db.create_pair(USER, "n", {}, None, "a", "b")
    assert exc.value.status_code == 409


async def test_list_pairs_is_scoped_to_user_and_newest_first(pairs_db, fake_client):
    fake_client.set_responder(lambda t, c: SimpleNamespace(data=[_row()]))
    rows = await pairs_db.list_pairs(USER)
    assert rows == [_row()]
    _, chain = fake_client.operations[0]
    assert _eqs(chain) == {"user_id": USER}
    order = next(c for c in chain if c[0] == "order")
    assert order[1] == ("created_at",) and order[2] == {"desc": True}


async def test_find_pair_filters_by_id_and_user(pairs_db, fake_client):
    fake_client.set_responder(lambda t, c: SimpleNamespace(data=[_row()]))
    assert (await pairs_db.find_pair(PAIR, USER))["id"] == PAIR
    _, chain = fake_client.operations[0]
    assert _eqs(chain) == {"id": PAIR, "user_id": USER}


async def test_find_pair_returns_none_when_not_owned(pairs_db, fake_client):
    fake_client.set_responder(lambda t, c: SimpleNamespace(data=[]))
    assert await pairs_db.find_pair(PAIR, OTHER) is None


async def test_delete_pair_filters_by_user_and_reports_outcome(pairs_db, fake_client):
    fake_client.set_responder(lambda t, c: SimpleNamespace(data=[_row()]))
    assert await pairs_db.delete_pair(PAIR, USER) is True
    table, chain = fake_client.operations[0]
    assert table == "collection_pairs"
    assert _ops(chain)[0] == "delete"
    assert _eqs(chain) == {"id": PAIR, "user_id": USER}

    fake_client.set_responder(lambda t, c: SimpleNamespace(data=[]))
    assert await pairs_db.delete_pair(PAIR, OTHER) is False


async def test_pairs_by_collection_indexes_both_sides(pairs_db, fake_client):
    fake_client.set_responder(lambda t, c: SimpleNamespace(data=[_row()]))
    by_col = await pairs_db.pairs_by_collection(USER)
    assert by_col == {
        "pl-col": {
            "id": PAIR,
            "name": "Fraud",
            "role": "PL",
            "partner_collection_id": "uk-col",
        },
        "uk-col": {
            "id": PAIR,
            "name": "Fraud",
            "role": "UK",
            "partner_collection_id": "pl-col",
        },
    }
    assert _eqs(fake_client.operations[0][1]) == {"user_id": USER}
