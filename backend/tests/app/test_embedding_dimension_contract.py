"""Guard tests: every embedding-dimension declaration shares one source of truth.

The codebase historically drifted across 768 / 1024 / 1536 dims (see #285).
BGE-M3 produces 1024-dim vectors; that is the single canonical dimension.
These unit tests fail loudly if any Python declaration diverges, so a future
embedder/model swap must update *every* site in lock-step rather than leaving
a silent mismatch that breaks cosine similarity at query time.

The matching DB-column assertion lives in
tests/integration/test_pgvector_contract.py (needs a live database).
"""

import pytest

pytestmark = pytest.mark.unit

# Canonical embedding dimension for the active embedder (BGE-M3).
CANONICAL_EMBEDDING_DIM = 1024


def test_meilisearch_embedder_dimension_is_canonical():
    from app.services.meilisearch_embeddings import EMBEDDER_DIMENSIONS

    assert EMBEDDER_DIMENSIONS == CANONICAL_EMBEDDING_DIM


def test_default_embedding_provider_dimension_is_canonical():
    from app.embedding_providers import get_default_model_id, get_model_config

    config = get_model_config(get_default_model_id())
    assert config.dimensions == CANONICAL_EMBEDDING_DIM


def test_juddges_search_embedding_dimension_is_canonical():
    from juddges_search.embeddings import EMBEDDING_DIMENSION

    assert EMBEDDING_DIMENSION == CANONICAL_EMBEDDING_DIM


def test_all_python_dimension_sources_agree():
    """A single mismatch anywhere is the bug this guard exists to catch."""
    from juddges_search.embeddings import EMBEDDING_DIMENSION

    from app.embedding_providers import get_default_model_id, get_model_config
    from app.services.meilisearch_embeddings import EMBEDDER_DIMENSIONS

    provider_dim = get_model_config(get_default_model_id()).dimensions

    dims = {
        "meilisearch.EMBEDDER_DIMENSIONS": EMBEDDER_DIMENSIONS,
        "embedding_providers.default.dimensions": provider_dim,
        "juddges_search.EMBEDDING_DIMENSION": EMBEDDING_DIMENSION,
    }
    assert len(set(dims.values())) == 1, f"embedding dimension drift: {dims}"
