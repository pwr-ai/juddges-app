"""Embedding helpers for Meilisearch hybrid vector search.

Kept separate from ``meilisearch_config.py`` so the document transform there
stays pure / synchronous / I/O-free. Anything that talks to the TEI server
lives in this module.
"""

from __future__ import annotations

import asyncio
from typing import Any

from juddges_search.embeddings import embed_texts
from loguru import logger

EMBEDDER_NAME = "bge-m3"


def build_embed_text(row: dict[str, Any]) -> str | None:
    """Build the text to embed for a single judgment row.

    Concatenates curated, LLM-extracted fields with double-newline separators.
    The legacy ``title`` and ``summary`` columns are intentionally NOT used
    here — they are truncated ``full_text`` boilerplate (verified 2026-05-11
    against the live corpus) and produce near-duplicate vectors.

    Returns ``None`` when no curated content is available — caller should
    upsert the judgment without ``_vectors`` (it remains keyword-searchable).
    """
    keywords = row.get("base_keywords") or []
    joined_keywords = ", ".join(k for k in keywords if k and k.strip()) or None

    parts = [
        row.get("base_case_name"),
        joined_keywords,
        row.get("structure_case_identification_summary"),
        row.get("structure_facts_summary"),
        row.get("structure_operative_part_summary"),
    ]
    cleaned = [p.strip() for p in parts if isinstance(p, str) and p.strip()]
    return "\n\n".join(cleaned) if cleaned else None


def _set_opt_out(doc: dict[str, Any]) -> dict[str, Any]:
    """Mark a doc as opted out of the bge-m3 user-provided embedder.

    Required because the index registers ``bge-m3`` with ``source: userProvided``
    — Meilisearch rejects any doc that does not include a vector or an explicit
    ``_vectors.bge-m3: null`` opt-out.
    """
    doc["_vectors"] = {EMBEDDER_NAME: None}
    return doc


async def attach_embedding(doc: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    """Compute and attach a ``_vectors`` entry to a Meilisearch document.

    Mutates and returns ``doc``. When ``build_embed_text`` returns None, or
    when the TEI server fails, the doc is marked with an explicit opt-out
    (``_vectors.bge-m3: null``) so Meilisearch still accepts it for keyword
    search.
    """
    text = build_embed_text(row)
    if text is None:
        return _set_opt_out(doc)

    try:
        vec = await asyncio.to_thread(embed_texts, text)
    except Exception:
        logger.opt(exception=True).warning(
            f"TEI embedding failed for doc {doc.get('id')} — opting out of vector"
        )
        return _set_opt_out(doc)

    doc["_vectors"] = {EMBEDDER_NAME: vec}
    return doc


async def attach_embeddings_batch(
    docs: list[dict[str, Any]], rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Batch-embed every (doc, row) pair in one TEI call.

    Rows without curated text get an explicit ``_vectors.bge-m3: null`` opt-out.
    If the TEI call fails, every doc opts out (keyword search still works).
    """
    if len(docs) != len(rows):
        raise ValueError("docs and rows must have the same length")

    texts_with_index: list[tuple[int, str]] = []
    for idx, row in enumerate(rows):
        text = build_embed_text(row)
        if text is not None:
            texts_with_index.append((idx, text))

    if not texts_with_index:
        return [_set_opt_out(doc) for doc in docs]

    payload = [text for _, text in texts_with_index]
    try:
        vectors = await asyncio.to_thread(embed_texts, payload)
    except Exception:
        logger.opt(exception=True).warning(
            f"TEI batch embedding failed for {len(payload)} docs — opting all out"
        )
        return [_set_opt_out(doc) for doc in docs]

    if not isinstance(vectors, list) or len(vectors) != len(texts_with_index):
        logger.warning(
            f"TEI returned {len(vectors) if isinstance(vectors, list) else '?'} "
            f"vectors for {len(texts_with_index)} inputs — opting all out"
        )
        return [_set_opt_out(doc) for doc in docs]

    embedded_indices = {idx for idx, _ in texts_with_index}
    for (idx, _text), vec in zip(texts_with_index, vectors, strict=True):
        docs[idx]["_vectors"] = {EMBEDDER_NAME: vec}
    for idx, doc in enumerate(docs):
        if idx not in embedded_indices:
            _set_opt_out(doc)

    return docs
