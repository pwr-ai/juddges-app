"""
Tests pinning the Bearer-JWT auth contract on extraction endpoints.

These tests document the migration from header-trusted ``X-User-ID`` to
Supabase Bearer JWT for the extraction domain (issue #233). They mirror the
pattern established by ``test_collections_bearer_auth.py`` and are written to:

- FAIL if X-User-ID alone can still authenticate extraction endpoints.
- PASS once all extraction routers consume ``app.core.auth_jwt.get_current_user``.

Endpoints exercised:
- ``GET  /extractions``          — list_extraction_jobs (requires Bearer)
- ``DELETE /extractions/{id}``   — cancel_or_delete_extraction_job (requires Bearer)
- ``GET  /extractions/{id}/export`` — export_extraction_results (requires Bearer)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit]

_FAKE_USER_ID = "00000000-0000-4000-a000-000000000abc"
_VALID_API_KEY = "test-api-key-12345"


@pytest.fixture
def valid_api_headers() -> dict[str, str]:
    return {"X-API-Key": _VALID_API_KEY}


@pytest.fixture
def fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": _FAKE_USER_ID,
            "email": "extraction-bearer-user@example.com",
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
    """Override the JWT dependency to return a stable test user for extraction."""

    async def _resolver() -> AuthenticatedUser:
        return fake_user

    app.dependency_overrides[jwt_get_current_user] = _resolver
    try:
        yield fake_user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)


# =============================================================================
# GET /extractions — list endpoint
# =============================================================================


async def test_extraction_list_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate GET /extractions."""
    headers = {**valid_api_headers, "X-User-ID": _FAKE_USER_ID}

    response = await client.get("/extractions", headers=headers)

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied to /extractions; "
        f"got {response.status_code}. Bearer JWT is now required."
    )


async def test_extraction_list_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone (no Bearer, no X-User-ID) must be rejected on /extractions."""
    response = await client.get("/extractions", headers=valid_api_headers)

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied to /extractions; "
        f"got {response.status_code}."
    )


async def test_extraction_list_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated request reaches the list handler (not 401/403/422)."""
    mock_celery_app = MagicMock()
    mock_inspect = MagicMock()
    mock_inspect.active.return_value = {}
    mock_inspect.scheduled.return_value = {}
    mock_inspect.reserved.return_value = {}
    mock_celery_app.control.inspect.return_value = mock_inspect

    headers = {**valid_api_headers, "Authorization": "Bearer fake-jwt-token"}

    with patch("app.extraction_domain.jobs_router.celery_app", mock_celery_app):
        response = await client.get("/extractions", headers=headers)

    assert response.status_code not in (401, 403, 422), (
        f"Bearer auth path returned {response.status_code}; "
        f"expected the handler to be reached (auth passed). "
        f"Body: {response.text[:300]}"
    )


# =============================================================================
# DELETE /extractions/{job_id} — cancel endpoint
# =============================================================================


async def test_extraction_cancel_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must not authenticate DELETE /extractions/{job_id}."""
    headers = {**valid_api_headers, "X-User-ID": _FAKE_USER_ID}

    response = await client.delete("/extractions/job-123", headers=headers)

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied to DELETE /extractions/{{id}}; "
        f"got {response.status_code}. Bearer JWT is now required."
    )


async def test_extraction_cancel_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated cancel request reaches the handler (not 401/403/422)."""
    mock_result = MagicMock()
    mock_result.state = "PENDING"
    mock_result.info = None

    headers = {**valid_api_headers, "Authorization": "Bearer fake-jwt-token"}

    with patch(
        "app.extraction_domain.jobs_router.AsyncResult",
        return_value=mock_result,
    ):
        response = await client.delete("/extractions/job-123", headers=headers)

    assert response.status_code not in (401, 403, 422), (
        f"Bearer auth path returned {response.status_code}; "
        f"expected the handler to be reached (auth passed). "
        f"Body: {response.text[:300]}"
    )


# =============================================================================
# GET /extractions/{job_id}/export — export endpoint
# =============================================================================


async def test_extraction_export_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must not authenticate GET /extractions/{job_id}/export."""
    headers = {**valid_api_headers, "X-User-ID": _FAKE_USER_ID}

    response = await client.get(
        "/extractions/job-123/export?format=csv", headers=headers
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied to /extractions/export; "
        f"got {response.status_code}. Bearer JWT is now required."
    )


async def test_extraction_export_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone (no Bearer) must be rejected on the export endpoint."""
    response = await client.get(
        "/extractions/job-123/export?format=csv", headers=valid_api_headers
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied to /extractions/export; "
        f"got {response.status_code}."
    )


async def test_extraction_export_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated export request reaches the handler (not 401/403/422).

    The handler itself will return 400 (invalid format for 'pdf') — that's fine.
    We are only verifying that the auth layer is passed, not the business logic.
    """
    headers = {**valid_api_headers, "Authorization": "Bearer fake-jwt-token"}

    # Use an invalid format so the handler immediately returns 400 without
    # hitting supabase — this is the cheapest way to confirm the auth layer
    # was passed while keeping the test fully unit-scoped.
    response = await client.get(
        "/extractions/job-123/export?format=pdf", headers=headers
    )

    assert response.status_code not in (401, 403, 422), (
        f"Bearer auth path returned {response.status_code}; "
        f"expected the handler to be reached (auth passed). "
        f"Body: {response.text[:300]}"
    )
    # Confirm the handler ran by checking the auth-unrelated 400 response
    assert response.status_code == 400, (
        f"Expected 400 (invalid format) after auth passes, got {response.status_code}. "
        f"Body: {response.text[:300]}"
    )
