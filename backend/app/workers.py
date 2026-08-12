import asyncio
import os
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import openai
from celery import Celery, Task
from celery.exceptions import Retry
from celery.schedules import crontab
from dotenv import load_dotenv
from juddges_search.info_extraction.extractor import InformationExtractor
from juddges_search.info_extraction.oai_schema_validation import (
    OaiSchemaValidationError,
)
from juddges_search.info_extraction.schema_utils import (
    SchemaProcessingError,
    prepare_schema_from_db,
)
from juddges_search.llms import get_llm
from loguru import logger

from app.core.supabase import supabase_client
from app.models import (
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    DocumentProcessingStatus,
)
from app.schemas_pkg import _fetch_schema_from_db
from app.utils.judgment_fetcher import get_documents_by_id

load_dotenv()
# Safe defaults so `import app.workers` succeeds in environments without Celery
# config (CI test collection, schema/type tooling). Real workers/beat set these
# explicitly; production compose files pass them through.
BROKER_URL = os.environ.get("CELERY_BROKER_URL", "memory://")
BACKEND_URL = os.environ.get("CELERY_BACKEND_URL", "cache+memory://")
PROJECT_NAME = os.environ.get("CELERY_PROJECT_NAME", "juddges")
LLM_BASE_URL = os.getenv("LLM_BASE_URL")

celery_app = Celery(PROJECT_NAME, broker=BROKER_URL, backend=BACKEND_URL)

# Initialize Sentry in the worker/beat processes too (not just the FastAPI
# server). With CeleryIntegration this captures exceptions raised inside tasks.
# No-op when SENTRY_DSN is unset, so dev/CI/test collection is unaffected.
from app.sentry import init_sentry  # noqa: E402

init_sentry()

# Explicitly register task modules so the worker knows about them.
# NOTE: autodiscover_tasks(["app.tasks"]) only finds ``app.tasks.tasks``
# (a file named tasks.py), not arbitrarily named modules like
# ``meilisearch_sync.py``.  Using conf.imports is explicit and avoids the
# circular-import hazard (meilisearch_sync imports celery_app from here).
celery_app.conf.imports = [
    "app.tasks.meilisearch_sync",
    "app.tasks.suggestions_index",
    "app.tasks.reasoning_line_pipeline",
    "app.tasks.digest_notifications",
    "app.tasks.maintenance",
    "app.tasks.ingestion",
]

# Celery Beat schedule — periodic background jobs
celery_app.conf.beat_schedule = {
    "meilisearch-full-sync-every-8h": {
        "task": "meilisearch.full_sync",
        "schedule": 8 * 60 * 60,  # every 8 hours (was 6h — eased cadence)
        # Drop a queued run if it hasn't started within the cadence window, so a
        # slow run can never let beat pile up overlapping syncs.
        "options": {"expires": 8 * 60 * 60},
    },
    "reasoning-lines-auto-assign-weekly": {
        "task": "reasoning_lines.auto_assign",
        "schedule": 7 * 24 * 60 * 60,  # every 7 days
    },
    "reasoning-lines-auto-discover-weekly": {
        "task": "reasoning_lines.auto_discover",
        "schedule": 7 * 24 * 60 * 60,  # every 7 days
        "options": {"countdown": 3600},  # offset by 1 hour from auto_assign
    },
    "reasoning-lines-detect-events-weekly": {
        "task": "reasoning_lines.detect_events",
        "schedule": 7 * 24 * 60 * 60,  # every 7 days
        "options": {"countdown": 7200},  # offset by 2 hours
    },
    "daily-digest-7am": {
        "task": "digest.send",
        "schedule": crontab(hour=7, minute=0),
        "kwargs": {"frequency": "daily"},
    },
    "weekly-digest-monday-8am": {
        "task": "digest.send",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),
        "kwargs": {"frequency": "weekly"},
    },
    # Stale extraction job reaper (#437). Runs often because the cost is one
    # indexed query and the symptom it clears — a job stuck at STARTED with a
    # dead worker — is visible to the user in the jobs list.
    "reap-stale-extraction-jobs-every-5min": {
        "task": "maintenance.reap_stale_extraction_jobs",
        "schedule": 5 * 60,
        # Never let these pile up: a skipped run is fully covered by the next.
        "options": {"expires": 5 * 60},
    },
    # Precomputed dashboard statistics (#467). Daily is ample: ingestion is the
    # only writer that moves these numbers, and the incremental ingestion beat
    # is opt-in via INGESTION_BEAT_ENABLED. Runs before the 7am digest so the
    # figures a reader sees are the freshly computed ones. `expires` matches the
    # cadence so a skipped run is covered by the next rather than piling up.
    "refresh-dashboard-stats-daily": {
        "task": "maintenance.refresh_dashboard_stats",
        "schedule": crontab(hour=5, minute=0),
        "options": {"expires": 24 * 60 * 60},
    },
    "vacuum-analyze-judgments-weekly": {
        "task": "maintenance.vacuum_analyze",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),
    },
    # app_events monthly partition roll-forward — day 25 leaves a 5+ day
    # buffer before rollover; 3:30 avoids the Sunday 3:00 vacuum job.
    "app-events-roll-partitions-monthly": {
        "task": "maintenance.roll_app_events_partitions",
        "schedule": crontab(hour=3, minute=30, day_of_month=25),
    },
    # Corpus-derived autocomplete suggestions (issue #153) — weekly rebuild,
    # offset to a low-traffic window away from the other Sunday jobs.
    "suggestions-rebuild-weekly": {
        "task": "suggestions.rebuild_index",
        "schedule": crontab(hour=4, minute=30, day_of_week=0),
    },
}

# Optional periodic incremental ingestion (#104). Disabled by default to avoid
# unexpected recurring HuggingFace downloads in production; opt in by setting
# INGESTION_BEAT_ENABLED=true and (optionally) INGESTION_BEAT_POLISH /
# INGESTION_BEAT_UK sample sizes. Idempotent thanks to upsert-on-conflict.
if os.environ.get("INGESTION_BEAT_ENABLED", "false").lower() == "true":
    celery_app.conf.beat_schedule["ingestion-incremental-daily"] = {
        "task": "ingestion.ingest_judgments",
        "schedule": crontab(hour=2, minute=0),
        "kwargs": {
            "polish": int(os.environ.get("INGESTION_BEAT_POLISH", "0")),
            "uk": int(os.environ.get("INGESTION_BEAT_UK", "0")),
        },
    }

celery_app.conf.timezone = "UTC"

# ---------------------------------------------------------------------------
# Reliability configuration (#437)
#
# Extraction runs for minutes, so every Celery default tuned for sub-second
# tasks is wrong here. The four settings below are load-bearing:
#
# * task_acks_late — Celery acks a message when the worker *reserves* it, not
#   when the task finishes. A worker restart or OOM 12 minutes into an
#   extraction therefore loses the message permanently. Acking late means an
#   interrupted task is redelivered instead of vanishing.
# * task_reject_on_worker_lost — without it, a hard-killed child (SIGKILL,
#   OOM) still marks the message as handled despite acks_late.
# * worker_prefetch_multiplier=1 — the default 4 makes one worker reserve
#   4 x concurrency messages into a local buffer that other workers cannot
#   see. With multi-minute tasks that is head-of-line blocking.
# * visibility_timeout — the Redis transport redelivers any un-acked message
#   after this window. It MUST exceed the hard time limit, otherwise a task
#   that is still legitimately running gets handed to a second worker and
#   runs twice. Derived from the time limit for exactly that reason.
_TASK_HARD_TIME_LIMIT = int(os.environ.get("CELERY_TASK_TIME_LIMIT", 3 * 60 * 60))
_TASK_SOFT_TIME_LIMIT = int(
    os.environ.get("CELERY_TASK_SOFT_TIME_LIMIT", max(_TASK_HARD_TIME_LIMIT - 300, 60))
)
# One hard-limit of headroom above the hard limit: a task cannot outlive its
# own time limit, so redelivery can only ever mean the worker really died.
_BROKER_VISIBILITY_TIMEOUT = _TASK_HARD_TIME_LIMIT * 2

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_time_limit=_TASK_HARD_TIME_LIMIT,
    task_soft_time_limit=_TASK_SOFT_TIME_LIMIT,
    # Recycle prefork children periodically — the LLM/HTTP client stack leaks
    # slowly over long-lived processes and a leak here means an OOM mid-job.
    worker_max_tasks_per_child=int(
        os.environ.get("CELERY_WORKER_MAX_TASKS_PER_CHILD", 100)
    ),
    broker_transport_options={"visibility_timeout": _BROKER_VISIBILITY_TIMEOUT},
    result_backend_transport_options={"visibility_timeout": _BROKER_VISIBILITY_TIMEOUT},
    # Results are also mirrored into ``extraction_jobs``; keep the Redis copy
    # long enough for polling clients but not indefinitely.
    result_expires=int(os.environ.get("CELERY_RESULT_EXPIRES", 7 * 24 * 60 * 60)),
    # The revoked-task set lives in memory unless persisted. With acks_late a
    # revoked-and-terminated task would otherwise be redelivered — and rerun —
    # after a worker restart.
    # Compose points this at a named volume so it also survives a container
    # recreate; the temp-dir default only has to survive a process restart.
    worker_state_db=os.environ.get(
        "CELERY_WORKER_STATE_DB",
        str(Path(tempfile.gettempdir()) / "celery-worker-state"),
    ),
    broker_connection_retry_on_startup=True,
    task_default_queue="celery",
    # Long LLM work must not share a queue with the periodic maintenance jobs;
    # one 20-minute extraction batch would otherwise delay the daily digest and
    # the weekly VACUUM behind it.
    task_routes={
        "app.workers.extract_information_from_documents_task": {"queue": "extraction"},
        "ingestion.*": {"queue": "extraction"},
        "reasoning_lines.*": {"queue": "extraction"},
        "digest.*": {"queue": "maintenance"},
        "maintenance.*": {"queue": "maintenance"},
        "meilisearch.*": {"queue": "maintenance"},
        "suggestions.*": {"queue": "maintenance"},
    },
)


def _update_job_results_in_supabase(
    job_id: str,
    results: list[dict[str, Any]],
    completed_documents: int,
    status: str = "STARTED",
    error_message: str | None = None,
) -> bool:
    """
    Update extraction job results in Supabase incrementally during processing.

    This ensures results are persisted even if Celery task data expires before
    the job status is queried.

    Args:
        job_id: The Celery task ID / job ID
        results: List of document extraction results
        completed_documents: Count of completed documents
        status: Job status (STARTED, SUCCESS, FAILURE)

    Returns:
        True if update succeeded, False otherwise
    """
    if not supabase_client:
        logger.debug(
            f"Supabase client not available, skipping results update for job {job_id}"
        )
        return False

    try:
        now = datetime.now(UTC).isoformat()
        update_data = {
            "results": results,
            "completed_documents": completed_documents,
            "status": status,
            "updated_at": now,
            # Written only here, by the running task. `updated_at` is also
            # touched by the BFF on every status poll, so it cannot distinguish
            # a live worker from a dead job someone is watching.
            "heartbeat_at": now,
        }
        # Stamping completed_at is what takes the row out of the reaper's scan;
        # a terminal row with no completion time reads as still running.
        if status in ("SUCCESS", "FAILURE"):
            update_data["completed_at"] = now
        if error_message:
            update_data["error_message"] = error_message
        elif status == "STARTED":
            # A single document slower than the reaper's threshold gets the job
            # marked FAILURE while the worker is in fact still alive. This write
            # is the worker reasserting itself, so it must also clear the reaper's
            # message and completion stamp — otherwise the row reads as running
            # while still carrying "worker stopped reporting", and a client that
            # polled during the window saw a failure that then un-failed.
            update_data["error_message"] = None
            update_data["completed_at"] = None

        result = (
            supabase_client.table("extraction_jobs")
            .update(update_data)
            .eq("job_id", job_id)
            .execute()
        )

        if result.data and len(result.data) > 0:
            logger.debug(
                f"Updated Supabase results for job {job_id}: {completed_documents} docs processed"
            )
            return True
        logger.warning(
            f"No rows updated in Supabase for job {job_id} - job might not exist"
        )
        return False

    except Exception as e:
        logger.error(f"Failed to update Supabase results for job {job_id}: {e}")
        return False


def _claim_job(job_id: str, total_documents: int) -> None:
    """Mark the job as owned by this worker run.

    Bumping ``attempts`` is what makes redelivery visible. With
    ``task_acks_late`` an interrupted job legitimately comes back, but a job on
    its fourth attempt is a job stuck in a crash loop, and nothing else in the
    system records that.
    """
    if not supabase_client:
        return
    try:
        current = (
            supabase_client.table("extraction_jobs")
            .select("attempts")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        rows = current.data or []
        if isinstance(rows, dict):
            rows = [rows]
        # Read-modify-write is safe here: only the worker holding this task id
        # writes the column, and a concurrent writer would mean the duplicate
        # execution this counter exists to surface.
        attempts = (rows[0].get("attempts") or 0) + 1 if rows else 1
        now = datetime.now(UTC).isoformat()
        supabase_client.table("extraction_jobs").update(
            {
                "status": "STARTED",
                "started_at": now,
                "heartbeat_at": now,
                "attempts": attempts,
                "total_documents": total_documents,
            }
        ).eq("job_id", job_id).execute()
        if attempts > 1:
            logger.warning(
                f"Job {job_id} is starting attempt {attempts} — the previous "
                f"run did not finish"
            )
    except Exception as claim_error:
        # Never fail the job over bookkeeping; the extraction itself is the
        # valuable part and the reaper can still resolve an unclaimed row.
        logger.error(f"Failed to claim job {job_id}: {claim_error}")


def _cancellation_requested(job_id: str) -> bool:
    """Check whether the owner asked for this job to stop.

    Polled between documents rather than enforced by SIGTERM: killing the child
    mid-document loses the in-flight document and, under ``task_acks_late``,
    causes the whole job to be redelivered and restarted.
    """
    if not supabase_client:
        return False
    try:
        response = (
            supabase_client.table("extraction_jobs")
            .select("cancel_requested_at")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if isinstance(rows, dict):
            rows = [rows]
        return bool(rows and rows[0].get("cancel_requested_at"))
    except Exception as check_error:
        # Treat an unreadable flag as "not cancelled" — aborting a long job on a
        # transient database blip would be the worse failure.
        logger.warning(f"Cancellation check failed for job {job_id}: {check_error}")
        return False


def _build_celery_failure_metadata(
    exception: BaseException | None = None, **extra_meta: Any
) -> dict[str, Any]:
    """
    Build a dictionary capturing failure metadata suitable for job/task status reporting.

    Args:
        exception: An optional exception object. If provided, its type and message are recorded in the metadata.
        **extra_meta: Arbitrary additional metadata key-value pairs.

    Returns:
        Dictionary containing:
            - "exc_type" and "exc_message" if exception is given,
            - all key-value pairs from extra_meta.

    Example:
        >>> _build_celery_failure_metadata(ValueError("bad"), code="ERR", status=500)
        {'exc_type': 'ValueError', 'exc_message': 'bad', 'code': 'ERR', 'status': 500}
    """
    meta: dict[str, Any] = {}
    if exception is not None:
        meta["exc_type"] = type(exception).__name__
        meta["exc_message"] = str(exception)
    meta.update(extra_meta)
    return meta


def _calculate_task_timing_metrics(
    job_start_time: float,
    completed_documents: int,
    total_documents: int,
) -> dict[str, Any]:
    """
    Calculate timing metrics for a task in progress.

    Args:
        job_start_time: Unix timestamp when the job started
        completed_documents: Number of documents processed so far
        total_documents: Total number of documents to process

    Returns:
        Dictionary containing:
            - elapsed_time: Seconds elapsed since job start
            - avg_time_per_doc: Average time per document in seconds
            - remaining_documents: Number of documents left to process
            - estimated_time_remaining: Estimated seconds until completion

    Example:
        >>> _calculate_task_timing_metrics(time.time() - 100, 5, 10)
        {'elapsed_time': 100, 'avg_time_per_doc': 20.0, 'remaining_documents': 5, 'estimated_time_remaining': 100.0}
    """
    elapsed_time = time.time() - job_start_time
    avg_time_per_doc = (
        elapsed_time / completed_documents if completed_documents > 0 else 0
    )
    remaining_documents = total_documents - completed_documents
    estimated_time_remaining = avg_time_per_doc * remaining_documents

    return {
        "elapsed_time": elapsed_time,
        "avg_time_per_doc": avg_time_per_doc,
        "remaining_documents": remaining_documents,
        "estimated_time_remaining": estimated_time_remaining,
    }


@celery_app.task(
    bind=True,
    pydantic=True,
    track_started=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(
        # TCP / OS-level transient failures
        ConnectionError,
        OSError,
        TimeoutError,
        # OpenAI HTTP-level transient failures.
        # RateLimitError (429) and APIConnectionError / APITimeoutError cover
        # network and quota bursts; InternalServerError covers 5xx responses.
        # Broad APIStatusError is intentionally excluded: it also matches 4xx
        # permanent errors (400/401/403) that should NOT be retried.
        openai.RateLimitError,
        openai.APIConnectionError,
        openai.APITimeoutError,
        openai.InternalServerError,
    ),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def extract_information_from_documents_task(
    self: Task,
    request: DocumentExtractionRequest,
) -> list[DocumentExtractionResponse]:
    """
    Extract information from documents using InformationExtractor with schemas from Supabase.

    This is the recommended function that uses InformationExtractor with prepared schemas
    from Supabase database. The schema should be provided as a dict with 'name', 'description',
    and 'text' fields (as returned by GET /schemas/db/{schema_id}).

    Error handling:
    - Connection errors (ConnectionError, OSError, TimeoutError): Automatically retried by Celery
      up to 3 times (4 attempts total) with exponential backoff (60s base, 300s max)
    - OpenAI transient HTTP errors (RateLimitError/429, APIConnectionError, APITimeoutError,
      InternalServerError/5xx): Automatically retried by the same Celery autoretry_for policy.
      Broad APIStatusError is excluded to avoid retrying permanent 4xx client errors
      (e.g. invalid model name → 400, bad API key → 401).
    - Schema/validation errors: Not retried, fail immediately
    - Other errors: Mark all documents as failed and return failed results

    Retry strategy:
    - Uses Celery's autoretry_for to handle most connection and OpenAI transient errors automatically
    - Database errors from Supabase are retried with connection error strategy

    Two-layer transient-error handling (#169):
    - PRIMARY (per document): the InformationExtractor's per-LLM-call tenacity retry
      now covers RateLimitError (429), InternalServerError (5xx), APITimeoutError and
      APIConnectionError (in addition to TCP-level errors) with exponential backoff.
      So a single transient 429/5xx during one document's extraction is retried at the
      call level and does NOT immediately fail the document.
    - OUTER SAFETY NET (whole task): autoretry_for below also lists the OpenAI transient
      classes. Because the per-document try/except converts a *terminal* per-doc failure
      into a FAILED result (partial-completion design), task-level autoretry only fires
      for transient OpenAI errors raised *outside* the per-document loop — e.g. during LLM
      initialisation (get_llm) or document fetching (get_documents_by_id). This is
      intentional: re-running the whole task would reprocess already-succeeded documents.

    Args:
        request: DocumentExtractionRequest with user_schema containing full schema dict from Supabase
                 (must have 'name', 'description', 'text' fields)

    Returns:
        List of DocumentExtractionResponse objects with extracted data
    """
    # Create a single event loop for the entire task to avoid the overhead and
    # potential RuntimeError of calling asyncio.run() multiple times (once per
    # document).  We use loop.run_until_complete() for each async call and close
    # the loop in a finally block.
    loop = asyncio.new_event_loop()
    try:
        # Track job start time
        job_start_time = time.time()
        started_at = datetime.now(UTC)

        # Update state with timing metadata
        self.update_state(
            state=DocumentProcessingStatus.PROCESSING.value,
            meta={
                "started_at": started_at.isoformat(),
                "total_documents": len(request.document_ids),
                "completed_documents": 0,
            },
        )

        # Claim the job before any slow work (LLM init, document fetch) so a run
        # that dies during setup still leaves a heartbeat for the reaper.
        _claim_job(self.request.id, total_documents=len(request.document_ids))

        # Initialize LLM - this may fail if LLM service is unavailable
        llm_name = request.llm_name
        logger.info(
            f"Initializing LLM for extraction: model={llm_name}, base_url={LLM_BASE_URL}, kwargs={request.llm_kwargs}"
        )
        llm = get_llm(
            name=llm_name,
            base_url=LLM_BASE_URL,
            **request.llm_kwargs,
        )
        api_base = getattr(llm, "openai_api_base", "not set")
        logger.info(f"LLM initialized: model={llm.model_name}, api_base={api_base}")

        # Get documents - this may fail if Supabase is unavailable
        documents = loop.run_until_complete(get_documents_by_id(request.document_ids))

        # Schema must be provided as dict from Supabase (with 'name', 'description', 'text' fields)
        # If not provided, fetch it from the database
        user_schema = request.user_schema
        if user_schema is None:
            schema_id = request.schema_id
            if not schema_id:
                raise ValueError(
                    "Either user_schema or schema_id must be provided. "
                    "If schema_id is provided, it will be fetched from the database."
                )

            try:
                user_schema = _fetch_schema_from_db(schema_id, client=supabase_client)
                logger.info(f"Fetched schema {schema_id} from database")
            except Exception as e:
                logger.error(
                    f"Failed to fetch schema from database: {e}", exc_info=True
                )
                raise ValueError(f"Failed to fetch schema from database: {e!s}")

        logger.info(
            f"Preparing schema from database format, schema type: {type(user_schema)}"
        )
        try:
            # Get language from request, default to Polish
            language = request.language or "pl"
            # Prepare schema using schema_utils
            prepared_schema = prepare_schema_from_db(
                user_schema, language=language, strict=True
            )
            logger.info("Schema prepared successfully")

            # Create extractor with prepared schema
            extractor = InformationExtractor(
                model=llm,
                prompt_name=request.prompt_id,
                schema=prepared_schema,
            )
            logger.info("InformationExtractor created successfully")
        except (
            SchemaProcessingError,
            OaiSchemaValidationError,
            ValueError,
            KeyError,
            TypeError,
        ) as e:
            error_type = type(e).__name__
            error_msg = str(e)
            logger.error(
                f"Failed to prepare schema or create InformationExtractor: {error_type}: {error_msg}",
                exc_info=True,
            )
            # Ensure exception message includes error type for Celery serialization
            if error_type not in error_msg:
                # Create new exception with type in message
                raise type(e)(f"{error_type}: {error_msg}") from e
            raise

        results: list[DocumentExtractionResponse] = []
        total_documents = len(documents)

        for idx, doc in enumerate(documents):
            # Extract information - this may fail if LLM service is unavailable
            # The extractor has its own retry logic, but we catch connection errors here too
            # Select language-specific extraction instructions based on request language
            language = request.language or "pl"

            # Load additional instructions from YAML config files
            base_instructions = InformationExtractor.get_additional_instructions(
                language=language
            )

            # Combine base instructions with any existing additional_instructions
            combined_instructions = base_instructions
            if request.additional_instructions:
                combined_instructions = (
                    f"{base_instructions}\n\n{request.additional_instructions}"
                )

            try:
                extracted_data = loop.run_until_complete(
                    extractor.extract_information_with_structured_output(
                        {
                            "extraction_context": request.extraction_context,
                            "additional_instructions": combined_instructions,
                            "language": request.language,
                            "full_text": doc.full_text,
                        }
                    )
                )

                results.append(
                    DocumentExtractionResponse(
                        collection_id=request.collection_id,
                        document_id=doc.document_id,
                        status=DocumentProcessingStatus.COMPLETED,
                        created_at=datetime.now(UTC).isoformat(),
                        updated_at=datetime.now(UTC).isoformat(),
                        started_at=datetime.now(UTC).isoformat(),
                        completed_at=datetime.now(UTC).isoformat(),
                        error_message=None,
                        extracted_data=extracted_data,
                    ).model_dump(mode="json")
                )
            except Exception as doc_error:
                # Individual document failed - mark it as failed but continue with other documents
                logger.error(
                    f"Error extracting from document {doc.document_id}: {doc_error}",
                    exc_info=True,
                )
                results.append(
                    DocumentExtractionResponse(
                        collection_id=request.collection_id,
                        document_id=doc.document_id,
                        status=DocumentProcessingStatus.FAILED,
                        created_at=datetime.now(UTC).isoformat(),
                        updated_at=datetime.now(UTC).isoformat(),
                        started_at=datetime.now(UTC).isoformat(),
                        completed_at=datetime.now(UTC).isoformat(),
                        error_message=str(doc_error),
                        extracted_data=None,
                    ).model_dump(mode="json")
                )

            # Update progress with timing information
            completed_documents = idx + 1
            timing_metrics = _calculate_task_timing_metrics(
                job_start_time=job_start_time,
                completed_documents=completed_documents,
                total_documents=total_documents,
            )

            # Update task state with progress and timing
            self.update_state(
                state=DocumentProcessingStatus.PROCESSING.value,
                meta={
                    "started_at": started_at.isoformat(),
                    "total_documents": total_documents,
                    "completed_documents": completed_documents,
                    "elapsed_time_seconds": int(timing_metrics["elapsed_time"]),
                    "estimated_time_remaining_seconds": int(
                        timing_metrics["estimated_time_remaining"]
                    ),
                    "avg_time_per_document_seconds": round(
                        timing_metrics["avg_time_per_doc"], 2
                    ),
                },
            )

            # Save results to Supabase after every document
            # This ensures results are persisted even if Celery task data expires or worker crashes
            _update_job_results_in_supabase(
                job_id=self.request.id,
                results=results,
                completed_documents=completed_documents,
                status="STARTED",
            )

            # Cooperative cancellation point. Checked after the write above so
            # everything extracted so far is already durable, and only between
            # documents so no document is abandoned half-processed.
            if completed_documents < total_documents and _cancellation_requested(
                self.request.id
            ):
                logger.info(
                    f"Job {self.request.id} cancelled by owner after "
                    f"{completed_documents}/{total_documents} documents"
                )
                _update_job_results_in_supabase(
                    job_id=self.request.id,
                    results=results,
                    completed_documents=completed_documents,
                    status="FAILURE",
                    error_message=(
                        f"Cancelled by user after {completed_documents} of "
                        f"{total_documents} documents"
                    ),
                )
                return results

        # Check results and update task state accordingly
        # NOTE: Do NOT call update_state() with final states (SUCCESS, FAILURE, etc.) before returning!
        # When we call update_state() and then return a value, Celery's Redis backend may store
        # the metadata from update_state() instead of the actual return value when fetching with .get().
        # Let Celery automatically handle the final state based on the return value.
        # The results list contains all the document statuses, which can be used by the extraction
        # endpoint to determine the overall job status (COMPLETED, PARTIALLY_COMPLETED, FAILED).

        # Final update to Supabase with all results and SUCCESS status
        _update_job_results_in_supabase(
            job_id=self.request.id,
            results=results,
            completed_documents=len(results),
            status="SUCCESS",
        )

        return results

    except Retry:
        # Re-raise retry exceptions to let Celery handle them
        raise
    except (
        ConnectionError,
        OSError,
        TimeoutError,
        openai.RateLimitError,
        openai.APIConnectionError,
        openai.APITimeoutError,
        openai.InternalServerError,
    ) as e:
        # These are all configured in autoretry_for above; this branch just adds
        # structured logging before Celery's autoretry machinery re-raises.
        logger.warning(
            f"Retryable transient error (attempt {self.request.retries + 1}/{self.max_retries + 1}): {type(e).__name__}: {e}"
        )
        raise  # Let Celery's autoretry_for handle it
    except Exception as e:
        # For non-retryable errors, fail all documents
        error_type = type(e).__name__
        error_msg = str(e)
        # Ensure error message includes type for Celery serialization
        full_error_msg = (
            f"{error_type}: {error_msg}" if error_type not in error_msg else error_msg
        )

        logger.error(f"Error in extraction task: {full_error_msg}", exc_info=True)
        failed_results = []
        for doc_id in request.document_ids:
            failed_results.append(
                DocumentExtractionResponse(
                    collection_id=request.collection_id,
                    document_id=doc_id,
                    status=DocumentProcessingStatus.FAILED,
                    created_at=datetime.now(UTC).isoformat(),
                    updated_at=datetime.now(UTC).isoformat(),
                    started_at=datetime.now(UTC).isoformat(),
                    completed_at=datetime.now(UTC).isoformat(),
                    error_message=full_error_msg,
                    extracted_data=None,
                ).model_dump(mode="json")
            )
        # NOTE: Do NOT call update_state() before returning!
        # When we manually set state and then return a value, Celery's Redis backend may store
        # the metadata from update_state() instead of the actual return value when fetching with .get().
        # Just return the failed_results - Celery will set state to SUCCESS since we return normally.
        # The extraction endpoint will check the document statuses to determine if all failed.

        # Save failed results to Supabase
        _update_job_results_in_supabase(
            job_id=self.request.id,
            results=failed_results,
            completed_documents=len(failed_results),
            status="FAILURE",
        )

        return failed_results
    finally:
        loop.close()
