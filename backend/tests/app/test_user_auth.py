"""
User Authentication Tests

Tests for user-based authentication including:
- X-User-ID header authentication
- User isolation and permissions
- Optional vs required authentication
"""

import pytest
from httpx import AsyncClient

from app.collections import get_current_user
from app.server import app


@pytest.mark.anyio
@pytest.mark.auth
class TestUserAuthentication:
    """Test user authentication via X-User-ID header."""

    async def test_user_id_header_required_for_collections(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that X-User-ID header is required for user-specific endpoints."""
        # Request without user ID should fail
        response = await client.get("/collections", headers=valid_api_headers)
        assert response.status_code == 422, (
            "Missing X-User-ID should return 422 (validation error)"
        )

    async def test_valid_user_id_grants_access(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that valid user ID grants access to user endpoints."""
        headers = {**valid_api_headers, "X-User-ID": "test-user-123"}

        response = await client.get("/collections", headers=headers)
        assert response.status_code != 401, "Valid user ID should not return 401"

    async def test_empty_user_id_rejected(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that empty user ID is rejected."""
        headers = {**valid_api_headers, "X-User-ID": ""}

        response = await client.get("/collections", headers=headers)
        assert response.status_code == 422, (
            "Empty user ID should return validation error"
        )

    async def test_user_id_format_validation(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that user ID format is validated."""
        # Test various user ID formats
        test_user_ids = [
            "user-123",  # Valid format
            "00000000-0000-0000-0000-000000000000",  # UUID format
            "auth0|123456",  # Auth0 format
        ]

        for user_id in test_user_ids:
            headers = {**valid_api_headers, "X-User-ID": user_id}

            response = await client.get("/collections", headers=headers)
            # Should not fail due to format (might fail for other reasons)
            assert response.status_code != 422, (
                f"User ID format should be accepted: {user_id}"
            )


@pytest.mark.anyio
@pytest.mark.auth
class TestUserIsolation:
    """Test that users can only access their own resources."""

    async def test_user_collections_isolated(
        self,
        client: AsyncClient,
        valid_api_headers: dict[str, str],
        sample_collection_data: dict,
    ):
        """Test that users can only see their own collections."""
        # Create collection as user A
        user_a_headers = {**valid_api_headers, "X-User-ID": "user-a"}

        create_response = await client.post(
            "/collections", headers=user_a_headers, json=sample_collection_data
        )

        if create_response.status_code == 201:
            # User A can list their collections
            list_response_a = await client.get("/collections", headers=user_a_headers)
            if list_response_a.status_code == 200:
                collections_a = list_response_a.json()
                assert len(collections_a) >= 1, "User A should see their collection"

            # User B should not see User A's collection
            user_b_headers = {**valid_api_headers, "X-User-ID": "user-b"}

            list_response_b = await client.get("/collections", headers=user_b_headers)
            if list_response_b.status_code == 200:
                collections_b = list_response_b.json()
                # User B should not see User A's collections
                user_a_collection_ids = [c.get("id") for c in collections_a]
                user_b_collection_ids = [c.get("id") for c in collections_b]

                for collection_id in user_a_collection_ids:
                    assert collection_id not in user_b_collection_ids, (
                        "User B should not see User A's collections"
                    )

    async def test_user_cannot_access_other_user_collection(
        self,
        client: AsyncClient,
        valid_api_headers: dict[str, str],
        sample_collection_data: dict,
    ):
        """Test that users cannot access collections belonging to other users."""
        # Create collection as user A
        user_a_headers = {**valid_api_headers, "X-User-ID": "user-a"}

        create_response = await client.post(
            "/collections", headers=user_a_headers, json=sample_collection_data
        )

        if create_response.status_code == 201:
            collection_id = create_response.json().get("id")

            # User B tries to access User A's collection
            user_b_headers = {**valid_api_headers, "X-User-ID": "user-b"}

            access_response = await client.get(
                f"/collections/{collection_id}", headers=user_b_headers
            )

            # Should be forbidden or not found
            assert access_response.status_code in [403, 404], (
                "User B should not be able to access User A's collection"
            )

    async def test_user_cannot_modify_other_user_collection(
        self,
        client: AsyncClient,
        valid_api_headers: dict[str, str],
        sample_collection_data: dict,
    ):
        """Test that users cannot modify collections belonging to other users."""
        # Create collection as user A
        user_a_headers = {**valid_api_headers, "X-User-ID": "user-a"}

        create_response = await client.post(
            "/collections", headers=user_a_headers, json=sample_collection_data
        )

        if create_response.status_code == 201:
            collection_id = create_response.json().get("id")

            # User B tries to update User A's collection
            user_b_headers = {**valid_api_headers, "X-User-ID": "user-b"}

            update_data = {"name": "Hacked Collection"}
            update_response = await client.put(
                f"/collections/{collection_id}",
                headers=user_b_headers,
                json=update_data,
            )

            # Should be forbidden or not found
            assert update_response.status_code in [403, 404], (
                "User B should not be able to modify User A's collection"
            )

    async def test_user_cannot_delete_other_user_collection(
        self,
        client: AsyncClient,
        valid_api_headers: dict[str, str],
        sample_collection_data: dict,
    ):
        """Test that users cannot delete collections belonging to other users."""
        # Create collection as user A
        user_a_headers = {**valid_api_headers, "X-User-ID": "user-a"}

        create_response = await client.post(
            "/collections", headers=user_a_headers, json=sample_collection_data
        )

        if create_response.status_code == 201:
            collection_id = create_response.json().get("id")

            # User B tries to delete User A's collection
            user_b_headers = {**valid_api_headers, "X-User-ID": "user-b"}

            delete_response = await client.delete(
                f"/collections/{collection_id}", headers=user_b_headers
            )

            # Should be forbidden or not found
            assert delete_response.status_code in [403, 404], (
                "User B should not be able to delete User A's collection"
            )


@pytest.mark.anyio
@pytest.mark.auth
class TestOptionalAuthentication:
    """Test endpoints with optional authentication."""

    async def test_optional_auth_allows_guest_access(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that endpoints with optional auth work for both guests and users."""
        # Guest access (only API key, no user ID)
        guest_response = await client.get("/documents", headers=valid_api_headers)
        assert guest_response.status_code == 200, (
            "Guest should be able to access documents"
        )

        # Authenticated access
        user_headers = {**valid_api_headers, "X-User-ID": "test-user-123"}
        user_response = await client.get("/documents", headers=user_headers)
        assert user_response.status_code == 200, (
            "Authenticated user should be able to access documents"
        )

    async def test_analytics_optional_auth(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that analytics endpoints work with optional authentication."""
        # Without user ID (guest)
        guest_response = await client.get(
            "/analytics/popular-searches", headers=valid_api_headers
        )
        # Should work for guests
        assert guest_response.status_code not in [401, 403]

        # With user ID (authenticated)
        user_headers = {**valid_api_headers, "X-User-ID": "test-user-123"}
        user_response = await client.get(
            "/analytics/popular-searches", headers=user_headers
        )
        # Should work for authenticated users
        assert user_response.status_code not in [401, 403]


@pytest.mark.anyio
@pytest.mark.auth
class TestAuthenticationCombinations:
    """Test various combinations of authentication methods."""

    async def test_both_api_key_and_user_id(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that both API key and user ID can be provided together."""
        headers = {**valid_api_headers, "X-User-ID": "test-user-123"}

        response = await client.get("/collections", headers=headers)
        # Should accept both (required for user-specific endpoints)
        assert response.status_code not in [401, 403]

    async def test_user_id_without_api_key_rejected(self, client: AsyncClient):
        """Test that user ID without API key is rejected."""
        headers = {"X-User-ID": "test-user-123"}

        response = await client.get("/collections", headers=headers)
        # Should be rejected due to missing API key
        assert response.status_code in [401, 403]

    async def test_dependency_override_for_testing(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that authentication can be overridden for testing."""

        # Override get_current_user dependency
        async def mock_get_current_user():
            return "mock-user-id"

        app.dependency_overrides[get_current_user] = mock_get_current_user

        try:
            # Request should work with mocked user
            response = await client.get("/collections", headers=valid_api_headers)
            # Should not fail due to missing X-User-ID
            assert response.status_code != 422
        finally:
            # Clean up
            app.dependency_overrides.clear()


@pytest.mark.anyio
@pytest.mark.auth
class TestUserIdSecurity:
    """Test security aspects of user ID authentication."""

    async def test_user_id_injection_protection(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that user ID is protected against injection attacks."""
        malicious_user_ids = [
            "user'; DROP TABLE collections;--",  # SQL injection
            "user<script>alert(1)</script>",  # XSS
            "../../../etc/passwd",  # Path traversal
            "user\x00admin",  # Null byte injection
        ]

        for user_id in malicious_user_ids:
            headers = {**valid_api_headers, "X-User-ID": user_id}

            response = await client.get("/collections", headers=headers)
            # Should not cause server error
            assert response.status_code < 500, (
                f"Malicious user ID should not cause server error: {user_id!r}"
            )

    async def test_very_long_user_id_handled(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that very long user IDs are handled gracefully."""
        long_user_id = "a" * 10000
        headers = {**valid_api_headers, "X-User-ID": long_user_id}

        response = await client.get("/collections", headers=headers)
        # Should not cause server error
        assert response.status_code < 500

    async def test_unicode_in_user_id(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that Unicode characters in user ID are handled correctly."""
        unicode_user_ids = [
            "user-测试",  # Chinese
            "user-テスト",  # Japanese
            "user-😀",  # Emoji
            "user-\u200b",  # Zero-width space
        ]

        for user_id in unicode_user_ids:
            headers = {**valid_api_headers, "X-User-ID": user_id}

            response = await client.get("/collections", headers=headers)
            # Should handle Unicode gracefully
            assert response.status_code < 500
