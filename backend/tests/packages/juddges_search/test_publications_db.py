"""Failure contract for the publications database adapter."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from juddges_search.db.publications_db import PublicationsDB
from supabase import PostgrestAPIError

pytestmark = [pytest.mark.anyio, pytest.mark.unit]


class _FailingPublicationsQuery:
    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        raise PostgrestAPIError(
            {
                "message": "database unavailable",
                "code": "XX000",
                "hint": None,
                "details": None,
            }
        )


class _FailingPublicationsClient:
    def table(self, _name: str) -> _FailingPublicationsQuery:
        return _FailingPublicationsQuery()


class _FailingMutationQuery:
    def __init__(self, client: "_FailingMutationClient") -> None:
        self.client = client
        self.operation: str | None = None
        self.payload: dict | None = None

    def insert(self, data: dict):
        self.operation = "insert"
        self.payload = data
        return self

    def update(self, data: dict):
        self.operation = "update"
        self.payload = data
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.operation == "insert":
            self.client.insert_calls.append(dict(self.payload or {}))
        elif self.operation == "update":
            self.client.update_calls.append(dict(self.payload or {}))
        elif self.operation == "delete":
            self.client.delete_calls += 1

        raise PostgrestAPIError(
            {
                "message": "raw-message-sentinel",
                "code": "raw-code-sentinel",
                "hint": "raw-hint-sentinel",
                "details": "raw-details-sentinel",
            }
        )


class _FailingMutationClient:
    def __init__(self) -> None:
        self.insert_calls: list[dict] = []
        self.update_calls: list[dict] = []
        self.delete_calls = 0

    def table(self, _name: str) -> _FailingMutationQuery:
        return _FailingMutationQuery(self)


class _MutationThenReadbackFailureQuery:
    def __init__(self, client: "_MutationThenReadbackFailureClient") -> None:
        self.client = client
        self.operation: str | None = None
        self.payload: dict | None = None

    def insert(self, data: dict):
        self.operation = "insert"
        self.payload = data
        return self

    def update(self, data: dict):
        self.operation = "update"
        self.payload = data
        return self

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.operation == "insert":
            self.client.insert_calls.append(dict(self.payload or {}))
            return SimpleNamespace(data=[self.client.insert_row])
        if self.operation == "update":
            self.client.update_calls.append(dict(self.payload or {}))
            return SimpleNamespace(data=[self.client.update_row])

        self.client.read_calls += 1
        raise PostgrestAPIError(
            {
                "message": "readback unavailable",
                "code": "XXREAD",
                "hint": None,
                "details": None,
            }
        )


class _MutationThenReadbackFailureClient:
    def __init__(self) -> None:
        self.insert_row = {
            "id": "11111111-1111-4111-a111-111111111111",
            "title": "Created publication",
        }
        self.update_row = {
            "id": "11111111-1111-4111-a111-111111111111",
            "title": "Updated publication",
        }
        self.insert_calls: list[dict] = []
        self.update_calls: list[dict] = []
        self.read_calls = 0

    def table(self, _name: str) -> _MutationThenReadbackFailureQuery:
        return _MutationThenReadbackFailureQuery(self)


async def test_get_publications_translates_database_failure_to_http_500() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    db.client = _FailingPublicationsClient()

    with pytest.raises(HTTPException) as exc_info:
        await db.get_publications()

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to retrieve publications"
    for sentinel in ("database unavailable", "XX000"):
        assert sentinel not in str(exc_info.value.detail)


async def test_get_publication_translates_database_failure_to_http_500() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    db.client = _FailingPublicationsClient()

    with pytest.raises(HTTPException) as exc_info:
        await db.get_publication("11111111-1111-4111-a111-111111111111")

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to retrieve publication"
    for sentinel in ("database unavailable", "XX000"):
        assert sentinel not in str(exc_info.value.detail)


async def test_create_returns_inserted_row_when_readback_fails() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    client = _MutationThenReadbackFailureClient()
    db.client = client

    result = await db.create_publication({"title": "Created publication"})

    assert result == client.insert_row
    assert client.insert_calls == [{"title": "Created publication"}]
    assert client.update_calls == []
    assert client.read_calls == 1


async def test_update_returns_updated_row_when_readback_fails() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    client = _MutationThenReadbackFailureClient()
    db.client = client

    result = await db.update_publication(
        "11111111-1111-4111-a111-111111111111",
        {"title": "Updated publication"},
    )

    assert result == client.update_row
    assert client.insert_calls == []
    assert len(client.update_calls) == 1
    assert client.update_calls[0]["title"] == "Updated publication"
    assert client.read_calls == 1


async def test_create_mutation_failure_is_sanitized() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    client = _FailingMutationClient()
    db.client = client

    with pytest.raises(HTTPException) as exc_info:
        await db.create_publication({"title": "Created publication"})

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to create publication"
    for sentinel in ("raw-message", "raw-code", "raw-hint", "raw-details"):
        assert sentinel not in str(exc_info.value.detail)
    assert client.insert_calls == [{"title": "Created publication"}]
    assert client.update_calls == []
    assert client.delete_calls == 0


async def test_update_mutation_failure_is_sanitized() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    client = _FailingMutationClient()
    db.client = client

    with pytest.raises(HTTPException) as exc_info:
        await db.update_publication(
            "11111111-1111-4111-a111-111111111111",
            {"title": "Updated publication"},
        )

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to update publication"
    for sentinel in ("raw-message", "raw-code", "raw-hint", "raw-details"):
        assert sentinel not in str(exc_info.value.detail)
    assert client.insert_calls == []
    assert len(client.update_calls) == 1
    assert client.update_calls[0]["title"] == "Updated publication"
    assert client.delete_calls == 0


async def test_delete_database_failure_is_sanitized() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    client = _FailingMutationClient()
    db.client = client

    with pytest.raises(HTTPException) as exc_info:
        await db.delete_publication("11111111-1111-4111-a111-111111111111")

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to delete publication"
    for sentinel in ("raw-message", "raw-code", "raw-hint", "raw-details"):
        assert sentinel not in str(exc_info.value.detail)
    assert client.insert_calls == []
    assert client.update_calls == []
    assert client.delete_calls == 1
