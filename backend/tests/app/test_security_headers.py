"""
Security Headers Tests

Tests for security headers and CORS configuration including:
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- CORS configuration
- Security best practices
"""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.auth
class TestSecurityHeaders:
    """Test that security headers are properly configured."""

    async def test_security_headers_present(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that all required security headers are present."""
        response = await client.get("/health/healthz")

        headers = response.headers

        # X-Content-Type-Options prevents MIME sniffing
        assert "x-content-type-options" in headers, (
            "X-Content-Type-Options header missing"
        )
        assert headers["x-content-type-options"] == "nosniff", (
            "X-Content-Type-Options should be 'nosniff'"
        )

        # X-Frame-Options prevents clickjacking
        assert "x-frame-options" in headers, "X-Frame-Options header missing"
        assert headers["x-frame-options"] in ["DENY", "SAMEORIGIN"], (
            "X-Frame-Options should be DENY or SAMEORIGIN"
        )

        # X-XSS-Protection (legacy but still useful)
        assert "x-xss-protection" in headers, "X-XSS-Protection header missing"
        assert "1" in headers["x-xss-protection"], "X-XSS-Protection should be enabled"

    async def test_strict_transport_security_header(self, client: AsyncClient):
        """Test that HSTS header is present (for HTTPS)."""
        response = await client.get("/health/healthz")

        headers = response.headers

        # HSTS header (Strict-Transport-Security)
        # Note: This may only be set in production/HTTPS environments
        if "strict-transport-security" in headers:
            hsts = headers["strict-transport-security"]
            assert "max-age=" in hsts, "HSTS should specify max-age"
            # Should have reasonable max-age (e.g., 31536000 = 1 year)
            assert "max-age=31536000" in hsts or "max-age=63072000" in hsts

    async def test_content_security_policy_header(self, client: AsyncClient):
        """Test that Content Security Policy header is present."""
        response = await client.get("/health/healthz")

        headers = response.headers

        # CSP header (optional but recommended)
        if "content-security-policy" in headers:
            csp = headers["content-security-policy"]
            # Should restrict resources
            assert "default-src" in csp or "script-src" in csp

    async def test_security_headers_on_all_endpoints(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that security headers are present on all endpoints."""
        endpoints = [
            ("/health/healthz", {}),
            ("/docs", {}),
            ("/documents", valid_api_headers),
        ]

        for endpoint, headers in endpoints:
            response = await client.get(endpoint, headers=headers)

            # All endpoints should have security headers
            assert "x-content-type-options" in response.headers, (
                f"Security headers missing on {endpoint}"
            )
            assert "x-frame-options" in response.headers, (
                f"X-Frame-Options missing on {endpoint}"
            )

    async def test_no_server_version_leakage(self, client: AsyncClient):
        """Test that server version is not leaked in headers."""
        response = await client.get("/health/healthz")

        headers = response.headers

        # Server header should not reveal version details
        if "server" in headers:
            server = headers["server"].lower()
            # Should not contain version numbers or detailed info
            assert "uvicorn" not in server or "/" not in headers["server"], (
                "Server header should not reveal version"
            )

    async def test_no_powered_by_header(self, client: AsyncClient):
        """Test that X-Powered-By header is not present."""
        response = await client.get("/health/healthz")

        headers = response.headers

        # X-Powered-By reveals technology stack and should not be present
        assert "x-powered-by" not in headers, (
            "X-Powered-By header should not be present"
        )

    async def test_referrer_policy_header(self, client: AsyncClient):
        """Test that Referrer-Policy header is configured."""
        response = await client.get("/health/healthz")

        headers = response.headers

        # Referrer-Policy (optional but recommended)
        if "referrer-policy" in headers:
            policy = headers["referrer-policy"]
            # Should use a secure policy
            secure_policies = [
                "no-referrer",
                "no-referrer-when-downgrade",
                "strict-origin",
                "strict-origin-when-cross-origin",
                "same-origin",
            ]
            assert any(p in policy for p in secure_policies), (
                "Referrer-Policy should use a secure policy"
            )

    async def test_permissions_policy_header(self, client: AsyncClient):
        """Test that Permissions-Policy header is configured."""
        response = await client.get("/health/healthz")

        headers = response.headers

        # Permissions-Policy (formerly Feature-Policy)
        if "permissions-policy" in headers:
            policy = headers["permissions-policy"]
            # Should restrict sensitive features
            assert "geolocation" in policy or "camera" in policy


@pytest.mark.anyio
@pytest.mark.auth
class TestCORSConfiguration:
    """Test CORS (Cross-Origin Resource Sharing) configuration."""

    async def test_cors_headers_on_preflight(self, client: AsyncClient):
        """Test that CORS headers are present on OPTIONS requests."""
        # Preflight request
        response = await client.options(
            "/documents",
            headers={
                "Origin": "http://localhost:3006",
                "Access-Control-Request-Method": "GET",
            },
        )

        headers = response.headers

        # CORS headers should be present
        assert "access-control-allow-origin" in headers, (
            "Access-Control-Allow-Origin header missing"
        )
        assert "access-control-allow-methods" in headers, (
            "Access-Control-Allow-Methods header missing"
        )
        assert "access-control-allow-headers" in headers, (
            "Access-Control-Allow-Headers header missing"
        )

    async def test_cors_allowed_origins(self, client: AsyncClient):
        """Test that CORS only allows specified origins."""
        # Allowed origin (development)
        allowed_response = await client.options(
            "/documents", headers={"Origin": "http://localhost:3007"}
        )

        if allowed_response.status_code == 200:
            assert "access-control-allow-origin" in allowed_response.headers
            # Should allow localhost for development
            origin = allowed_response.headers.get("access-control-allow-origin")
            assert origin in ["http://localhost:3007", "*"]

    async def test_cors_disallows_unauthorized_origins(self, client: AsyncClient):
        """Test that CORS blocks unauthorized origins."""
        # Unauthorized origin
        response = await client.options(
            "/documents", headers={"Origin": "http://evil.com"}
        )

        # Should either not include CORS headers or explicitly deny
        if response.status_code == 200:
            origin = response.headers.get("access-control-allow-origin", "")
            # Should not allow evil.com specifically
            assert origin != "http://evil.com", "Should not allow unauthorized origin"

    async def test_cors_allowed_methods(self, client: AsyncClient):
        """Test that CORS allows appropriate HTTP methods."""
        response = await client.options(
            "/documents", headers={"Origin": "http://localhost:3007"}
        )

        if response.status_code == 200:
            methods = response.headers.get("access-control-allow-methods", "")

            # Should allow common methods
            expected_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
            for method in expected_methods:
                assert method in methods, f"CORS should allow {method} method"

    async def test_cors_allowed_headers(self, client: AsyncClient):
        """Test that CORS allows required headers."""
        response = await client.options(
            "/documents", headers={"Origin": "http://localhost:3007"}
        )

        if response.status_code == 200:
            allowed_headers = response.headers.get(
                "access-control-allow-headers", ""
            ).lower()

            # Should allow authentication headers
            required_headers = [
                "content-type",
                "authorization",
                "x-api-key",
                "x-user-id",
            ]

            for header in required_headers:
                assert header in allowed_headers, f"CORS should allow {header} header"

    async def test_cors_credentials_support(self, client: AsyncClient):
        """Test that CORS supports credentials if needed."""
        response = await client.options(
            "/documents", headers={"Origin": "http://localhost:3007"}
        )

        if response.status_code == 200:
            # If credentials are supported
            credentials = response.headers.get("access-control-allow-credentials")
            if credentials:
                assert credentials.lower() == "true", (
                    "Access-Control-Allow-Credentials should be 'true' if set"
                )

    async def test_cors_max_age(self, client: AsyncClient):
        """Test that CORS preflight cache duration is set."""
        response = await client.options(
            "/documents", headers={"Origin": "http://localhost:3007"}
        )

        if response.status_code == 200:
            max_age = response.headers.get("access-control-max-age")
            if max_age:
                # Should cache preflight for reasonable time (e.g., 1 hour = 3600)
                assert int(max_age) > 0, "Access-Control-Max-Age should be positive"
                assert int(max_age) <= 86400, (
                    "Access-Control-Max-Age should not exceed 24 hours"
                )


@pytest.mark.anyio
@pytest.mark.auth
class TestSecurityBestPractices:
    """Test additional security best practices."""

    async def test_no_sensitive_data_in_error_responses(self, client: AsyncClient):
        """Test that error responses don't leak sensitive information."""
        # Trigger various errors
        response = await client.get("/nonexistent-endpoint")

        if response.status_code >= 400:
            data = response.json()
            detail = str(data).lower()

            # Should not leak:
            # - File paths
            # - Database connection strings
            # - Internal implementation details
            # - Stack traces (in production)

            assert "/home/" not in detail, "Should not leak file paths"
            assert "postgresql://" not in detail, "Should not leak DB connection"
            assert "traceback" not in detail or "development" in detail

    async def test_rate_limit_headers_if_present(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that rate limit headers are present if rate limiting is enabled."""
        response = await client.get("/documents", headers=valid_api_headers)

        headers = response.headers

        # Rate limit headers (optional)
        rate_limit_headers = [
            "x-ratelimit-limit",
            "x-ratelimit-remaining",
            "x-ratelimit-reset",
            "retry-after",  # For 429 responses
        ]

        # If any rate limit header is present, check format
        for header in rate_limit_headers:
            if header in headers:
                value = headers[header]
                if header == "retry-after":
                    continue
                # Should be a valid number
                assert value.isdigit(), f"{header} should be numeric"

    async def test_json_content_type(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that JSON responses have correct Content-Type."""
        response = await client.get("/documents", headers=valid_api_headers)

        if response.status_code == 200:
            content_type = response.headers.get("content-type", "")
            assert "application/json" in content_type, (
                "JSON responses should have application/json Content-Type"
            )

    async def test_gzip_compression_support(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that GZip compression is supported."""
        headers = {**valid_api_headers, "Accept-Encoding": "gzip"}

        response = await client.get("/documents", headers=headers)

        # GZip may or may not be applied depending on response size
        # Just verify it doesn't cause errors
        assert response.status_code < 500

    async def test_request_id_tracking(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Test that request ID is supported for tracking."""
        headers = {**valid_api_headers, "X-Request-ID": "test-request-123"}

        response = await client.get("/documents", headers=headers)

        # Request ID header should be accepted
        assert response.status_code < 500

        # May be echoed back in response
        if "x-request-id" in response.headers:
            assert response.headers["x-request-id"] == "test-request-123"
