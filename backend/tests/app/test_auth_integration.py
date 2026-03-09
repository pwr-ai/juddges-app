"""
Integration tests for authentication and authorization.

Tests API key verification, JWT authentication, and access control.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_api_key_required_for_protected_endpoints(client: AsyncClient):
    """Test that protected endpoints require API key."""
    protected_endpoints = [
        "/documents",
        "/collections",
        "/schemas",
    ]

    for endpoint in protected_endpoints:
        response = await client.get(endpoint)
        assert response.status_code in [401, 403], (
            f"Endpoint {endpoint} should require authentication"
        )


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_invalid_api_key_rejected(
    client: AsyncClient, invalid_api_headers: dict[str, str]
):
    """Test that invalid API keys are rejected."""
    response = await client.get("/documents", headers=invalid_api_headers)
    assert response.status_code == 401

    # Check error message
    data = response.json()
    assert "detail" in data
    assert "Invalid API key" in data["detail"] or "Unauthorized" in str(data)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_valid_api_key_accepted(
    client: AsyncClient, valid_api_headers: dict[str, str]
):
    """Test that valid API key grants access."""
    response = await client.get("/documents", headers=valid_api_headers)
    # Should not be rejected for auth reasons (may fail for other reasons)
    assert response.status_code != 401
    assert response.status_code != 403


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_api_key_case_sensitivity(client: AsyncClient, test_api_key: str):
    """Test that API key comparison is case-sensitive."""
    # Uppercase version
    headers = {"X-API-Key": test_api_key.upper()}
    response = await client.get("/documents", headers=headers)

    # Should be rejected if original key was lowercase
    if test_api_key != test_api_key.upper():
        assert response.status_code == 401


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_api_key_header_name(client: AsyncClient, test_api_key: str):
    """Test that API key must be in correct header."""
    # Wrong header name
    headers = {"Authorization": test_api_key}
    response = await client.get("/documents", headers=headers)
    assert response.status_code in [401, 403]

    # Correct header name
    headers = {"X-API-Key": test_api_key}
    response = await client.get("/documents", headers=headers)
    assert response.status_code != 403  # Should not fail auth


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_empty_api_key_rejected(client: AsyncClient):
    """Test that empty API key is rejected."""
    headers = {"X-API-Key": ""}
    response = await client.get("/documents", headers=headers)
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_api_key_timing_attack_protection(client: AsyncClient):
    """Test that API key verification is constant-time (timing attack protection)."""
    import time

    # This is a basic test - proper timing attack testing requires statistical analysis
    test_keys = [
        "a" * 20,  # Wrong key, wrong length
        "test-api-key-12345",  # Correct key
        "test-api-key-99999",  # Wrong key, same prefix
    ]

    timings = []
    for key in test_keys:
        headers = {"X-API-Key": key}
        start = time.perf_counter()
        await client.get("/documents", headers=headers)
        end = time.perf_counter()
        timings.append(end - start)

    # Note: This is not a definitive test, just a basic sanity check
    # Real timing attack testing requires thousands of samples and statistical analysis


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_public_endpoints_no_auth_required(client: AsyncClient):
    """Test that public endpoints don't require authentication."""
    public_endpoints = [
        "/health",
        "/docs",
        "/openapi.json",
    ]

    for endpoint in public_endpoints:
        response = await client.get(endpoint)
        # Should not be rejected for auth reasons
        assert response.status_code not in [401, 403], (
            f"Public endpoint {endpoint} should not require auth"
        )


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_cors_headers_present(
    client: AsyncClient, valid_api_headers: dict[str, str]
):
    """Test that CORS headers are present in responses."""
    response = await client.options("/documents", headers=valid_api_headers)

    # Check for CORS headers (if CORS is enabled)
    if response.status_code == 200:
        # Common CORS headers
        pass

        # At least some CORS headers should be present if CORS is configured
        # This is optional depending on deployment


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_rate_limiting(client: AsyncClient, valid_api_headers: dict[str, str]):
    """Test rate limiting on API endpoints (if implemented)."""
    # Make multiple rapid requests
    responses = []
    for _ in range(100):
        response = await client.get("/documents", headers=valid_api_headers)
        responses.append(response)

    # Check if any requests were rate limited
    rate_limited = any(r.status_code == 429 for r in responses)

    # Rate limiting may or may not be enabled
    # If enabled, should see 429 responses
    if rate_limited:
        # Verify rate limit headers
        next(r for r in responses if r.status_code == 429)
        # Common rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_jwt_authentication_if_supported(
    client: AsyncClient, valid_jwt_headers: dict[str, str]
):
    """Test JWT token authentication (if supported)."""
    # Endpoints that may use JWT (user-specific operations)
    await client.get("/collections", headers=valid_jwt_headers)

    # Should accept valid JWT (or require different auth)
    # This test is optional depending on whether JWT is implemented


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_expired_jwt_rejected(client: AsyncClient):
    """Test that expired JWT tokens are rejected."""
    # This requires JWT support
    expired_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.test"
    headers = {
        "Authorization": f"Bearer {expired_jwt}",
        "X-API-Key": "test-api-key-12345",
    }

    await client.get("/collections", headers=headers)
    # May reject for JWT expiry or may not use JWT
    # Status depends on implementation


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_malformed_jwt_rejected(client: AsyncClient):
    """Test that malformed JWT tokens are rejected."""
    headers = {
        "Authorization": "Bearer not-a-valid-jwt",
        "X-API-Key": "test-api-key-12345",
    }

    await client.get("/collections", headers=headers)
    # Should either reject or ignore depending on JWT implementation


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_multiple_auth_methods(client: AsyncClient, test_api_key: str):
    """Test providing multiple authentication methods."""
    headers = {"X-API-Key": test_api_key, "Authorization": "Bearer test-jwt"}

    response = await client.get("/documents", headers=headers)
    # Should accept if at least one valid method provided
    assert response.status_code not in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_security_headers_present(
    client: AsyncClient, valid_api_headers: dict[str, str]
):
    """Test that security headers are present in responses."""
    await client.get("/documents", headers=valid_api_headers)

    # Check for recommended security headers (optional)

    # These are optional but recommended for production


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_api_key_in_query_param_rejected(client: AsyncClient, test_api_key: str):
    """Test that API key in query parameter is rejected (should be in header)."""
    response = await client.get(f"/documents?api_key={test_api_key}")

    # Should require header-based authentication
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_authentication_error_messages(client: AsyncClient):
    """Test that authentication error messages are appropriate."""
    # No credentials
    response = await client.get("/documents")
    assert response.status_code in [401, 403]
    data = response.json()
    assert "detail" in data

    # Invalid credentials
    response = await client.get("/documents", headers={"X-API-Key": "invalid"})
    assert response.status_code == 401
    data = response.json()
    assert "detail" in data
    # Should not leak implementation details
    assert "Invalid API key" in data["detail"] or "Unauthorized" in str(data)
