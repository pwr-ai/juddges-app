"""Regression tests for schema route precedence."""

from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.schemas_pkg import router as schemas_router
from app.schemas_pkg import versioning


class _SchemaVersionsQuery:
    def __init__(self, snapshots: dict[int, list[dict[str, Any]]]) -> None:
        self._snapshots = snapshots
        self._version_number: int | None = None

    def select(self, fields: str) -> "_SchemaVersionsQuery":
        assert fields == "field_snapshot"
        return self

    def eq(self, field: str, value: str | int) -> "_SchemaVersionsQuery":
        if field == "version_number":
            assert isinstance(value, int)
            self._version_number = value
        return self

    def single(self) -> "_SchemaVersionsQuery":
        return self

    def execute(self) -> SimpleNamespace:
        assert self._version_number is not None
        return SimpleNamespace(
            data={"field_snapshot": self._snapshots[self._version_number]}
        )


class _SchemaVersionsClient:
    def __init__(self, snapshots: dict[int, list[dict[str, Any]]]) -> None:
        self._snapshots = snapshots

    def table(self, name: str) -> _SchemaVersionsQuery:
        assert name == "schema_versions"
        return _SchemaVersionsQuery(self._snapshots)


def test_compare_versions_route_is_not_shadowed_by_version_number(monkeypatch) -> None:
    """The static compare route must win over the dynamic version route."""
    snapshots = {
        1: [
            {
                "field_path": "case.title",
                "field_name": "title",
                "field_type": "string",
                "description": "Old description",
                "is_required": True,
            }
        ],
        2: [
            {
                "field_path": "case.title",
                "field_name": "title",
                "field_type": "string",
                "description": "New description",
                "is_required": True,
            }
        ],
    }
    monkeypatch.setattr(versioning, "supabase_client", _SchemaVersionsClient(snapshots))

    app = FastAPI()
    app.include_router(schemas_router)

    with TestClient(app) as client:
        response = client.get(
            "/schemas/db/schema-1/versions/compare",
            params={"version_a": 1, "version_b": 2},
        )

    assert response.status_code == 200
    assert response.json() == {
        "schema_id": "schema-1",
        "version_a": 1,
        "version_b": 2,
        "added_fields": [],
        "removed_fields": [],
        "modified_fields": [
            {
                "field_path": "case.title",
                "field_name": "title",
                "changes": [
                    {
                        "property": "description",
                        "old": "Old description",
                        "new": "New description",
                    }
                ],
            }
        ],
    }
