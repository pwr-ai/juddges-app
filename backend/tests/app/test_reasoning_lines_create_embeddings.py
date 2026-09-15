"""Regression for #620: PostgREST returns pgvector columns as JSON strings.

``create`` skipped every string-form embedding, so ``avg_embedding`` was never
written, every member's ``similarity_to_centroid`` was 0.0 and the legal
question was never embedded. Search and related-lines compared against the
same string form and silently scored 0.
"""

from collections.abc import Generator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.reasoning_lines.similarity import (
    _pair_centroid_similarity,
    parse_embedding,
)
from app.server import app

pytestmark = [pytest.mark.unit, pytest.mark.api]

_API_KEY = "test-api-key-12345"
_JUDGMENTS = [
    {
        "id": "11111111-1111-4111-8111-111111111111",
        "case_number": "I C 1/20",
        "title": "first",
        "court_name": "SO",
        "decision_date": "2020-01-01",
        "embedding": "[1.0, 0.0, 0.0]",
    },
    {
        "id": "22222222-2222-4222-8222-222222222222",
        "case_number": "I C 2/21",
        "title": "second",
        "court_name": "SA",
        "decision_date": "2021-01-01",
        "embedding": "[0.8, 0.6, 0.0]",
    },
]


class _RecordingQuery:
    def __init__(self, db: "_RecordingDb", name: str):
        self._db = db
        self._name = name

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def insert(self, rows: dict | list[dict]):
        self._db.inserted.setdefault(self._name, []).extend(
            rows if isinstance(rows, list) else [rows]
        )
        return self

    def delete(self):
        return self

    def execute(self):
        if self._name == "judgments":
            return SimpleNamespace(data=_JUDGMENTS)
        return SimpleNamespace(data=[])


class _RecordingDb:
    def __init__(self):
        self.client = self
        self.inserted: dict[str, list[dict[str, Any]]] = {}

    def table(self, name: str) -> _RecordingQuery:
        return _RecordingQuery(self, name)


@pytest.fixture
def admin_client() -> Generator[TestClient, None, None]:
    async def _admin() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_data={
                "id": "admin-1",
                "email": "admin@example.com",
                "role": "authenticated",
                "app_metadata": {"is_admin": True},
            },
            access_token="test-bearer-token",
        )

    app.dependency_overrides[jwt_get_current_user] = _admin
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)


def test_parse_embedding_accepts_pgvector_string_and_list() -> None:
    assert parse_embedding("[0.1, 0.2, 0.3]") == [0.1, 0.2, 0.3]
    assert parse_embedding([0.1, 0.2]) == [0.1, 0.2]
    assert parse_embedding(None) is None
    assert parse_embedding("") is None
    assert parse_embedding("not json") is None
    assert parse_embedding("[]") is None


def test_create_computes_centroid_from_string_embeddings(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _RecordingDb()
    monkeypatch.setattr("app.reasoning_lines.crud.get_vector_db", lambda: db)

    async def _embed(_text: str) -> list[float]:
        return [0.9, 0.1, 0.0]

    monkeypatch.setattr("app.judgments_pkg.utils.generate_embedding", _embed)

    response = admin_client.post(
        "/reasoning-lines/create",
        headers={"X-API-Key": _API_KEY},
        json={
            "label": "CHF",
            "legal_question": "Is the contract void?",
            "judgment_ids": [j["id"] for j in _JUDGMENTS],
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert all(m["similarity_to_centroid"] > 0.9 for m in body["members"])
    assert body["coherence_score"] == pytest.approx(
        sum(m["similarity_to_centroid"] for m in body["members"]) / 2, abs=1e-4
    )

    line_row = db.inserted["reasoning_lines"][0]
    assert line_row["avg_embedding"] == pytest.approx([0.9, 0.3, 0.0])
    assert line_row["legal_question_embedding"] == [0.9, 0.1, 0.0]
    assert line_row["coherence_score"] == body["coherence_score"]
    assert all(
        row["similarity_to_centroid"] > 0.9
        for row in db.inserted["reasoning_line_members"]
    )


def test_create_still_succeeds_when_question_embedding_fails(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _RecordingDb()
    monkeypatch.setattr("app.reasoning_lines.crud.get_vector_db", lambda: db)

    async def _embed(_text: str) -> list[float]:
        raise RuntimeError("embedding provider down")

    monkeypatch.setattr("app.judgments_pkg.utils.generate_embedding", _embed)

    response = admin_client.post(
        "/reasoning-lines/create",
        headers={"X-API-Key": _API_KEY},
        json={
            "label": "CHF",
            "legal_question": "Is the contract void?",
            "judgment_ids": [j["id"] for j in _JUDGMENTS],
        },
    )

    assert response.status_code == 200, response.text
    assert "legal_question_embedding" not in db.inserted["reasoning_lines"][0]


def test_pair_centroid_similarity_reads_string_avg_embeddings() -> None:
    line_a = {"avg_embedding": "[1.0, 0.0]"}
    line_b = {"avg_embedding": "[1.0, 0.0]"}

    assert _pair_centroid_similarity(line_a, line_b) == pytest.approx(1.0)
