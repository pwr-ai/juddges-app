"""
Embedding provider abstraction for legal document search.

Supports switching between different embedding providers:
- OpenAI (text-embedding-3-small, text-embedding-3-large)
- Cohere (embed-english-v3.0, embed-multilingual-v3.0)
- HuggingFace (BAAI/bge-m3 - multilingual dense/sparse/multi-vector, requires FlagEmbedding)
- Local SentenceTransformer models (e.g., sdadas/mmlw-roberta-large)
- TEI (remote HuggingFace Text Embeddings Inference server, HTTP)
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
    TEI = "tei"


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
    "tei/bge-m3": EmbeddingModelConfig(
        provider=EmbeddingProviderType.TEI,
        model_name="BAAI/bge-m3",
        dimensions=1024,
        max_input_length=8192,
        description="BGE-M3 via remote Text Embeddings Inference server - same model as ingest, no local deps",
        is_default=True,
    ),
    "huggingface/bge-m3": EmbeddingModelConfig(
        provider=EmbeddingProviderType.HUGGINGFACE,
        model_name="BAAI/bge-m3",
        dimensions=1024,
        max_input_length=8192,
        description="BGE-M3 multilingual model (1024d) - requires FlagEmbedding installed locally (~2GB RAM)",
        is_default=False,
    ),
    "openai/text-embedding-3-small": EmbeddingModelConfig(
        provider=EmbeddingProviderType.OPENAI,
        model_name="text-embedding-3-small",
        dimensions=1536,
        max_input_length=8000,
        description="OpenAI small embedding model - fast, cost-effective, good quality",
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
        """Truncate text to max input length (character-based default).

        Subclasses override for token-aware truncation when the backing API
        enforces a token budget rather than a character budget (OpenAI).
        Logs a warning when truncation fires so it's not silent.
        """
        if len(text) > self.config.max_input_length:
            logger.warning(
                f"{self.__class__.__name__}: truncating input "
                f"{len(text)} → {self.config.max_input_length} chars "
                f"(model={self.config.model_name})"
            )
            return text[: self.config.max_input_length]
        return text


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """OpenAI embedding provider.

    OpenAI embedding endpoints enforce a TOKEN limit (8192 tokens for
    text-embedding-3-*), not a character limit. Polish text averages
    ~2-3 chars/token, so a naive character-based truncation can still
    blow the token budget. Override _truncate_text to count tokens with
    tiktoken and cut there.
    """

    # OpenAI 3-* models: 8192 token context window. Leave a small headroom
    # to stay safe across tokenizer versions.
    _TOKEN_BUDGET = 8000

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI()
        self._encoding = None

    def _get_encoding(self):
        import tiktoken

        if self._encoding is None:
            try:
                self._encoding = tiktoken.encoding_for_model(self.config.model_name)
            except KeyError:
                # Newer model not yet in tiktoken registry — fall back to cl100k.
                self._encoding = tiktoken.get_encoding("cl100k_base")
        return self._encoding

    def _truncate_text(self, text: str) -> str:
        enc = self._get_encoding()
        tokens = enc.encode(text)
        if len(tokens) <= self._TOKEN_BUDGET:
            return text
        truncated = enc.decode(tokens[: self._TOKEN_BUDGET])
        logger.warning(
            f"OpenAI: token-truncating input {len(tokens)} → {self._TOKEN_BUDGET} "
            f"tokens ({len(text)} → {len(truncated)} chars, "
            f"model={self.config.model_name})"
        )
        return truncated

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
    This provider uses dense embeddings (1024d) for pgvector compatibility.
    The model outputs fixed 1024-dimensional vectors (no Matryoshka support).
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
                    f"({self.config.dimensions}d)"
                )
                self._model = BGEM3FlagModel(self.config.model_name, use_fp16=True)
            except ImportError:
                raise ImportError(
                    "FlagEmbedding is required for BGE-M3. "
                    "Install with: pip install FlagEmbedding"
                )
        return self._model

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
            # dense_vecs is a numpy array of shape (n, 1024)
            return [vec.tolist() for vec in dense]

        return await loop.run_in_executor(None, _encode)


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


# Provider factory
_PROVIDER_CLASSES = {
    EmbeddingProviderType.OPENAI: OpenAIEmbeddingProvider,
    EmbeddingProviderType.COHERE: CohereEmbeddingProvider,
    EmbeddingProviderType.HUGGINGFACE: HuggingFaceEmbeddingProvider,
    EmbeddingProviderType.LOCAL: LocalEmbeddingProvider,
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

    # Fall back to the model marked as default
    for model_id, config in AVAILABLE_MODELS.items():
        if config.is_default:
            return model_id
    return "huggingface/bge-m3"


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
