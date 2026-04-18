"""Shared embedding client for juddges_search retrieval paths.

Delegates to the same BGE-M3 TEI (Text Embeddings Inference) server as
backend/app/embedding_providers.py so that query embeddings share the
vector space of already-ingested documents in Supabase.

Historically this module loaded `sdadas/mmlw-roberta-large` locally via
SentenceTransformer. That produced embeddings in a DIFFERENT vector
space than the ingested BGE-M3 corpus, silently breaking cosine
similarity. Anything calling `embed_texts` now hits the same TEI host
as the main backend.

Configuration:
    TEI_EMBEDDING_URL       — primary TEI URL (e.g. https://embeddings.lab...)
    TRANSFORMERS_INFERENCE_URL — legacy fallback (deprecated)
    TEI_VERIFY_SSL          — default "true"; "false" for self-signed dev
    TEI_TIMEOUT_SECONDS     — per-request timeout, default 10
    EMBEDDING_DIMENSION     — expected dim, default 1024 (BGE-M3)
"""

from __future__ import annotations

import os
from functools import lru_cache

import httpx
from loguru import logger


class VectorName:
    """Available vector names for semantic search.

    These vector names are used to specify which vector embedding to use for semantic search:
    - BASE: Default vector for general search
    - DEV: Vector for development/testing
    - FAST: Optimized vector for speed over accuracy
    """

    BASE = "base"
    DEV = "dev"
    FAST = "fast"


EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "1024"))


def _tei_url() -> str:
    url = (os.getenv("TEI_EMBEDDING_URL") or os.getenv("TRANSFORMERS_INFERENCE_URL") or "").rstrip("/")
    if not url:
        raise RuntimeError(
            "TEI_EMBEDDING_URL (or legacy TRANSFORMERS_INFERENCE_URL) must be "
            "set for juddges_search.embeddings.embed_texts to work"
        )
    return url


def _verify_ssl() -> bool:
    return os.getenv("TEI_VERIFY_SSL", "true").lower() not in ("false", "0", "no")


def _timeout() -> float:
    return float(os.getenv("TEI_TIMEOUT_SECONDS", "10"))


@lru_cache(maxsize=1)
def _client() -> httpx.Client:
    url = _tei_url()
    logger.info(
        f"juddges_search.embeddings: TEI client configured {url} (verify_ssl={_verify_ssl()}, model={EMBEDDING_MODEL})"
    )
    return httpx.Client(base_url=url, timeout=_timeout(), verify=_verify_ssl())


def embed_texts(docs: str | list[str]) -> list[float] | list[list[float]]:
    """Embed text(s) via the shared TEI BGE-M3 server.

    Args:
        docs: single text or list of texts.

    Returns:
        For a single str: a 1024-dim list[float].
        For a list: list[list[float]] in input order.
    """
    client = _client()
    is_single = isinstance(docs, str)
    payload = {"inputs": docs if is_single else list(docs)}
    resp = client.post("/embed", json=payload)
    resp.raise_for_status()
    data = resp.json()
    # TEI returns [[...]] for both single and batch; normalize defensively.
    if data and isinstance(data[0], float):
        data = [data]
    for row in data:
        if len(row) != EMBEDDING_DIMENSION:
            raise ValueError(f"TEI returned dim={len(row)}, expected {EMBEDDING_DIMENSION} (model={EMBEDDING_MODEL})")
    return data[0] if is_single else data


# Kept for backward compatibility — some call sites want the "model".
# Returns a no-op sentinel; callers should only use embed_texts().
def get_embedding_model():
    """Deprecated shim. Callers should use embed_texts() directly."""
    logger.warning("get_embedding_model() is deprecated; juddges_search now uses a remote TEI server. Returning None.")
    return None
