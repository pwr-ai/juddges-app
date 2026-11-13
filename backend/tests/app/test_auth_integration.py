"""HTTP authentication contracts against the real application dependencies.

Only the Supabase upstream and collection storage are stubbed. Neither
verify_api_key nor get_current_user is overridden, so 401/200 assertions
exercise the authentication boundary. These unit tests do not prove that
Supabase itself validates or refreshes tokens; the real-auth suite must do that.

Constant-time comparison and throttling are covered by test_api_key_auth.py
and test_rate_limit_middleware.py, rather than assertion-free timing loops here.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from httpx import AsyncClient, Response
from juddges_search.db.supabase_db import get_collections_db
from supabase_auth.errors import AuthApiError

from app.collection_pairs import get_collection_pairs_db
from app.core import auth_jwt
from app.server import ALLOWED_ORIGINS, app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.auth, pytest.mark.api]

USER_ID = "00000000-0000-4000-a000-000000000abc"
ACCESS_TOKEN = "test-access-token"  # noqa: S105


@pytest.fixture
def auth_boundary(monkeypatch: pytest.MonkeyPatch):
    """Stub I/O while preserving the actual API-key and Bearer dependencies."""
    user = MagicMock()
    user.model_dump.return_value = {
        "id": USER_ID,
        "email": "auth@example.test",
        "role": "authenticated",
    }
    upstream = MagicMock()
    upstream.auth.get_user.return_value = SimpleNamespace(user=user)
    monkeypatch.setattr(auth_jwt, "get_admin_supabase_client", lambda: upstream)
    collections = SimpleNamespace(get_user_collections=AsyncMock(return_value=[]))
    pairs = SimpleNamespace(pairs_by_collection=AsyncMock(return_value={}))
    app.dependency_overrides[get_collections_db] = lambda: collections
    app.dependency_overrides[get_collection_pairs_db] = lambda: pairs
    try:
        yield SimpleNamespace(upstream=upstream, collections=collections, pairs=pairs)
    finally:
        app.dependency_overrides.pop(get_collections_db, None)
        app.dependency_overrides.pop(get_collection_pairs_db, None)


def assert_auth_error(response: Response, detail: str, scheme: str) -> None:
    assert response.status_code == 401
    assert response.json() == {"detail": detail}
    assert response.headers["WWW-Authenticate"] == scheme


def assert_no_collection_reads(boundary) -> None:
    boundary.collections.get_user_collections.assert_not_awaited()
    boundary.pairs.pairs_by_collection.assert_not_awaited()


@pytest.mark.parametrize("endpoint", ["/documents", "/collections", "/schemas"])
@pytest.mark.parametrize(
    ("headers", "detail"),
    [
        ({}, "Not authenticated"),
        ({"X-API-Key": ""}, "Not authenticated"),
        ({"X-API-Key": "invalid"}, "Invalid API key"),
        ({"X-API-Key": "TEST-API-KEY-12345"}, "Invalid API key"),
        ({"Authorization": "test-api-key-12345"}, "Not authenticated"),
    ],
)
async def test_missing_or_invalid_api_key_is_rejected(
    client: AsyncClient, auth_boundary, endpoint: str, headers: dict, detail: str
):
    response = await client.get(endpoint, headers=headers)

    assert_auth_error(response, detail, "APIKey")
    auth_boundary.upstream.auth.get_user.assert_not_called()
    assert_no_collection_reads(auth_boundary)


@pytest.mark.parametrize("header_name", ["X-API-Key", "x-api-key"])
async def test_valid_credentials_reach_collection_handler(
    client: AsyncClient, auth_boundary, test_api_key: str, header_name: str
):
    response = await client.get(
        "/collections",
        headers={header_name: test_api_key, "Authorization": f"Bearer {ACCESS_TOKEN}"},
    )

    assert response.status_code == 200
    assert response.json() == []
    auth_boundary.upstream.auth.get_user.assert_called_once_with(ACCESS_TOKEN)
    auth_boundary.collections.get_user_collections.assert_awaited_once_with(USER_ID)
    auth_boundary.pairs.pairs_by_collection.assert_awaited_once_with(USER_ID)


@pytest.mark.parametrize("authorization", [None, "Bearer", "Basic credentials"])
async def test_api_key_does_not_replace_bearer(
    client: AsyncClient, auth_boundary, valid_api_headers: dict, authorization
):
    headers = {**valid_api_headers, "X-User-ID": USER_ID}
    if authorization is not None:
        headers["Authorization"] = authorization

    response = await client.get("/collections", headers=headers)

    assert_auth_error(response, "Not authenticated", "Bearer")
    auth_boundary.upstream.auth.get_user.assert_not_called()
    assert_no_collection_reads(auth_boundary)


@pytest.mark.parametrize("missing_response", [None, SimpleNamespace(user=None)])
async def test_invalid_bearer_is_rejected(
    client: AsyncClient, auth_boundary, valid_api_headers: dict, missing_response
):
    auth_boundary.upstream.auth.get_user.return_value = missing_response
    response = await client.get(
        "/collections",
        headers={**valid_api_headers, "Authorization": "Bearer not-a-valid-jwt"},
    )

    assert_auth_error(response, "Invalid authentication token", "Bearer")
    auth_boundary.upstream.auth.get_user.assert_called_once_with("not-a-valid-jwt")
    assert_no_collection_reads(auth_boundary)


async def test_upstream_expiration_rejection_blocks_collection_access(
    client: AsyncClient, auth_boundary, valid_api_headers: dict
):
    """Propagate a Supabase expiry rejection, without pretending to run Auth."""
    expired_token = jwt.encode(
        {"sub": USER_ID, "exp": 1, "aud": "authenticated"},
        "test-only-signing-key-at-least-32-bytes",
        algorithm="HS256",
    )
    auth_boundary.upstream.auth.get_user.side_effect = AuthApiError(
        "JWT expired", status=401, code="bad_jwt"
    )

    response = await client.get(
        "/collections",
        headers={**valid_api_headers, "Authorization": f"Bearer {expired_token}"},
    )

    assert_auth_error(response, "Failed to authenticate", "Bearer")
    auth_boundary.upstream.auth.get_user.assert_called_once_with(expired_token)
    assert_no_collection_reads(auth_boundary)


async def test_request_user_id_cannot_override_verified_identity(
    client: AsyncClient, auth_boundary, valid_api_headers: dict
):
    response = await client.get(
        "/collections?user_id=someone-else",
        headers={
            **valid_api_headers,
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "X-User-ID": "someone-else",
        },
    )

    assert response.status_code == 200
    assert response.json() == []
    auth_boundary.upstream.auth.get_user.assert_called_once_with(ACCESS_TOKEN)
    auth_boundary.collections.get_user_collections.assert_awaited_once_with(USER_ID)
    auth_boundary.pairs.pairs_by_collection.assert_awaited_once_with(USER_ID)


async def test_api_key_in_query_param_is_rejected(
    client: AsyncClient, auth_boundary, test_api_key: str
):
    response = await client.get(f"/collections?api_key={test_api_key}")

    assert_auth_error(response, "Not authenticated", "APIKey")
    auth_boundary.upstream.auth.get_user.assert_not_called()
    assert_no_collection_reads(auth_boundary)


@pytest.mark.parametrize("endpoint", ["/health/healthz", "/docs", "/openapi.json"])
async def test_public_endpoint_returns_success(client: AsyncClient, endpoint: str):
    response = await client.get(endpoint)

    assert response.status_code == 200
    if endpoint == "/openapi.json":
        assert "/collections" in response.json()["paths"]


async def test_cors_preflight_allows_configured_origin(client: AsyncClient):
    assert ALLOWED_ORIGINS, "This test needs a configured frontend origin"
    origin = ALLOWED_ORIGINS[0]
    response = await client.options(
        "/collections",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-api-key",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "GET" in response.headers["access-control-allow-methods"].split(", ")
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "x-api-key" in allowed_headers


async def test_cors_preflight_rejects_untrusted_origin(client: AsyncClient):
    response = await client.options(
        "/collections",
        headers={
            "Origin": "https://untrusted.example.test",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


async def test_auth_errors_carry_security_headers(client: AsyncClient, auth_boundary):
    response = await client.get("/collections")

    assert_auth_error(response, "Not authenticated", "APIKey")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "script-src 'self'" in response.headers["content-security-policy"]
    assert_no_collection_reads(auth_boundary)
