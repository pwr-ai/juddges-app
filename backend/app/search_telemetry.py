"""Langfuse telemetry for search requests.

Emits one trace per /documents/search call with:
- input: the raw query (truncated, since full paragraphs are noisy)
- output: top-K document IDs + titles + hits count
- metadata: timing_breakdown + query_type + language + fallback flags

Used to answer: "what fraction of searches fall back to BM25 today?",
"what's P95 latency for conceptual queries?", "which queries got 0 hits?"

Fails silently if Langfuse is not configured — safe to call unconditionally.
"""

from __future__ import annotations

import os
from typing import Any

from loguru import logger

_langfuse_client: Any = None
_langfuse_checked = False


def _get_client() -> Any:
    global _langfuse_client, _langfuse_checked
    if _langfuse_checked:
        return _langfuse_client
    _langfuse_checked = True
    if not os.getenv("LANGFUSE_SECRET_KEY"):
        return None
    try:
        from langfuse import get_client

        _langfuse_client = get_client()
    except Exception as e:
        logger.warning(f"Langfuse telemetry disabled ({e})")
        _langfuse_client = None
    return _langfuse_client


def record_search(
    *,
    query: str,
    query_type: str | None,
    language: str | None,
    hits: int,
    chunks_preview: list[dict[str, Any]] | None,
    timing_breakdown: dict[str, Any],
    effective_alpha: float,
    alpha_was_routed: bool,
    vector_fallback: bool,
    fallback_used: bool,
    thinking_mode: bool,
    error: str | None = None,
) -> None:
    """Send a trace to Langfuse. No-op if not configured."""
    client = _get_client()
    if client is None:
        return
    try:
        tags = [f"type:{query_type or 'unknown'}"]
        if language:
            tags.append(f"lang:{language}")
        if vector_fallback:
            tags.append("vector_fallback")
        if fallback_used:
            tags.append("zero_result_fallback")
        if thinking_mode:
            tags.append("thinking")
        if hits == 0:
            tags.append("zero_hits")

        # chunks_preview is the top 5 ids/titles for quick eyeballing in UI.
        output = {
            "hits": hits,
            "top": chunks_preview or [],
        }
        if error:
            output["error"] = error

        with client.start_as_current_span(name="documents.search") as span:
            span.update(
                input={"query": query[:500], "chars": len(query)},
                output=output,
                metadata={
                    "query_type": query_type,
                    "language": language,
                    "effective_alpha": effective_alpha,
                    "alpha_was_routed": alpha_was_routed,
                    "vector_fallback": vector_fallback,
                    "fallback_used": fallback_used,
                    "thinking_mode": thinking_mode,
                    "timing_breakdown": timing_breakdown,
                },
            )
            span.update_trace(tags=tags)
    except Exception as e:  # never break search because of telemetry
        logger.warning(f"Langfuse telemetry emit failed: {e}")
