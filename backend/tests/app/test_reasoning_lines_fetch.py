"""Pagination and batching of reasoning-line fetches (PostgREST 1000-row cap)."""

from collections.abc import Generator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.reasoning_lines._fetch import fetch_all_pages, fetch_by_ids
from app.server import app

pytestmark = [pytest.mark.unit]

_API_KEY = "test-api-key-12345"
_MAX_ROWS = 1000


class _FakeQuery:
    """Query builder emulating PostgREST: max_rows cap, range, in_ filter."""

    def __init__(self, db: "_FakeDb", name: str):
        self._db = db
        self._name = name
        self._range: tuple[int, int] | None = None
        self._in: tuple[str, list[str]] | None = None
        self._eq: dict[str, Any] = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column: str, value: Any):
        self._eq[column] = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def in_(self, column: str, values: list[str]):
        self._in = (column, values)
        return self

    def range(self, start: int, end: int):
        self._range = (start, end)
        return self

    def execute(self):
        self._db.calls.append((self._name, self._range, self._in))
        rows = self._db.tables.get(self._name, [])
        for col, val in self._eq.items():
            rows = [r for r in rows if r.get(col) == val]
        if self._in:
            col, values = self._in
            rows = [r for r in rows if r.get(col) in values]
        start, end = self._range or (0, _MAX_ROWS - 1)
        return SimpleNamespace(data=rows[start : end + 1][:_MAX_ROWS])


class _FakeDb:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]):
        self.client = self
        self.tables = tables
        self.calls: list[tuple[str, Any, Any]] = []

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self, name)


def test_fetch_all_pages_pages_until_short_page() -> None:
    db = _FakeDb({"t": [{"i": i} for i in range(2500)]})

    rows = fetch_all_pages(lambda: db.table("t").select("i"))

    assert len(rows) == 2500
    assert [c[1] for c in db.calls] == [(0, 999), (1000, 1999), (2000, 2999)]


def test_fetch_all_pages_exact_multiple_needs_empty_trailing_page() -> None:
    db = _FakeDb({"t": [{"i": i} for i in range(2000)]})

    rows = fetch_all_pages(lambda: db.table("t").select("i"))

    assert len(rows) == 2000
    assert len(db.calls) == 3


def test_fetch_all_pages_builds_fresh_query_per_page() -> None:
    db = _FakeDb({"t": [{"i": i} for i in range(1500)]})
    built: list[_FakeQuery] = []

    def build() -> _FakeQuery:
        q = db.table("t").select("i")
        built.append(q)
        return q

    fetch_all_pages(build)

    assert len(built) == 2
    assert built[0] is not built[1]


def test_fetch_by_ids_batches_and_concatenates() -> None:
    db = _FakeDb({"judgments": [{"id": str(i)} for i in range(400)]})
    ids = [str(i) for i in range(400)]

    rows = fetch_by_ids(db.client, "judgments", "id", ids)

    assert len(rows) == 400
    assert [len(c[2][1]) for c in db.calls] == [150, 150, 100]


def test_fetch_by_ids_empty_makes_no_request() -> None:
    db = _FakeDb({"judgments": [{"id": "1"}]})

    assert fetch_by_ids(db.client, "judgments", "id", []) == []
    assert db.calls == []


@pytest.fixture
def reader_client() -> Generator[TestClient, None, None]:
    async def _user() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_data={"id": "r-1", "email": "r@example.com", "role": "authenticated"},
            access_token="test-bearer-token",
        )

    app.dependency_overrides[jwt_get_current_user] = _user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)


def test_line_detail_returns_all_members_beyond_max_rows(
    reader_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    n = 2300
    db = _FakeDb(
        {
            "reasoning_lines": [
                {
                    "id": "line-1",
                    "label": "CHF",
                    "legal_question": "q",
                    "status": "active",
                    "case_count": n,
                    "created_at": "2024-01-01T00:00:00Z",
                }
            ],
            "reasoning_line_members": [
                {
                    "reasoning_line_id": "line-1",
                    "judgment_id": f"j-{i}",
                    "position_in_line": i,
                    "similarity_to_centroid": 0.9,
                }
                for i in range(n)
            ],
            "judgments": [
                {"id": f"j-{i}", "case_number": f"C {i}", "title": "t"}
                for i in range(n)
            ],
        }
    )
    monkeypatch.setattr("app.reasoning_lines.crud.get_vector_db", lambda: db)

    response = reader_client.get(
        "/reasoning-lines/line-1", headers={"X-API-Key": _API_KEY}
    )

    assert response.status_code == 200, response.text
    members = response.json()["members"]
    assert len(members) == n
    assert members[-1]["signature"] == f"C {n - 1}"
    assert all(len(c[2][1]) <= 150 for c in db.calls if c[2])
