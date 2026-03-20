"""
Embedding provider abstraction for legal document search.

Supports switching between different embedding providers:
- OpenAI (text-embedding-3-small, text-embedding-3-large)
- Cohere (embed-english-v3.0, embed-multilingual-v3.0)
- HuggingFace (BAAI/bge-m3 - multilingual dense/sparse/multi-vector)
- Local SentenceTransformer models (e.g., sdadas/mmlw-roberta-large)
"""

import os
from abc import ABC, abstractmethod
from enum import Enum

from loguru import logger
from pydantic import BaseModel, Field


class EmbeddingProviderType(str, Enum):
    """Supported embedding provider types."""

    OPENAI = "openai"
    COHERE = "cohere"
    HUGGINGFACE = "huggingface"
    LOCAL = "local"


class EmbeddingModelConfig(BaseModel):
    """Configuration for an embedding model."""

    provider: EmbeddingProviderType = Field(description="Embedding provider type")
    model_name: str = Field(
        description="Model identifier (e.g., 'text-embedding-3-small')"
    )
    dimensions: int = Field(description="Output embedding dimensions")
    max_input_length: int = Field(
        default=8000, description="Maximum input text length in characters"
    )
    description: str = Field(default="", description="Human-readable description")
    is_default: bool = Field(
        default=False, description="Whether this is the default model"
    )


# Pre-defined model configurations
AVAILABLE_MODELS: dict[str, EmbeddingModelConfig] = {
    "openai/text-embedding-3-small-768": EmbeddingModelConfig(
        provider=EmbeddingProviderType.OPENAI,
        model_name="text-embedding-3-small",
        dimensions=768,
        max_input_length=8000,
        description="OpenAI small embedding model (768d) aligned with current judgments pgvector schema",
        is_default=False,
    ),
    "openai/text-embedding-3-small": EmbeddingModelConfig(
        provider=EmbeddingProviderType.OPENAI,
        model_name="text-embedding-3-small",
        dimensions=1536,
        max_input_length=8000,
        description="OpenAI small embedding model - fast, cost-effective, good quality",
        is_default=True,
    ),
    "openai/text-embedding-3-large": EmbeddingModelConfig(
        provider=EmbeddingProviderType.OPENAI,
        model_name="text-embedding-3-large",
        dimensions=3072,
        max_input_length=8000,
        description="OpenAI large embedding model - highest quality, higher cost",
    ),
    "cohere/embed-multilingual-v3.0": EmbeddingModelConfig(
        provider=EmbeddingProviderType.COHERE,
        model_name="embed-multilingual-v3.0",
        dimensions=1024,
        max_input_length=512,
        description="Cohere multilingual model - excellent for Polish and English legal texts",
    ),
    "cohere/embed-english-v3.0": EmbeddingModelConfig(
        provider=EmbeddingProviderType.COHERE,
        model_name="embed-english-v3.0",
        dimensions=1024,
        max_input_length=512,
        description="Cohere English model - optimized for English legal texts",
    ),
    "huggingface/bge-m3": EmbeddingModelConfig(
        provider=EmbeddingProviderType.HUGGINGFACE,
        model_name="BAAI/bge-m3",
        dimensions=1024,
        max_input_length=8192,
        description="BGE-M3 multilingual model (1024d) - native Polish + English, self-hosted, dense/sparse/multi-vector",
    ),
    "huggingface/bge-m3-768": EmbeddingModelConfig(
        provider=EmbeddingProviderType.HUGGINGFACE,
        model_name="BAAI/bge-m3",
        dimensions=768,
        max_input_length=8192,
        description="BGE-M3 multilingual model (768d via Matryoshka) - compatible with current pgvector schema",
    ),
    "local/mmlw-roberta-large": EmbeddingModelConfig(
        provider=EmbeddingProviderType.LOCAL,
        model_name="sdadas/mmlw-roberta-large",
        dimensions=1024,
        max_input_length=512,
        description="Local Polish/multilingual RoBERTa model - no API costs, good for Polish legal domain",
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
        """Truncate text to max input length."""
        if len(text) > self.config.max_input_length:
            return text[: self.config.max_input_length]
        return text


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """OpenAI embedding provider."""

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI()

    async def embed_text(self, text: str) -> list[float]:
        text = self._truncate_text(text)
        request_payload = {
            "model": self.config.model_name,
            "input": text,
        }
        if self.config.model_name.startswith("text-embedding-3"):
            request_payload["dimensions"] = self.config.dimensions
        response = await self._client.embeddings.create(**request_payload)
        return response.data[0].embedding

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        texts = [self._truncate_text(t) for t in texts]
        request_payload = {
            "model": self.config.model_name,
            "input": texts,
        }
        if self.config.model_name.startswith("text-embedding-3"):
            request_payload["dimensions"] = self.config.dimensions
        response = await self._client.embeddings.create(**request_payload)
        return [item.embedding for item in response.data]


class CohereEmbeddingProvider(BaseEmbeddingProvider):
    """Cohere embedding provider."""

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        self._api_key = os.getenv("COHERE_API_KEY")

    async def embed_text(self, text: str) -> list[float]:
        result = await self.embed_texts([text])
        return result[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        import httpx

        texts = [self._truncate_text(t) for t in texts]
        if not self._api_key:
            raise ValueError("COHERE_API_KEY environment variable not set")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.cohere.ai/v1/embed",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "texts": texts,
                    "model": self.config.model_name,
                    "input_type": "search_document",
                    "truncate": "END",
                },
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["embeddings"]


class LocalEmbeddingProvider(BaseEmbeddingProvider):
    """Local SentenceTransformer embedding provider."""

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        self._model = None

    def _get_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            logger.info(f"Loading local embedding model: {self.config.model_name}")
            self._model = SentenceTransformer(self.config.model_name)
        return self._model

    async def embed_text(self, text: str) -> list[float]:
        import asyncio

        text = self._truncate_text(text)
        model = self._get_model()
        # Run in thread pool since SentenceTransformer is synchronous
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: model.encode(text).tolist())

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        import asyncio

        texts = [self._truncate_text(t) for t in texts]
        model = self._get_model()
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: [model.encode(t).tolist() for t in texts]
        )


class HuggingFaceEmbeddingProvider(BaseEmbeddingProvider):
    """HuggingFace embedding provider using FlagEmbedding for BGE-M3.

    BGE-M3 supports dense, sparse, and multi-vector retrieval.
    This provider uses dense embeddings by default for pgvector compatibility.
    Supports Matryoshka dimension reduction (e.g., 1024 -> 768) via truncation.
    """

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        self._model = None

    def _get_model(self):
        if self._model is None:
            try:
                from FlagEmbedding import BGEM3FlagModel

                logger.info(
                    f"Loading HuggingFace model: {self.config.model_name} "
                    f"(target dims: {self.config.dimensions})"
                )
                self._model = BGEM3FlagModel(self.config.model_name, use_fp16=True)
            except ImportError:
                raise ImportError(
                    "FlagEmbedding is required for BGE-M3. "
                    "Install with: pip install FlagEmbedding"
                )
        return self._model

    def _truncate_embedding(self, embedding: list[float]) -> list[float]:
        """Truncate embedding to target dimensions (Matryoshka representation)."""
        if len(embedding) > self.config.dimensions:
            return embedding[: self.config.dimensions]
        return embedding

    async def embed_text(self, text: str) -> list[float]:
        result = await self.embed_texts([text])
        return result[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        import asyncio

        texts = [self._truncate_text(t) for t in texts]
        model = self._get_model()
        loop = asyncio.get_event_loop()

        def _encode():
            output = model.encode(texts)
            dense = output["dense_vecs"]
            # dense_vecs is a numpy array of shape (n, native_dim)
            return [self._truncate_embedding(vec.tolist()) for vec in dense]

        return await loop.run_in_executor(None, _encode)


# Provider factory
_PROVIDER_CLASSES = {
    EmbeddingProviderType.OPENAI: OpenAIEmbeddingProvider,
    EmbeddingProviderType.COHERE: CohereEmbeddingProvider,
    EmbeddingProviderType.HUGGINGFACE: HuggingFaceEmbeddingProvider,
    EmbeddingProviderType.LOCAL: LocalEmbeddingProvider,
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

    configured_dimension = os.getenv("EMBEDDING_DIMENSION", "").strip()
    if configured_dimension == "768":
        return "openai/text-embedding-3-small-768"

    # Fall back to the model marked as default
    for model_id, config in AVAILABLE_MODELS.items():
        if config.is_default:
            return model_id
    return "openai/text-embedding-3-small"


def get_embedding_provider(model_id: str | None = None) -> BaseEmbeddingProvider:
    """Get the embedding provider for a given model (or the default).

    Uses a singleton pattern - the provider is cached and reused.
    """
    global _active_provider, _active_model_id

    if model_id is None:
        model_id = get_default_model_id()

    # Return cached provider if same model
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
        # Check if the required API key is available
        if config.provider == EmbeddingProviderType.COHERE:
            model_dict["api_key_configured"] = bool(os.getenv("COHERE_API_KEY"))
        elif config.provider == EmbeddingProviderType.OPENAI:
            model_dict["api_key_configured"] = bool(os.getenv("OPENAI_API_KEY"))
        else:
            # Local and HuggingFace models don't need API keys
            model_dict["api_key_configured"] = True
        models.append(model_dict)
    return models


def set_active_model(model_id: str) -> EmbeddingModelConfig:
    """Set the active embedding model. Returns the model config."""
    global _active_provider, _active_model_id

    config = get_model_config(model_id)

    # Check API key availability
    if config.provider == EmbeddingProviderType.COHERE and not os.getenv(
        "COHERE_API_KEY"
    ):
        raise ValueError(
            "COHERE_API_KEY environment variable is required for Cohere models"
        )
    if config.provider == EmbeddingProviderType.OPENAI and not os.getenv(
        "OPENAI_API_KEY"
    ):
        raise ValueError(
            "OPENAI_API_KEY environment variable is required for OpenAI models"
        )

    # Clear cached provider to force re-initialization
    _active_provider = None
    _active_model_id = None

    # Set the environment variable so it persists
    os.environ["EMBEDDING_MODEL_ID"] = model_id

    logger.info(f"Active embedding model set to: {model_id}")
    return config
