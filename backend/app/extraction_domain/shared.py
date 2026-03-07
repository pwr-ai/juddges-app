"""Shared helpers and utilities for extraction domain routers."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path as FilePath
from typing import Any

import jinja2
from celery import exceptions as celery_exceptions
from fastapi import Header, HTTPException, status
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


def _validate_documents(
    document_ids: list[str] | None, collection_id: str | None
) -> list[str]:
    """
    Validate that document_ids is not empty.

    Args:
        document_ids: List of document IDs to validate
        collection_id: Collection ID for error message context

    Returns:
        The validated document_ids list

    Raises:
        HTTPException: 400 if document list is empty
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


def _submit_extraction_task(extraction_request: DocumentExtractionRequest) -> str:
    """
    Submit extraction task to Celery with proper error handling.

    Args:
        extraction_request: The validated extraction request

    Returns:
        The task ID

    Raises:
        HTTPException: 503 on connection errors, 500 on unexpected errors
    """
    try:
        task = extract_information_from_documents_task.delay(
            extraction_request.model_dump(mode="json")
        )
        logger.info(f"Created extraction job with ID: {task.id}")
        return task.id
    except celery_exceptions.OperationalError as e:
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


def get_current_user(x_user_id: str = Header(..., alias="X-User-ID")) -> str:
    """
    Extract user ID from request header.

    Args:
        x_user_id: User ID from X-User-ID header

    Returns:
        User ID string

    Raises:
        HTTPException: If user ID header is missing or invalid
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID header is required")
    return x_user_id
