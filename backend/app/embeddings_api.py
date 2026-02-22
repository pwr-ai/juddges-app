"""
API endpoints for managing embedding models and providers.

Provides:
- List available embedding models
- Get/set active embedding model
- Test embedding generation with a specific model
"""

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

from app.embedding_providers import (
    list_available_models,
    get_default_model_id,
    get_model_config,
    get_embedding_provider,
    set_active_model,
)

router = APIRouter(prefix="/embeddings", tags=["embeddings"])


class SetActiveModelRequest(BaseModel):
    """Request to set the active embedding model."""

    model_id: str = Field(
        description="Model ID to activate (e.g., 'openai/text-embedding-3-small')"
    )


class SetActiveModelResponse(BaseModel):
    """Response after setting active model."""

    model_id: str
    provider: str
    model_name: str
    dimensions: int
    message: str


class TestEmbeddingRequest(BaseModel):
    """Request to test embedding generation."""

    text: str = Field(
        description="Text to generate a test embedding for", max_length=2000
    )
    model_id: str | None = Field(
        default=None, description="Model to test (uses active model if not specified)"
    )


class TestEmbeddingResponse(BaseModel):
    """Response for test embedding generation."""

    model_id: str
    dimensions: int
    embedding_preview: list[float] = Field(
        description="First 10 dimensions of the embedding"
    )
    success: bool
    message: str


class EmbeddingModelsResponse(BaseModel):
    """Response listing all available embedding models."""

    models: list[dict]
    active_model_id: str


@router.get(
    "/models",
    response_model=EmbeddingModelsResponse,
    summary="List available embedding models",
)
async def list_models():
    """List all available embedding models and their configurations."""
    models = list_available_models()
    active_id = get_default_model_id()
    return EmbeddingModelsResponse(models=models, active_model_id=active_id)


@router.get("/models/active", summary="Get the currently active embedding model")
async def get_active_model():
    """Get the currently active embedding model configuration."""
    model_id = get_default_model_id()
    config = get_model_config(model_id)
    return {
        "model_id": model_id,
        "provider": config.provider.value,
        "model_name": config.model_name,
        "dimensions": config.dimensions,
        "description": config.description,
    }


@router.post(
    "/models/active",
    response_model=SetActiveModelResponse,
    summary="Set the active embedding model",
)
async def set_active_model_endpoint(request: SetActiveModelRequest):
    """Set the active embedding model for search and indexing."""
    try:
        config = set_active_model(request.model_id)
        return SetActiveModelResponse(
            model_id=request.model_id,
            provider=config.provider.value,
            model_name=config.model_name,
            dimensions=config.dimensions,
            message=f"Active embedding model set to {request.model_id}",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/test", response_model=TestEmbeddingResponse, summary="Test embedding generation"
)
async def test_embedding(request: TestEmbeddingRequest):
    """Generate a test embedding to verify model connectivity."""
    model_id = request.model_id or get_default_model_id()

    try:
        provider = get_embedding_provider(model_id)
        embedding = await provider.embed_text(request.text)

        return TestEmbeddingResponse(
            model_id=model_id,
            dimensions=len(embedding),
            embedding_preview=embedding[:10],
            success=True,
            message=f"Successfully generated {len(embedding)}-dimensional embedding",
        )
    except Exception as e:
        logger.error(f"Test embedding failed for model {model_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Embedding generation failed: {str(e)}",
        )
