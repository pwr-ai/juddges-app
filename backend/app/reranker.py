"""Optional cross-encoder reranking for search results.

Reranks a list of result dicts by sending (query, document_text) pairs to a
reranking API and returning the results ordered by the reranking score.

Currently supports:
  - Cohere Rerank API (rerank-v3.5) — active when COHERE_API_KEY is set

The module is designed to be extended: add a new backend by implementing the
``BaseReranker`` abstract class and registering it in ``_build_reranker()``.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any

import httpx
from loguru import logger

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank"
_COHERE_MODEL = "rerank-v3.5"
_TEXT_MAX_CHARS = 4000
_API_TIMEOUT_SECONDS = 10.0


# ---------------------------------------------------------------------------
# Document text extraction helper
# ---------------------------------------------------------------------------


def _extract_document_text(result: dict[str, Any]) -> str:
    """Return the most informative text field available in a result dict.

    Preference order: ``summary`` → ``chunk_text`` → ``title``.
    The returned string is truncated to ``_TEXT_MAX_CHARS`` characters.
    """
    text: str = (
        result.get("summary") or result.get("chunk_text") or result.get("title") or ""
    )
    return text[:_TEXT_MAX_CHARS]


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class BaseReranker(ABC):
    """Interface for reranking backends."""

    @abstractmethod
    async def rerank(
        self,
        query: str,
        results: list[dict[str, Any]],
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Return *results* reordered by relevance to *query*.

        Each returned dict must include a ``rerank_score`` key (float).
        """


# ---------------------------------------------------------------------------
# Cohere backend
# ---------------------------------------------------------------------------


class CohereReranker(BaseReranker):
    """Reranker backed by the Cohere Rerank v2 API.

    Uses a persistent ``httpx.AsyncClient`` for connection pooling across
    requests, avoiding TCP/TLS handshake overhead on each reranking call.
    """

    def __init__(self, api_key: str, model: str = _COHERE_MODEL) -> None:
        self._api_key = api_key
        self._model = model
        self._client = httpx.AsyncClient(timeout=_API_TIMEOUT_SECONDS)

    async def rerank(
        self,
        query: str,
        results: list[dict[str, Any]],
        top_k: int,
    ) -> list[dict[str, Any]]:
        documents = [_extract_document_text(r) for r in results]

        payload = {
            "model": self._model,
            "query": query,
            "documents": documents,
            "top_n": min(top_k, len(documents)),
            "return_documents": False,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        response = await self._client.post(
            _COHERE_RERANK_URL,
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()

        # Cohere v2 returns {"results": [{"index": int, "relevance_score": float}, ...]}
        ranked_items: list[dict[str, Any]] = data.get("results", [])

        reranked: list[dict[str, Any]] = []
        for item in ranked_items:
            original_index: int = item["index"]
            score: float = item["relevance_score"]
            result_copy = dict(results[original_index])
            result_copy["rerank_score"] = score
            reranked.append(result_copy)

        return reranked


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def _build_reranker() -> BaseReranker | None:
    """Return the appropriate reranker based on available environment variables.

    Returns ``None`` when no reranking backend is configured.
    """
    cohere_api_key = os.getenv("COHERE_API_KEY")
    if cohere_api_key:
        logger.debug("Cohere API key detected — using CohereReranker (rerank-v3.5)")
        return CohereReranker(api_key=cohere_api_key)

    return None


# Cached singleton — avoids rebuilding the reranker (and its httpx client)
# on every search request.
_cached_reranker: BaseReranker | None = None
_reranker_checked = False


def _get_reranker() -> BaseReranker | None:
    """Return the cached reranker instance, building it on first call."""
    global _cached_reranker, _reranker_checked
    if not _reranker_checked:
        _cached_reranker = _build_reranker()
        _reranker_checked = True
    return _cached_reranker


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def rerank_results(
    query: str,
    results: list[dict],
    top_k: int = 20,
) -> list[dict]:
    """Rerank *results* by relevance to *query* using the configured backend.

    When no reranking backend is available (``COHERE_API_KEY`` not set) the
    original list is returned unchanged and a debug message is logged.

    On any reranking failure the original list is returned unchanged so that
    search results are never lost due to a reranker outage.

    Args:
        query:   The user search query.
        results: List of result dicts, each optionally containing ``summary``,
                 ``chunk_text``, or ``title`` fields used as document text.
        top_k:   Maximum number of results to return after reranking.

    Returns:
        Results list reordered by reranking score, each dict extended with a
        ``rerank_score`` float key. When reranking is skipped, the original
        list is returned as-is (no ``rerank_score`` key is added).
    """
    if not results:
        return results

    reranker = _get_reranker()

    if reranker is None:
        logger.debug(
            "Reranking skipped: no reranking backend configured "
            "(set COHERE_API_KEY to enable Cohere reranking)"
        )
        return results

    try:
        reranked = await reranker.rerank(query=query, results=results, top_k=top_k)
        logger.info(
            "Reranking applied via {backend}: {n_in} → {n_out} results",
            backend=type(reranker).__name__,
            n_in=len(results),
            n_out=len(reranked),
        )
        return reranked
    except Exception:
        logger.exception(
            "Reranking failed — returning original results unchanged "
            "(backend: {backend})",
            backend=type(reranker).__name__,
        )
        return results
