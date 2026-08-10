"""Celery tasks for database maintenance."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

from loguru import logger

from app.workers import celery_app

if TYPE_CHECKING:
    from celery import Task


# A running extraction reports a heartbeat after every document, so the
# threshold has to exceed the slowest single document, not the slowest job.
# Sized for a worst case (a very long judgment against a slow model) plus margin.
#
# A false positive is survivable by design rather than by luck: one document
# slower than this gets the job reaped, and the worker's next progress write
# reasserts STARTED and clears the error message and completion stamp (see
# ``_update_job_results_in_supabase`` in app/workers.py). Raising this value
# trades faster recovery from real worker deaths for fewer such flips.
STALE_JOB_THRESHOLD_SECONDS = int(
    os.environ.get("EXTRACTION_STALE_JOB_SECONDS", 45 * 60)
)


@celery_app.task(
    bind=True,
    name="maintenance.reap_stale_extraction_jobs",
    max_retries=1,
    default_retry_delay=300,
)
def reap_stale_extraction_jobs(self: Task) -> dict[str, Any]:
    """Fail extraction jobs whose worker stopped reporting.

    Closes the gap left by the on-demand recovery in `jobs_router._try_resubmit_job`,
    which only runs when somebody polls the job. An unpolled job whose worker was
    OOM-killed used to sit at STARTED forever, showing as in-progress in the UI
    with no way to reach a terminal state.

    Deliberately terminal rather than requeueing: `task_acks_late` already
    redelivers a genuinely interrupted message, so a row still stale after the
    threshold has exhausted that path, and re-queueing here would race the
    broker's own redelivery.
    """
    from datetime import UTC, datetime, timedelta

    from app.core.supabase import supabase_client

    if not supabase_client:
        logger.warning("Supabase client unavailable — skipping stale job reap")
        return {"status": "skipped", "reason": "no_supabase_client"}

    cutoff = (
        datetime.now(UTC) - timedelta(seconds=STALE_JOB_THRESHOLD_SECONDS)
    ).isoformat()

    try:
        stale = (
            supabase_client.table("extraction_jobs")
            .select("job_id, completed_documents, total_documents, attempts")
            .eq("status", "STARTED")
            .lt("heartbeat_at", cutoff)
            .execute()
        )
        rows = stale.data or []
        if isinstance(rows, dict):
            rows = [rows]

        reaped = []
        for row in rows:
            job_id = row["job_id"]
            completed = row.get("completed_documents") or 0
            total = row.get("total_documents") or 0
            supabase_client.table("extraction_jobs").update(
                {
                    "status": "FAILURE",
                    "completed_at": datetime.now(UTC).isoformat(),
                    "error_message": (
                        f"Worker stopped reporting after {completed} of {total} "
                        f"documents (no heartbeat for over "
                        f"{STALE_JOB_THRESHOLD_SECONDS // 60} minutes, "
                        f"attempt {row.get('attempts') or 1})"
                    ),
                }
            ).eq("job_id", job_id).eq("status", "STARTED").execute()
            reaped.append(job_id)
            logger.warning(
                f"Reaped stale extraction job {job_id} "
                f"({completed}/{total} documents completed)"
            )

        if not reaped:
            logger.debug("No stale extraction jobs found")
        return {"status": "completed", "reaped": len(reaped), "job_ids": reaped}
    except Exception as exc:
        logger.error(f"Stale extraction job reap failed: {exc}")
        raise


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
