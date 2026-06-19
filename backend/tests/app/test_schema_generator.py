"""
Unit tests for app.api.schema_generator module.

Tests helper functions, response formatting, and the simple schema generation
endpoint with mocked dependencies.

Note: all endpoint tests that expect a non-401 result must install the JWT
override because Bearer auth is now required on /chat, /test, and /simple.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.schema_generator import (
    _generate_simple_response_message,
    format_response_message,
    get_or_create_agent,
)
from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

# ---------------------------------------------------------------------------
# Auth helper — install a fake user so endpoint tests bypass Supabase
# ---------------------------------------------------------------------------

_FAKE_USER = AuthenticatedUser(
    user_data={
        "id": "test-user-id-schema",
        "email": "schema@example.com",
        "role": "authenticated",
    },
    access_token="fake-bearer-token",
)


def _install_test_user() -> None:
    async def _resolver() -> AuthenticatedUser:
        return _FAKE_USER

    app.dependency_overrides[jwt_get_current_user] = _resolver


def _clear_test_user() -> None:
    app.dependency_overrides.pop(jwt_get_current_user, None)


# ===== format_response_message tests =====


@pytest.mark.unit
class TestFormatResponseMessage:
    def test_returns_problem_definition(self):
        state = {"problem_definition": "We need to extract tax data"}
        result = format_response_message(state)
        assert result == "We need to extract tax data"

    def test_returns_merged_data_assessment(self):
        state = {
            "merged_data_assessment": {
                "overall_quality": "high",
                "suggestions": ["Add more fields", "Improve types"],
            }
        }
        result = format_response_message(state)
        assert "Schema Quality: high" in result
        assert "Add more fields" in result

    def test_returns_merged_data_assessment_without_suggestions(self):
        state = {
            "merged_data_assessment": {
                "overall_quality": "medium",
            }
        }
        result = format_response_message(state)
        assert "Schema Quality: medium" in result

    def test_returns_problem_help(self):
        state = {"problem_help": "Please provide more details"}
        result = format_response_message(state)
        assert result == "Please provide more details"

    def test_returns_schema_info(self):
        state = {
            "current_schema": {
                "properties": {"field_a": {}, "field_b": {}, "field_c": {}}
            }
        }
        result = format_response_message(state)
        assert "3 fields" in result

    def test_returns_default_message(self):
        state = {}
        result = format_response_message(state)
        assert "Schema generated successfully" in result

    def test_priority_problem_definition_over_others(self):
        """problem_definition takes priority even if other fields are present."""
        state = {
            "problem_definition": "Primary message",
            "problem_help": "Secondary message",
            "current_schema": {"properties": {"f1": {}}},
        }
        result = format_response_message(state)
        assert result == "Primary message"

    def test_merged_data_assessment_empty_suggestions(self):
        state = {
            "merged_data_assessment": {
                "overall_quality": "low",
                "suggestions": [],
            }
        }
        result = format_response_message(state)
        assert "Schema Quality: low" in result

    def test_merged_data_assessment_empty_dict(self):
        state = {"merged_data_assessment": {}}
        # No quality field, no suggestions -> falls through to next check
        result = format_response_message(state)
        # Should fall through since no message_parts
        assert isinstance(result, str)


# ===== _generate_simple_response_message tests =====


@pytest.mark.unit
class TestGenerateSimpleResponseMessage:
    def test_new_schema_message(self):
        schema = {
            "properties": {
                "name": {"type": "string"},
                "amount": {"type": "number"},
            }
        }
        result = _generate_simple_response_message(schema, field_count=2)
        assert "2 field(s)" in result
        assert "name" in result
        assert "amount" in result

    def test_extending_schema_message(self):
        schema = {"properties": {"old": {}, "new1": {}, "new2": {}}}
        result = _generate_simple_response_message(
            schema,
            field_count=3,
            new_fields=["new1", "new2"],
            existing_field_count=1,
        )
        assert "2 new field(s)" in result
        assert "1 existing field(s)" in result

    def test_many_fields_truncated(self):
        props = {f"field_{i}": {} for i in range(8)}
        schema = {"properties": props}
        result = _generate_simple_response_message(schema, field_count=8)
        assert "and 3 more" in result

    def test_many_new_fields_truncated(self):
        schema = {"properties": {f"f{i}": {} for i in range(10)}}
        new_fields = [f"f{i}" for i in range(7)]
        result = _generate_simple_response_message(
            schema,
            field_count=10,
            new_fields=new_fields,
            existing_field_count=3,
        )
        assert "and 2 more" in result

    def test_empty_schema(self):
        schema = {"properties": {}}
        result = _generate_simple_response_message(schema, field_count=0)
        assert "0 field(s)" in result


# ===== get_or_create_agent tests =====


@pytest.mark.unit
class TestGetOrCreateAgent:
    @patch("app.api.schema_generator._generation_sessions", {})
    @patch("app.api.schema_generator.SchemaGenerator")
    @patch("app.api.schema_generator.load_prompts")
    @patch("app.api.schema_generator.get_default_llm")
    def test_creates_new_agent(self, mock_llm, mock_prompts, mock_gen):
        mock_prompts.return_value = {
            "problem_definer_helper_prompt": "p1",
            "problem_definer_prompt": "p2",
            "schema_generator_prompt": "p3",
            "schema_assessment_prompt": "p4",
            "schema_refiner_prompt": "p5",
            "query_generator_prompt": "p6",
            "schema_data_assessment_prompt": "p7",
            "schema_data_assessment_merger_prompt": "p8",
            "schema_data_refiner_prompt": "p9",
        }
        mock_agent = MagicMock()
        mock_gen.return_value = mock_agent

        mock_request = MagicMock()
        mock_request.app.state.checkpointer = MagicMock()

        from juddges_search.models import DocumentType

        result = get_or_create_agent(
            "session-1", "user-xyz", DocumentType.JUDGMENT, mock_request
        )
        assert result is mock_agent

    @patch("app.api.schema_generator._generation_sessions")
    def test_reuses_existing_agent(self, mock_sessions):
        mock_agent = MagicMock()
        from datetime import UTC, datetime

        # Namespaced key is "user-xyz:existing-session"
        mock_sessions.__contains__ = MagicMock(return_value=True)
        mock_sessions.__getitem__ = MagicMock(
            return_value=(mock_agent, datetime.now(UTC))
        )

        mock_request = MagicMock()

        from juddges_search.models import DocumentType

        result = get_or_create_agent(
            "existing-session", "user-xyz", DocumentType.JUDGMENT, mock_request
        )
        assert result is mock_agent


# ===== Simple schema generation endpoint tests =====


@pytest.mark.unit
class TestGenerateSchemaSimpleEndpoint:
    @patch("app.api.schema_generator.generate_schema")
    async def test_simple_generation_success(self, mock_gen):
        mock_gen.return_value = {
            "schema": {
                "type": "object",
                "properties": {
                    "party_name": {"type": "string"},
                    "amount": {"type": "number"},
                },
            },
            "generated_prompt": "Extract party names and amounts",
            "new_fields": ["party_name", "amount"],
            "existing_field_count": 0,
            "new_field_count": 2,
        }

        _install_test_user()
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/schema-generator/simple",
                    json={
                        "message": "Extract party names and amounts",
                        "schema_name": "ContractSchema",
                    },
                    headers={
                        "X-API-Key": "test-api-key-12345",
                        "Authorization": "Bearer fake-bearer-token",
                    },
                )
        finally:
            _clear_test_user()

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["field_count"] == 2
        assert "party_name" in data["new_fields"]

    @patch("app.api.schema_generator.generate_schema")
    async def test_simple_generation_value_error(self, mock_gen):
        mock_gen.side_effect = ValueError("Invalid schema spec")

        _install_test_user()
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/schema-generator/simple",
                    json={"message": "bad input"},
                    headers={
                        "X-API-Key": "test-api-key-12345",
                        "Authorization": "Bearer fake-bearer-token",
                    },
                )
        finally:
            _clear_test_user()

        assert response.status_code == 400

    @patch("app.api.schema_generator.generate_schema")
    async def test_simple_generation_internal_error(self, mock_gen):
        mock_gen.side_effect = RuntimeError("LLM crashed")

        _install_test_user()
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/schema-generator/simple",
                    json={"message": "extract data"},
                    headers={
                        "X-API-Key": "test-api-key-12345",
                        "Authorization": "Bearer fake-bearer-token",
                    },
                )
        finally:
            _clear_test_user()

        assert response.status_code == 500

    async def test_simple_generation_empty_message_rejected(self):
        # With auth required, FastAPI resolves Depends(get_current_user) before
        # Pydantic validates the body, so an unauthenticated call returns 401.
        # Install the test user so the auth dep passes and we can verify body
        # validation returns 422.
        _install_test_user()
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/schema-generator/simple",
                    json={"message": ""},
                    headers={
                        "X-API-Key": "test-api-key-12345",
                        "Authorization": "Bearer fake-bearer-token",
                    },
                )
        finally:
            _clear_test_user()
        assert response.status_code == 422


# ===== Request validation tests =====


@pytest.mark.unit
class TestSchemaGeneratorRequestValidation:
    async def test_chat_empty_message_rejected(self):
        # Install auth so Pydantic body validation is the failure point.
        _install_test_user()
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/schema-generator/chat",
                    json={"message": ""},
                    headers={
                        "X-API-Key": "test-api-key-12345",
                        "Authorization": "Bearer fake-bearer-token",
                    },
                )
        finally:
            _clear_test_user()
        assert response.status_code == 422

    async def test_test_endpoint_requires_schema(self):
        # Install auth so Pydantic body validation is the failure point.
        _install_test_user()
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/schema-generator/test",
                    json={
                        "collection_id": "c1",
                        "document_ids": ["d1"],
                        # missing "schema" field
                    },
                    headers={
                        "X-API-Key": "test-api-key-12345",
                        "Authorization": "Bearer fake-bearer-token",
                    },
                )
        finally:
            _clear_test_user()
        assert response.status_code == 422

    async def test_simple_schema_name_too_long(self):
        # Install auth so Pydantic body validation is the failure point.
        _install_test_user()
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/schema-generator/simple",
                    json={
                        "message": "extract",
                        "schema_name": "x" * 101,
                    },
                    headers={
                        "X-API-Key": "test-api-key-12345",
                        "Authorization": "Bearer fake-bearer-token",
                    },
                )
        finally:
            _clear_test_user()
        assert response.status_code == 422
