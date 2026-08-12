"""
API Key Authentication Tests

Tests for API key authentication including security measures like:
- Timing attack protection
- Case sensitivity
- Missing/invalid keys
- Constant-time comparison
"""

import pytest
from httpx import AsyncClient, Response


def _assert_api_key_error(response: Response, detail: str) -> None:
    """Assert the exact API-key authentication contract."""
    assert response.status_code == 401
    assert response.json() == {"detail": detail}
    assert response.headers["WWW-Authenticate"] == "APIKey"


@pytest.mark.anyio
@pytest.mark.auth
class TestAPIKeyAuthentication:
    """Test API key authentication functionality."""

    async def test_valid_api_key_grants_access(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that valid API key grants access to protected endpoints."""
        response = await client.get("/documents", headers=valid_api_headers)

        # Should not be rejected for authentication reasons
        assert response.status_code != 401, "Valid API key should not return 401"
        assert response.status_code != 403, "Valid API key should not return 403"

    async def test_missing_api_key_rejected(self, client: AsyncClient):
        """Test that requests without API key are rejected with 401."""
        response = await client.get("/documents")

        _assert_api_key_error(response, "Not authenticated")

    async def test_invalid_api_key_rejected(
        self, client: AsyncClient, invalid_api_headers: dict[str, str]
    ):
        """Test that invalid API key is rejected with 401."""
        response = await client.get("/documents", headers=invalid_api_headers)

        _assert_api_key_error(response, "Invalid API key")

    async def test_empty_api_key_rejected(self, client: AsyncClient):
        """Test that empty API key is rejected."""
        headers = {"X-API-Key": ""}
        response = await client.get("/documents", headers=headers)

        _assert_api_key_error(response, "Not authenticated")

    async def test_api_key_with_whitespace_rejected(self, client: AsyncClient):
        """Test that API key with leading/trailing whitespace is rejected."""
        test_cases = [
            " test-api-key-12345",  # Leading space
            "test-api-key-12345 ",  # Trailing space
            " test-api-key-12345 ",  # Both
            "test-api-key-12345\n",  # Newline
            "test-api-key-12345\t",  # Tab
        ]

        for api_key in test_cases:
            headers = {"X-API-Key": api_key}
            response = await client.get("/documents", headers=headers)
            _assert_api_key_error(response, "Invalid API key")

    async def test_api_key_case_sensitivity(
        self, client: AsyncClient, test_api_key: str
    ):
        """Test that API key comparison is case-sensitive."""
        # Test with uppercase version
        headers_upper = {"X-API-Key": test_api_key.upper()}
        response_upper = await client.get("/documents", headers=headers_upper)

        # Test with lowercase version
        headers_lower = {"X-API-Key": test_api_key.lower()}
        response_lower = await client.get("/documents", headers=headers_lower)

        # Original case should work
        headers_original = {"X-API-Key": test_api_key}
        response_original = await client.get("/documents", headers=headers_original)
        assert response_original.status_code != 401

        # Different case should be rejected (if original is not all same case)
        if test_api_key != test_api_key.upper():
            _assert_api_key_error(response_upper, "Invalid API key")

        if test_api_key != test_api_key.lower():
            _assert_api_key_error(response_lower, "Invalid API key")

    @pytest.mark.parametrize(
        "candidate",
        [
            "a",  # very short, completely wrong
            "a" * 50,  # long, completely wrong
            "test-api-key-00000",  # same length, different ending
            "zzzz-api-key-99999",  # same length, different everywhere
            "test",  # partial prefix match
            "test-api",  # longer prefix match
            "test-api-key-1234",  # almost correct, one char short
        ],
    )
    async def test_api_key_comparison_is_constant_time(
        self, monkeypatch: pytest.MonkeyPatch, candidate: str
    ) -> None:
        """Every rejected key must be compared with `secrets.compare_digest`.

        This replaces a test that measured wall-clock latency of 35 real HTTP
        requests and asserted the relative standard deviation stayed under 50%.
        That cannot work: the key comparison is a vanishing fraction of a round
        trip, and the rest is event-loop scheduling, GC, coverage instrumentation
        and whatever else shares the CI runner. Five samples per key cannot
        average that away, so a single scheduling hiccup failed the build — it did
        so on #470, a versioning change touching no auth code, reporting 213%
        variation while the suite passed locally.

        The guarantee it reached for comes from the comparison primitive, so
        assert that instead. This fails for the regression that actually matters —
        someone replacing `secrets.compare_digest` with `==` — which the timing
        test could not reliably catch, and it fails deterministically.

        The prefix-overlap keys are kept as parameters: a short-circuiting
        comparison would show up as a missing call for a candidate whose first
        character already differs.
        """
        from fastapi import HTTPException

        from app import auth

        real_compare = auth.secrets.compare_digest
        calls: list[tuple[str, str]] = []

        def recording_compare(left, right):
            calls.append((left, right))
            return real_compare(left, right)

        monkeypatch.setattr(auth.secrets, "compare_digest", recording_compare)

        with pytest.raises(HTTPException) as exc_info:
            await auth.verify_api_key(candidate)

        assert exc_info.value.status_code == 401
        assert calls, (
            "verify_api_key rejected the key without calling "
            "secrets.compare_digest — a plain == comparison leaks key material "
            "through timing"
        )
        assert any(left == candidate for left, _ in calls), (
            f"the supplied key {candidate!r} never reached compare_digest"
        )

    async def test_valid_api_key_also_goes_through_compare_digest(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The accept path must not shortcut the constant-time comparison.

        Guarding only the reject path would miss an implementation that returns
        early on an equality check and falls back to compare_digest only when
        that fails.
        """
        from app import auth

        real_compare = auth.secrets.compare_digest
        calls: list[tuple[str, str]] = []

        def recording_compare(left, right):
            calls.append((left, right))
            return real_compare(left, right)

        monkeypatch.setattr(auth.secrets, "compare_digest", recording_compare)

        result = await auth.verify_api_key(auth.API_KEY)

        assert result == auth.API_KEY
        assert calls, "the accept path bypassed secrets.compare_digest"

    async def test_api_key_header_name_required(
        self, client: AsyncClient, test_api_key: str
    ):
        """Test that API key must be in X-API-Key header, not other headers."""
        # Wrong header names
        wrong_headers = [
            {"Authorization": test_api_key},
            {"Api-Key": test_api_key},
            {"API-KEY": test_api_key},
            {"Bearer": test_api_key},
        ]

        for headers in wrong_headers:
            response = await client.get("/documents", headers=headers)
            _assert_api_key_error(response, "Not authenticated")

        # Header names are case-insensitive per HTTP spec, so this variant is valid.
        response = await client.get("/documents", headers={"X-Api-Key": test_api_key})
        assert response.status_code not in [401, 403]

    async def test_api_key_not_in_query_params(
        self, client: AsyncClient, test_api_key: str
    ):
        """Test that API key in query parameters is rejected (must be in header)."""
        # API keys should NEVER be in query params (can be logged)
        response = await client.get(f"/documents?api_key={test_api_key}")

        _assert_api_key_error(response, "Not authenticated")

        response = await client.get(f"/documents?X-API-Key={test_api_key}")

        _assert_api_key_error(response, "Not authenticated")

    async def test_multiple_api_keys_rejected(
        self, client: AsyncClient, test_api_key: str
    ):
        """Test that multiple API keys in request are handled properly."""
        # This tests for header injection attacks
        response = await client.get(
            "/documents",
            headers=[("X-API-Key", test_api_key), ("X-API-Key", "malicious-key")],
        )

        # Should either accept first key or reject entirely
        # Important: should not cause server error
        assert response.status_code < 500, (
            "Multiple API keys should not cause server error"
        )

    async def test_very_long_api_key_rejected(self, client: AsyncClient):
        """Test that extremely long API keys are rejected (DoS protection)."""
        # Test with very long key (potential DoS attempt)
        long_key = "a" * 10000
        headers = {"X-API-Key": long_key}
        response = await client.get("/documents", headers=headers)

        _assert_api_key_error(response, "Invalid API key")

    async def test_special_characters_in_api_key(self, client: AsyncClient):
        """Test that API keys with special characters are handled correctly."""
        special_keys = [
            "test-api-key-12345'; DROP TABLE users;--",  # SQL injection attempt
            "test-api-key-12345<script>alert(1)</script>",  # XSS attempt
            "test-api-key-12345\x00",  # Null byte
            "test-api-key-12345\r\n\r\n",  # CRLF injection
        ]

        for key in special_keys:
            headers = {"X-API-Key": key}
            response = await client.get("/documents", headers=headers)

            _assert_api_key_error(response, "Invalid API key")

    async def test_api_key_works_across_endpoints(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that valid API key works for endpoints that require ONLY API key.

        Note: /collections is intentionally excluded — it now also requires a
        Supabase Bearer JWT (see #209 / collections-auth migration). Bearer
        auth is exercised separately in test_collections_bearer_auth.py.
        """
        api_key_only_endpoints = [
            "/documents",
            "/schemas",
        ]

        for endpoint in api_key_only_endpoints:
            response = await client.get(endpoint, headers=valid_api_headers)
            assert response.status_code not in [401, 403], (
                f"Valid API key should work for {endpoint}"
            )

    async def test_api_key_persists_across_requests(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that API key authentication is stateless (no session dependency)."""
        # Make multiple requests with same API key
        for i in range(5):
            response = await client.get("/documents", headers=valid_api_headers)
            assert response.status_code not in [401, 403], (
                f"API key should work on request {i + 1}"
            )

    async def test_api_key_error_messages_no_leakage(self, client: AsyncClient):
        """Test that error messages don't leak sensitive information."""
        response = await client.get("/documents", headers={"X-API-Key": "wrong-key"})

        _assert_api_key_error(response, "Invalid API key")

        data = response.json()
        detail = str(data.get("detail", "")).lower()

        # Should not leak:
        # - Expected key format
        # - Expected key length
        # - How many characters matched
        # - Internal implementation details

        assert "expect" not in detail, "Error should not reveal expected format"
        assert "length" not in detail, "Error should not reveal key length"
        assert "char" not in detail, "Error should not reveal character matches"
        assert "compare" not in detail, "Error should not reveal comparison details"


@pytest.mark.anyio
@pytest.mark.auth
class TestPublicEndpoints:
    """Test that public endpoints don't require API key."""

    async def test_health_endpoint_no_auth(self, client: AsyncClient):
        """Test that health endpoints don't require authentication."""
        public_health_endpoints = [
            "/health",
            "/health/healthz",
            "/health/liveness",
            "/health/readiness",
        ]

        for endpoint in public_health_endpoints:
            response = await client.get(endpoint)
            assert response.status_code not in [401, 403], (
                f"Health endpoint {endpoint} should not require auth"
            )

    async def test_docs_endpoint_no_auth(self, client: AsyncClient):
        """Test that API documentation endpoints don't require authentication."""
        docs_endpoints = [
            "/docs",
            "/redoc",
            "/openapi.json",
        ]

        for endpoint in docs_endpoints:
            response = await client.get(endpoint)
            assert response.status_code not in [401, 403], (
                f"Docs endpoint {endpoint} should not require auth"
            )

    async def test_root_endpoint_no_auth(self, client: AsyncClient):
        """Test that root endpoint doesn't require authentication."""
        response = await client.get("/")
        assert response.status_code not in [401, 403], (
            "Root endpoint should not require auth"
        )
