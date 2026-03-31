"""Unit tests for the embeddings API endpoints.

Tests cover:
- GET /embeddings/models - list available models
- GET /embeddings/models/active - get active model
- POST /embeddings/models/active - set active model
- POST /embeddings/test - test embedding generation
- Error handling for invalid models and provider failures
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.embedding_providers import EmbeddingModelConfig, EmbeddingProviderType
from app.embeddings_api import (
    EmbeddingModelsResponse,
    SetActiveModelRequest,
    SetActiveModelResponse,
    TestEmbeddingRequest,
    TestEmbeddingResponse,
)


# ---------------------------------------------------------------------------
# Pydantic model validation tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestPydanticModels:
    """Validate request/response schema construction."""

    def test_set_active_model_request(self):
        req = SetActiveModelRequest(model_id="openai/text-embedding-3-small")
        assert req.model_id == "openai/text-embedding-3-small"

    def test_set_active_model_response(self):
        resp = SetActiveModelResponse(
            model_id="openai/text-embedding-3-small",
            provider="openai",
            model_name="text-embedding-3-small",
            dimensions=1536,
            message="Active embedding model set to openai/text-embedding-3-small",
        )
        assert resp.dimensions == 1536
        assert resp.provider == "openai"

    def test_test_embedding_request_defaults(self):
        req = TestEmbeddingRequest(text="hello world")
        assert req.model_id is None
        assert req.text == "hello world"

    def test_test_embedding_request_with_model(self):
        req = TestEmbeddingRequest(
            text="hello", model_id="openai/text-embedding-3-small"
        )
        assert req.model_id == "openai/text-embedding-3-small"

    def test_test_embedding_request_max_length(self):
        """Text exceeding max_length=2000 should be rejected by Pydantic."""
        with pytest.raises(Exception):
            TestEmbeddingRequest(text="a" * 2001)

    def test_test_embedding_response(self):
        resp = TestEmbeddingResponse(
            model_id="openai/text-embedding-3-small",
            dimensions=1536,
            embedding_preview=[0.1] * 10,
            success=True,
            message="ok",
        )
        assert resp.success is True
        assert len(resp.embedding_preview) == 10

    def test_embedding_models_response(self):
        resp = EmbeddingModelsResponse(
            models=[{"id": "m1", "provider": "openai"}],
            active_model_id="m1",
        )
        assert len(resp.models) == 1


# ---------------------------------------------------------------------------
# API endpoint tests (using the ASGI test client)
# ---------------------------------------------------------------------------


# Helper: build a fake EmbeddingModelConfig used across multiple mocks
_FAKE_CONFIG = EmbeddingModelConfig(
    provider=EmbeddingProviderType.OPENAI,
    model_name="text-embedding-3-small",
    dimensions=1536,
    description="Test model",
)


@pytest.mark.unit
class TestListModelsEndpoint:
    """GET /embeddings/models"""

    @patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small")
    @patch(
        "app.embeddings_api.list_available_models",
        return_value=[
            {"id": "openai/text-embedding-3-small", "provider": "openai", "dimensions": 1536},
        ],
    )
    async def test_list_models_success(self, mock_list, mock_default, client, valid_api_headers):
        resp = await client.get("/embeddings/models", headers=valid_api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "models" in data
        assert data["active_model_id"] == "openai/text-embedding-3-small"
        assert len(data["models"]) == 1

    @patch("app.embeddings_api.get_default_model_id", return_value="huggingface/bge-m3")
    @patch("app.embeddings_api.list_available_models", return_value=[])
    async def test_list_models_empty(self, mock_list, mock_default, client, valid_api_headers):
        resp = await client.get("/embeddings/models", headers=valid_api_headers)
        assert resp.status_code == 200
        assert resp.json()["models"] == []

    async def test_list_models_requires_auth(self, client):
        """Request without API key should be rejected."""
        resp = await client.get("/embeddings/models")
        assert resp.status_code in (401, 403)


@pytest.mark.unit
class TestGetActiveModelEndpoint:
    """GET /embeddings/models/active"""

    @patch("app.embeddings_api.get_model_config", return_value=_FAKE_CONFIG)
    @patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small")
    async def test_get_active_model(self, mock_default, mock_config, client, valid_api_headers):
        resp = await client.get("/embeddings/models/active", headers=valid_api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["model_id"] == "openai/text-embedding-3-small"
        assert data["dimensions"] == 1536
        assert data["provider"] == "openai"

    async def test_get_active_model_requires_auth(self, client):
        resp = await client.get("/embeddings/models/active")
        assert resp.status_code in (401, 403)


@pytest.mark.unit
class TestSetActiveModelEndpoint:
    """POST /embeddings/models/active"""

    @patch("app.embeddings_api.set_active_model", return_value=_FAKE_CONFIG)
    async def test_set_active_model_success(self, mock_set, client, valid_api_headers):
        resp = await client.post(
            "/embeddings/models/active",
            json={"model_id": "openai/text-embedding-3-small"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["model_id"] == "openai/text-embedding-3-small"
        assert "Active embedding model set to" in data["message"]
        mock_set.assert_called_once_with("openai/text-embedding-3-small")

    @patch(
        "app.embeddings_api.set_active_model",
        side_effect=ValueError("Unknown model: bad/model"),
    )
    async def test_set_active_model_invalid_model(self, mock_set, client, valid_api_headers):
        resp = await client.post(
            "/embeddings/models/active",
            json={"model_id": "bad/model"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 400
        assert "Unknown model" in resp.json()["detail"]

    async def test_set_active_model_missing_body(self, client, valid_api_headers):
        resp = await client.post(
            "/embeddings/models/active",
            json={},
            headers=valid_api_headers,
        )
        # Pydantic validation should reject missing required field
        assert resp.status_code == 422

    async def test_set_active_model_requires_auth(self, client):
        resp = await client.post(
            "/embeddings/models/active",
            json={"model_id": "openai/text-embedding-3-small"},
        )
        assert resp.status_code in (401, 403)


@pytest.mark.unit
class TestTestEmbeddingEndpoint:
    """POST /embeddings/test"""

    @patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small")
    @patch("app.embeddings_api.get_embedding_provider")
    async def test_embed_normal_text(self, mock_provider_fn, mock_default, client, valid_api_headers):
        # Set up mock provider that returns a 1536-dim embedding
        fake_embedding = [0.01 * i for i in range(1536)]
        provider = AsyncMock()
        provider.embed_text = AsyncMock(return_value=fake_embedding)
        mock_provider_fn.return_value = provider

        resp = await client.post(
            "/embeddings/test",
            json={"text": "contract breach damages"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["dimensions"] == 1536
        assert len(data["embedding_preview"]) == 10
        provider.embed_text.assert_awaited_once_with("contract breach damages")

    @patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small")
    @patch("app.embeddings_api.get_embedding_provider")
    async def test_embed_unicode_text(self, mock_provider_fn, mock_default, client, valid_api_headers):
        """Polish diacritics and special characters should be handled correctly."""
        fake_embedding = [0.5] * 1024
        provider = AsyncMock()
        provider.embed_text = AsyncMock(return_value=fake_embedding)
        mock_provider_fn.return_value = provider

        polish_text = "Odpowiedzialność cywilna sądu najwyższego"
        resp = await client.post(
            "/embeddings/test",
            json={"text": polish_text},
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["dimensions"] == 1024
        provider.embed_text.assert_awaited_once_with(polish_text)

    @patch("app.embeddings_api.get_embedding_provider")
    async def test_embed_with_explicit_model(self, mock_provider_fn, client, valid_api_headers):
        """When model_id is provided it should be used instead of default."""
        fake_embedding = [0.0] * 3072
        provider = AsyncMock()
        provider.embed_text = AsyncMock(return_value=fake_embedding)
        mock_provider_fn.return_value = provider

        resp = await client.post(
            "/embeddings/test",
            json={"text": "test", "model_id": "openai/text-embedding-3-large"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        # Should call with the explicit model, not the default
        mock_provider_fn.assert_called_once_with("openai/text-embedding-3-large")

    @patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small")
    @patch(
        "app.embeddings_api.get_embedding_provider",
        side_effect=Exception("Connection refused"),
    )
    async def test_embed_provider_unavailable(self, mock_provider_fn, mock_default, client, valid_api_headers):
        """When the embedding service is down, return 500 with detail."""
        resp = await client.post(
            "/embeddings/test",
            json={"text": "any text"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 500
        assert "Embedding generation failed" in resp.json()["detail"]

    @patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small")
    @patch("app.embeddings_api.get_embedding_provider")
    async def test_embed_provider_runtime_error(self, mock_provider_fn, mock_default, client, valid_api_headers):
        """Provider initializes but embed_text raises at runtime."""
        provider = AsyncMock()
        provider.embed_text = AsyncMock(side_effect=RuntimeError("Rate limited"))
        mock_provider_fn.return_value = provider

        resp = await client.post(
            "/embeddings/test",
            json={"text": "something"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 500
        assert "Rate limited" in resp.json()["detail"]

    async def test_embed_empty_text(self, client, valid_api_headers):
        """Empty text should still be accepted (no min_length constraint)."""
        # The endpoint doesn't enforce min_length, so this depends on
        # whether the provider handles it. We just verify the API accepts it.
        with patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small"):
            provider = AsyncMock()
            provider.embed_text = AsyncMock(return_value=[0.0] * 1536)
            with patch("app.embeddings_api.get_embedding_provider", return_value=provider):
                resp = await client.post(
                    "/embeddings/test",
                    json={"text": ""},
                    headers=valid_api_headers,
                )
                assert resp.status_code == 200

    @patch("app.embeddings_api.get_default_model_id", return_value="openai/text-embedding-3-small")
    @patch("app.embeddings_api.get_embedding_provider")
    async def test_embed_short_embedding_preview(self, mock_provider_fn, mock_default, client, valid_api_headers):
        """If embedding has fewer than 10 dimensions, preview should be shorter."""
        fake_embedding = [1.0, 2.0, 3.0]  # Only 3 dims
        provider = AsyncMock()
        provider.embed_text = AsyncMock(return_value=fake_embedding)
        mock_provider_fn.return_value = provider

        resp = await client.post(
            "/embeddings/test",
            json={"text": "test"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["dimensions"] == 3
        assert len(data["embedding_preview"]) == 3

    async def test_embed_requires_auth(self, client):
        resp = await client.post(
            "/embeddings/test",
            json={"text": "hello"},
        )
        assert resp.status_code in (401, 403)
