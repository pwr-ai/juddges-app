"""
API Key Authentication Tests

Tests for API key authentication including security measures like:
- Timing attack protection
- Case sensitivity
- Missing/invalid keys
- Constant-time comparison
"""

import pytest
import time
from httpx import AsyncClient
from typing import Dict


@pytest.mark.anyio
@pytest.mark.auth
class TestAPIKeyAuthentication:
    """Test API key authentication functionality."""

    async def test_valid_api_key_grants_access(
        self,
        client: AsyncClient,
        valid_api_headers: Dict[str, str]
    ):
        """Test that valid API key grants access to protected endpoints."""
        response = await client.get("/documents", headers=valid_api_headers)
        
        # Should not be rejected for authentication reasons
        assert response.status_code != 401, "Valid API key should not return 401"
        assert response.status_code != 403, "Valid API key should not return 403"

    async def test_missing_api_key_rejected(self, client: AsyncClient):
        """Test that requests without API key are rejected with 401."""
        response = await client.get("/documents")
        
        assert response.status_code in [401, 403], \
            "Missing API key should return 401 or 403"
        
        data = response.json()
        assert "detail" in data, "Error response should contain detail field"

    async def test_invalid_api_key_rejected(
        self,
        client: AsyncClient,
        invalid_api_headers: Dict[str, str]
    ):
        """Test that invalid API key is rejected with 401."""
        response = await client.get("/documents", headers=invalid_api_headers)
        
        assert response.status_code == 401, "Invalid API key should return 401"
        
        data = response.json()
        assert "detail" in data
        assert "Invalid API key" in data["detail"] or "Unauthorized" in str(data)

    async def test_empty_api_key_rejected(self, client: AsyncClient):
        """Test that empty API key is rejected."""
        headers = {"X-API-Key": ""}
        response = await client.get("/documents", headers=headers)
        
        assert response.status_code in [401, 403], \
            "Empty API key should be rejected"

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
            assert response.status_code == 401, \
                f"API key with whitespace should be rejected: {repr(api_key)}"

    async def test_api_key_case_sensitivity(
        self,
        client: AsyncClient,
        test_api_key: str
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
            assert response_upper.status_code == 401, \
                "Uppercase API key should be rejected if original is not uppercase"
        
        if test_api_key != test_api_key.lower():
            assert response_lower.status_code == 401, \
                "Lowercase API key should be rejected if original is not lowercase"

    async def test_api_key_timing_attack_protection(self, client: AsyncClient):
        """
        Test that API key verification uses constant-time comparison.
        
        This test verifies that the comparison time doesn't significantly vary
        based on how many characters match, which would allow timing attacks.
        """
        test_keys = [
            "a",  # Very short, completely wrong
            "a" * 50,  # Long, completely wrong
            "test-api-key-00000",  # Same length, different ending
            "zzzz-api-key-99999",  # Same length, different everywhere
            "test",  # Partial prefix match
            "test-api",  # More prefix match
            "test-api-key-1234",  # Almost correct (one char short)
        ]
        
        timings = []
        samples_per_key = 5
        
        for key in test_keys:
            key_timings = []
            for _ in range(samples_per_key):
                headers = {"X-API-Key": key}
                start = time.perf_counter()
                await client.get("/documents", headers=headers)
                end = time.perf_counter()
                key_timings.append(end - start)
            
            avg_timing = sum(key_timings) / len(key_timings)
            timings.append(avg_timing)
        
        # Calculate variance in timings
        mean_timing = sum(timings) / len(timings)
        variance = sum((t - mean_timing) ** 2 for t in timings) / len(timings)
        std_dev = variance ** 0.5
        
        # Standard deviation should be small relative to mean (< 50%)
        # This indicates constant-time comparison
        relative_std = std_dev / mean_timing if mean_timing > 0 else 0
        
        assert relative_std < 0.5, \
            f"Timing variation too high ({relative_std:.2%}), " \
            f"may indicate timing attack vulnerability"

    async def test_api_key_header_name_required(
        self,
        client: AsyncClient,
        test_api_key: str
    ):
        """Test that API key must be in X-API-Key header, not other headers."""
        # Wrong header names
        wrong_headers = [
            {"Authorization": test_api_key},
            {"Api-Key": test_api_key},
            {"X-Api-Key": test_api_key.lower()},  # Wrong case in header
            {"API-KEY": test_api_key},
            {"Bearer": test_api_key},
        ]
        
        for headers in wrong_headers:
            response = await client.get("/documents", headers=headers)
            assert response.status_code in [401, 403], \
                f"Wrong header {list(headers.keys())[0]} should be rejected"

    async def test_api_key_not_in_query_params(
        self,
        client: AsyncClient,
        test_api_key: str
    ):
        """Test that API key in query parameters is rejected (must be in header)."""
        # API keys should NEVER be in query params (can be logged)
        response = await client.get(f"/documents?api_key={test_api_key}")
        
        assert response.status_code in [401, 403], \
            "API key in query param should be rejected"
        
        response = await client.get(f"/documents?X-API-Key={test_api_key}")
        
        assert response.status_code in [401, 403], \
            "API key in query param should be rejected"

    async def test_multiple_api_keys_rejected(
        self,
        client: AsyncClient,
        test_api_key: str
    ):
        """Test that multiple API keys in request are handled properly."""
        # This tests for header injection attacks
        response = await client.get(
            "/documents",
            headers=[
                ("X-API-Key", test_api_key),
                ("X-API-Key", "malicious-key")
            ]
        )
        
        # Should either accept first key or reject entirely
        # Important: should not cause server error
        assert response.status_code < 500, \
            "Multiple API keys should not cause server error"

    async def test_very_long_api_key_rejected(self, client: AsyncClient):
        """Test that extremely long API keys are rejected (DoS protection)."""
        # Test with very long key (potential DoS attempt)
        long_key = "a" * 10000
        headers = {"X-API-Key": long_key}
        response = await client.get("/documents", headers=headers)
        
        assert response.status_code == 401, \
            "Very long API key should be rejected"
        assert response.status_code < 500, \
            "Very long API key should not cause server error"

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
            
            assert response.status_code == 401, \
                f"Special character key should be rejected: {repr(key)}"
            assert response.status_code < 500, \
                f"Special character key should not cause server error: {repr(key)}"

    async def test_api_key_works_across_endpoints(
        self,
        client: AsyncClient,
        valid_api_headers: Dict[str, str]
    ):
        """Test that valid API key works for multiple protected endpoints."""
        protected_endpoints = [
            "/documents",
            "/collections",
            "/schemas",
        ]
        
        for endpoint in protected_endpoints:
            response = await client.get(endpoint, headers=valid_api_headers)
            assert response.status_code not in [401, 403], \
                f"Valid API key should work for {endpoint}"

    async def test_api_key_persists_across_requests(
        self,
        client: AsyncClient,
        valid_api_headers: Dict[str, str]
    ):
        """Test that API key authentication is stateless (no session dependency)."""
        # Make multiple requests with same API key
        for i in range(5):
            response = await client.get("/documents", headers=valid_api_headers)
            assert response.status_code not in [401, 403], \
                f"API key should work on request {i+1}"

    async def test_api_key_error_messages_no_leakage(
        self,
        client: AsyncClient
    ):
        """Test that error messages don't leak sensitive information."""
        response = await client.get(
            "/documents",
            headers={"X-API-Key": "wrong-key"}
        )
        
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
            assert response.status_code not in [401, 403], \
                f"Health endpoint {endpoint} should not require auth"

    async def test_docs_endpoint_no_auth(self, client: AsyncClient):
        """Test that API documentation endpoints don't require authentication."""
        docs_endpoints = [
            "/docs",
            "/redoc",
            "/openapi.json",
        ]
        
        for endpoint in docs_endpoints:
            response = await client.get(endpoint)
            assert response.status_code not in [401, 403], \
                f"Docs endpoint {endpoint} should not require auth"

    async def test_root_endpoint_no_auth(self, client: AsyncClient):
        """Test that root endpoint doesn't require authentication."""
        response = await client.get("/")
        assert response.status_code not in [401, 403], \
            "Root endpoint should not require auth"
