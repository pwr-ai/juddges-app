"""Cross-tenant access regression tests for CollectionsDB.

Two security regressions are pinned here:

* `delete_collection` previously deleted `collection_judgments` rows BEFORE
  verifying the caller owned the collection — a non-owner could wipe another
  user's collection contents.
* `get_collection_documents` previously skipped the `user_id` filter on the
  collections lookup ("Any user can retrieve judgments from any collection"),
  leaking which judgments any user has saved.

Both endpoints sit behind the BFF API key, so the practical attacker model is a
key holder (or a leak); even so, the DB layer must enforce ownership.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from juddges_search.db.collections_db import CollectionsDB

# ---------------------------------------------------------------------------
# Test double for the Supabase fluent client
# ---------------------------------------------------------------------------


class _FluentTable:
    """Records a Supabase-style fluent chain and defers `.execute()` to the
    parent recorder so each test can shape the response per-table."""

    _CHAIN_METHODS = {
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "in_",
        "order",
        "range",
        "limit",
        "not_",
        "is_",
        "gt",
        "lt",
        "gte",
        "lte",
        "neq",
        "like",
        "ilike",
        "or_",
    }

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
    """Records every call issued by CollectionsDB so we can assert on the
    actual queries the production code emitted."""

    def __init__(self) -> None:
        self.operations: list[
            tuple[str, list[tuple[str, tuple[Any, ...], dict[str, Any]]]]
        ] = []
        self._responder = lambda table, chain: SimpleNamespace(data=[], count=0)

    def set_responder(self, responder) -> None:
        self._responder = responder

    def table(self, name: str) -> _FluentTable:
        return _FluentTable(self, name)

    def _dispatch(
        self, name: str, chain: list[tuple[str, tuple[Any, ...], dict[str, Any]]]
    ):
        self.operations.append((name, list(chain)))
        return self._responder(name, chain)


def _filters(chain) -> list[tuple[str, Any]]:
    """Extract `(column, value)` pairs from `.eq(...)` calls in a chain."""
    return [(args[0], args[1]) for op, args, _ in chain if op == "eq"]


def _ops(chain) -> list[str]:
    """Extract the ordered list of operations issued in a chain."""
    return [op for op, _, _ in chain]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_client() -> FakeSupabaseClient:
    return FakeSupabaseClient()


@pytest.fixture
def collections_db(fake_client: FakeSupabaseClient) -> CollectionsDB:
    """A CollectionsDB instance with the real Supabase client swapped for the fake.

    Bypasses `_init_client` so we never reach `create_client` and the test
    needs no live Supabase, no env vars, and no network.
    """
    db = CollectionsDB.__new__(CollectionsDB)
    db.url = "http://fake.local"
    db.service_key = "fake-key"
    db.client = fake_client
    return db


# ---------------------------------------------------------------------------
# get_collection_documents — must scope by user_id
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGetCollectionDocumentsOwnership:
    async def test_non_owner_request_returns_404(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """A non-owner querying another user's collection must get 404 — no
        leakage of judgment IDs from collections they don't own."""

        def respond(table: str, chain) -> SimpleNamespace:
            # Owner-scoped collections lookup must filter by user_id and
            # return no rows for a non-owner caller.
            if table == "collections":
                return SimpleNamespace(data=[], count=0)
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        with pytest.raises(HTTPException) as exc:
            await collections_db.get_collection_documents(
                "00000000-0000-4000-a000-000000000001",
                user_id="user-b",
            )

        assert exc.value.status_code == 404

    async def test_collections_lookup_filters_by_user_id(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """The ownership lookup against `collections` must include
        `.eq("user_id", caller)`, otherwise it's still an IDOR even if a 404
        happens to be returned for unrelated reasons."""

        def respond(table: str, chain) -> SimpleNamespace:
            if table == "collections":
                return SimpleNamespace(data=[{"id": "col-1"}], count=1)
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        await collections_db.get_collection_documents("col-1", user_id="user-a")

        collections_chain = next(
            chain for table, chain in fake_client.operations if table == "collections"
        )
        assert ("user_id", "user-a") in _filters(collections_chain), (
            "get_collection_documents must scope the collections lookup by "
            f"user_id; observed eq filters: {_filters(collections_chain)}"
        )

    async def test_owner_receives_judgment_ids(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """Happy path: owner gets their judgment IDs back."""

        def respond(table: str, chain) -> SimpleNamespace:
            if table == "collections":
                return SimpleNamespace(data=[{"id": "col-1"}], count=1)
            if table == "collection_judgments":
                return SimpleNamespace(
                    data=[{"judgment_id": "j-1"}, {"judgment_id": "j-2"}],
                    count=2,
                )
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        result = await collections_db.get_collection_documents(
            "col-1", user_id="user-a"
        )

        assert [doc["id"] for doc in result] == ["j-1", "j-2"]


# ---------------------------------------------------------------------------
# delete_collection — must verify ownership before any destructive write
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestDeleteCollectionOwnership:
    async def test_non_owner_does_not_wipe_join_rows(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """A non-owner delete must NOT issue any `delete` against
        `collection_judgments` for a collection they don't own."""

        def respond(table: str, chain) -> SimpleNamespace:
            # Owner-scoped delete returns no rows because the caller isn't owner.
            if table == "collections" and "delete" in _ops(chain):
                return SimpleNamespace(data=[], count=0)
            # Pre-check (if the implementation does one) finds nothing either.
            if table == "collections":
                return SimpleNamespace(data=[], count=0)
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        result = await collections_db.delete_collection("col-1", user_id="user-b")

        assert result is False
        for table, chain in fake_client.operations:
            if table == "collection_judgments" and "delete" in _ops(chain):
                pytest.fail(
                    "delete_collection wiped collection_judgments before "
                    f"verifying ownership: {chain}"
                )

    async def test_owner_delete_succeeds(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """Owner delete returns True; CASCADE on the FK handles join rows."""

        def respond(table: str, chain) -> SimpleNamespace:
            if table == "collections" and "delete" in _ops(chain):
                return SimpleNamespace(data=[{"id": "col-1"}], count=1)
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        result = await collections_db.delete_collection("col-1", user_id="user-a")

        assert result is True

    async def test_owner_scoped_delete_filters_on_user_id(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """The destructive delete against `collections` must include
        `.eq("user_id", caller)`."""

        def respond(table: str, chain) -> SimpleNamespace:
            if table == "collections" and "delete" in _ops(chain):
                return SimpleNamespace(data=[{"id": "col-1"}], count=1)
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        await collections_db.delete_collection("col-1", user_id="user-a")

        delete_chain = next(
            chain
            for table, chain in fake_client.operations
            if table == "collections" and "delete" in _ops(chain)
        )
        assert ("user_id", "user-a") in _filters(delete_chain)
        assert ("id", "col-1") in _filters(delete_chain)


# ---------------------------------------------------------------------------
# update_collection — partial-update semantics for `description`
# ---------------------------------------------------------------------------


def _update_payload(chain) -> dict[str, Any]:
    """Extract the dict passed to `.update(...)` in a Supabase chain."""
    for op, args, _ in chain:
        if op == "update":
            return args[0]
    raise AssertionError(f"no update() in chain: {chain}")


@pytest.mark.unit
class TestUpdateCollectionDescriptionSemantics:
    async def test_omitted_description_is_not_in_update_payload(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """When the caller omits description (UNSET sentinel), the update
        payload must contain only `name` — preserving the existing value."""

        def respond(table: str, chain) -> SimpleNamespace:
            if table == "collections":
                return SimpleNamespace(data=[{"id": "col-1", "name": "x"}], count=1)
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        await collections_db.update_collection("col-1", "user-a", "renamed")

        update_chain = next(
            chain for table, chain in fake_client.operations if table == "collections"
        )
        payload = _update_payload(update_chain)
        assert payload == {"name": "renamed"}, (
            "Omitting description must NOT clobber existing value; observed "
            f"payload: {payload}"
        )

    async def test_explicit_none_description_is_written(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """When the caller passes description=None, the update must include
        `description: None` so the DB clears the field."""

        def respond(table: str, chain) -> SimpleNamespace:
            if table == "collections":
                return SimpleNamespace(
                    data=[{"id": "col-1", "name": "x", "description": None}], count=1
                )
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        await collections_db.update_collection(
            "col-1", "user-a", "renamed", description=None
        )

        update_chain = next(
            chain for table, chain in fake_client.operations if table == "collections"
        )
        payload = _update_payload(update_chain)
        assert payload == {"name": "renamed", "description": None}

    async def test_string_description_is_written(
        self, collections_db: CollectionsDB, fake_client: FakeSupabaseClient
    ):
        """Happy path: a string description is forwarded verbatim."""

        def respond(table: str, chain) -> SimpleNamespace:
            if table == "collections":
                return SimpleNamespace(
                    data=[{"id": "col-1", "name": "x", "description": "new"}],
                    count=1,
                )
            return SimpleNamespace(data=[], count=0)

        fake_client.set_responder(respond)

        await collections_db.update_collection(
            "col-1", "user-a", "renamed", description="new"
        )

        update_chain = next(
            chain for table, chain in fake_client.operations if table == "collections"
        )
        payload = _update_payload(update_chain)
        assert payload == {"name": "renamed", "description": "new"}
