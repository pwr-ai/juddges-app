"""Unit tests for app.extraction_domain.prompts_router module.

Tests cover: list, get, create, update, delete prompt endpoints,
including validation, error handling, and system prompt protection.

NOTE: The prompts_router routes (/prompts, /prompts/{id}, /schemas) overlap
with the jobs_router /{job_id} parametric route when composed under
/extractions. Tests use a dedicated FastAPI app with only the prompts_router
to avoid path-matching interference.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.extraction_domain.prompts_router import router as prompts_router

# Create a dedicated test app with only the prompts router
_test_app = FastAPI()
_test_app.include_router(prompts_router, prefix="/extractions")


@pytest.fixture
async def prompts_client() -> AsyncGenerator[AsyncClient, None]:
    """Client targeting only the prompts router (no jobs_router interference)."""
    async with AsyncClient(
        transport=ASGITransport(app=_test_app), base_url="http://test"
    ) as ac:
        yield ac


# =============================================================================
# GET /extractions/prompts
# =============================================================================


class TestListPrompts:
    @pytest.mark.unit
    async def test_list_prompts_success(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.InformationExtractor"
        ) as mock_ie:
            mock_ie.list_prompts.return_value = ["info_extraction", "custom_prompt"]
            response = await prompts_client.get("/extractions/prompts")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert "info_extraction" in data

    @pytest.mark.unit
    async def test_list_prompts_error(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.InformationExtractor"
        ) as mock_ie:
            mock_ie.list_prompts.side_effect = RuntimeError("file system error")
            response = await prompts_client.get("/extractions/prompts")
            assert response.status_code == 500


# =============================================================================
# GET /extractions/prompts/{prompt_id}
# =============================================================================


class TestGetPrompt:
    @pytest.mark.unit
    async def test_get_prompt_success(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.InformationExtractor"
        ) as mock_ie:
            mock_ie.get_prompt_template.return_value = (
                "Hello {{ name }}, extract {{ fields }}"
            )
            response = await prompts_client.get("/extractions/prompts/info_extraction")
            assert response.status_code == 200

    @pytest.mark.unit
    async def test_get_prompt_not_found(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.InformationExtractor"
        ) as mock_ie:
            mock_ie.get_prompt_template.side_effect = FileNotFoundError("not found")
            response = await prompts_client.get("/extractions/prompts/missing_prompt")
            assert response.status_code == 404

    @pytest.mark.unit
    async def test_get_prompt_server_error(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.InformationExtractor"
        ) as mock_ie:
            mock_ie.get_prompt_template.side_effect = RuntimeError("io error")
            response = await prompts_client.get("/extractions/prompts/broken")
            assert response.status_code == 500


# =============================================================================
# POST /extractions/prompts
# =============================================================================


class TestCreatePrompt:
    @pytest.mark.unit
    async def test_create_prompt_success(self, prompts_client) -> None:
        with (
            patch(
                "app.extraction_domain.prompts_router.prompt_exists",
                return_value=False,
            ),
            patch("app.extraction_domain.prompts_router.validate_jinja2_template"),
            patch(
                "app.extraction_domain.prompts_router.PROMPTS_DIR",
                MagicMock(),
            ),
            patch("builtins.open", MagicMock()),
            patch("app.extraction_domain.prompts_router.save_prompt_metadata"),
        ):
            response = await prompts_client.post(
                "/extractions/prompts",
                json={
                    "prompt_id": "new-prompt",
                    "description": "A new custom prompt",
                    "template": "Extract {{ fields }} from {{ document }}",
                    "variables": ["fields", "document"],
                },
            )
            assert response.status_code == 201
            data = response.json()
            assert data["prompt_id"] == "new-prompt"
            assert data["is_system"] is False

    @pytest.mark.unit
    async def test_create_prompt_duplicate(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.prompt_exists",
            return_value=True,
        ):
            response = await prompts_client.post(
                "/extractions/prompts",
                json={
                    "prompt_id": "existing-prompt",
                    "description": "Duplicate",
                    "template": "Some template {{ var }}",
                    "variables": ["var"],
                },
            )
            assert response.status_code == 400

    @pytest.mark.unit
    async def test_create_prompt_invalid_template(self, prompts_client) -> None:
        with (
            patch(
                "app.extraction_domain.prompts_router.prompt_exists",
                return_value=False,
            ),
            patch(
                "app.extraction_domain.prompts_router.validate_jinja2_template",
                side_effect=ValueError("Invalid Jinja2 template syntax"),
            ),
        ):
            response = await prompts_client.post(
                "/extractions/prompts",
                json={
                    "prompt_id": "bad-template",
                    "description": "Bad template",
                    "template": "{% if unclosed %}",
                    "variables": [],
                },
            )
            assert response.status_code == 400

    @pytest.mark.unit
    async def test_create_prompt_validation_short_template(
        self, prompts_client
    ) -> None:
        """Template must be at least 10 characters."""
        response = await prompts_client.post(
            "/extractions/prompts",
            json={
                "prompt_id": "short",
                "description": "Too short template",
                "template": "short",
                "variables": [],
            },
        )
        assert response.status_code == 422


# =============================================================================
# PUT /extractions/prompts/{prompt_id}
# =============================================================================


class TestUpdatePrompt:
    @pytest.mark.unit
    async def test_update_prompt_success(self, prompts_client) -> None:
        mock_metadata = MagicMock()
        mock_metadata.description = "Old desc"
        mock_metadata.variables = ["v1"]
        mock_metadata.created_at = "2025-01-01T00:00:00"
        mock_metadata.is_system = False

        with (
            patch(
                "app.extraction_domain.prompts_router.prompt_exists",
                return_value=True,
            ),
            patch(
                "app.extraction_domain.prompts_router.load_prompt_metadata",
                return_value=mock_metadata,
            ),
            patch(
                "app.extraction_domain.prompts_router.InformationExtractor"
            ) as mock_ie,
            patch("app.extraction_domain.prompts_router.validate_jinja2_template"),
            patch("app.extraction_domain.prompts_router.create_backup"),
            patch("builtins.open", MagicMock()),
            patch("app.extraction_domain.prompts_router.save_prompt_metadata"),
        ):
            mock_ie.get_prompt_template.return_value = "old template content"
            response = await prompts_client.put(
                "/extractions/prompts/my-prompt",
                json={
                    "description": "Updated description",
                    "template": "New template {{ var }} content",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["description"] == "Updated description"

    @pytest.mark.unit
    async def test_update_prompt_not_found(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.prompt_exists",
            return_value=False,
        ):
            response = await prompts_client.put(
                "/extractions/prompts/missing-prompt",
                json={"description": "Updated"},
            )
            assert response.status_code == 404


# =============================================================================
# DELETE /extractions/prompts/{prompt_id}
# =============================================================================


class TestDeletePrompt:
    @pytest.mark.unit
    async def test_delete_prompt_success(self, prompts_client) -> None:
        with (
            patch(
                "app.extraction_domain.prompts_router.prompt_exists",
                return_value=True,
            ),
            patch(
                "app.extraction_domain.prompts_router.is_system_prompt",
                return_value=False,
            ),
            patch("app.extraction_domain.prompts_router.archive_prompt"),
        ):
            response = await prompts_client.delete("/extractions/prompts/custom-prompt")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "archived"

    @pytest.mark.unit
    async def test_delete_prompt_not_found(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.prompt_exists",
            return_value=False,
        ):
            response = await prompts_client.delete("/extractions/prompts/missing")
            assert response.status_code == 404

    @pytest.mark.unit
    async def test_delete_system_prompt_rejected(self, prompts_client) -> None:
        with (
            patch(
                "app.extraction_domain.prompts_router.prompt_exists",
                return_value=True,
            ),
            patch(
                "app.extraction_domain.prompts_router.is_system_prompt",
                return_value=True,
            ),
        ):
            response = await prompts_client.delete(
                "/extractions/prompts/info_extraction"
            )
            assert response.status_code == 400

    @pytest.mark.unit
    async def test_delete_prompt_archive_failure(self, prompts_client) -> None:
        with (
            patch(
                "app.extraction_domain.prompts_router.prompt_exists",
                return_value=True,
            ),
            patch(
                "app.extraction_domain.prompts_router.is_system_prompt",
                return_value=False,
            ),
            patch(
                "app.extraction_domain.prompts_router.archive_prompt",
                side_effect=ValueError("I/O error"),
            ),
        ):
            response = await prompts_client.delete("/extractions/prompts/custom")
            assert response.status_code == 500


# =============================================================================
# GET /extractions/schemas (deprecated)
# =============================================================================


class TestListSchemasDeprecated:
    @pytest.mark.unit
    async def test_list_schemas_success(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.InformationExtractor"
        ) as mock_ie:
            mock_ie.list_schemas.return_value = ["schema1", "schema2"]
            response = await prompts_client.get("/extractions/schemas")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)

    @pytest.mark.unit
    async def test_list_schemas_error(self, prompts_client) -> None:
        with patch(
            "app.extraction_domain.prompts_router.InformationExtractor"
        ) as mock_ie:
            mock_ie.list_schemas.side_effect = RuntimeError("disk error")
            response = await prompts_client.get("/extractions/schemas")
            assert response.status_code == 500
