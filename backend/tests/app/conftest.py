"""
Pytest fixtures for FastAPI integration tests.
"""

import os
from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

# Set test environment variables before importing app.
# BACKEND_API_KEY must be deterministic for auth tests because app auth caches it at import time.
os.environ["BACKEND_API_KEY"] = "test-api-key-12345"
os.environ.setdefault("SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")

from app.auth import verify_api_key
from app.server import app


@pytest.fixture
def test_api_key() -> str:
    """Return the test API key."""
    return "test-api-key-12345"


@pytest.fixture
def valid_api_headers(test_api_key: str) -> dict[str, str]:
    """Return valid API key headers."""
    return {"X-API-Key": test_api_key}


@pytest.fixture
def invalid_api_headers() -> dict[str, str]:
    """Return invalid API key headers."""
    return {"X-API-Key": "invalid-key"}


@pytest.fixture
def valid_jwt_headers() -> dict[str, str]:
    """Return valid JWT headers (mocked)."""
    return {"Authorization": "Bearer test-jwt-token", "X-API-Key": "test-api-key-12345"}


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """
    Create an async HTTP client for testing FastAPI endpoints.

    Uses ASGITransport to test the app directly without running a server.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
async def authenticated_client(
    valid_api_headers: dict[str, str],
    mock_user: dict[str, Any],
) -> AsyncGenerator[AsyncClient, None]:
    """
    Create an authenticated async HTTP client with valid API key and user header.
    """
    headers = {**valid_api_headers, "X-User-ID": mock_user["id"]}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=headers,
    ) as ac:
        yield ac


@pytest.fixture
def mock_user() -> dict[str, Any]:
    """Mock user data for authentication tests."""
    return {"id": "test-user-id-123", "email": "test@example.com", "name": "Test User"}


@pytest.fixture
def sample_document_data() -> dict[str, Any]:
    """Sample document data for testing."""
    return {
        "id": "test-doc-123",
        "title": "Sample Legal Document",
        "content": "This is a sample legal document about contract law.",
        "jurisdiction": "PL",
        "court_name": "Supreme Court",
        "case_number": "I CSK 123/2023",
        "decision_date": "2023-06-15",
        "publication_date": "2023-07-01",
        "document_type": "judgment",
    }


@pytest.fixture
def sample_search_request() -> dict[str, Any]:
    """Sample search request data."""
    return {"query": "contract law precedents", "limit_docs": 10, "alpha": 0.5}


@pytest.fixture
def sample_collection_data() -> dict[str, Any]:
    """Sample collection data for testing."""
    return {
        "name": "Test Collection",
        "description": "A test collection for integration tests",
        "tags": ["test", "integration"],
    }


@pytest.fixture
def sample_schema_data() -> dict[str, Any]:
    """Sample schema data for testing."""
    return {
        "name": "ContractSchema",
        "description": "Schema for extracting contract information",
        "version": "1.0.0",
        "fields": [
            {
                "name": "parties",
                "type": "array",
                "description": "Parties involved in the contract",
                "items": {"type": "string"},
            },
            {
                "name": "contract_date",
                "type": "string",
                "format": "date",
                "description": "Date of contract signing",
            },
            {
                "name": "contract_value",
                "type": "number",
                "description": "Monetary value of the contract",
            },
        ],
    }


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    """
    Clear any dependency overrides after each test.

    This ensures tests don't interfere with each other.
    """
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def disable_rate_limiter():
    """
    Disable SlowAPI rate limiting during tests to avoid cross-test interference.
    """
    limiter = getattr(app.state, "limiter", None)
    previous_enabled = getattr(limiter, "enabled", None)

    if limiter is not None and previous_enabled is not None:
        limiter.enabled = False

    yield

    if limiter is not None and previous_enabled is not None:
        limiter.enabled = previous_enabled


@pytest.fixture
def override_api_key_auth(test_api_key: str):
    """
    Factory fixture to override API key authentication.

    Usage:
        def test_something(override_api_key_auth):
            override_api_key_auth()
            # Now API key verification is bypassed
    """

    def _override():
        async def mock_verify_api_key():
            return test_api_key

        app.dependency_overrides[verify_api_key] = mock_verify_api_key
        return test_api_key

    return _override


# Pytest markers configuration
def pytest_configure(config):
    """Add custom markers for app integration tests."""
    config.addinivalue_line(
        "markers", "api: marks tests as API integration tests (requires HTTP client)"
    )
    config.addinivalue_line(
        "markers", "auth: marks tests as authentication/authorization tests"
    )
    config.addinivalue_line(
        "markers", "search: marks tests as search functionality tests"
    )
    config.addinivalue_line(
        "markers", "collections: marks tests as collection management tests"
    )
    config.addinivalue_line(
        "markers", "schemas: marks tests as schema management tests"
    )
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (e.g., rate limiting tests)"
    )
    config.addinivalue_line("markers", "security: marks tests as security-related")
    config.addinivalue_line(
        "markers", "timing: marks tests that measure timing (timing attack protection)"
    )


# Additional fixtures for comprehensive authentication testing


@pytest.fixture
def mock_user_a() -> dict[str, Any]:
    """Mock user A for isolation testing."""
    return {"id": "user-a", "email": "user-a@example.com", "name": "User A"}


@pytest.fixture
def mock_user_b() -> dict[str, Any]:
    """Mock user B for isolation testing."""
    return {"id": "user-b", "email": "user-b@example.com", "name": "User B"}


@pytest.fixture
def user_a_headers(
    valid_api_headers: dict[str, str], mock_user_a: dict[str, Any]
) -> dict[str, str]:
    """Headers for user A (API key + user ID)."""
    return {**valid_api_headers, "X-User-ID": mock_user_a["id"]}


@pytest.fixture
def user_b_headers(
    valid_api_headers: dict[str, str], mock_user_b: dict[str, Any]
) -> dict[str, str]:
    """Headers for user B (API key + user ID)."""
    return {**valid_api_headers, "X-User-ID": mock_user_b["id"]}


@pytest.fixture
def malicious_api_keys() -> list[str]:
    """List of malicious API key inputs for security testing."""
    return [
        "'; DROP TABLE users;--",  # SQL injection
        "<script>alert(1)</script>",  # XSS
        "../../../etc/passwd",  # Path traversal
        "test\x00admin",  # Null byte injection
        "test\r\n\r\nX-Admin: true",  # CRLF injection
        "a" * 10000,  # Very long input (DoS)
    ]


@pytest.fixture
def malicious_user_ids() -> list[str]:
    """List of malicious user ID inputs for security testing."""
    return [
        "user'; DROP TABLE collections;--",
        "user<script>alert(1)</script>",
        "../../../etc/passwd",
        "user\x00admin",
        "a" * 10000,
    ]


@pytest.fixture
def override_user_auth(mock_user: dict[str, Any]):
    """
    Factory fixture to override user authentication.

    Usage:
        def test_something(override_user_auth):
            override_user_auth("custom-user-id")
            # Now user authentication returns custom user ID
    """
    from app.collections import get_current_user

    def _override(user_id: str | None = None):
        if user_id is None:
            user_id = mock_user["id"]

        async def mock_get_current_user():
            return user_id

        app.dependency_overrides[get_current_user] = mock_get_current_user
        return user_id

    return _override


@pytest.fixture
async def client_with_user(
    valid_api_headers: dict[str, str], mock_user: dict[str, Any]
) -> AsyncGenerator[AsyncClient, None]:
    """
    Create an authenticated async HTTP client with both API key and user ID.
    """
    headers = {**valid_api_headers, "X-User-ID": mock_user["id"]}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers=headers
    ) as ac:
        yield ac
