"""Shared utilities: embedding generation, language detection, caching, normalization."""

import asyncio
import os
import re
from datetime import UTC, datetime
from typing import Any

from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.config import settings

JUDGMENTS_EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "1024"))

# Cache for document IDs with configurable TTL
_document_ids_cache: dict[str, Any] = {
    "ttl_seconds": settings.CACHE_TTL_SECONDS,
}
_cache_lock = asyncio.Lock()


async def generate_embedding(text: str) -> list[float]:
    """Generate embedding for text using the active embedding provider.

    Uses the configured embedding provider (OpenAI, Cohere, TEI, local)
    based on the EMBEDDING_MODEL_ID environment variable. A Redis cache
    (see app.embedding_cache) short-circuits repeat queries — search
    over a small user base has very high repeat rate.

    Args:
        text: Text to embed

    Returns:
        Embedding vector (dimensions depend on the active model)
    """
    from app import embedding_cache
    from app.embedding_providers import get_default_model_id, get_embedding_provider

    provider = get_embedding_provider()
    model_id = get_default_model_id()
    dimensions = provider.config.dimensions

    cached = await embedding_cache.get(model_id, text, dimensions)
    if cached is not None:
        return cached

    vec = await provider.embed_text(text)
    await embedding_cache.set(model_id, text, dimensions, vec)
    return vec


# Common Polish characters and words for language detection
_POLISH_CHARS = re.compile(r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]")
_POLISH_STOPWORDS = frozenset(
    {
        "i",
        "w",
        "z",
        "na",
        "do",
        "nie",
        "się",
        "jest",
        "za",
        "od",
        "że",
        "jak",
        "ale",
        "co",
        "to",
        "ten",
        "ta",
        "po",
        "dla",
        "jej",
        "jego",
        "ich",
        "tym",
        "przez",
        "tak",
        "już",
        "są",
        "tej",
        "te",
        "tego",
        "być",
        "sąd",
        "wyrok",
        "orzeczenie",
        "sprawy",
        "karny",
        "cywilny",
        "apelacyjny",
        "odpowiedzialność",
    }
)
_ENGLISH_STOPWORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "or",
        "of",
        "to",
        "for",
        "in",
        "on",
        "at",
        "by",
        "with",
        "from",
        "what",
        "when",
        "how",
        "can",
        "does",
        "do",
        "is",
        "are",
        "was",
        "were",
        "be",
    }
)


def _detect_search_language(
    query: str,
    languages: list[str] | None,
    jurisdictions: list[str] | None,
) -> str:
    """Detect appropriate PostgreSQL text search configuration.

    Priority: explicit language filter > jurisdiction filter > query content heuristic.
    Returns 'english', 'polish' (with unaccent), or 'auto' (per-document detection).
    """
    # 1. Explicit language filter
    if languages:
        if "en" in languages or "uk" in languages:
            return "english"
        if "pl" in languages:
            return "polish"

    # 2. Jurisdiction filter implies language
    if jurisdictions:
        if jurisdictions == ["UK"]:
            return "english"
        if jurisdictions == ["PL"]:
            return "polish"

    # 3. Content-based heuristic: detect Polish from characters or stopwords
    lower = query.lower()
    if _POLISH_CHARS.search(query):
        return "polish"

    query_tokens = set(re.findall(r"\w+", lower))
    polish_overlap = query_tokens & _POLISH_STOPWORDS
    if len(polish_overlap) >= 2:
        return "polish"

    # 4. Mixed or unknown → let SQL function detect per-document
    return "auto"


async def _get_cached_document_ids(only_with_coordinates: bool = False) -> list[str]:
    """Get all document IDs with caching.

    Args:
        only_with_coordinates: If True, only return documents with x,y coordinates

    Returns:
        List of document IDs
    """
    cache_key = "with_coords" if only_with_coordinates else "all"

    async with _cache_lock:
        now = datetime.now(UTC)
        if cache_key not in _document_ids_cache:
            _document_ids_cache[cache_key] = {"data": None, "timestamp": None}

        cache_entry = _document_ids_cache[cache_key]
        if cache_entry["data"] is not None and cache_entry["timestamp"] is not None:
            elapsed = (now - cache_entry["timestamp"]).total_seconds()
            if elapsed < _document_ids_cache["ttl_seconds"]:
                return cache_entry["data"]

    # Fetch from database
    db = get_vector_db()
    try:
        if only_with_coordinates:
            response = (
                db.client.table("judgments")
                .select("id, umap_x, umap_y")
                .not_.is_("umap_x", "null")
                .not_.is_("umap_y", "null")
                .limit(settings.MAX_DOCUMENT_IDS_FETCH_LIMIT)
                .execute()
            )
        else:
            response = (
                db.client.table("judgments")
                .select("id")
                .limit(settings.MAX_DOCUMENT_IDS_FETCH_LIMIT)
                .execute()
            )

        document_ids = [doc["id"] for doc in (response.data or [])]
        logger.info(
            f"Found {len(document_ids)} documents (only_with_coords={only_with_coordinates})"
        )

    except Exception as e:
        logger.error(f"Error fetching document IDs: {e}")
        document_ids = []

    # Update cache
    async with _cache_lock:
        _document_ids_cache[cache_key]["data"] = document_ids
        _document_ids_cache[cache_key]["timestamp"] = datetime.now(UTC)

    return document_ids
