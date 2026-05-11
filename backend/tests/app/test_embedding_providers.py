"""Unit tests for app.embedding_providers module."""

from unittest.mock import patch

import pytest

from app.embedding_providers import (
    AVAILABLE_MODELS,
    BaseEmbeddingProvider,
    EmbeddingModelConfig,
    EmbeddingProviderType,
    TEIEmbeddingProvider,
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
            provider=EmbeddingProviderType.TEI,
            model_name="BAAI/bge-m3",
            dimensions=1024,
        )
        assert config.max_input_length == 8192
        assert config.description == ""
        assert config.is_default is False

    def test_all_provider_types(self):
        for provider in EmbeddingProviderType:
            config = EmbeddingModelConfig(
                provider=provider, model_name="BAAI/bge-m3", dimensions=1024
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

    def test_only_tei_bge_m3_registered(self):
        assert set(AVAILABLE_MODELS.keys()) == {"tei/bge-m3"}

    def test_all_models_are_bge_m3_1024(self):
        for config in AVAILABLE_MODELS.values():
            assert config.model_name == "BAAI/bge-m3"
            assert config.dimensions == 1024

    def test_tei_bge_m3_is_default(self):
        key = "tei/bge-m3"
        assert key in AVAILABLE_MODELS
        assert AVAILABLE_MODELS[key].provider == EmbeddingProviderType.TEI
        assert AVAILABLE_MODELS[key].dimensions == 1024
        assert AVAILABLE_MODELS[key].max_input_length == 8192
        assert AVAILABLE_MODELS[key].is_default is True


# ---------------------------------------------------------------------------
# get_model_config
# ---------------------------------------------------------------------------


class TestGetModelConfig:
    def test_returns_config_for_valid_model(self):
        config = get_model_config("tei/bge-m3")
        assert config.dimensions == 1024
        assert config.provider == EmbeddingProviderType.TEI

    def test_raises_for_unknown_model(self):
        with pytest.raises(ValueError, match="Unknown model"):
            get_model_config("nonexistent/model")

    def test_raises_for_removed_openai_model(self):
        with pytest.raises(ValueError, match="Unknown model"):
            get_model_config("openai/text-embedding-3-small")

    def test_raises_for_removed_cohere_model(self):
        with pytest.raises(ValueError, match="Unknown model"):
            get_model_config("cohere/embed-multilingual-v3.0")


# ---------------------------------------------------------------------------
# get_default_model_id
# ---------------------------------------------------------------------------


class TestGetDefaultModelId:
    def test_returns_env_model_id_when_set(self):
        with patch.dict(
            "os.environ",
            {"EMBEDDING_MODEL_ID": "tei/bge-m3"},
        ):
            assert get_default_model_id() == "tei/bge-m3"

    def test_returns_default_tei_bge_m3_when_no_env(self):
        with patch.dict(
            "os.environ",
            {"EMBEDDING_MODEL_ID": "", "EMBEDDING_DIMENSION": ""},
        ):
            model_id = get_default_model_id()
            assert model_id == "tei/bge-m3"
            assert AVAILABLE_MODELS[model_id].is_default is True

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
            provider=EmbeddingProviderType.TEI,
            model_name="BAAI/bge-m3",
            dimensions=1024,
            max_input_length=100,
        )

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
            provider=EmbeddingProviderType.TEI,
            model_name="BAAI/bge-m3",
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
    def test_returns_tei_provider(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        with patch.dict(
            "os.environ", {"TEI_EMBEDDING_URL": "http://tei.local"}, clear=False
        ):
            provider = get_embedding_provider("tei/bge-m3")
        assert provider.config.provider == EmbeddingProviderType.TEI
        assert isinstance(provider, TEIEmbeddingProvider)

    def test_caches_provider_for_same_model(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        with patch.dict(
            "os.environ", {"TEI_EMBEDDING_URL": "http://tei.local"}, clear=False
        ):
            p1 = get_embedding_provider("tei/bge-m3")
            p2 = get_embedding_provider("tei/bge-m3")
        assert p1 is p2

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
            {"EMBEDDING_MODEL_ID": "tei/bge-m3"},
        ):
            models = list_available_models()
            active = [m for m in models if m["is_active"]]
            assert len(active) == 1
            assert active[0]["id"] == "tei/bge-m3"

    def test_tei_models_no_api_key_required(self):
        models = list_available_models()
        for m in models:
            assert m["api_key_configured"] is True


# ---------------------------------------------------------------------------
# set_active_model
# ---------------------------------------------------------------------------


class TestSetActiveModel:
    def test_sets_model_and_returns_config(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        config = set_active_model("tei/bge-m3")
        assert config.dimensions == 1024
        assert mod._active_provider is None  # Cleared for re-init

    def test_raises_for_unknown_model(self):
        with pytest.raises(ValueError, match="Unknown model"):
            set_active_model("nonexistent/model")

    def test_sets_tei_model_without_api_key(self):
        """TEI does not require an API key — only TEI_EMBEDDING_URL."""
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        with patch.dict("os.environ", {}, clear=True):
            config = set_active_model("tei/bge-m3")
        assert config.dimensions == 1024
        assert config.provider == EmbeddingProviderType.TEI


# ---------------------------------------------------------------------------
# TEIEmbeddingProvider
# ---------------------------------------------------------------------------


class TestTEIEmbeddingProvider:
    def test_provider_type_in_enum(self):
        assert EmbeddingProviderType.TEI == "tei"

    def test_factory_recognizes_tei_provider(self):
        import app.embedding_providers as mod

        mod._active_provider = None
        mod._active_model_id = None

        with patch.dict(
            "os.environ", {"TEI_EMBEDDING_URL": "http://tei.local"}, clear=False
        ):
            provider = get_embedding_provider("tei/bge-m3")
        assert isinstance(provider, TEIEmbeddingProvider)
        assert provider.config.dimensions == 1024

    def test_raises_when_url_missing(self):
        config = EmbeddingModelConfig(
            provider=EmbeddingProviderType.TEI,
            model_name="BAAI/bge-m3",
            dimensions=1024,
        )
        with (
            patch.dict("os.environ", {}, clear=True),
            pytest.raises(ValueError, match="TEI_EMBEDDING_URL"),
        ):
            TEIEmbeddingProvider(config)
