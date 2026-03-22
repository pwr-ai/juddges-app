"""Unit tests for app.embedding_providers module."""

from unittest.mock import patch

import pytest

from app.embedding_providers import (
    AVAILABLE_MODELS,
    BaseEmbeddingProvider,
    EmbeddingModelConfig,
    EmbeddingProviderType,
    HuggingFaceEmbeddingProvider,
    get_default_model_id,
    get_embedding_provider,
    get_model_config,
    list_available_models,
    set_active_model,
)

# ---------------------------------------------------------------------------
# EmbeddingModelConfig
# ---------------------------------------------------------------------------


class TestEmbeddingModelConfig:
    def test_default_values(self):
        config = EmbeddingModelConfig(
            provider=EmbeddingProviderType.OPENAI,
            model_name="test-model",
            dimensions=768,
        )
        assert config.max_input_length == 8000
        assert config.description == ""
        assert config.is_default is False

    def test_all_provider_types(self):
        for provider in EmbeddingProviderType:
            config = EmbeddingModelConfig(
                provider=provider, model_name="test", dimensions=768
            )
            assert config.provider == provider


# ---------------------------------------------------------------------------
# AVAILABLE_MODELS
# ---------------------------------------------------------------------------


class TestAvailableModels:
    def test_has_at_least_one_default(self):
        defaults = [m for m in AVAILABLE_MODELS.values() if m.is_default]
        assert len(defaults) >= 1

    def test_all_models_have_positive_dimensions(self):
        for model_id, config in AVAILABLE_MODELS.items():
            assert config.dimensions > 0, f"{model_id} has invalid dimensions"

    def test_cohere_multilingual_model_exists(self):
        key = "cohere/embed-multilingual-v3.0"
        assert key in AVAILABLE_MODELS
        assert AVAILABLE_MODELS[key].provider == EmbeddingProviderType.COHERE

    def test_bge_m3_model_exists(self):
        key = "huggingface/bge-m3"
        assert key in AVAILABLE_MODELS
        assert AVAILABLE_MODELS[key].provider == EmbeddingProviderType.HUGGINGFACE
        assert AVAILABLE_MODELS[key].dimensions == 1024
        assert AVAILABLE_MODELS[key].max_input_length == 8192
        assert AVAILABLE_MODELS[key].is_default is True


# ---------------------------------------------------------------------------
# get_model_config
# ---------------------------------------------------------------------------


class TestGetModelConfig:
    def test_returns_config_for_valid_model(self):
        config = get_model_config("huggingface/bge-m3")
        assert config.dimensions == 1024
        assert config.provider == EmbeddingProviderType.HUGGINGFACE

    def test_raises_for_unknown_model(self):
        with pytest.raises(ValueError, match="Unknown model"):
            get_model_config("nonexistent/model")


# ---------------------------------------------------------------------------
# get_default_model_id
# ---------------------------------------------------------------------------


class TestGetDefaultModelId:
    def test_returns_env_model_id_when_set(self):
        with patch.dict(
            "os.environ",
            {"EMBEDDING_MODEL_ID": "huggingface/bge-m3"},
        ):
            assert get_default_model_id() == "huggingface/bge-m3"

    def test_returns_default_bge_m3_when_no_env(self):
        with patch.dict(
            "os.environ",
            {"EMBEDDING_MODEL_ID": "", "EMBEDDING_DIMENSION": ""},
        ):
            model_id = get_default_model_id()
            assert model_id == "huggingface/bge-m3"
            assert AVAILABLE_MODELS[model_id].is_default is True

    def test_returns_default_model_when_no_env(self):
        with patch.dict(
            "os.environ",
            {"EMBEDDING_MODEL_ID": "", "EMBEDDING_DIMENSION": ""},
        ):
            model_id = get_default_model_id()
            config = AVAILABLE_MODELS[model_id]
            assert config.is_default is True

    def test_ignores_unknown_env_model_id(self):
        with patch.dict(
            "os.environ",
            {"EMBEDDING_MODEL_ID": "nonexistent/model", "EMBEDDING_DIMENSION": ""},
        ):
            model_id = get_default_model_id()
            assert model_id in AVAILABLE_MODELS


# ---------------------------------------------------------------------------
# BaseEmbeddingProvider._truncate_text
# ---------------------------------------------------------------------------


class TestTruncateText:
    def test_truncates_long_text(self):
        config = EmbeddingModelConfig(
            provider=EmbeddingProviderType.OPENAI,
            model_name="test",
            dimensions=1024,
            max_input_length=100,
        )

        # Create a concrete subclass to test the mixin method
        class StubProvider(BaseEmbeddingProvider):
            async def embed_text(self, text):
                return []

            async def embed_texts(self, texts):
                return []

        provider = StubProvider(config)
        result = provider._truncate_text("x" * 200)
        assert len(result) == 100

    def test_does_not_truncate_short_text(self):
        config = EmbeddingModelConfig(
            provider=EmbeddingProviderType.OPENAI,
            model_name="test",
            dimensions=1024,
            max_input_length=100,
        )

        class StubProvider(BaseEmbeddingProvider):
            async def embed_text(self, text):
                return []

            async def embed_texts(self, texts):
                return []

        provider = StubProvider(config)
        result = provider._truncate_text("short")
        assert result == "short"


# ---------------------------------------------------------------------------
# get_embedding_provider
# ---------------------------------------------------------------------------


class TestGetEmbeddingProvider:
    def test_returns_huggingface_provider(self):
        # Reset singleton state
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        provider = get_embedding_provider("huggingface/bge-m3")
        assert provider.config.provider == EmbeddingProviderType.HUGGINGFACE

    def test_caches_provider_for_same_model(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        p1 = get_embedding_provider("huggingface/bge-m3")
        p2 = get_embedding_provider("huggingface/bge-m3")
        assert p1 is p2

    def test_creates_new_provider_for_different_model(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        p1 = get_embedding_provider("huggingface/bge-m3")
        p2 = get_embedding_provider("openai/text-embedding-3-small")
        assert p1 is not p2

    def test_raises_for_unknown_model(self):
        with pytest.raises(ValueError, match="Unknown model"):
            get_embedding_provider("nonexistent/model")


# ---------------------------------------------------------------------------
# list_available_models
# ---------------------------------------------------------------------------


class TestListAvailableModels:
    def test_returns_all_models(self):
        models = list_available_models()
        assert len(models) == len(AVAILABLE_MODELS)

    def test_includes_id_field(self):
        models = list_available_models()
        for m in models:
            assert "id" in m
            assert m["id"] in AVAILABLE_MODELS

    def test_marks_active_model(self):
        with patch.dict(
            "os.environ",
            {"EMBEDDING_MODEL_ID": "huggingface/bge-m3"},
        ):
            models = list_available_models()
            active = [m for m in models if m["is_active"]]
            assert len(active) == 1
            assert active[0]["id"] == "huggingface/bge-m3"

    def test_checks_api_key_availability(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}, clear=False):
            models = list_available_models()
            openai_models = [
                m for m in models if m["provider"] == EmbeddingProviderType.OPENAI
            ]
            for m in openai_models:
                assert m["api_key_configured"] is True


# ---------------------------------------------------------------------------
# set_active_model
# ---------------------------------------------------------------------------


class TestSetActiveModel:
    def test_sets_model_and_returns_config(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        config = set_active_model("huggingface/bge-m3")
        assert config.dimensions == 1024
        assert mod._active_provider is None  # Cleared for re-init

    def test_raises_for_unknown_model(self):
        with pytest.raises(ValueError, match="Unknown model"):
            set_active_model("nonexistent/model")

    def test_raises_when_cohere_key_missing(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            pytest.raises(ValueError, match="COHERE_API_KEY"),
        ):
            set_active_model("cohere/embed-multilingual-v3.0")

    def test_raises_when_openai_key_missing(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            pytest.raises(ValueError, match="OPENAI_API_KEY"),
        ):
            set_active_model("openai/text-embedding-3-small")

    def test_sets_huggingface_model_without_api_key(self):
        """HuggingFace models don't require API keys (local inference)."""
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        with patch.dict("os.environ", {}, clear=True):
            config = set_active_model("huggingface/bge-m3")
        assert config.dimensions == 1024
        assert config.provider == EmbeddingProviderType.HUGGINGFACE


# ---------------------------------------------------------------------------
# HuggingFaceEmbeddingProvider
# ---------------------------------------------------------------------------


class TestHuggingFaceEmbeddingProvider:
    def test_truncate_embedding_preserves_short(self):
        config = EmbeddingModelConfig(
            provider=EmbeddingProviderType.HUGGINGFACE,
            model_name="BAAI/bge-m3",
            dimensions=1024,
        )
        provider = HuggingFaceEmbeddingProvider(config)
        assert provider.config.dimensions == 1024
        assert provider.config.provider == EmbeddingProviderType.HUGGINGFACE

    def test_huggingface_provider_type_in_enum(self):
        assert EmbeddingProviderType.HUGGINGFACE == "huggingface"

    def test_factory_recognizes_huggingface_provider(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        provider = get_embedding_provider("huggingface/bge-m3")
        assert isinstance(provider, HuggingFaceEmbeddingProvider)
        assert provider.config.dimensions == 1024

    def test_huggingface_models_no_api_key_required(self):
        models = list_available_models()
        hf_models = [
            m for m in models if m["provider"] == EmbeddingProviderType.HUGGINGFACE
        ]
        assert len(hf_models) >= 1
        for m in hf_models:
            assert m["api_key_configured"] is True
