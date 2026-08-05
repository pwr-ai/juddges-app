"""HTTP contract tests for reasoning-line routes (#225)."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.server import app

pytestmark = [pytest.mark.unit, pytest.mark.api]

_API_KEY = "test-api-key-12345"


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column: str, value: object):
        if column == "id" and value == "dag":
            self._rows = []
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _FakeVectorDb:
    def __init__(self):
        self.client = self

    def table(self, name: str) -> _FakeQuery:
        rows = {
            "reasoning_lines": [
                {
                    "id": "line-1",
                    "label": "VAT deduction",
                    "status": "active",
                    "case_count": 2,
                    "coherence_score": 0.9,
                    "date_range_start": "2023-01-01",
                    "date_range_end": "2024-01-01",
                    "keywords": ["VAT"],
                }
            ],
            "reasoning_line_events": [],
        }
        return _FakeQuery(rows.get(name, []))


class _FailingVectorDb:
    def __init__(self):
        self.client = self

    def table(self, _name: str):
        raise RuntimeError("database unavailable")


@pytest.fixture
def reasoning_client() -> TestClient:
    return TestClient(app)


def test_dag_static_route_is_not_shadowed_by_line_detail(
    reasoning_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /dag must resolve to the DAG handler, never to /{line_id}."""
    fake_db = _FakeVectorDb()
    monkeypatch.setattr("app.reasoning_lines.events.get_vector_db", lambda: fake_db)
    monkeypatch.setattr("app.reasoning_lines.crud.get_vector_db", lambda: fake_db)

    response = reasoning_client.get(
        "/reasoning-lines/dag", headers={"X-API-Key": _API_KEY}
    )

    assert response.status_code == 200
    assert response.json() == {
        "nodes": [
            {
                "id": "line-1",
                "label": "VAT deduction",
                "status": "active",
                "case_count": 2,
                "coherence_score": 0.9,
                "date_range_start": "2023-01-01",
                "date_range_end": "2024-01-01",
                "keywords": ["VAT"],
            }
        ],
        "edges": [],
        "statistics": {
            "total_nodes": 1,
            "total_edges": 0,
            "by_event_type": {},
            "by_status": {"active": 1},
        },
    }


def test_dag_route_requires_backend_api_key(reasoning_client: TestClient) -> None:
    response = reasoning_client.get("/reasoning-lines/dag")

    assert response.status_code == 401


def test_dag_route_returns_stable_error_when_storage_is_unavailable(
    reasoning_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.reasoning_lines.events.get_vector_db", lambda: _FailingVectorDb()
    )

    response = reasoning_client.get(
        "/reasoning-lines/dag", headers={"X-API-Key": _API_KEY}
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to fetch reasoning lines"}
