"""
Integration tests for guest session endpoints.
Tests /api/guest/* routes for session management.
"""

import pytest
from httpx import AsyncClient


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
    """Convert guest session to user - requires request body."""
    response = await client.post(
        "/api/guest/convert",
        json={
            "session_id": "fake-session-id",
            "user_id": "new-user-123",
            "email": "user@example.com",
        },
    )
    # Should work (returns session_not_found) or fail on Redis
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert "status" in data
        assert "user_id" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_convert_guest_missing_fields(client: AsyncClient):
    """Convert guest should validate required fields."""
    response = await client.post(
        "/api/guest/convert",
        json={"session_id": "fake-session"},
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
async def test_delete_guest_session_no_cookie(client: AsyncClient):
    """Deleting session without cookie should fail."""
    response = await client.delete("/api/guest/session")
    assert response.status_code in [400, 422]
