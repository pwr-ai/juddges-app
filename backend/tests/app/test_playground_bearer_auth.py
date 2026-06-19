"""
Tests pinning the Bearer-JWT auth contract on /playground endpoints.

These tests document the migration from header-trusted ``X-User-ID`` to
Supabase Bearer JWT (issue #232). They are written to fail against the legacy
``x_user_id: str = Header(...)`` parameter and pass once each handler consumes
``app.core.auth_jwt.get_current_user`` via ``Depends``.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.security]


@pytest.fixture
def valid_api_headers() -> dict[str, str]:
    return {"X-API-Key": "test-api-key-12345"}


@pytest.fixture
def fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": "00000000-0000-4000-a000-000000000abc",
            "email": "bearer-user@example.com",
            "role": "authenticated",
        },
        access_token="fake-jwt-token",
    )


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def override_jwt_user(fake_user: AuthenticatedUser):
    """Override the JWT dependency to return a stable test user."""

    async def _resolver() -> AuthenticatedUser:
        return fake_user

    app.dependency_overrides[jwt_get_current_user] = _resolver
    try:
        yield fake_user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)


# ---------------------------------------------------------------------------
# POST /playground/extract — prompt run endpoint
# ---------------------------------------------------------------------------


async def test_playground_extract_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate POST /playground/extract."""
    headers = {**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000abc"}

    response = await client.post(
        "/playground/extract",
        headers=headers,
        json={
            "schema_id": "schema-uuid-1",
            "document_id": "doc-1",
        },
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied; got {response.status_code}. "
        "Bearer JWT is now required."
    )


async def test_playground_extract_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone (no Bearer, no X-User-ID) must be rejected."""
    response = await client.post(
        "/playground/extract",
        headers=valid_api_headers,
        json={
            "schema_id": "schema-uuid-1",
            "document_id": "doc-1",
        },
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied; got {response.status_code}."
    )


async def test_playground_extract_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated request reaches the handler (not rejected at auth layer)."""
    headers = {
        **valid_api_headers,
        "Authorization": "Bearer fake-jwt-token",
    }

    # Patch both supabase and the document/extractor so the handler doesn't
    # need real services — we only care that the auth layer admits the request.
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "name": "TestSchema",
        "description": "desc",
        "text": {"field1": "string"},
        "schema_version": 1,
    }

    with (
        patch("app.playground.supabase", mock_supabase),
        patch(
            "app.playground.get_documents_by_id",
            return_value=[],
        ),
    ):
        response = await client.post(
            "/playground/extract",
            headers=headers,
            json={
                "schema_id": "schema-uuid-1",
                "document_id": "doc-1",
            },
        )

    # Auth passed; document-not-found 404 is fine — it means we got past the
    # auth layer and into the handler.
    assert response.status_code != 401, (
        f"Bearer auth path returned 401; expected handler-level response. "
        f"Body: {response.text[:300]}"
    )
    assert response.status_code != 403, (
        f"Bearer auth path returned 403; expected handler-level response. "
        f"Body: {response.text[:300]}"
    )
    assert response.status_code != 422, (
        f"Bearer auth path returned 422 (schema validation error). "
        f"Body: {response.text[:300]}"
    )


# ---------------------------------------------------------------------------
# GET /playground/runs — list history endpoint
# ---------------------------------------------------------------------------


async def test_playground_runs_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate GET /playground/runs."""
    headers = {**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000abc"}

    response = await client.get(
        "/playground/runs",
        headers=headers,
        params={"schema_id": "schema-uuid-1"},
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied; got {response.status_code}."
    )


async def test_playground_runs_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone (no Bearer, no X-User-ID) must be rejected."""
    response = await client.get(
        "/playground/runs",
        headers=valid_api_headers,
        params={"schema_id": "schema-uuid-1"},
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied; got {response.status_code}."
    )


async def test_playground_runs_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated request reaches the handler for GET /playground/runs."""
    headers = {
        **valid_api_headers,
        "Authorization": "Bearer fake-jwt-token",
    }

    mock_supabase = MagicMock()
    mock_resp = MagicMock()
    mock_resp.data = []
    (
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value
    ) = mock_resp

    with patch("app.playground.supabase", mock_supabase):
        response = await client.get(
            "/playground/runs",
            headers=headers,
            params={"schema_id": "schema-uuid-1"},
        )

    assert response.status_code == 200, (
        f"Bearer auth path returned {response.status_code}; expected 200. "
        f"Body: {response.text[:300]}"
    )


# ---------------------------------------------------------------------------
# GET /playground/runs/{run_id} — get run detail endpoint
# ---------------------------------------------------------------------------


async def test_playground_run_detail_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate GET /playground/runs/{run_id}."""
    headers = {**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000abc"}

    response = await client.get(
        "/playground/runs/some-run-id",
        headers=headers,
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied; got {response.status_code}."
    )


async def test_playground_run_detail_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone (no Bearer, no X-User-ID) must be rejected."""
    response = await client.get(
        "/playground/runs/some-run-id",
        headers=valid_api_headers,
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied; got {response.status_code}."
    )


async def test_playground_run_detail_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated request reaches the handler for GET /playground/runs/{run_id}."""
    headers = {
        **valid_api_headers,
        "Authorization": "Bearer fake-jwt-token",
    }

    mock_supabase = MagicMock()
    mock_resp = MagicMock()
    mock_resp.data = None
    (
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value
    ) = mock_resp

    with patch("app.playground.supabase", mock_supabase):
        response = await client.get(
            "/playground/runs/some-run-id",
            headers=headers,
        )

    # 404 (run not found with stubbed DB) means auth was accepted and the
    # handler ran — which is what we're testing.
    assert response.status_code not in (401, 403, 422), (
        f"Bearer auth path returned {response.status_code}; expected handler-level response. "
        f"Body: {response.text[:300]}"
    )
