"""
Embedding provider for legal document search.

This codebase standardizes on BAAI/bge-m3 (1024-dim) served via a remote
Text Embeddings Inference (TEI) server. All other providers (OpenAI,
Cohere, local FlagEmbedding, SentenceTransformer) have been removed so
the backend container stays light and search queries always share the
same vector space as the ingested corpus in Supabase.
"""

import os
from abc import ABC, abstractmethod
from enum import Enum

from loguru import logger
from pydantic import BaseModel, Field


class EmbeddingProviderType(str, Enum):
    """Supported embedding provider types."""

    TEI = "tei"


class EmbeddingModelConfig(BaseModel):
    """Configuration for an embedding model."""

    provider: EmbeddingProviderType = Field(description="Embedding provider type")
    model_name: str = Field(description="Model identifier (e.g., 'BAAI/bge-m3')")
    dimensions: int = Field(description="Output embedding dimensions")
    max_input_length: int = Field(
        default=8192, description="Maximum input text length in characters"
    )
    description: str = Field(default="", description="Human-readable description")
    is_default: bool = Field(
        default=False, description="Whether this is the default model"
    )


AVAILABLE_MODELS: dict[str, EmbeddingModelConfig] = {
    "tei/bge-m3": EmbeddingModelConfig(
        provider=EmbeddingProviderType.TEI,
        model_name="BAAI/bge-m3",
        dimensions=1024,
        max_input_length=8192,
        description="BGE-M3 via remote Text Embeddings Inference server - 1024-dim multilingual dense embeddings",
        is_default=True,
    ),
}


class BaseEmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    def __init__(self, config: EmbeddingModelConfig):
        self.config = config

    @abstractmethod
    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text."""
        ...

    @abstractmethod
    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        ...

    def _truncate_text(self, text: str) -> str:
        """Truncate text to max input length (character-based)."""
        if len(text) > self.config.max_input_length:
            logger.warning(
                f"{self.__class__.__name__}: truncating input "
                f"{len(text)} → {self.config.max_input_length} chars "
                f"(model={self.config.model_name})"
            )
            return text[: self.config.max_input_length]
        return text


class TEIEmbeddingProvider(BaseEmbeddingProvider):
    """HTTP client for a remote Text Embeddings Inference (TEI) server.

    TEI (https://github.com/huggingface/text-embeddings-inference) hosts models
    like BAAI/bge-m3 behind a simple HTTP API. Keeps the backend container
    lightweight (no local model, no FlagEmbedding) and lets several services
    share one warm GPU-backed embedder.

    URL comes from TEI_EMBEDDING_URL (primary) or TRANSFORMERS_INFERENCE_URL
    (legacy fallback). TLS verification is controlled by TEI_VERIFY_SSL
    (default true; set to false for internal CAs / self-signed dev hosts).
    """

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        self._base_url = (
            os.getenv("TEI_EMBEDDING_URL")
            or os.getenv("TRANSFORMERS_INFERENCE_URL")
            or ""
        ).rstrip("/")
        if not self._base_url:
            raise ValueError(
                "TEI_EMBEDDING_URL (or legacy TRANSFORMERS_INFERENCE_URL) "
                "must be set to use the TEI embedding provider"
            )
        self._timeout = float(os.getenv("TEI_TIMEOUT_SECONDS", "10"))
        self._verify_ssl = os.getenv("TEI_VERIFY_SSL", "true").lower() not in (
            "false",
            "0",
            "no",
        )
        self._client = None
        logger.info(
            f"TEI provider configured: {self._base_url} "
            f"(dim={config.dimensions}, verify_ssl={self._verify_ssl})"
        )

    def _get_client(self):
        import httpx

        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
                verify=self._verify_ssl,
            )
        return self._client

    async def embed_text(self, text: str) -> list[float]:
        result = await self.embed_texts([text])
        return result[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        texts = [self._truncate_text(t) for t in texts]
        payload = {"inputs": texts if len(texts) > 1 else texts[0]}
        client = self._get_client()
        response = await client.post("/embed", json=payload)
        response.raise_for_status()
        data = response.json()
        # TEI returns [[...]] for both single and batch; normalize defensively.
        if data and isinstance(data[0], float):
            data = [data]
        for row in data:
            if len(row) != self.config.dimensions:
                raise ValueError(
                    f"TEI returned dim={len(row)}, expected {self.config.dimensions}"
                )
        return data


_PROVIDER_CLASSES = {
    EmbeddingProviderType.TEI: TEIEmbeddingProvider,
}

# Singleton provider cache
_active_provider: BaseEmbeddingProvider | None = None
_active_model_id: str | None = None


def get_model_config(model_id: str) -> EmbeddingModelConfig:
    """Get configuration for a specific model."""
    if model_id not in AVAILABLE_MODELS:
        raise ValueError(
            f"Unknown model: {model_id}. Available: {list(AVAILABLE_MODELS.keys())}"
        )
    return AVAILABLE_MODELS[model_id]


def get_default_model_id() -> str:
    """Get the ID of the default embedding model."""
    active_model = os.getenv("EMBEDDING_MODEL_ID", "")
    if active_model and active_model in AVAILABLE_MODELS:
        return active_model

    for model_id, config in AVAILABLE_MODELS.items():
        if config.is_default:
            return model_id
    return "tei/bge-m3"


def get_embedding_provider(model_id: str | None = None) -> BaseEmbeddingProvider:
    """Get the embedding provider for a given model (or the default).

    Uses a singleton pattern - the provider is cached and reused.
    """
    global _active_provider, _active_model_id

    if model_id is None:
        model_id = get_default_model_id()

    if _active_provider is not None and _active_model_id == model_id:
        return _active_provider

    config = get_model_config(model_id)
    provider_class = _PROVIDER_CLASSES.get(config.provider)
    if provider_class is None:
        raise ValueError(f"No provider implementation for: {config.provider}")

    logger.info(f"Initializing embedding provider: {model_id} ({config.provider})")
    _active_provider = provider_class(config)
    _active_model_id = model_id
    return _active_provider


def list_available_models() -> list[dict]:
    """List all available embedding models with their configurations."""
    default_model_id = get_default_model_id()
    models = []
    for model_id, config in AVAILABLE_MODELS.items():
        model_dict = config.model_dump()
        model_dict["id"] = model_id
        model_dict["is_active"] = model_id == default_model_id
        # TEI/BGE-M3 needs no API key — only TEI_EMBEDDING_URL.
        model_dict["api_key_configured"] = True
        models.append(model_dict)
    return models


def set_active_model(model_id: str) -> EmbeddingModelConfig:
    """Set the active embedding model. Returns the model config."""
    global _active_provider, _active_model_id

    config = get_model_config(model_id)

    _active_provider = None
    _active_model_id = None
    os.environ["EMBEDDING_MODEL_ID"] = model_id

    logger.info(f"Active embedding model set to: {model_id}")
    return config
