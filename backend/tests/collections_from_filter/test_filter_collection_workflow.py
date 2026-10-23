"""Direct tests for the collection-from-filter workflow (no app.server import)."""

from __future__ import annotations

import os
from typing import Any

import pytest
from fastapi import BackgroundTasks, HTTPException

os.environ.setdefault("SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

import app.collections_from_filter as cff
from app.core.auth_jwt import AuthenticatedUser
from app.extraction_domain.filter_ids import (
    SAVE_FROM_FILTER_MAX_DOCUMENTS,
    FilterIdsResult,
)

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

USER_ID = "00000000-0000-4000-a000-000000000abc"
OWNED_ID = "00000000-0000-4000-a000-00000000c001"
FOREIGN_ID = "00000000-0000-4000-a000-00000000c0ff"


class StubDb:
    def __init__(self) -> None:
        self.owned_ids: list[str] = []
        self.created: list[dict[str, Any]] = []
        self.bulk_calls: list[tuple[str, list[str]]] = []
        self.delete_attempts: list[str] = []
        self.delete_should_fail = False

    async def get_user_collections(self, user_id: str) -> list[dict[str, str]]:
        return [{"id": collection_id} for collection_id in self.owned_ids]

    async def create_collection(
        self, user_id: str, name: str, description: str | None = None
    ) -> dict[str, Any]:
        index = len(self.created) + 1
        row = {
            "id": f"00000000-0000-4000-a000-{index:012x}",
            "user_id": user_id,
            "name": name,
            "description": description,
            "created_at": "2026-10-23T00:00:00Z",
            "updated_at": "2026-10-23T00:00:00Z",
        }
        self.created.append(row)
        return row

    async def bulk_add_documents(
        self, collection_id: str, judgment_ids: list[str], user_id: str
    ) -> dict[str, list[str]]:
        self.bulk_calls.append((collection_id, list(judgment_ids)))
        return {"added": list(judgment_ids), "failed": []}

    async def delete_collection(self, collection_id: str, user_id: str) -> bool:
        self.delete_attempts.append(collection_id)
        if self.delete_should_fail:
            raise RuntimeError("delete boom")
        return True


class StubPairsDb:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.failure: HTTPException | None = None

    async def create_pair(
        self,
        user_id: str,
        name: str,
        filters: dict[str, Any],
        text_query: str | None,
        pl_collection_id: str,
        uk_collection_id: str,
    ) -> dict[str, Any]:
        if self.failure is not None:
            raise self.failure
        row = {
            "id": "00000000-0000-4000-a000-00000000aa01",
            "user_id": user_id,
            "name": name,
            "filters": filters,
            "text_query": text_query,
            "pl_collection_id": pl_collection_id,
            "uk_collection_id": uk_collection_id,
        }
        self.rows.append(row)
        return row


def ids(count: int, *, side: str = "a") -> list[str]:
    return [f"00000000-0000-4000-{side}000-{index:012x}" for index in range(count)]


def result(pl: int, uk: int = 0) -> FilterIdsResult:
    pl_ids = ids(pl, side="a")
    uk_ids = ids(uk, side="b")
    return FilterIdsResult(
        ids=pl_ids + uk_ids,
        by_jurisdiction={"PL": pl_ids, "UK": uk_ids},
    )


@pytest.fixture
def user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={"id": USER_ID, "email": "x@example.com", "role": "authenticated"},
        access_token="fake",
    )


async def run(
    request: cff.CreateCollectionFromFilterRequest,
    *,
    user: AuthenticatedUser,
    db: StubDb | None = None,
    pairs_db: StubPairsDb | None = None,
    filter_client: object | None = None,
) -> tuple[cff.CollectionFromFilterResponse, StubDb, StubPairsDb, BackgroundTasks]:
    current_db = db or StubDb()
    current_pairs_db = pairs_db or StubPairsDb()
    background_tasks = BackgroundTasks()
    response = await cff.run_collection_from_filter(
        request=request,
        background_tasks=background_tasks,
        db=current_db,
        pairs_db=current_pairs_db,
        user=user,
        filter_client=filter_client or object(),
    )
    return response, current_db, current_pairs_db, background_tasks


async def test_checks_collection_access_before_resolving(
    monkeypatch: pytest.MonkeyPatch, user: AuthenticatedUser
) -> None:
    resolve_calls: list[object] = []
    monkeypatch.setattr(
        cff,
        "resolve_filter_ids",
        lambda *args: resolve_calls.append(args) or result(1),
    )

    with pytest.raises(HTTPException) as raised:
        await run(
            cff.CreateCollectionFromFilterRequest(
                name="x", filters={"collection_ids": [FOREIGN_ID]}
            ),
            user=user,
        )

    assert raised.value.status_code == 404
    assert resolve_calls == []


async def test_rejects_the_cap_before_any_write(
    monkeypatch: pytest.MonkeyPatch, user: AuthenticatedUser
) -> None:
    client = object()
    seen_clients: list[object] = []
    monkeypatch.setattr(
        cff,
        "resolve_filter_ids",
        lambda current_client, *_args: (
            seen_clients.append(current_client)
            or result(SAVE_FROM_FILTER_MAX_DOCUMENTS + 1)
        ),
    )
    db = StubDb()

    with pytest.raises(HTTPException) as raised:
        await run(
            cff.CreateCollectionFromFilterRequest(name="x", filters={}),
            user=user,
            db=db,
            filter_client=client,
        )

    assert raised.value.status_code == 413
    assert seen_clients == [client]
    assert db.created == []
    assert db.bulk_calls == []


async def test_creates_one_collection_with_chunk_counts_and_audit_order(
    monkeypatch: pytest.MonkeyPatch, user: AuthenticatedUser
) -> None:
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_args: result(1001))

    response, db, pairs_db, tasks = await run(
        cff.CreateCollectionFromFilterRequest(
            name="Cases", filters={"jurisdiction": ["PL"]}, text_query="fraud"
        ),
        user=user,
    )

    assert response.total_matched == 1001
    assert [
        (entry.jurisdiction, entry.added_count) for entry in response.collections
    ] == [(None, 1001)]
    assert [len(documents) for _, documents in db.bulk_calls] == [1000, 1]
    assert pairs_db.rows == []
    assert [task.kwargs["action_type"] for task in tasks.tasks] == [
        "collection_created",
        "collection_document_added",
    ]
    assert tasks.tasks[1].kwargs["input_data"]["count"] == 1001


async def test_creates_pair_in_side_order_with_matching_counts_and_audits(
    monkeypatch: pytest.MonkeyPatch, user: AuthenticatedUser
) -> None:
    client = object()
    seen: dict[str, object] = {}

    def resolve(
        current_client: object, filters: dict[str, Any], text_query: str | None
    ):
        seen.update(client=current_client, filters=filters, text_query=text_query)
        return result(2, 1)

    monkeypatch.setattr(cff, "resolve_filter_ids", resolve)

    response, db, pairs_db, tasks = await run(
        cff.CreateCollectionFromFilterRequest(
            name="Cases",
            filters={"jurisdiction": ["UK"], "appellant": ["offender"]},
            text_query="fraud",
            split_by_jurisdiction=True,
        ),
        user=user,
        filter_client=client,
    )

    assert seen == {
        "client": client,
        "filters": {"appellant": ["offender"]},
        "text_query": "fraud",
    }
    assert response.total_matched == 3
    assert response.ignored_filter_keys == ["jurisdiction"]
    assert [
        (entry.jurisdiction, entry.added_count) for entry in response.collections
    ] == [
        ("PL", 2),
        ("UK", 1),
    ]
    assert [row["name"] for row in db.created] == ["Cases — PL", "Cases — UK"]
    assert pairs_db.rows[0]["pl_collection_id"] == response.collections[0].collection.id
    assert pairs_db.rows[0]["uk_collection_id"] == response.collections[1].collection.id
    assert [task.kwargs["action_type"] for task in tasks.tasks] == [
        "collection_created",
        "collection_document_added",
        "collection_created",
        "collection_document_added",
        "collection_pair_created",
    ]
    assert [tasks.tasks[index].kwargs["input_data"]["count"] for index in (1, 3)] == [
        2,
        1,
    ]


async def test_pair_rollback_failures_do_not_mask_the_original_error(
    monkeypatch: pytest.MonkeyPatch, user: AuthenticatedUser
) -> None:
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_args: result(1, 1))
    db = StubDb()
    db.delete_should_fail = True
    pairs_db = StubPairsDb()
    original = HTTPException(status_code=500, detail="pair boom")
    pairs_db.failure = original

    with pytest.raises(HTTPException) as raised:
        await run(
            cff.CreateCollectionFromFilterRequest(
                name="Cases", filters={}, split_by_jurisdiction=True
            ),
            user=user,
            db=db,
            pairs_db=pairs_db,
        )

    assert raised.value is original
    assert db.delete_attempts == [row["id"] for row in db.created]
