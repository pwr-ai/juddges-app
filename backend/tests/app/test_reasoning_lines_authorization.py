"""Authorization contracts for the global reasoning-lines data set (#394)."""

from types import SimpleNamespace
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.security]

_API_HEADERS = {"X-API-Key": "test-api-key-12345"}
_LINE_ID = "11111111-1111-4111-8111-111111111111"


class _EmptyQuery:
    def select(self, *_args: object, **_kwargs: object) -> "_EmptyQuery":
        return self

    def contains(self, *_args: object, **_kwargs: object) -> "_EmptyQuery":
        return self

    def in_(self, *_args: object, **_kwargs: object) -> "_EmptyQuery":
        return self

    def limit(self, *_args: object, **_kwargs: object) -> "_EmptyQuery":
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[])


class _EmptyVectorDb:
    client: "_EmptyVectorDb"

    def __init__(self) -> None:
        self.client = self

    def table(self, _name: str) -> _EmptyQuery:
        return _EmptyQuery()


class _FailingVectorDb:
    client: "_FailingVectorDb"

    def __init__(self) -> None:
        self.client = self

    def table(self, _name: str) -> Any:
        raise RuntimeError("storage must not be reached before authorization")


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as test_client:
        yield test_client


def _user(*, admin: bool = False) -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": "admin-1" if admin else "user-1",
            "email": "admin@example.com" if admin else "user@example.com",
            "role": "authenticated",
            "app_metadata": {"is_admin": admin},
        },
        access_token="test-bearer-token",
    )


def _authenticate(user: AuthenticatedUser) -> None:
    async def _resolver() -> AuthenticatedUser:
        return user

    app.dependency_overrides[jwt_get_current_user] = _resolver


def _stub_storage(monkeypatch: pytest.MonkeyPatch, db: object) -> None:
    for module in ("crud", "discovery", "drift", "events", "outcomes", "search"):
        monkeypatch.setattr(f"app.reasoning_lines.{module}.get_vector_db", lambda: db)


async def test_reads_require_a_bearer_authenticated_user(client: AsyncClient) -> None:
    response = await client.get("/reasoning-lines/dag", headers=_API_HEADERS)

    assert response.status_code in (401, 403)


async def test_regular_user_can_use_read_only_get_and_post_operations(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _authenticate(_user())
    empty_db = _EmptyVectorDb()
    _stub_storage(monkeypatch, empty_db)

    dag_response = await client.get("/reasoning-lines/dag", headers=_API_HEADERS)
    search_response = await client.post(
        "/reasoning-lines/search",
        json={"query": "VAT deduction"},
        headers=_API_HEADERS,
    )
    discovery_response = await client.post(
        "/reasoning-lines/discover",
        json={"sample_size": 20, "num_clusters": 2},
        headers=_API_HEADERS,
    )

    assert dag_response.status_code == 200
    assert search_response.status_code == 200
    # Empty storage is a valid domain error and proves auth let the request through.
    assert discovery_response.status_code == 400


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        (
            "POST",
            "/reasoning-lines/create",
            {
                "label": "VAT",
                "legal_question": "When is VAT deductible?",
                "judgment_ids": [],
            },
        ),
        ("DELETE", f"/reasoning-lines/{_LINE_ID}", None),
        ("POST", "/reasoning-lines/detect-events", None),
        ("POST", f"/reasoning-lines/{_LINE_ID}/drift-analysis", None),
        ("POST", f"/reasoning-lines/{_LINE_ID}/analyze-outcomes", None),
    ],
)
async def test_regular_user_cannot_mutate_the_global_reasoning_lines_dataset(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    path: str,
    json_body: dict[str, object] | None,
) -> None:
    _authenticate(_user())
    _stub_storage(monkeypatch, _FailingVectorDb())

    response = await client.request(method, path, json=json_body, headers=_API_HEADERS)

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin privileges required"}


async def test_admin_can_reach_global_mutation_handler(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _authenticate(_user(admin=True))
    _stub_storage(monkeypatch, _FailingVectorDb())

    response = await client.post(
        "/reasoning-lines/create",
        json={
            "label": "VAT",
            "legal_question": "When is VAT deductible?",
            "judgment_ids": [],
        },
        headers=_API_HEADERS,
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "judgment_ids must not be empty"}
