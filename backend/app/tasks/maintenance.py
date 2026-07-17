"""Celery tasks for database maintenance."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

from loguru import logger

from app.workers import celery_app

if TYPE_CHECKING:
    from celery import Task


@celery_app.task(
    bind=True,
    name="maintenance.vacuum_analyze",
    max_retries=1,
    default_retry_delay=300,
)
def vacuum_analyze_judgments(self: Task) -> dict[str, Any]:
    """Run VACUUM ANALYZE on the judgments table.

    Keeps HNSW index statistics and query planner costs up to date.
    Designed to run weekly via Celery Beat.
    """
    import psycopg2

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.warning("DATABASE_URL not set — skipping VACUUM ANALYZE")
        return {"status": "skipped", "reason": "no_database_url"}

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cur = conn.cursor()
        logger.info("Running VACUUM ANALYZE on judgments table")
        cur.execute("VACUUM ANALYZE public.judgments")
        cur.close()
        conn.close()
        logger.info("VACUUM ANALYZE completed successfully")
        return {"status": "completed"}
    except Exception as exc:
        logger.error(f"VACUUM ANALYZE failed: {exc}")
        raise


@celery_app.task(
    bind=True,
    name="maintenance.roll_app_events_partitions",
    max_retries=1,
    default_retry_delay=300,
)
def roll_app_events_partitions(self: Task) -> dict[str, Any]:
    """Ensure current + next month app_events partitions exist.

    Calls the idempotent SQL function created in migration 20260717000001.
    Designed to run monthly via Celery Beat (day 25 leaves a buffer before
    month rollover; the migration itself bootstraps the first two partitions).
    """
    # psycopg (v3) — the declared driver; psycopg2 is not a project dependency.
    import psycopg

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.warning("DATABASE_URL not set — skipping app_events partition roll")
        return {"status": "skipped", "reason": "no_database_url"}

    try:
        conn = psycopg.connect(database_url)
        conn.autocommit = True
        cur = conn.cursor()
        logger.info("Rolling app_events partitions (current + next month)")
        cur.execute(
            "SELECT public.create_app_events_partition("
            "date_trunc('month', now())::date)"
        )
        cur.execute(
            "SELECT public.create_app_events_partition("
            "(date_trunc('month', now()) + interval '1 month')::date)"
        )
        cur.close()
        conn.close()
        logger.info("app_events partition roll completed")
        return {"status": "completed"}
    except Exception as exc:
        logger.error(f"app_events partition roll failed: {exc}")
        raise
