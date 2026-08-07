"""Shared helpers and utilities for extraction domain routers."""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path as FilePath
from typing import Any

import jinja2
from celery import exceptions as celery_exceptions
from fastapi import HTTPException, status
from loguru import logger

from app.core.supabase import supabase_client as supabase
from app.models import (
    DocumentExtractionRequest,
    DocumentExtractionSubmissionResponse,
    DocumentProcessingStatus,
    PromptMetadata,
)
from app.workers import extract_information_from_documents_task

_IN_PROGRESS_STATES = {"PENDING", "STARTED", "PROCESSING", "RETRY"}
_CANCELLED_STATES = {"REVOKED", "CANCELLED"}
_FAILURE_STATES = {"FAILURE", "PARTIAL_FAILURE", "COMPLETED_WITH_FAILURES"}
MAX_DOCUMENTS_PER_JOB: int = int(os.getenv("MAX_DOCUMENTS_PER_JOB", "1000"))


def _summarize_result_status(results: list[dict[str, Any]] | None) -> str | None:
    """Summarize extraction results to COMPLETED/PARTIALLY_COMPLETED/FAILED."""
    if not results:
        return None

    failed_count = sum(
        1
        for result in results
        if isinstance(result, dict)
        and result.get("status") == DocumentProcessingStatus.FAILED.value
    )
    total_count = len(results)

    if failed_count == 0:
        return "COMPLETED"
    if failed_count < total_count:
        return "PARTIALLY_COMPLETED"
    return "FAILED"


def simplify_job_status(
    celery_state: str, results: list[dict[str, Any]] | None = None
) -> str:
    """
    Map Celery task states to simplified user-facing job statuses.

    Status State Machine:
    --------------------
    The extraction job lifecycle follows this state machine:

    1. Initial State: "IN_PROGRESS"
       - Maps from Celery states: PENDING, STARTED, PROCESSING, RETRY
       - Job is queued or actively running
       - Valid transitions: → COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED

    2. Terminal States (no further transitions):
       a) "COMPLETED" - All documents processed successfully
          - Maps from: SUCCESS (with all documents succeeded in results)

       b) "PARTIALLY_COMPLETED" - Some documents succeeded, some failed
          - Maps from: SUCCESS or PARTIAL_FAILURE (with mixed results)
          - Indicates degraded success where some data was extracted

       c) "FAILED" - All documents failed or task failed completely
          - Maps from: FAILURE (or SUCCESS with all documents failed)
          - No data was successfully extracted

       d) "CANCELLED" - Job was cancelled by user or system
          - Maps from: REVOKED, CANCELLED
          - Processing was interrupted

    Simplified Statuses:
    - "IN_PROGRESS": Job is running (PENDING, STARTED, PROCESSING, RETRY)
    - "COMPLETED": Job completed successfully (all documents succeeded)
    - "FAILED": Job failed completely (all documents failed or task error)
    - "PARTIALLY_COMPLETED": Some documents succeeded, some failed
    - "CANCELLED": Job was cancelled

    Args:
        celery_state: The raw Celery task state
        results: Optional list of document results to determine partial completion

    Returns:
        Simplified status string for user display (uppercase)
    """
    normalized_state = (celery_state or "").upper()

    # Map intermediate states to "IN_PROGRESS"
    if normalized_state in _IN_PROGRESS_STATES:
        return "IN_PROGRESS"

    # Map cancellation states
    if normalized_state in _CANCELLED_STATES:
        return "CANCELLED"

    if normalized_state == "SUCCESS":
        return _summarize_result_status(results) or "COMPLETED"

    # Map failure states (including custom COMPLETED_WITH_FAILURES state from worker)
    if normalized_state in _FAILURE_STATES:
        result_status = _summarize_result_status(results)
        if result_status:
            return result_status
        if normalized_state == "PARTIAL_FAILURE":
            return "PARTIALLY_COMPLETED"
        return "FAILED"

    # Fallback: return as-is if unknown (keep uppercase)
    logger.warning(f"Unknown Celery state: {celery_state}, returning as-is")
    return normalized_state or "UNKNOWN"


def is_uuid(value: str) -> bool:
    """Check if a string is a valid UUID."""
    uuid_pattern = re.compile(
        r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", re.IGNORECASE
    )
    return bool(uuid_pattern.match(value))


# =============================================================================
# Extraction Job Helper Functions
# =============================================================================


def _enforce_max_documents(
    document_ids: list[str] | None, collection_id: str | None = None
) -> None:
    """
    Enforce the per-job document cap without requiring a non-empty list.

    Use this on code paths (e.g. full-mode ``DocumentExtractionRequest``) that
    may legitimately omit ``document_ids`` but must still not exceed the cap.

    Raises:
        HTTPException: 400 if document_ids exceeds MAX_DOCUMENTS_PER_JOB
    """
    docs = document_ids or []
    if len(docs) > MAX_DOCUMENTS_PER_JOB:
        logger.warning(
            f"Document count {len(docs)} exceeds cap {MAX_DOCUMENTS_PER_JOB} for collection {collection_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Too Many Documents",
                "message": f"Document count {len(docs)} exceeds the maximum of {MAX_DOCUMENTS_PER_JOB} documents per job. "
                f"Split your request into smaller batches.",
                "code": "TOO_MANY_DOCUMENTS",
            },
        )


def _validate_documents(
    document_ids: list[str] | None, collection_id: str | None
) -> list[str]:
    """
    Validate that document_ids is not empty and does not exceed the per-job cap.

    Args:
        document_ids: List of document IDs to validate
        collection_id: Collection ID for error message context

    Returns:
        The validated document_ids list

    Raises:
        HTTPException: 400 if document list is empty or exceeds MAX_DOCUMENTS_PER_JOB
    """
    docs = document_ids or []
    if not docs or len(docs) == 0:
        logger.warning(f"Empty document list for collection {collection_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Empty Collection",
                "message": "No documents provided for extraction. Please ensure the collection contains documents.",
                "code": "EMPTY_DOCUMENT_LIST",
            },
        )
    _enforce_max_documents(docs, collection_id)
    return docs


def _validate_schema_id_required(schema_id: str | None) -> None:
    """
    Validate that schema_id is provided.

    Raises:
        HTTPException: 400 if schema_id is missing
    """
    if not schema_id:
        logger.error("Schema ID is required but not provided")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Missing Schema",
                "message": "Schema ID is required for extraction.",
                "code": "MISSING_SCHEMA_ID",
            },
        )


def _check_supabase_available() -> None:
    """
    Check if Supabase client is available.

    Raises:
        HTTPException: 503 if Supabase is not available
    """
    if not supabase:
        logger.error("Supabase client not initialized when trying to fetch schema")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Service Unavailable",
                "message": "Database connection unavailable. The extraction service cannot connect to the database. Please try again later or contact support.",
                "code": "DATABASE_UNAVAILABLE",
            },
        )


def _validate_collection_id(collection_id: str | None) -> None:
    """
    Validate that collection_id is provided.

    Raises:
        HTTPException: 400 if collection_id is missing
    """
    if not collection_id:
        logger.error("Collection ID is missing from extraction request")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Missing Collection",
                "message": "Collection ID is required for extraction.",
                "code": "MISSING_COLLECTION_ID",
            },
        )


def build_idempotency_key(
    extraction_request: DocumentExtractionRequest,
) -> str:
    """Fingerprint the work a request asks for, ignoring incidental ordering.

    Two submissions that would extract the same fields from the same documents
    are the same job even if the document list arrives in a different order, so
    the ids are sorted before hashing. The schema is part of the key: the same
    documents under a different schema is genuinely different work.
    """
    payload = {
        "collection_id": extraction_request.collection_id,
        "schema_id": extraction_request.schema_id,
        "document_ids": sorted(extraction_request.document_ids or []),
        "prompt_id": extraction_request.prompt_id,
        "language": extraction_request.language,
    }
    # A user_schema passed inline has no id to key on, so hash its text.
    if extraction_request.user_schema:
        payload["user_schema"] = json.dumps(
            extraction_request.user_schema, sort_keys=True, default=str
        )
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()


def _find_inflight_job(user_id: str, idempotency_key: str) -> str | None:
    """Return the job_id of an equivalent job that is still running, if any."""
    if not supabase:
        return None
    try:
        existing = (
            supabase.table("extraction_jobs")
            .select("job_id")
            .eq("user_id", user_id)
            .eq("idempotency_key", idempotency_key)
            .in_("status", ["PENDING", "STARTED"])
            .limit(1)
            .execute()
        )
    except Exception as lookup_error:
        # A failed dedup lookup must not block the submission; the worst case is
        # a duplicate job, which is what the situation was before this check.
        logger.warning(f"Idempotency lookup failed, submitting anyway: {lookup_error}")
        return None
    rows = existing.data or []
    if isinstance(rows, dict):
        rows = [rows]
    return rows[0]["job_id"] if rows else None


def _insert_job_record(
    job_id: str,
    user_id: str,
    extraction_request: DocumentExtractionRequest,
    idempotency_key: str,
) -> None:
    """Persist the job row before the task is queued.

    Ordering matters: the worker updates this row from its very first document,
    so the row has to exist before the message is on the broker. Enqueueing
    first is a race the worker loses, and it used to be worse than a race — the
    row was written by the Next.js BFF after this call returned, in a different
    process, with its insert error swallowed (#437).
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Service Unavailable",
                "message": "Job store unavailable; the extraction job was not queued.",
                "code": "JOB_STORE_UNAVAILABLE",
            },
        )
    document_ids = extraction_request.document_ids or []
    supabase.table("extraction_jobs").insert(
        {
            "job_id": job_id,
            "user_id": user_id,
            "collection_id": extraction_request.collection_id,
            "schema_id": extraction_request.schema_id,
            "status": "PENDING",
            "document_ids": document_ids,
            "total_documents": len(document_ids),
            "completed_documents": 0,
            "language": extraction_request.language or "pl",
            "prompt_id": extraction_request.prompt_id or "info_extraction",
            "extraction_context": extraction_request.extraction_context,
            "idempotency_key": idempotency_key,
            "attempts": 0,
        }
    ).execute()


def _abandon_job_record(job_id: str, reason: str) -> None:
    """Mark a job as failed when it could not be handed to the broker.

    Without this the row would sit at PENDING forever, and the stale-job reaper
    cannot tell it apart from a job that is legitimately waiting for a worker.
    """
    if not supabase:
        return
    try:
        supabase.table("extraction_jobs").update(
            {
                "status": "FAILURE",
                "error_message": reason,
                "completed_at": datetime.now(UTC).isoformat(),
            }
        ).eq("job_id", job_id).execute()
    except Exception as cleanup_error:
        logger.error(f"Could not mark job {job_id} as failed: {cleanup_error}")


def _submit_extraction_task(
    extraction_request: DocumentExtractionRequest,
    user_id: str,
) -> str:
    """
    Submit extraction task to Celery with proper error handling.

    Writes the tracking row first, then enqueues under an explicitly chosen task
    id so the two always agree. An equivalent job that is already in flight is
    returned as-is rather than queued a second time — a double-clicked submit
    otherwise pays for the same LLM calls twice.

    Args:
        extraction_request: The validated extraction request
        user_id: Owner of the job, used for the row and for dedup scoping

    Returns:
        The task ID

    Raises:
        HTTPException: 503 on connection errors, 500 on unexpected errors
    """
    idempotency_key = build_idempotency_key(extraction_request)
    inflight_job_id = _find_inflight_job(user_id, idempotency_key)
    if inflight_job_id:
        logger.info(
            f"Reusing in-flight extraction job {inflight_job_id} for an "
            f"identical request from user {user_id}"
        )
        return inflight_job_id

    task_id = str(uuid.uuid4())
    try:
        _insert_job_record(task_id, user_id, extraction_request, idempotency_key)
    except HTTPException:
        raise
    except Exception as insert_error:
        # A unique-violation here means a concurrent request won the race for
        # the same fingerprint; adopt its job instead of failing the caller.
        concurrent_job_id = _find_inflight_job(user_id, idempotency_key)
        if concurrent_job_id:
            logger.info(
                f"Concurrent submit detected; reusing job {concurrent_job_id} "
                f"for user {user_id}"
            )
            return concurrent_job_id
        logger.error(f"Failed to create extraction job record: {insert_error}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Job Store Error",
                "message": "Could not record the extraction job. Please try again.",
                "code": "JOB_RECORD_FAILED",
                "debug": str(insert_error),
            },
        )

    try:
        extract_information_from_documents_task.apply_async(
            args=[extraction_request.model_dump(mode="json")],
            task_id=task_id,
        )
        logger.info(f"Created extraction job with ID: {task_id}")
        return task_id
    except celery_exceptions.OperationalError as e:
        _abandon_job_record(task_id, f"Task queue unavailable: {e}")
        logger.error(f"Failed to submit extraction task to Celery broker: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Task Queue Connection Error",
                "message": "Failed to connect to the task queue service. The Redis/Celery broker may be unavailable. Please check the service status and try again.",
                "code": "TASK_SUBMISSION_FAILED",
                "debug": str(e),
            },
        )
    except (ConnectionError, OSError, TimeoutError) as e:
        _abandon_job_record(task_id, f"Task queue unreachable: {e}")
        logger.error(f"Network error while submitting extraction task: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Task Queue Network Error",
                "message": "Failed to connect to the task queue service due to a network error. Please check your connection and try again.",
                "code": "TASK_SUBMISSION_FAILED",
                "debug": str(e),
            },
        )
    except Exception as e:
        _abandon_job_record(task_id, f"Task submission failed: {e}")
        logger.error(
            f"Unexpected error while submitting extraction task to Celery: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Task Submission Failed",
                "message": "An unexpected error occurred while submitting the extraction job. Please try again or contact support.",
                "code": "TASK_SUBMISSION_FAILED",
                "debug": str(e),
            },
        )


def _fetch_schema_from_db(schema_id: str, include_metadata: bool = False) -> dict:
    """
    Fetch schema from Supabase database.

    Args:
        schema_id: UUID of the schema to fetch
        include_metadata: If True, returns {name, description, text}. If False, returns just the text field.

    Returns:
        Schema data (dict with text, or dict with name/description/text)

    Raises:
        HTTPException: 404 if schema not found, 500 on fetch error
    """
    _check_supabase_available()

    try:
        fields = "name, description, text" if include_metadata else "text"
        response = (
            supabase.table("extraction_schemas")
            .select(fields)
            .eq("id", schema_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.warning(f"Schema {schema_id} not found in database")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "Schema Not Found",
                    "message": f"The extraction schema '{schema_id}' was not found in the database. Please ensure you've selected a valid schema.",
                    "code": "SCHEMA_NOT_FOUND",
                },
            )

        if include_metadata:
            return {
                "name": response.data["name"],
                "description": response.data.get("description", ""),
                "text": response.data["text"],
            }
        return response.data["text"]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Unexpected error fetching schema from database: {}", str(e), exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Schema Retrieval Error",
                "message": f"Failed to retrieve schema from database: {e!s}. Please try again or contact support.",
                "code": "SCHEMA_FETCH_ERROR",
            },
        )


def _convert_simplified_schema(user_schema: dict) -> dict:
    """
    Convert simplified schema format to full format if needed.

    Simplified format: {"field_name": "description"}
    Full format: {"field_name": {"type": "string", "description": "...", "required": True}}

    Args:
        user_schema: Schema dict that may be in simplified format

    Returns:
        Schema in full format
    """
    if not isinstance(user_schema, dict) or not user_schema:
        return user_schema

    first_value = next(iter(user_schema.values()), None)
    if isinstance(first_value, str):
        # Convert simplified format to full format
        logger.info("Converting schema from simplified format to full format")
        converted_schema = {}
        for field_name, field_desc in user_schema.items():
            converted_schema[field_name] = {
                "type": "string",
                "description": field_desc,
                "required": True,
            }
        logger.info("Schema conversion completed")
        return converted_schema

    return user_schema


def _create_extraction_response(task_id: str) -> DocumentExtractionSubmissionResponse:
    """Create the standard extraction submission response."""
    return DocumentExtractionSubmissionResponse(
        task_id=task_id,
        status="accepted",
        message="The extraction job has been accepted and is processing in the background.",
    )


def update_job_status_in_supabase(
    job_id: str,
    simplified_status: str,
    completed_documents: int | None = None,
    results: list[dict[str, Any]] | None = None,
    error_message: str | None = None,
) -> bool:
    """
    Update extraction job status in Supabase database.

    Maps simplified statuses to database-compatible values:
    - Supabase accepts: PENDING, STARTED, SUCCESS, FAILURE
    - Maps: IN_PROGRESS/PROCESSING -> STARTED, COMPLETED/PARTIALLY_COMPLETED -> SUCCESS, FAILED -> FAILURE

    Args:
        job_id: The job ID to update
        simplified_status: The simplified status from simplify_job_status()
        completed_documents: Optional count of completed documents
        results: Optional list of document results
        error_message: Optional error message for failed jobs

    Returns:
        True if update succeeded, False otherwise
    """
    if not supabase:
        logger.debug(f"Supabase client not available, skipping update for job {job_id}")
        return False

    try:
        # Map simplified status to database-compatible status
        # Supabase schema only accepts: PENDING, STARTED, SUCCESS, FAILURE
        status_mapping = {
            "IN_PROGRESS": "STARTED",
            "PROCESSING": "STARTED",
            "PENDING": "PENDING",
            "STARTED": "STARTED",
            "COMPLETED": "SUCCESS",
            "PARTIALLY_COMPLETED": "SUCCESS",
            "SUCCESS": "SUCCESS",
            "FAILED": "FAILURE",
            "FAILURE": "FAILURE",
            "CANCELLED": "FAILURE",  # Treat cancelled as failure
        }
        db_status = status_mapping.get(simplified_status, "STARTED")

        update_data = {
            "status": db_status,
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Add optional fields
        if completed_documents is not None:
            update_data["completed_documents"] = completed_documents

        if results is not None:
            update_data["results"] = results

        # Set completed_at for terminal states
        if db_status in ["SUCCESS", "FAILURE"]:
            update_data["completed_at"] = datetime.now(UTC).isoformat()

        if error_message:
            update_data["error_message"] = error_message

        # Execute update
        result = (
            supabase.table("extraction_jobs")
            .update(update_data)
            .eq("job_id", job_id)
            .execute()
        )

        if result.data and len(result.data) > 0:
            logger.info(
                f"Updated Supabase: job {job_id}, status {db_status} (from {simplified_status}), "
                f"updated {len(result.data)} row(s)"
            )
            return True
        logger.warning(
            f"No rows updated in Supabase for job {job_id} - job might not exist or job_id mismatch"
        )
        return False

    except Exception as e:
        logger.error(f"Failed to update Supabase for job {job_id}: {e}", exc_info=True)
        return False


# Constants for prompt management
PROMPTS_DIR = FilePath("packages/juddges_search/config/prompts")
PROMPTS_ARCHIVE_DIR = PROMPTS_DIR / "archive"
SYSTEM_PROMPTS = {"info_extraction"}  # System prompts that cannot be deleted


# ===== Helper Functions for Prompt Management =====


def get_prompt_file_path(prompt_id: str) -> FilePath:
    """Get the file path for a prompt template."""
    return PROMPTS_DIR / f"{prompt_id}.jinja2"


def get_metadata_file_path(prompt_id: str) -> FilePath:
    """Get the file path for a prompt metadata file."""
    return PROMPTS_DIR / f"{prompt_id}.json"


def get_archived_prompt_path(prompt_id: str) -> FilePath:
    """Get the file path for an archived prompt."""
    return PROMPTS_ARCHIVE_DIR / f"{prompt_id}.jinja2"


def get_archived_metadata_path(prompt_id: str) -> FilePath:
    """Get the file path for archived prompt metadata."""
    return PROMPTS_ARCHIVE_DIR / f"{prompt_id}.json"


def validate_jinja2_template(template: str) -> None:
    """
    Validate Jinja2 template syntax.

    Raises:
        ValueError: If template syntax is invalid
    """
    try:
        jinja2.Template(template)
    except jinja2.exceptions.TemplateSyntaxError as e:
        raise ValueError(f"Invalid Jinja2 template syntax: {e!s}")
    except Exception as e:
        raise ValueError(f"Error validating template: {e!s}")


def load_prompt_metadata(prompt_id: str) -> PromptMetadata:
    """
    Load metadata for a prompt.

    Returns default metadata if file doesn't exist.
    """
    metadata_path = get_metadata_file_path(prompt_id)

    if not metadata_path.exists():
        # Return default metadata for system prompts
        return PromptMetadata(
            prompt_id=prompt_id,
            description="System prompt",
            variables=[],
            created_at=datetime.now(UTC).isoformat(),
            is_system=prompt_id in SYSTEM_PROMPTS,
        )

    try:
        with open(metadata_path) as f:
            data = json.load(f)
            return PromptMetadata(**data)
    except Exception as e:
        logger.error(f"Error loading metadata for prompt {prompt_id}: {e!s}")
        raise ValueError(f"Error loading prompt metadata: {e!s}")


def save_prompt_metadata(metadata: PromptMetadata) -> None:
    """Save prompt metadata to file."""
    metadata_path = get_metadata_file_path(metadata.prompt_id)

    try:
        with open(metadata_path, "w") as f:
            json.dump(metadata.model_dump(), f, indent=2)
        logger.info(f"Saved metadata for prompt {metadata.prompt_id}")
    except Exception as e:
        logger.error(f"Error saving metadata for prompt {metadata.prompt_id}: {e!s}")
        raise ValueError(f"Error saving prompt metadata: {e!s}")


def prompt_exists(prompt_id: str) -> bool:
    """Check if a prompt exists."""
    return get_prompt_file_path(prompt_id).exists()


def is_system_prompt(prompt_id: str) -> bool:
    """Check if a prompt is a system prompt."""
    return prompt_id in SYSTEM_PROMPTS


def create_backup(prompt_id: str) -> None:
    """Create a timestamped backup of a prompt before modification."""
    prompt_path = get_prompt_file_path(prompt_id)
    metadata_path = get_metadata_file_path(prompt_id)

    if not prompt_path.exists():
        return

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    backup_prompt_path = PROMPTS_DIR / f"{prompt_id}.jinja2.backup_{timestamp}"
    backup_metadata_path = PROMPTS_DIR / f"{prompt_id}.json.backup_{timestamp}"

    try:
        # Backup template
        with open(prompt_path) as src, open(backup_prompt_path, "w") as dst:
            dst.write(src.read())

        # Backup metadata if exists
        if metadata_path.exists():
            with open(metadata_path) as src, open(backup_metadata_path, "w") as dst:
                dst.write(src.read())

        logger.info(f"Created backup for prompt {prompt_id} with timestamp {timestamp}")
    except Exception as e:
        logger.error(f"Error creating backup for prompt {prompt_id}: {e!s}")
        raise ValueError(f"Error creating backup: {e!s}")


def archive_prompt(prompt_id: str) -> None:
    """Archive a prompt by moving it to the archive directory."""
    # Ensure archive directory exists
    PROMPTS_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    prompt_path = get_prompt_file_path(prompt_id)
    metadata_path = get_metadata_file_path(prompt_id)
    archived_prompt_path = get_archived_prompt_path(prompt_id)
    archived_metadata_path = get_archived_metadata_path(prompt_id)

    try:
        # Move template
        if prompt_path.exists():
            prompt_path.rename(archived_prompt_path)

        # Move metadata
        if metadata_path.exists():
            metadata_path.rename(archived_metadata_path)

        logger.info(f"Archived prompt {prompt_id} to {PROMPTS_ARCHIVE_DIR}")
    except Exception as e:
        logger.error(f"Error archiving prompt {prompt_id}: {e!s}")
        raise ValueError(f"Error archiving prompt: {e!s}")
