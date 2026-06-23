"""Celery task: rebuild the corpus-derived ``suggestions`` Meilisearch index.

Issue #153 — scheduled (weekly) offline job that mines phrase-level autocomplete
suggestions from the PL + EN judgment corpus and (re)populates a dedicated
Meilisearch ``suggestions`` index, atomically swapped in for zero downtime.

Sources mined (see ``app.services.suggestions_config``):
- Structured fields: keywords, legal_topics, cited_legislation, court_name,
  judges (flattened).
- Language-aware n-grams over summary / full_text.
- Popular query log from ``search_analytics``.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from loguru import logger

from app.core.supabase import supabase_client
from app.services.meilisearch_config import (
    setup_suggestions_meilisearch_index,
    transform_judgment_for_meilisearch,
)
from app.services.search import MeiliSearchService
from app.services.search_analytics import get_popular_queries
from app.services.suggestions_config import build_suggestion_documents
from app.workers import celery_app

# Columns needed to mine suggestions — a subset of the full sync payload.
_SUGGESTION_SOURCE_COLUMNS = ", ".join(
    [
        "id",
        "jurisdiction",
        "court_name",
        "judges",
        "summary",
        "full_text",
        "keywords",
        "legal_topics",
        "cited_legislation",
    ]
)


def _live_index_name() -> str:
    return os.getenv("MEILISEARCH_SUGGESTIONS_INDEX_NAME", "suggestions")


def _admin_service(index_name: str) -> MeiliSearchService:
    base_url = os.getenv("MEILISEARCH_INTERNAL_URL") or os.getenv("MEILISEARCH_URL")
    admin_key = os.getenv("MEILISEARCH_ADMIN_KEY") or os.getenv("MEILI_MASTER_KEY")
    return MeiliSearchService(
        base_url=base_url,
        api_key=admin_key,
        admin_key=admin_key,
        index_name=index_name,
    )


def _fetch_corpus_rows(batch_size: int, max_rows: int) -> list[dict[str, Any]]:
    """Page through ``judgments`` and flatten judges for suggestion mining."""
    rows: list[dict[str, Any]] = []
    offset = 0
    while len(rows) < max_rows:
        resp = (
            supabase_client.table("judgments")
            .select(_SUGGESTION_SOURCE_COLUMNS)
            .order("created_at")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for row in batch:
            # Reuse the judgments transformer purely to derive ``judges_flat``
            # from the JSONB ``judges`` column; keep the source fields intact.
            transformed = transform_judgment_for_meilisearch(row)
            row["judges_flat"] = transformed.get("judges_flat", "")
            rows.append(row)
        offset += batch_size
        if len(batch) < batch_size:
            break
    return rows[:max_rows]


async def _rebuild_suggestions_index(
    *,
    batch_size: int,
    max_rows: int,
    popular_days: int,
    popular_limit: int,
) -> dict[str, Any]:
    live_index = _live_index_name()
    staging_index = f"{live_index}_new"

    staging_svc = _admin_service(staging_index)

    if not staging_svc.admin_configured:
        logger.info("Meilisearch admin not configured — skipping suggestions rebuild")
        return {"status": "skipped", "reason": "not_configured"}
    if not supabase_client:
        logger.warning("Supabase unavailable — cannot rebuild suggestions index")
        return {"status": "skipped", "reason": "no_supabase"}

    rows = _fetch_corpus_rows(batch_size, max_rows)
    if not rows:
        logger.info("No judgments found — skipping suggestions rebuild")
        return {"status": "skipped", "reason": "empty_corpus"}

    try:
        popular = await get_popular_queries(days=popular_days, limit=popular_limit)
    except Exception:
        logger.opt(exception=True).debug(
            "Could not load popular queries — continuing without them"
        )
        popular = []

    documents = build_suggestion_documents(rows, popular_queries=popular)
    if not documents:
        logger.info("Extraction produced no suggestions — skipping rebuild")
        return {"status": "skipped", "reason": "no_suggestions"}

    # Fresh staging index → populate → atomic swap → drop stale.
    await staging_svc.delete_index()
    await setup_suggestions_meilisearch_index(staging_svc)

    upsert_resp = await staging_svc.upsert_documents(documents, primary_key="id")
    task_uid = upsert_resp.get("taskUid")
    if task_uid is not None:
        task = await staging_svc.wait_for_task(task_uid, max_wait=180.0)
        if task.get("status") != "succeeded":
            logger.error(
                f"Suggestions staging upsert task {task_uid} did not succeed: "
                f"{task.get('error')}"
            )
            return {"status": "failed", "reason": "staging_upsert"}

    swap_resp = await staging_svc.swap_indexes(live_index, staging_index)
    swap_uid = swap_resp.get("taskUid")
    if swap_uid is not None:
        swap_task = await staging_svc.wait_for_task(swap_uid, max_wait=60.0)
        if swap_task.get("status") != "succeeded":
            logger.error(
                f"Suggestions swap task {swap_uid} did not succeed: "
                f"{swap_task.get('error')}"
            )
            return {"status": "failed", "reason": "swap"}

    # Drop the stale index (now holding the previous live data).
    del_resp = await staging_svc.delete_index()
    del_uid = del_resp.get("taskUid")
    if del_uid:
        await staging_svc.wait_for_task(del_uid, max_wait=30.0)

    logger.info(
        f"Suggestions index rebuilt: {len(documents)} suggestions from "
        f"{len(rows)} judgments"
    )
    return {
        "status": "completed",
        "suggestions": len(documents),
        "judgments_scanned": len(rows),
    }


@celery_app.task(
    bind=True,
    name="suggestions.rebuild_index",
    max_retries=1,
    default_retry_delay=300,
    autoretry_for=(ConnectionError, OSError, TimeoutError),
    retry_backoff=True,
)
def rebuild_suggestions_index(
    self,
    batch_size: int = 500,
    max_rows: int = 20_000,
    popular_days: int = 30,
    popular_limit: int = 100,
) -> dict[str, Any]:
    """Mine corpus suggestions and atomically refresh the suggestions index.

    Designed to run weekly via Celery Beat. ``max_rows`` caps how many judgments
    are scanned so the job stays bounded on large corpora.
    """
    return asyncio.run(
        _rebuild_suggestions_index(
            batch_size=batch_size,
            max_rows=max_rows,
            popular_days=popular_days,
            popular_limit=popular_limit,
        )
    )
