"""Celery tasks for synchronising Supabase judgments → Meilisearch index."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from loguru import logger

from app.core.supabase import supabase_client
from app.services.meilisearch_config import (
    JUDGMENT_SYNC_COLUMNS,
    setup_meilisearch_index,
    transform_judgment_for_meilisearch,
)
from app.services.meilisearch_embeddings import attach_embedding
from app.services.search import MeiliSearchService
from app.services.sync_status import record_sync_completed, record_sync_failed
from app.workers import celery_app

if TYPE_CHECKING:
    from celery import Task


def _get_service() -> MeiliSearchService:
    return MeiliSearchService.from_env()


# ── Incremental sync ─────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    name="meilisearch.sync_judgment",
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(ConnectionError, OSError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def sync_judgment_to_meilisearch(
    self: Task, judgment_id: str, operation: str = "upsert"
) -> dict[str, Any]:
    """Sync a single judgment to Meilisearch (upsert or delete).

    Args:
        judgment_id: UUID of the judgment row.
        operation: ``"upsert"`` or ``"delete"``.
    """
    service = _get_service()
    if not service.admin_configured:
        logger.debug("Meilisearch admin not configured — skipping sync")
        return {"status": "skipped", "reason": "not_configured"}

    if operation == "delete":
        result = asyncio.run(service.delete_document(judgment_id))
        logger.info(f"Deleted judgment {judgment_id} from Meilisearch")
        return {"status": "deleted", "task": result}

    # upsert — fetch row from Supabase
    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot fetch judgment for sync")
        return {"status": "skipped", "reason": "no_supabase"}

    resp = (
        supabase_client.table("judgments")
        .select(JUDGMENT_SYNC_COLUMNS)
        .eq("id", judgment_id)
        .execute()
    )
    if not resp.data:
        logger.warning(f"Judgment {judgment_id} not found in Supabase")
        return {"status": "skipped", "reason": "not_found"}

    row = resp.data[0]
    doc = transform_judgment_for_meilisearch(row)
    doc = asyncio.run(attach_embedding(doc, row))
    result = asyncio.run(service.upsert_documents([doc]))
    logger.info(f"Upserted judgment {judgment_id} to Meilisearch")
    return {"status": "upserted", "task": result}


# ── Full sync ────────────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    name="meilisearch.full_sync",
    max_retries=1,
    default_retry_delay=120,
    autoretry_for=(ConnectionError, OSError, TimeoutError),
    retry_backoff=True,
)
def full_sync_judgments_to_meilisearch(
    self: Task, batch_size: int = 500
) -> dict[str, Any]:
    """Paginated full sync of all judgments from Supabase → Meilisearch.

    This is designed to run periodically as a Celery Beat task (every 6 hours)
    as a catch-up fallback for any missed incremental syncs.
    """
    service = _get_service()
    if not service.admin_configured:
        logger.info("Meilisearch admin not configured — skipping full sync")
        return {"status": "skipped", "reason": "not_configured"}

    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot run full sync")
        return {"status": "skipped", "reason": "no_supabase"}

    total_synced = 0
    offset = 0

    try:
        while True:
            resp = (
                supabase_client.table("judgments")
                .select(JUDGMENT_SYNC_COLUMNS)
                .order("created_at")
                .range(offset, offset + batch_size - 1)
                .execute()
            )

            rows = resp.data or []
            if not rows:
                break

            documents = [transform_judgment_for_meilisearch(row) for row in rows]
            documents = [
                asyncio.run(attach_embedding(doc, row))
                for doc, row in zip(documents, rows, strict=True)
            ]
            result = asyncio.run(service.upsert_documents(documents))

            # Wait for the indexing task to finish before moving on
            task_uid = result.get("taskUid")
            if task_uid is not None:
                asyncio.run(service.wait_for_task(task_uid, max_wait=120.0))

            total_synced += len(documents)
            offset += batch_size

            self.update_state(
                state="PROGRESS",
                meta={"synced": total_synced, "current_batch": len(documents)},
            )

            logger.info(
                f"Meilisearch full sync: {total_synced} documents synced so far"
            )
    except Exception as exc:
        record_sync_failed(str(exc))
        raise

    record_sync_completed(total_synced)
    logger.info(f"Meilisearch full sync complete: {total_synced} documents total")
    return {"status": "completed", "total_synced": total_synced}


# ── Index setup task ─────────────────────────────────────────────────────────


@celery_app.task(name="meilisearch.setup_index")
def setup_meilisearch_index_task() -> dict[str, Any]:
    """One-shot task to create and configure the Meilisearch index."""
    service = _get_service()
    success = asyncio.run(setup_meilisearch_index(service))
    return {"status": "completed" if success else "skipped"}
