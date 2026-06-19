"""Supabase-backed storage helpers for search topic snapshots.

The ``search_topics`` table is the ground truth for topic autocomplete
snapshots. Generators persist a full run there first, then Meilisearch can be
re-built from the latest stored run without repeating topic modelling.
"""

from __future__ import annotations

import os
from typing import Any
from uuid import uuid4

SEARCH_TOPICS_TABLE = "search_topics"

# Ordered explicitly so Supabase ``select`` calls stay consistent.
SEARCH_TOPICS_COLUMNS = [
    "run_id",
    "id",
    "label_pl",
    "label_en",
    "aliases_pl",
    "aliases_en",
    "category",
    "doc_count",
    "jurisdictions",
    "generated_at",
    "corpus_snapshot",
    "source_case_type",
    "created_at",
]

SEARCH_TOPICS_SELECT = ", ".join(SEARCH_TOPICS_COLUMNS)


def _get_supabase():
    """Create a service-role Supabase client from env."""
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _normalize_topic_payload(
    topic: dict[str, Any], *, run_id: str, case_type: str
) -> dict[str, Any]:
    """Normalize a generated topic into the table schema."""
    return {
        "run_id": run_id,
        "id": topic["id"],
        "label_pl": topic["label_pl"],
        "label_en": topic["label_en"],
        "aliases_pl": topic.get("aliases_pl") or [],
        "aliases_en": topic.get("aliases_en") or [],
        "category": topic["category"],
        "doc_count": int(topic.get("doc_count", 0) or 0),
        "jurisdictions": topic.get("jurisdictions") or [],
        "generated_at": topic["generated_at"],
        "corpus_snapshot": topic.get("corpus_snapshot"),
        "source_case_type": case_type,
    }


def persist_search_topics_run(
    topics: list[dict[str, Any]],
    *,
    case_type: str,
    run_id: str | None = None,
) -> str:
    """Persist a full generated topics run to Supabase and return its run id."""
    if not topics:
        raise ValueError("topics must not be empty")

    supabase = _get_supabase()
    effective_run_id = run_id or str(uuid4())
    payload = [
        _normalize_topic_payload(topic, run_id=effective_run_id, case_type=case_type)
        for topic in topics
    ]
    supabase.table(SEARCH_TOPICS_TABLE).insert(payload).execute()
    return effective_run_id


def get_latest_search_topics_run_id() -> str | None:
    """Return the latest persisted run id, or None if the table is empty."""
    supabase = _get_supabase()
    response = (
        supabase.table(SEARCH_TOPICS_TABLE)
        .select("run_id, generated_at, created_at")
        .order("generated_at", desc=True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    return rows[0].get("run_id")


def load_search_topics_run(run_id: str | None = None) -> list[dict[str, Any]]:
    """Load all topics for one run, defaulting to the latest persisted run."""
    effective_run_id = run_id or get_latest_search_topics_run_id()
    if not effective_run_id:
        return []

    supabase = _get_supabase()
    response = (
        supabase.table(SEARCH_TOPICS_TABLE)
        .select(SEARCH_TOPICS_SELECT)
        .eq("run_id", effective_run_id)
        .order("doc_count", desc=True)
        .order("id")
        .execute()
    )
    return response.data or []


def topic_row_to_meilisearch_document(row: dict[str, Any]) -> dict[str, Any]:
    """Project a Supabase ``search_topics`` row into a Meilisearch document."""
    return {
        "id": row["id"],
        "label_pl": row["label_pl"],
        "label_en": row["label_en"],
        "aliases_pl": row.get("aliases_pl") or [],
        "aliases_en": row.get("aliases_en") or [],
        "category": row["category"],
        "doc_count": int(row.get("doc_count", 0) or 0),
        "jurisdictions": row.get("jurisdictions") or [],
        "generated_at": row.get("generated_at"),
        "corpus_snapshot": row.get("corpus_snapshot"),
    }
