"""HTTP contract tests for reasoning-line routes (#225)."""

from collections.abc import Generator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
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
        elif column == "id" and value == "non-existent-line":
            self._rows = []
        elif column == "status":
            self._rows = [r for r in self._rows if r.get("status") == value]
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def single(self):
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
                    "legal_question": "Can VAT be deducted for company cars?",
                    "status": "active",
                    "case_count": 2,
                    "coherence_score": 0.9,
                    "date_range_start": "2023-01-01",
                    "date_range_end": "2024-01-01",
                    "keywords": ["VAT"],
                    "legal_bases": ["Art 86 ust 1 ustawy o VAT"],
                    "created_at": "2024-01-01T00:00:00Z",
                }
            ],
            "reasoning_line_events": [],
            "reasoning_line_members": [],
        }
        return _FakeQuery(rows.get(name, []))


class _FailingVectorDb:
    def __init__(self):
        self.client = self

    def table(self, _name: str):
        raise RuntimeError("database unavailable")


@pytest.fixture
def reasoning_client() -> Generator[TestClient, None, None]:
    async def _authenticated_user() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_data={
                "id": "reader-1",
                "email": "reader@example.com",
                "role": "authenticated",
            },
            access_token="test-bearer-token",
        )

    app.dependency_overrides[jwt_get_current_user] = _authenticated_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)


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
    assert response.json()["statistics"]["total_nodes"] == 1


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


def test_list_reasoning_lines_endpoint(
    reasoning_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_db = _FakeVectorDb()
    monkeypatch.setattr("app.reasoning_lines.crud.get_vector_db", lambda: fake_db)

    response = reasoning_client.get(
        "/reasoning-lines/", headers={"X-API-Key": _API_KEY}
    )

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == "line-1"
    assert items[0]["label"] == "VAT deduction"


def test_list_reasoning_lines_invalid_status_filter(
    reasoning_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_db = _FakeVectorDb()
    monkeypatch.setattr("app.reasoning_lines.crud.get_vector_db", lambda: fake_db)

    response = reasoning_client.get(
        "/reasoning-lines/?status=invalid_status", headers={"X-API-Key": _API_KEY}
    )

    assert response.status_code == 400
    assert "Invalid status filter" in response.json()["detail"]


def test_get_reasoning_line_not_found(
    reasoning_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_db = _FakeVectorDb()
    monkeypatch.setattr("app.reasoning_lines.crud.get_vector_db", lambda: fake_db)

    response = reasoning_client.get(
        "/reasoning-lines/non-existent-line", headers={"X-API-Key": _API_KEY}
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

