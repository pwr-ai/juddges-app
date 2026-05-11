"""Embedding helpers for Meilisearch hybrid vector search.

Kept separate from ``meilisearch_config.py`` so the document transform there
stays pure / synchronous / I/O-free. Anything that talks to the TEI server
lives in this module.
"""

from __future__ import annotations

from typing import Any


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
