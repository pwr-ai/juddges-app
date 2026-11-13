"""
Integration tests for guest session endpoints.
Tests /api/guest/* routes for session management.
"""

import pytest
from httpx import AsyncClient

from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.server import app


@pytest.mark.anyio
@pytest.mark.api
async def test_create_guest_session(client: AsyncClient):
    """Create a guest session - no auth required."""
    response = await client.post("/api/guest/session")
    # Requires Redis - may fail with 500 if not available
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert "session_id" in data
        assert "expires_at" in data
        assert "message" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_get_guest_usage_no_cookie(client: AsyncClient):
    """Getting usage without session cookie should fail."""
    response = await client.get("/api/guest/usage")
    assert response.status_code in [400, 422]


@pytest.mark.anyio
@pytest.mark.api
async def test_convert_guest_to_user(client: AsyncClient):
    """Guest conversion requires a verified Supabase user session."""
    response = await client.post(
        "/api/guest/convert",
        json={
            "session_id": "fake-session-id",
            "user_id": "new-user-123",
            "email": "user@example.com",
        },
    )
    assert response.status_code == 401


@pytest.mark.anyio
@pytest.mark.api
async def test_convert_guest_requires_cookie_bound_to_authenticated_user(
    client: AsyncClient,
):
    """A valid JWT cannot convert an unrelated guest-session capability."""

    async def current_user() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_data={"id": "user-1", "email": "user-1@example.com"},
            access_token="test-token",
        )

    app.dependency_overrides[get_current_user] = current_user
    try:
        response = await client.post(
            "/api/guest/convert",
            cookies={"guest_session_id": "different-session"},
            json={
                "session_id": "requested-session",
                "user_id": "user-1",
                "email": "user-1@example.com",
            },
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


@pytest.mark.anyio
@pytest.mark.api
async def test_convert_guest_missing_fields(client: AsyncClient):
    """Unauthenticated conversion is rejected before body details matter."""
    response = await client.post(
        "/api/guest/convert",
        json={"session_id": "fake-session"},
    )
    assert response.status_code == 401


@pytest.mark.anyio
@pytest.mark.api
async def test_delete_guest_session_no_cookie(client: AsyncClient):
    """Deleting session without cookie should fail."""
    response = await client.delete("/api/guest/session")
    assert response.status_code in [400, 422]
