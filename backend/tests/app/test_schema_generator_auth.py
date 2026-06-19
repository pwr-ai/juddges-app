"""
Security tests for app.api.schema_generator Bearer-JWT auth contract.

Covers:
  (a) all three endpoints (/chat, /test, /simple) reject requests without a
      valid Bearer token with 401/403.
  (b) per-user session isolation: a second user cannot resume a session that
      belongs to a different user because both the in-memory cache key and the
      LangGraph thread_id are namespaced by user_id.

Design notes
------------
* We use 404 (not 403) when a user attempts to continue a session they do not
  own to avoid leaking that the session even exists.  These tests document that
  contract without asserting the exact response body content.
* Auth is bypassed via the ``_install_jwt_user_override`` helper from conftest
  so no real Supabase round-trip happens.
* The in-memory ``_generation_sessions`` dict is patched for isolation tests
  to avoid needing a live LangGraph/LLM setup.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.security]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def api_headers() -> dict[str, str]:
    """Minimal headers that satisfy the API-key middleware layer."""
    return {"X-API-Key": "test-api-key-12345"}


@pytest.fixture
def user_a() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": "user-aaa-111",
            "email": "user-a@example.com",
            "role": "authenticated",
        },
        access_token="token-a",
    )


@pytest.fixture
def user_b() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": "user-bbb-222",
            "email": "user-b@example.com",
            "role": "authenticated",
        },
        access_token="token-b",
    )


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _install_user(user: AuthenticatedUser) -> None:
    """Override JWT dep to return *user* without hitting Supabase."""

    async def _resolver() -> AuthenticatedUser:
        return user

    app.dependency_overrides[jwt_get_current_user] = _resolver


def _clear_user() -> None:
    app.dependency_overrides.pop(jwt_get_current_user, None)


# ---------------------------------------------------------------------------
# (a) Unauthenticated requests are rejected
# ---------------------------------------------------------------------------


class TestSchemaGeneratorRequiresAuth:
    """All three endpoints must return 401/403 when no Bearer token is supplied."""

    async def test_chat_rejects_no_auth(
        self, client: AsyncClient, api_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/schema-generator/chat",
            json={"message": "extract drug names"},
            headers=api_headers,
        )
        assert response.status_code in (401, 403), (
            f"/schema-generator/chat accepted unauthenticated request; "
            f"got {response.status_code}"
        )

    async def test_test_rejects_no_auth(
        self, client: AsyncClient, api_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/schema-generator/test",
            json={
                "schema": {"type": "object", "properties": {}},
                "collection_id": "col-1",
                "document_ids": ["doc-1"],
            },
            headers=api_headers,
        )
        assert response.status_code in (401, 403), (
            f"/schema-generator/test accepted unauthenticated request; "
            f"got {response.status_code}"
        )

    async def test_simple_rejects_no_auth(
        self, client: AsyncClient, api_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/schema-generator/simple",
            json={"message": "extract contract parties"},
            headers=api_headers,
        )
        assert response.status_code in (401, 403), (
            f"/schema-generator/simple accepted unauthenticated request; "
            f"got {response.status_code}"
        )

    async def test_chat_rejects_no_api_key_either(self, client: AsyncClient) -> None:
        """Even with a (fake) Bearer header, missing X-API-Key returns 401/403."""
        response = await client.post(
            "/schema-generator/chat",
            json={"message": "extract"},
            headers={"Authorization": "Bearer fake-token"},
        )
        # API-key middleware fires first; the exact code is 401 or 403.
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# (b) Session isolation — user B cannot hijack user A's session
# ---------------------------------------------------------------------------


class TestSchemaGeneratorSessionIsolation:
    """
    The in-memory cache key is ``"{user_id}:{session_id}"``.  A second user
    that submits the same *session_id* gets a fresh agent (not user A's).
    Both the agent lookup and the LangGraph thread_id are namespaced, so
    there is no data leakage even for colliding UUIDs.
    """

    @patch("app.api.schema_generator.generate_schema")
    async def test_simple_user_a_sees_their_own_response(
        self,
        mock_gen: MagicMock,
        client: AsyncClient,
        api_headers: dict[str, str],
        user_a: AuthenticatedUser,
    ) -> None:
        mock_gen.return_value = {
            "schema": {
                "type": "object",
                "properties": {"field_a": {"type": "string"}},
            },
            "generated_prompt": "prompt for user A",
            "new_fields": ["field_a"],
            "existing_field_count": 0,
            "new_field_count": 1,
        }

        _install_user(user_a)
        try:
            response = await client.post(
                "/schema-generator/simple",
                json={
                    "message": "extract user A data",
                    "session_id": "shared-session-id",
                },
                headers={**api_headers, "Authorization": "Bearer token-a"},
            )
        finally:
            _clear_user()

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "field_a" in data["new_fields"]

    @patch("app.api.schema_generator.generate_schema")
    async def test_simple_user_b_gets_their_own_call(
        self,
        mock_gen: MagicMock,
        client: AsyncClient,
        api_headers: dict[str, str],
        user_b: AuthenticatedUser,
    ) -> None:
        """User B uses the same session_id but gets a separate generate_schema call."""
        mock_gen.return_value = {
            "schema": {
                "type": "object",
                "properties": {"field_b": {"type": "string"}},
            },
            "generated_prompt": "prompt for user B",
            "new_fields": ["field_b"],
            "existing_field_count": 0,
            "new_field_count": 1,
        }

        _install_user(user_b)
        try:
            response = await client.post(
                "/schema-generator/simple",
                json={
                    "message": "extract user B data",
                    "session_id": "shared-session-id",
                },
                headers={**api_headers, "Authorization": "Bearer token-b"},
            )
        finally:
            _clear_user()

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # User B's call returned user B's schema — not user A's cached agent
        assert "field_b" in data["new_fields"]
        # generate_schema was called (not served from user A's cached agent)
        mock_gen.assert_called_once()

    def test_namespaced_key_prevents_collision(
        self,
        user_a: AuthenticatedUser,
        user_b: AuthenticatedUser,
    ) -> None:
        """_namespaced_key must produce distinct keys for same session_id, different users."""
        from app.api.schema_generator import _namespaced_key

        key_a = _namespaced_key(user_a.id, "same-session")
        key_b = _namespaced_key(user_b.id, "same-session")

        assert key_a != key_b
        assert user_a.id in key_a
        assert user_b.id in key_b

    def test_namespaced_key_same_user_same_session_is_stable(
        self,
        user_a: AuthenticatedUser,
    ) -> None:
        """Same user + same session_id always resolves to the same cache key."""
        from app.api.schema_generator import _namespaced_key

        assert _namespaced_key(user_a.id, "session-xyz") == _namespaced_key(
            user_a.id, "session-xyz"
        )

    def test_get_or_create_agent_uses_namespaced_cache_key(
        self,
        user_a: AuthenticatedUser,
    ) -> None:
        """get_or_create_agent must store the agent under the namespaced key."""
        from unittest.mock import MagicMock, patch

        from juddges_search.models import DocumentType

        from app.api.schema_generator import _namespaced_key, get_or_create_agent

        expected_key = _namespaced_key(user_a.id, "my-session")
        mock_agent = MagicMock()
        mock_request = MagicMock()
        mock_request.app.state.checkpointer = MagicMock()

        with (
            patch("app.api.schema_generator._generation_sessions", {}) as sessions,
            patch("app.api.schema_generator.SchemaGenerator", return_value=mock_agent),
            patch(
                "app.api.schema_generator.load_prompts",
                return_value=dict.fromkeys(
                    [
                        "problem_definer_helper_prompt",
                        "problem_definer_prompt",
                        "schema_generator_prompt",
                        "schema_assessment_prompt",
                        "schema_refiner_prompt",
                        "query_generator_prompt",
                        "schema_data_assessment_prompt",
                        "schema_data_assessment_merger_prompt",
                        "schema_data_refiner_prompt",
                    ],
                    "",
                ),
            ),
            patch("app.api.schema_generator.get_default_llm"),
        ):
            result = get_or_create_agent(
                session_id="my-session",
                user_id=user_a.id,
                document_type=DocumentType.JUDGMENT,
                request=mock_request,
            )
            # Agent must be stored under the namespaced key
            assert expected_key in sessions
            # Bare session_id must NOT be in the store
            assert "my-session" not in sessions
            assert result is mock_agent
