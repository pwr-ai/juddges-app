"""
Authorization Boundary Tests

Tests that authentication and authorization gates are enforced correctly:
- Protected endpoints reject unauthenticated requests (no API key -> 401/403)
- Admin endpoints reject non-admin callers
- API key is required for all data-plane endpoints

These tests intentionally do NOT mock auth so that they exercise the real
verify_api_key / require_admin dependencies.
"""

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Unauthenticated access to API-key-protected endpoints
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestUnauthenticatedAccessRejected:
    """Every API-key-protected endpoint must reject requests without a valid key."""

    # Endpoints registered with ``dependencies=[Depends(verify_api_key)]``
    # in server.py.  We pick representative GET endpoints for each router.
    PROTECTED_GET_ENDPOINTS = [
        "/documents",
        "/collections",
        "/schemas",
        "/publications",
        "/dashboard/stats",
        "/marketplace",
        "/blog/posts",
        "/api/search/autocomplete?q=test",
        "/example_questions",
    ]

    PROTECTED_POST_ENDPOINTS = [
        "/collections",
        "/summarize",
        "/ocr/jobs",
    ]

    async def test_get_endpoints_reject_missing_api_key(self, client: AsyncClient):
        """GET requests without X-API-Key header must return 401 or 403."""
        for endpoint in self.PROTECTED_GET_ENDPOINTS:
            response = await client.get(endpoint)
            assert response.status_code in (401, 403), (
                f"{endpoint} returned {response.status_code} without API key, "
                "expected 401 or 403"
            )

    async def test_post_endpoints_reject_missing_api_key(self, client: AsyncClient):
        """POST requests without X-API-Key header must return 401 or 403."""
        for endpoint in self.PROTECTED_POST_ENDPOINTS:
            response = await client.post(endpoint, json={})
            assert response.status_code in (401, 403), (
                f"{endpoint} returned {response.status_code} without API key, "
                "expected 401 or 403"
            )

    async def test_langserve_routes_reject_missing_api_key(self, client: AsyncClient):
        """LangServe chain endpoints (/qa, /chat, /enhance_query) require API key."""
        langserve_endpoints = [
            "/qa/invoke",
            "/chat/invoke",
            "/enhance_query/invoke",
        ]
        for endpoint in langserve_endpoints:
            response = await client.post(endpoint, json={"input": "test"})
            assert response.status_code in (401, 403), (
                f"LangServe endpoint {endpoint} returned {response.status_code} "
                "without API key, expected 401 or 403"
            )

    async def test_graphql_rejects_missing_api_key(self, client: AsyncClient):
        """The /graphql endpoint must require API key authentication."""
        response = await client.post(
            "/graphql",
            json={"query": "{ __typename }"},
        )
        assert response.status_code in (401, 403), (
            f"/graphql returned {response.status_code} without API key, "
            "expected 401 or 403"
        )


# ---------------------------------------------------------------------------
# Invalid API key
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestInvalidAPIKeyRejected:
    """Endpoints must reject requests carrying an invalid API key."""

    async def test_documents_reject_invalid_key(
        self, client: AsyncClient, invalid_api_headers: dict[str, str]
    ):
        """GET /documents must return 401 for an invalid API key."""
        response = await client.get("/documents", headers=invalid_api_headers)
        assert response.status_code == 401, (
            f"/documents returned {response.status_code} for invalid key"
        )

    async def test_collections_reject_invalid_key(
        self, client: AsyncClient, invalid_api_headers: dict[str, str]
    ):
        """GET /collections must return 401 for an invalid API key."""
        response = await client.get("/collections", headers=invalid_api_headers)
        assert response.status_code == 401, (
            f"/collections returned {response.status_code} for invalid key"
        )

    async def test_schemas_reject_invalid_key(
        self, client: AsyncClient, invalid_api_headers: dict[str, str]
    ):
        """GET /schemas must return 401 for an invalid API key."""
        response = await client.get("/schemas", headers=invalid_api_headers)
        assert response.status_code == 401, (
            f"/schemas returned {response.status_code} for invalid key"
        )

    async def test_search_rejects_invalid_key(
        self, client: AsyncClient, invalid_api_headers: dict[str, str]
    ):
        """GET /api/search/autocomplete must return 401 for an invalid API key."""
        response = await client.get(
            "/api/search/autocomplete",
            params={"q": "test"},
            headers=invalid_api_headers,
        )
        assert response.status_code == 401, (
            f"/api/search/autocomplete returned {response.status_code} for invalid key"
        )

    async def test_graphql_rejects_invalid_key(
        self, client: AsyncClient, invalid_api_headers: dict[str, str]
    ):
        """POST /graphql must return 401 for an invalid API key."""
        response = await client.post(
            "/graphql",
            json={"query": "{ __typename }"},
            headers=invalid_api_headers,
        )
        assert response.status_code == 401, (
            f"/graphql returned {response.status_code} for invalid key"
        )


# ---------------------------------------------------------------------------
# Public endpoints must NOT require auth
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestPublicEndpointsAccessible:
    """Public endpoints must remain accessible without any authentication."""

    PUBLIC_ENDPOINTS = [
        "/",
        "/health",
        "/health/healthz",
        "/health/liveness",
        "/health/readiness",
        "/docs",
        "/redoc",
        "/openapi.json",
    ]

    async def test_public_endpoints_do_not_require_auth(self, client: AsyncClient):
        """Public endpoints must not return 401 or 403."""
        for endpoint in self.PUBLIC_ENDPOINTS:
            response = await client.get(endpoint, follow_redirects=True)
            assert response.status_code not in (401, 403), (
                f"Public endpoint {endpoint} unexpectedly requires auth "
                f"(got {response.status_code})"
            )


# ---------------------------------------------------------------------------
# Admin endpoint boundary tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestAdminEndpointBoundaries:
    """Admin endpoints must reject unauthenticated and non-admin callers.

    Admin endpoints use JWT-based ``require_admin`` dependency (not API key).
    Requests without a valid JWT must receive 401 or 403.
    """

    ADMIN_ENDPOINTS = [
        "/api/admin/stats",
        "/api/admin/users",
    ]

    async def test_admin_endpoints_reject_no_auth(self, client: AsyncClient):
        """Admin endpoints must reject requests with no auth at all."""
        for endpoint in self.ADMIN_ENDPOINTS:
            response = await client.get(endpoint)
            assert response.status_code in (401, 403, 422), (
                f"Admin endpoint {endpoint} returned {response.status_code} "
                "without any auth, expected 401/403/422"
            )

    async def test_admin_endpoints_reject_api_key_only(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Admin endpoints must reject requests with only an API key (no JWT)."""
        for endpoint in self.ADMIN_ENDPOINTS:
            response = await client.get(endpoint, headers=valid_api_headers)
            # API key alone is not sufficient for admin endpoints
            assert response.status_code in (401, 403, 422), (
                f"Admin endpoint {endpoint} accepted API-key-only auth "
                f"(got {response.status_code}), expected 401/403/422"
            )

    async def test_admin_endpoints_reject_fake_jwt(self, client: AsyncClient):
        """Admin endpoints must reject a fabricated JWT token."""
        fake_jwt_headers = {
            "Authorization": "Bearer fake.jwt.token",
        }
        for endpoint in self.ADMIN_ENDPOINTS:
            response = await client.get(endpoint, headers=fake_jwt_headers)
            assert response.status_code in (401, 403, 422), (
                f"Admin endpoint {endpoint} accepted fake JWT "
                f"(got {response.status_code})"
            )

    async def test_admin_endpoints_reject_non_admin_user_header(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Admin endpoints must reject requests with a regular user header."""
        headers = {
            **valid_api_headers,
            "X-User-ID": "regular-user-id",
            "Authorization": "Bearer not-a-real-jwt",
        }
        for endpoint in self.ADMIN_ENDPOINTS:
            response = await client.get(endpoint, headers=headers)
            assert response.status_code in (401, 403, 422), (
                f"Admin endpoint {endpoint} accepted non-admin user "
                f"(got {response.status_code})"
            )


# ---------------------------------------------------------------------------
# Audit / consent / legal endpoints (JWT-auth, no API key)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestJWTProtectedEndpoints:
    """Endpoints using JWT auth (audit, consent, legal) must reject invalid tokens."""

    JWT_PROTECTED_ENDPOINTS = [
        "/api/audit/my-activity",
        "/api/consent/status",
    ]

    async def test_jwt_endpoints_reject_no_auth(self, client: AsyncClient):
        """JWT-protected endpoints must not accept requests without auth."""
        for endpoint in self.JWT_PROTECTED_ENDPOINTS:
            response = await client.get(endpoint)
            assert response.status_code in (401, 403, 422), (
                f"JWT endpoint {endpoint} returned {response.status_code} "
                "without auth, expected 401/403/422"
            )

    async def test_jwt_endpoints_reject_api_key_only(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """JWT-protected endpoints must not accept API key as a substitute for JWT."""
        for endpoint in self.JWT_PROTECTED_ENDPOINTS:
            response = await client.get(endpoint, headers=valid_api_headers)
            assert response.status_code in (401, 403, 422), (
                f"JWT endpoint {endpoint} accepted API-key-only auth "
                f"(got {response.status_code})"
            )
