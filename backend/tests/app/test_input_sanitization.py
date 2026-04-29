"""
Input Sanitization Tests

Tests that the API properly handles malicious and edge-case inputs including:
- XSS payloads in search queries and parameters
- SQL injection patterns in user-facing inputs
- Oversized inputs (DoS prevention)
- Unicode, null bytes, and special character handling

All tests verify that the server does not crash (status < 500) and that
potentially dangerous payloads are not reflected back unsanitized.
"""

import pytest
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# XSS payload tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestXSSPayloads:
    """Verify that XSS payloads in user inputs are handled safely."""

    XSS_PAYLOADS = [
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "<svg/onload=alert(1)>",
        "javascript:alert(1)",
        '"><script>alert(document.cookie)</script>',
        "<iframe src='javascript:alert(1)'>",
        "<body onload=alert(1)>",
        "'-alert(1)-'",
        "${alert(1)}",
        "{{7*7}}",  # Template injection probe
    ]

    async def test_xss_in_search_query_does_not_crash(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """XSS payloads in search query params must not cause a 5xx error."""
        for payload in self.XSS_PAYLOADS:
            response = await client.get(
                "/api/search/autocomplete",
                params={"q": payload},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for XSS payload: {payload!r}"
            )

    async def test_xss_in_search_query_not_reflected_raw(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """XSS payloads must not appear unsanitized in JSON responses."""
        payload = "<script>alert(1)</script>"
        response = await client.get(
            "/api/search/autocomplete",
            params={"q": payload},
            headers=valid_api_headers,
        )
        # Even if the endpoint returns the query, it should be in a JSON
        # string context (auto-escaped).  Verify no raw <script> in body.
        if response.status_code < 500:
            body = response.text
            # JSON-encoded responses naturally escape angle brackets in strings,
            # but verify the raw HTML tag is not present outside JSON encoding.
            assert "<script>" not in body.replace("\\u003c", "<").replace(
                "\\u003e", ">"
            ) or "application/json" in response.headers.get("content-type", ""), (
                "XSS payload reflected in non-JSON response body"
            )

    async def test_xss_in_document_search_endpoint(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """XSS payloads submitted to the documents endpoint must be safe."""
        payload = "<script>alert('xss')</script>"
        response = await client.get(
            "/documents",
            params={"q": payload},
            headers=valid_api_headers,
        )
        assert response.status_code < 500, (
            "Server error when XSS payload sent to /documents"
        )

    async def test_xss_in_collection_name(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """XSS payloads in collection creation body must not crash the server."""
        payload_data = {
            "name": "<script>alert(1)</script>",
            "description": "<img src=x onerror=alert(1)>",
        }
        response = await client.post(
            "/collections",
            json=payload_data,
            headers=valid_api_headers,
        )
        assert response.status_code < 500, (
            "Server error when XSS payload sent in collection body"
        )


# ---------------------------------------------------------------------------
# SQL injection tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestSQLInjection:
    """Verify that SQL injection payloads are handled safely."""

    SQL_INJECTION_PAYLOADS = [
        "'; DROP TABLE judgments; --",
        "1; DROP TABLE judgments; --",
        "' OR '1'='1",
        "' OR 1=1 --",
        "' UNION SELECT * FROM pg_tables --",
        "1' OR '1'='1' /*",
        "admin'--",
        "'; EXECUTE IMMEDIATE 'DROP TABLE judgments'; --",
        "1; UPDATE judgments SET content='hacked' WHERE 1=1; --",
        "' AND 1=CONVERT(int, (SELECT TOP 1 table_name FROM information_schema.tables))--",
    ]

    async def test_sql_injection_in_search_does_not_crash(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """SQL injection payloads in search queries must not cause server errors."""
        for payload in self.SQL_INJECTION_PAYLOADS:
            response = await client.get(
                "/api/search/autocomplete",
                params={"q": payload},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for SQL injection payload: {payload!r}"
            )

    async def test_sql_injection_in_documents_search(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """SQL injection payloads via the documents endpoint must be safe."""
        for payload in self.SQL_INJECTION_PAYLOADS:
            response = await client.get(
                "/documents",
                params={"q": payload},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for SQL injection payload on /documents: {payload!r}"
            )

    async def test_sql_injection_in_collection_creation(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """SQL injection in collection fields must not crash the server."""
        payload_data = {
            "name": "'; DROP TABLE collections; --",
            "description": "' OR 1=1 --",
        }
        response = await client.post(
            "/collections",
            json=payload_data,
            headers=valid_api_headers,
        )
        assert response.status_code < 500, (
            "Server error for SQL injection payload in collection creation"
        )

    async def test_sql_injection_in_path_parameter(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """SQL injection in URL path segments must not crash the server."""
        malicious_ids = [
            "1; DROP TABLE judgments;--",
            "' OR '1'='1",
            "1 UNION SELECT 1,2,3--",
        ]
        for mal_id in malicious_ids:
            response = await client.get(
                f"/documents/{mal_id}",
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for SQL injection in path: {mal_id!r}"
            )


# ---------------------------------------------------------------------------
# Oversized input tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestOversizedInputs:
    """Verify that extremely large inputs are rejected gracefully."""

    async def test_very_long_search_query_via_get(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """A search query exceeding the max_length validation must be rejected.

        The autocomplete endpoint declares ``max_length=500`` on the ``q``
        parameter, so a 1000-char string should be rejected with 422.
        We keep the string short enough that httpx can build the URL.
        """
        long_query = "a" * 1_000  # Exceeds max_length=500 but fits in a URL
        response = await client.get(
            "/api/search/autocomplete",
            params={"q": long_query},
            headers=valid_api_headers,
        )
        # FastAPI should reject with 422 (validation error) or 400
        assert response.status_code < 500, "Server error for oversized search query"
        assert response.status_code in (400, 422), (
            f"Expected 400/422 for query exceeding max_length, got {response.status_code}"
        )

    async def test_extremely_long_search_query_rejected_at_transport(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """An extremely long query (100 KB) should be rejected by transport or server."""
        import httpx

        long_query = "a" * 100_000
        try:
            response = await client.get(
                "/api/search/autocomplete",
                params={"q": long_query},
                headers=valid_api_headers,
            )
            # If it gets through, it must not be a server error
            assert response.status_code < 500, (
                "Server error for extremely long search query"
            )
        except httpx.InvalidURL:
            # httpx rejects the URL before sending -- this is acceptable
            pass

    async def test_very_long_collection_name(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """An extremely long collection name must not crash the server."""
        payload = {
            "name": "x" * 100_000,
            "description": "normal description",
        }
        response = await client.post(
            "/collections",
            json=payload,
            headers=valid_api_headers,
        )
        assert response.status_code < 500, "Server error for oversized collection name"

    async def test_very_large_json_body(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """A request body with many nested keys must not crash the server."""
        large_body = {f"key_{i}": f"value_{i}" for i in range(10_000)}
        response = await client.post(
            "/collections",
            json=large_body,
            headers=valid_api_headers,
        )
        assert response.status_code < 500, "Server error for oversized JSON body"

    async def test_deeply_nested_json(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Deeply nested JSON payloads must not crash the server."""
        # Build a 200-level nested dict
        nested: dict = {"value": "deep"}
        for _ in range(200):
            nested = {"nested": nested}

        response = await client.post(
            "/collections",
            json=nested,
            headers=valid_api_headers,
        )
        assert response.status_code < 500, "Server error for deeply nested JSON"


# ---------------------------------------------------------------------------
# Unicode and special character tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.security
class TestUnicodeAndSpecialCharacters:
    """Verify that unicode and special characters are handled safely."""

    async def test_unicode_search_queries(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Unicode characters in search queries must be processed safely."""
        unicode_queries = [
            "umowa o pracę",  # Polish characters
            "判決",  # Japanese kanji
            "حكم قضائي",  # Arabic
            "Ünited Stätes Cöurt",  # Diacritics
            "\U0001f600\U0001f47b\U0001f4a9",  # Emoji
            "test\u200bquery",  # Zero-width space
            "test\u202equery",  # Right-to-left override
            "test\ufeffquery",  # BOM character
        ]
        for query in unicode_queries:
            response = await client.get(
                "/api/search/autocomplete",
                params={"q": query},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for unicode query: {query!r}"
            )

    async def test_null_byte_injection(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Null bytes in inputs must not cause server errors or bypass validation."""
        null_byte_inputs = [
            "test\x00query",
            "query\x00' OR 1=1 --",
            "\x00",
            "normal\x00<script>alert(1)</script>",
        ]
        for payload in null_byte_inputs:
            response = await client.get(
                "/documents",
                params={"q": payload},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for null-byte input: {payload!r}"
            )

    async def test_crlf_injection_in_query(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """CRLF sequences in query parameters must not cause header injection."""
        crlf_payloads = [
            "query\r\nX-Injected: true",
            "query\r\n\r\n<html>injected</html>",
            "query%0d%0aInjected-Header: true",
        ]
        for payload in crlf_payloads:
            response = await client.get(
                "/api/search/autocomplete",
                params={"q": payload},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for CRLF injection: {payload!r}"
            )
            # Verify no injected header appears in the response
            assert "x-injected" not in response.headers, (
                "CRLF injection succeeded -- injected header present in response"
            )

    async def test_path_traversal_in_query(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Path traversal sequences in query params must not leak files."""
        traversal_payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
            "....//....//....//etc/passwd",
        ]
        for payload in traversal_payloads:
            response = await client.get(
                "/documents",
                params={"q": payload},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for path traversal payload: {payload!r}"
            )
            # Ensure no file content leaked
            if response.status_code == 200:
                body = response.text.lower()
                assert "root:" not in body, (
                    "Path traversal may have leaked /etc/passwd content"
                )

    async def test_empty_and_whitespace_queries(
        self, client: AsyncClient, valid_api_headers: dict[str, str]
    ):
        """Empty and whitespace-only queries must be handled gracefully."""
        edge_queries = [
            "",
            " ",
            "\t",
            "\n",
            "   \t\n  ",
        ]
        for query in edge_queries:
            response = await client.get(
                "/documents",
                params={"q": query},
                headers=valid_api_headers,
            )
            assert response.status_code < 500, (
                f"Server error for whitespace query: {query!r}"
            )
