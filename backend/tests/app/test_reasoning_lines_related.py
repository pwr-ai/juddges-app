"""Related reasoning lines: avg_embedding arrives as pgvector text or a list."""

import json
from collections.abc import Generator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.unit]

_API_KEY = "test-api-key-12345"


class _Query:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self._eq: tuple[str, Any] | None = None
        self._neq: tuple[str, Any] | None = None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._eq = (col, val)
        return self

    def neq(self, col, val):
        self._neq = (col, val)
        return self

    def in_(self, *_a, **_k):
        return self

    def execute(self):
        rows = self._rows
        if self._eq:
            rows = [r for r in rows if r[self._eq[0]] == self._eq[1]]
        if self._neq:
            rows = [r for r in rows if r[self._neq[0]] != self._neq[1]]
        return SimpleNamespace(data=rows)


class _Db:
    def __init__(self, rows: list[dict[str, Any]]):
        self.client = self
        self._rows = rows

    def table(self, _name: str) -> _Query:
        return _Query(self._rows)


def _line(line_id: str, emb: Any) -> dict[str, Any]:
    return {
        "id": line_id,
        "label": line_id,
        "legal_question": "q",
        "keywords": [],
        "legal_bases": [],
        "case_count": 1,
        "coherence_score": 0.5,
        "avg_embedding": emb,
        "status": "active",
    }


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


@pytest.mark.parametrize("as_text", [True, False])
def test_related_scores_embedding_for_text_and_list(
    reader_client: TestClient, monkeypatch: pytest.MonkeyPatch, as_text: bool
) -> None:
    def enc(v: list[float]) -> Any:
        return json.dumps(v) if as_text else v

    db = _Db(
        [
            _line("target", enc([1.0, 0.0])),
            _line("same", enc([1.0, 0.0])),
            _line("orthogonal", enc([0.0, 1.0])),
            _line("no-emb", None),
        ]
    )
    monkeypatch.setattr("app.reasoning_lines.search.get_vector_db", lambda: db)

    response = reader_client.get(
        "/reasoning-lines/target/related", headers={"X-API-Key": _API_KEY}
    )

    assert response.status_code == 200
    scores = {r["id"]: r["relatedness_score"] for r in response.json()["related"]}
    assert scores["same"] == pytest.approx(0.4)
    # zero-relatedness lines are dropped by the endpoint
    assert set(scores) == {"same"}
