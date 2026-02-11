"""
Embedding generation using Sentence Transformers inference service.

This module provides unified embedding generation supporting:
- Sentence Transformers (multilingual, self-hosted)
- Batch processing for faster throughput
- OpenAI (fallback, if configured)
"""

import os
from typing import List, Optional
import requests
from loguru import logger


class EmbeddingService:
    """Service for generating text embeddings with batch support."""

    def __init__(self):
        """Initialize embedding service with environment configuration."""
        self.transformers_url = os.getenv("TRANSFORMERS_INFERENCE_URL", "http://localhost:8080")
        self.use_openai = os.getenv("USE_OPENAI_EMBEDDINGS", "false").lower() == "true"
        self.embedding_dim = int(os.getenv("EMBEDDING_DIMENSION", "768"))
        self.batch_size = int(os.getenv("EMBEDDING_BATCH_SIZE", "16"))

        logger.info(f"Embedding service initialized: "
                   f"transformers_url={self.transformers_url}, "
                   f"use_openai={self.use_openai}, "
                   f"dim={self.embedding_dim}, "
                   f"batch_size={self.batch_size}")

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text to embed (max ~8000 tokens)

        Returns:
            List of floats (embedding vector), or None if generation fails
        """
        embeddings = self.generate_embeddings_batch([text])
        return embeddings[0] if embeddings else None

    def generate_embeddings_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts in batch (much faster).

        Args:
            texts: List of input texts to embed

        Returns:
            List of embedding vectors (same length as input texts)
        """
        if not texts:
            return []

        # Try Sentence Transformers first (preferred)
        if not self.use_openai:
            try:
                return self._generate_transformers_batch(texts)
            except Exception as e:
                logger.warning(f"Transformers batch embedding failed: {e}")

                # If OpenAI is configured as fallback, try it
                if self.use_openai:
                    logger.info("Falling back to OpenAI embeddings")
                    return self._generate_openai_batch(texts)

                return [None] * len(texts)

        # Use OpenAI if explicitly configured
        return self._generate_openai_batch(texts)

    def _generate_transformers_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings using Sentence Transformers inference service (batch).

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors (768 dimensions each)

        Raises:
            requests.RequestException: If API call fails
        """
        # Truncate all texts
        truncated_texts = [text[:32000] for text in texts]

        url = f"{self.transformers_url}/vectors"

        # The API supports batch processing with array of texts
        payload = {
            "texts": truncated_texts  # Note: "texts" plural for batch
        }

        response = requests.post(url, json=payload, timeout=60)
        response.raise_for_status()

        data = response.json()

        # Extract vectors from batch response
        # API returns: {"vectors": [[...], [...], ...], "dim": 768}
        vectors = data.get("vectors")

        if not vectors:
            raise ValueError(f"No vectors in batch response: {data}")

        if len(vectors) != len(texts):
            raise ValueError(f"Expected {len(texts)} vectors, got {len(vectors)}")

        logger.debug(f"Generated {len(vectors)} embeddings in batch with dim={self.embedding_dim}")
        return vectors

    def _generate_openai_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings using OpenAI API (batch, fallback).

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors (1536 dimensions each), or list of None if fails
        """
        try:
            import openai

            openai_key = os.getenv("OPENAI_API_KEY")
            if not openai_key or openai_key.startswith("sk-your-"):
                logger.warning("OpenAI API key not configured")
                return [None] * len(texts)

            openai.api_key = openai_key

            # OpenAI supports batch embedding
            truncated_texts = [text[:32000] for text in texts]

            response = openai.embeddings.create(
                model="text-embedding-ada-002",
                input=truncated_texts
            )

            # Extract embeddings in order
            embeddings = [item.embedding for item in response.data]
            return embeddings

        except Exception as e:
            logger.error(f"OpenAI batch embedding generation failed: {e}")
            return [None] * len(texts)

    def health_check(self) -> bool:
        """
        Check if embedding service is healthy.

        Returns:
            True if service is available and responsive
        """
        try:
            url = f"{self.transformers_url}/.well-known/ready"
            response = requests.get(url, timeout=5)
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"Embedding service health check failed: {e}")
            return False


# Singleton instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """
    Get the shared embedding service instance.

    Returns:
        EmbeddingService singleton
    """
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
