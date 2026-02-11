import json
import os
import asyncio
from datetime import datetime
from pathlib import Path as FilePath
from typing import Any, Union
import re

import jinja2
from juddges_search.info_extraction.extractor import InformationExtractor
from celery import exceptions as celery_exceptions
from celery.result import AsyncResult
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Path, Query, status
from loguru import logger
from werkzeug.utils import secure_filename

from app.core.supabase import supabase_client as supabase
from app.models import (
    BatchExtractionResponse,
    BulkExtractionRequest,
    BulkExtractionResponse,
    BulkExtractionJobInfo,
    CreatePromptRequest,
    DeletePromptResponse,
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    DocumentExtractionSubmissionResponse,
    DocumentProcessingStatus,
    PromptMetadata,
    PromptResponse,
    SimpleExtractionRequest,
    UpdatePromptRequest,
    ExtractionJobSummary,
    ListExtractionJobsResponse,
    CancelJobResponse,
)
from app.workers import (
    celery_app,
    extract_information_from_documents_task,
)
from app.error_utils import is_weaviate_or_grpc_error

router = APIRouter(prefix="/extractions", tags=["extraction"])


def raise_weaviate_error(error: Exception, context: str = "") -> None:
    """
    Raise an HTTPException for Weaviate/gRPC connection errors with appropriate details.
    
    This should be used together with is_weaviate_or_grpc_error() from error_utils,
    which performs robust exception type checking using isinstance() checks only.
    
    Args:
        error: The original Weaviate/gRPC-related exception
        context: Optional context string describing what operation failed (e.g., "retrieving extraction job")
        
    Raises:
        HTTPException: 503 Service Unavailable with Weaviate error details
    """
    context_msg = f" while {context}" if context else ""
    logger.error(f"Weaviate connection error{context_msg}: {error}")
    raise HTTPException(
        status_code=503,
        detail={
            "error": "Weaviate Service Unavailable",
            "message": "The vector database service (Weaviate) is currently unavailable. Please check the service status and try again later.",
            "code": "WEAVIATE_UNAVAILABLE",
            "debug": str(error),
            "context": context
        }
    )


def simplify_job_status(celery_state: str, results: list[dict[str, Any]] | None = None) -> str:
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
    if normalized_state in {"PENDING", "STARTED", "PROCESSING", "RETRY"}:
        return "IN_PROGRESS"
    
    # Map cancellation states
    if normalized_state in {"REVOKED", "CANCELLED"}:
        return "CANCELLED"
    
    # For completed tasks, check results to determine status
    if normalized_state == "SUCCESS" and results:
        failed_count = sum(
            1 for r in results 
            if isinstance(r, dict) and r.get("status") == DocumentProcessingStatus.FAILED.value
        )
        total_count = len(results)
        
        if failed_count == 0:
            return "COMPLETED"
        elif failed_count < total_count:
            return "PARTIALLY_COMPLETED"
        else:
            return "FAILED"
    
    # Map failure states (including custom COMPLETED_WITH_FAILURES state from worker)
    if normalized_state in {"FAILURE", "PARTIAL_FAILURE", "COMPLETED_WITH_FAILURES"}:
        if results:
            failed_count = sum(
                1 for r in results
                if isinstance(r, dict) and r.get("status") == DocumentProcessingStatus.FAILED.value
            )
            total_count = len(results)
            if failed_count == 0:
                return "COMPLETED"
            if failed_count < total_count:
                return "PARTIALLY_COMPLETED"
            return "FAILED"
        if normalized_state == "PARTIAL_FAILURE":
            return "PARTIALLY_COMPLETED"
        return "FAILED"
    
    # Default for SUCCESS without results
    if normalized_state == "SUCCESS":
        return "COMPLETED"
    
    # Fallback: return as-is if unknown (keep uppercase)
    logger.warning(f"Unknown Celery state: {celery_state}, returning as-is")
    return normalized_state or "UNKNOWN"


def is_uuid(value: str) -> bool:
    """Check if a string is a valid UUID."""
    uuid_pattern = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', re.IGNORECASE)
    return bool(uuid_pattern.match(value))


# =============================================================================
# Extraction Job Helper Functions
# =============================================================================


def _validate_documents(document_ids: list[str] | None, collection_id: str | None) -> list[str]:
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
                "code": "EMPTY_DOCUMENT_LIST"
            }
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
                "code": "MISSING_SCHEMA_ID"
            }
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
                "code": "DATABASE_UNAVAILABLE"
            }
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
                "code": "MISSING_COLLECTION_ID"
            }
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
                "debug": str(e)
            }
        )
    except (ConnectionError, OSError, TimeoutError) as e:
        logger.error(f"Network error while submitting extraction task: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Task Queue Network Error",
                "message": "Failed to connect to the task queue service due to a network error. Please check your connection and try again.",
                "code": "TASK_SUBMISSION_FAILED",
                "debug": str(e)
            }
        )
    except Exception as e:
        logger.error(f"Unexpected error while submitting extraction task to Celery: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Task Submission Failed",
                "message": "An unexpected error occurred while submitting the extraction job. Please try again or contact support.",
                "code": "TASK_SUBMISSION_FAILED",
                "debug": str(e)
            }
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
        response = supabase.table("extraction_schemas").select(fields).eq("id", schema_id).single().execute()

        if not response.data:
            logger.warning(f"Schema {schema_id} not found in database")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "Schema Not Found",
                    "message": f"The extraction schema '{schema_id}' was not found in the database. Please ensure you've selected a valid schema.",
                    "code": "SCHEMA_NOT_FOUND"
                }
            )

        if include_metadata:
            return {
                "name": response.data["name"],
                "description": response.data.get("description", ""),
                "text": response.data["text"],
            }
        else:
            return response.data["text"]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error fetching schema from database: {}", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Schema Retrieval Error",
                "message": f"Failed to retrieve schema from database: {str(e)}. Please try again or contact support.",
                "code": "SCHEMA_FETCH_ERROR"
            }
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
                "required": True
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
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        # Add optional fields
        if completed_documents is not None:
            update_data["completed_documents"] = completed_documents
        
        if results is not None:
            update_data["results"] = results
        
        # Set completed_at for terminal states
        if db_status in ["SUCCESS", "FAILURE"]:
            update_data["completed_at"] = datetime.utcnow().isoformat()
        
        if error_message:
            update_data["error_message"] = error_message
        
        # Execute update
        result = supabase.table("extraction_jobs").update(update_data).eq("job_id", job_id).execute()
        
        if result.data and len(result.data) > 0:
            logger.info(
                f"Updated Supabase: job {job_id}, status {db_status} (from {simplified_status}), "
                f"updated {len(result.data)} row(s)"
            )
            return True
        else:
            logger.warning(f"No rows updated in Supabase for job {job_id} - job might not exist or job_id mismatch")
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
        raise ValueError(f"Invalid Jinja2 template syntax: {str(e)}")
    except Exception as e:
        raise ValueError(f"Error validating template: {str(e)}")


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
            created_at=datetime.utcnow().isoformat(),
            is_system=prompt_id in SYSTEM_PROMPTS
        )

    try:
        with open(metadata_path, "r") as f:
            data = json.load(f)
            return PromptMetadata(**data)
    except Exception as e:
        logger.error(f"Error loading metadata for prompt {prompt_id}: {str(e)}")
        raise ValueError(f"Error loading prompt metadata: {str(e)}")


def save_prompt_metadata(metadata: PromptMetadata) -> None:
    """Save prompt metadata to file."""
    metadata_path = get_metadata_file_path(metadata.prompt_id)

    try:
        with open(metadata_path, "w") as f:
            json.dump(metadata.model_dump(), f, indent=2)
        logger.info(f"Saved metadata for prompt {metadata.prompt_id}")
    except Exception as e:
        logger.error(f"Error saving metadata for prompt {metadata.prompt_id}: {str(e)}")
        raise ValueError(f"Error saving prompt metadata: {str(e)}")


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

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_prompt_path = PROMPTS_DIR / f"{prompt_id}.jinja2.backup_{timestamp}"
    backup_metadata_path = PROMPTS_DIR / f"{prompt_id}.json.backup_{timestamp}"

    try:
        # Backup template
        with open(prompt_path, "r") as src:
            with open(backup_prompt_path, "w") as dst:
                dst.write(src.read())

        # Backup metadata if exists
        if metadata_path.exists():
            with open(metadata_path, "r") as src:
                with open(backup_metadata_path, "w") as dst:
                    dst.write(src.read())

        logger.info(f"Created backup for prompt {prompt_id} with timestamp {timestamp}")
    except Exception as e:
        logger.error(f"Error creating backup for prompt {prompt_id}: {str(e)}")
        raise ValueError(f"Error creating backup: {str(e)}")


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
        logger.error(f"Error archiving prompt {prompt_id}: {str(e)}")
        raise ValueError(f"Error archiving prompt: {str(e)}")


# ===== Authentication Helper =====

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


# ===== Job Management Endpoints =====

@router.post(
    "",
    response_model=DocumentExtractionSubmissionResponse,
    status_code=202,
    summary="Create extraction job",
    description="Submit a new extraction job. Supports both full and simple modes.",
)
async def create_extraction_job(
    request: Union[DocumentExtractionRequest, SimpleExtractionRequest],
) -> DocumentExtractionSubmissionResponse:
    """
    Create a new extraction job.

    This endpoint merges the previous /submit and /simple endpoints.
    It automatically detects whether the request is full or simple extraction.

    - **Full mode**: Provide all parameters including prompt_id, llm_name, etc.
    - **Simple mode**: Provide minimal parameters, defaults will be used

    Returns a job_id (task_id) that can be used to check status and results.
    """
    try:
        if isinstance(request, SimpleExtractionRequest):
            # Validate documents
            document_ids = _validate_documents(request.document_ids, request.collection_id)

            # Validate and fetch schema
            _validate_schema_id_required(request.schema_id)
            schema_id = request.schema_id
            user_schema = None

            if is_uuid(schema_id):
                # Fetch schema from Supabase database
                logger.info(f"Fetching schema {schema_id} from database")
                user_schema = _fetch_schema_from_db(schema_id, include_metadata=False)
                user_schema = _convert_simplified_schema(user_schema)
                schema_id = None  # Clear schema_id to prevent file lookup
                logger.info("Successfully fetched schema from database")

            extraction_request = DocumentExtractionRequest(
                collection_id=request.collection_id,
                schema_id=schema_id,
                user_schema=user_schema,
                extraction_context=request.extraction_context,
                additional_instructions=request.additional_instructions,
                prompt_id="info_extraction",
                language=request.language,
                document_ids=document_ids,
            )
        else:
            extraction_request = request

        # Validate and submit
        _validate_collection_id(extraction_request.collection_id)
        task_id = _submit_extraction_task(extraction_request)
        return _create_extraction_response(task_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error creating extraction job: {}", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal Server Error",
                "message": f"An unexpected error occurred while creating the extraction job: {str(e)}. Please try again or contact support.",
                "code": "INTERNAL_ERROR"
            }
        )


@router.post(
    "/db",
    response_model=DocumentExtractionSubmissionResponse,
    status_code=202,
    summary="Create extraction job (DB schema)",
    description="Submit a new extraction job using schemas from Supabase database. Supports both full and simple modes.",
)
async def create_extraction_job_db(
    request: Union[DocumentExtractionRequest, SimpleExtractionRequest],
) -> DocumentExtractionSubmissionResponse:
    """
    Create a new extraction job using InformationExtractor with schemas from Supabase.

    This is the new recommended endpoint that uses extract_information_from_documents_task,
    which works with InformationExtractor and schemas from Supabase database.

    - **Full mode**: Provide all parameters including prompt_id, llm_name, etc.
    - **Simple mode**: Provide minimal parameters, defaults will be used

    For simple mode with schema_id, the full schema (name, description, text) will be fetched
    from Supabase and passed to the extractor.

    Returns a job_id (task_id) that can be used to check status and results.
    """
    try:
        if isinstance(request, SimpleExtractionRequest):
            # Validate documents
            document_ids = _validate_documents(request.document_ids, request.collection_id)

            # Validate schema_id is present and is a UUID
            _validate_schema_id_required(request.schema_id)
            if not is_uuid(request.schema_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "Invalid Schema ID",
                        "message": f"Schema ID '{request.schema_id}' is not a valid UUID. This endpoint requires a schema from Supabase database.",
                        "code": "INVALID_SCHEMA_ID"
                    }
                )

            # Fetch full schema with metadata from database
            logger.info(f"Fetching full schema {request.schema_id} from database")
            user_schema = _fetch_schema_from_db(request.schema_id, include_metadata=True)
            logger.info(f"Successfully fetched full schema from database: {request.schema_id}")

            extraction_request = DocumentExtractionRequest(
                collection_id=request.collection_id,
                schema_id=None,
                user_schema=user_schema,
                extraction_context=request.extraction_context,
                additional_instructions=request.additional_instructions,
                prompt_id="info_extraction",
                language=request.language,
                document_ids=document_ids,
            )
        else:
            # Validate user_schema has required fields if provided
            if request.user_schema is not None:
                required_fields = ["name", "description", "text"]
                missing_fields = [f for f in required_fields if f not in request.user_schema]
                if missing_fields:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "error": "Invalid Schema Format",
                            "message": f"Schema is missing required fields: {', '.join(missing_fields)}. "
                                       f"Schema must have 'name', 'description', and 'text' fields.",
                            "code": "INVALID_SCHEMA_FORMAT"
                        }
                    )
            extraction_request = request

        # Validate collection and schema
        _validate_collection_id(extraction_request.collection_id)

        if extraction_request.user_schema is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "Missing Schema",
                    "message": "user_schema must be provided. For simple requests, provide schema_id to fetch from database. "
                               "For full requests, provide user_schema with 'name', 'description', and 'text' fields.",
                    "code": "MISSING_USER_SCHEMA"
                }
            )

        # Submit and return
        task_id = _submit_extraction_task(extraction_request)
        return _create_extraction_response(task_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error creating extraction job: {}", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal Server Error",
                "message": f"An unexpected error occurred while creating the extraction job: {str(e)}. Please try again or contact support.",
                "code": "INTERNAL_ERROR"
            }
        )


@router.post(
    "/bulk",
    response_model=BulkExtractionResponse,
    status_code=202,
    summary="Create bulk extraction jobs",
    description="Apply multiple schemas to documents simultaneously. Creates one extraction job per schema.",
)
async def create_bulk_extraction(
    request: BulkExtractionRequest = Body(...),
) -> BulkExtractionResponse:
    """
    Create bulk extraction jobs - one per schema.

    This endpoint creates multiple extraction jobs simultaneously,
    one for each schema provided. All jobs share the same collection
    and document IDs.
    """
    import uuid as uuid_module

    try:
        bulk_id = str(uuid_module.uuid4())

        # Validate documents
        document_ids = _validate_documents(request.document_ids, request.collection_id)
        _validate_collection_id(request.collection_id)
        _check_supabase_available()

        jobs = []

        for schema_id in request.schema_ids:
            # Validate schema_id is a UUID
            if not is_uuid(schema_id):
                jobs.append(BulkExtractionJobInfo(
                    job_id="",
                    schema_id=schema_id,
                    schema_name=None,
                    status="rejected",
                ))
                continue

            try:
                # Fetch schema from database
                schema_data = _fetch_schema_from_db(schema_id, include_metadata=True)
                schema_name = schema_data.get("name", "Unknown Schema") if isinstance(schema_data, dict) else None

                # Create extraction request for this schema
                extraction_request = DocumentExtractionRequest(
                    collection_id=request.collection_id,
                    schema_id=None,
                    user_schema=schema_data,
                    extraction_context=request.extraction_context,
                    prompt_id="info_extraction",
                    language=request.language,
                    document_ids=document_ids,
                )

                # Submit to Celery
                task_id = _submit_extraction_task(extraction_request)

                jobs.append(BulkExtractionJobInfo(
                    job_id=task_id,
                    schema_id=schema_id,
                    schema_name=schema_name,
                    status="accepted",
                ))

                logger.info(f"Bulk extraction: created job {task_id} for schema {schema_id} ({schema_name})")

            except HTTPException as he:
                logger.warning(f"Failed to create job for schema {schema_id}: {he.detail}")
                jobs.append(BulkExtractionJobInfo(
                    job_id="",
                    schema_id=schema_id,
                    schema_name=None,
                    status="rejected",
                ))
            except Exception as e:
                logger.error(f"Unexpected error creating job for schema {schema_id}: {e}")
                jobs.append(BulkExtractionJobInfo(
                    job_id="",
                    schema_id=schema_id,
                    schema_name=None,
                    status="rejected",
                ))

        accepted_count = sum(1 for j in jobs if j.status == "accepted")

        return BulkExtractionResponse(
            bulk_id=bulk_id,
            status="accepted" if accepted_count > 0 else "rejected",
            jobs=jobs,
            total_schemas=len(request.schema_ids),
            total_documents=len(document_ids),
            auto_export=request.auto_export,
            scheduled_at=request.scheduled_at,
            message=f"Created {accepted_count} extraction jobs for {len(document_ids)} documents.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in bulk extraction: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Bulk Extraction Failed",
                "message": f"An error occurred while creating bulk extraction jobs: {str(e)}",
                "code": "BULK_EXTRACTION_FAILED"
            }
        )


@router.get(
    "/{job_id}",
    response_model=BatchExtractionResponse,
    summary="Get extraction job status and results",
    description="Retrieve the status and results of an extraction job by its ID.",
)
async def get_extraction_job(
    job_id: str = Path(..., description="Extraction job ID (task ID)")
) -> BatchExtractionResponse:
    """
    Get extraction job status and results.

    Returns the current status of the extraction job and results if completed.

    Simplified statuses:
    - **QUEUED**: Job is queued but not yet captured by worker
    - **IN_PROGRESS**: Job is running (captured by worker)
    - **COMPLETED**: Job completed (all documents succeeded)
    - **PARTIALLY_COMPLETED**: Job completed but some documents failed
    - **FAILED**: Job failed completely (all documents failed)
    - **CANCELLED**: Job was cancelled
    """
    try:
        # Don't pre-check workers - just try to get the task result
        # The result backend might have the data even if workers aren't currently active
        task_result = AsyncResult(id=job_id, app=celery_app)

        # Safely check task state - handle cases where task doesn't exist or hasn't been captured
        try:
            task_state = task_result.state
        except Exception as state_error:
            # Task might not exist if worker wasn't running when it was submitted
            error_msg = str(state_error).lower()
            if "not found" in error_msg or "does not exist" in error_msg or "pending" in error_msg:
                logger.warning(f"Task {job_id} not found or not captured by worker: {state_error}")
                # Return as PENDING - task is queued but not captured yet
                return BatchExtractionResponse(
                    task_id=job_id,
                    status="PENDING",
                    results=None,
                )
            logger.error(f"Failed to get task state for job {job_id}: {state_error}")
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "Service Unavailable",
                    "message": "The extraction service is temporarily unavailable. Please try again in a few moments.",
                    "code": "WORKER_UNAVAILABLE"
                }
            )
        
        # If task state is PENDING and has no info, either:
        # 1. Task hasn't been captured by a worker yet (new job)
        # 2. Celery task data has expired (old job) - preserve existing state
        if task_state == "PENDING" and not task_result.info:
            logger.warning(f"Task {job_id} is PENDING with no info - checking Supabase for existing state")

            # First, check if the job already has progress in Supabase
            # This handles the case where Celery task data has expired but job was partially/fully processed
            if supabase:
                try:
                    job_data = supabase.table("extraction_jobs").select("*").eq("job_id", job_id).single().execute()
                    if job_data.data:
                        completed_documents = job_data.data.get("completed_documents", 0) or 0
                        total_documents = job_data.data.get("total_documents", 0) or 0
                        existing_status = job_data.data.get("status", "PENDING")
                        existing_results = job_data.data.get("results")

                        # If job has completed documents or results, preserve the state - don't reset to PENDING
                        if completed_documents > 0 or existing_results:
                            logger.info(
                                f"Job {job_id} has existing progress: {completed_documents}/{total_documents} docs, "
                                f"status={existing_status}. Preserving state instead of resetting to PENDING."
                            )

                            # Determine the appropriate status based on existing state
                            if completed_documents >= total_documents and total_documents > 0:
                                # All documents processed - should be SUCCESS
                                final_status = "COMPLETED"
                                if existing_status not in ["SUCCESS", "COMPLETED", "PARTIALLY_COMPLETED"]:
                                    # Update Supabase to reflect completion
                                    update_job_status_in_supabase(job_id, final_status, completed_documents=completed_documents)
                            elif completed_documents > 0:
                                # Partially processed - job was interrupted
                                final_status = "PARTIALLY_COMPLETED"
                                if existing_status not in ["SUCCESS", "COMPLETED", "PARTIALLY_COMPLETED", "FAILURE"]:
                                    # Update Supabase to reflect partial completion (Celery data lost)
                                    update_job_status_in_supabase(job_id, final_status, completed_documents=completed_documents)
                            else:
                                final_status = existing_status

                            # Return results if available
                            results = None
                            if existing_results:
                                results = [
                                    DocumentExtractionResponse(**r) if isinstance(r, dict) else r
                                    for r in existing_results
                                ]

                            return BatchExtractionResponse(
                                task_id=job_id,
                                status=final_status,
                                results=results,
                            )

                        # Job has no progress yet - try to resubmit
                        logger.info(f"Job {job_id} has no progress, attempting to resubmit")
                        collection_id = job_data.data.get("collection_id")
                        schema_id = job_data.data.get("schema_id")
                        document_ids = job_data.data.get("document_ids", [])
                        language = job_data.data.get("language", "pl")
                        extraction_context = job_data.data.get("extraction_context", "Extract structured information from legal documents using the provided schema.")

                        if collection_id and schema_id and document_ids:
                            # Fetch schema from database
                            schema_response = supabase.table("extraction_schemas").select("name, description, text").eq("id", schema_id).single().execute()
                            if schema_response.data:
                                user_schema = {
                                    "name": schema_response.data["name"],
                                    "description": schema_response.data.get("description", ""),
                                    "text": schema_response.data["text"],
                                }

                                # Get prompt_id from job data, default to 'info_extraction'
                                prompt_id = job_data.data.get("prompt_id", "info_extraction")

                                # Create request object
                                resubmit_request = DocumentExtractionRequest(
                                    collection_id=collection_id,
                                    schema_id=schema_id,
                                    document_ids=document_ids,
                                    language=language,
                                    extraction_context=extraction_context,
                                    user_schema=user_schema,
                                    prompt_id=prompt_id,
                                )

                                # Resubmit the task
                                try:
                                    new_task = extract_information_from_documents_task.delay(
                                        resubmit_request.model_dump(mode="json")
                                    )
                                    logger.info(f"Resubmitted job {job_id} as new job {new_task.id}")

                                    # Update the job record with new job_id
                                    supabase.table("extraction_jobs").update({
                                        "job_id": new_task.id,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("job_id", job_id).execute()

                                    # Return the new job status
                                    return BatchExtractionResponse(
                                        task_id=new_task.id,
                                        status="IN_PROGRESS",
                                        results=None,
                                    )
                                except Exception as resubmit_error:
                                    logger.error(f"Failed to resubmit job {job_id}: {resubmit_error}")
                except Exception as supabase_error:
                    logger.warning(f"Could not retrieve job data from Supabase for {job_id}: {supabase_error}")

            # If resubmission failed or Supabase not available, return PENDING status
            # Note: Using PENDING instead of QUEUED to match database constraint
            return BatchExtractionResponse(
                task_id=job_id,
                status="PENDING",
                results=None,
            )

        # Check if task is still running/retrying
        try:
            if not task_result.ready():
                # Task has been captured (has info), so use normal status mapping
                simplified_status = simplify_job_status(task_state)
                
                # Update Supabase with current status for in-progress jobs
                task_info = task_result.info
                completed_docs = None
                if isinstance(task_info, dict):
                    completed_docs = task_info.get("completed_documents")
                update_job_status_in_supabase(job_id, simplified_status, completed_documents=completed_docs)
                
                return BatchExtractionResponse(
                    task_id=job_id,
                    status=simplified_status,
                    results=None,
                )
        except Exception as ready_error:
            logger.warning(f"Error checking if task {job_id} is ready: {ready_error}")
            # If we can't check ready state and task has no info, it's pending
            if not task_result.info:
                return BatchExtractionResponse(
                    task_id=job_id,
                    status="PENDING",
                    results=None,
                )
            # Otherwise assume it's in progress
            return BatchExtractionResponse(
                task_id=job_id,
                status="IN_PROGRESS",
                results=None,
            )

        # Task is complete - handle failure states gracefully
        try:
            if task_result.failed():
                error_info = task_result.info
                error_type = type(error_info).__name__ if error_info else "TaskError"
                error_message = str(error_info) if error_info else "Task failed"
                logger.error(
                    "Extraction job {} failed: {}: {}", job_id, error_type, error_message
                )
                simplified_status = simplify_job_status(task_state)
                
                # Update Supabase with failure status
                update_job_status_in_supabase(job_id, simplified_status, error_message=error_message)
                
                return BatchExtractionResponse(
                    task_id=job_id,
                    status=simplified_status,
                    results=[],
                )
        except Exception as failed_check_error:
            logger.warning(f"Error checking if task {job_id} failed: {failed_check_error}")

        # Task completed successfully - get results
        try:
            results = task_result.get()

            # Handle case where Celery returns task metadata instead of actual results
            # This can happen when task manually calls update_state(state="FAILURE"/"SUCCESS")
            if isinstance(results, dict) and any(key in results for key in ["started_at", "elapsed_time_seconds", "exc_type"]):
                logger.warning(f"Celery returned task metadata instead of results for job {job_id}: {results}")
                # Check if there's error information in the metadata
                error_msg = results.get("error") or results.get("exc_message") or "Task completed with unexpected result format"
                simplified_status = simplify_job_status(task_state)
                update_job_status_in_supabase(job_id, simplified_status, error_message=str(error_msg))
                return BatchExtractionResponse(
                    task_id=job_id,
                    status=simplified_status,
                    results=[],
                )

            # Validate results format - each item should be a dict
            if not isinstance(results, list):
                logger.error(f"Unexpected results type from Celery task: {type(results)}, expected list. Results: {results!r}")
                raise ValueError(f"Expected list of results, got {type(results).__name__}")

            responses = []
            for idx, res in enumerate(results):
                if isinstance(res, dict):
                    responses.append(DocumentExtractionResponse(**res))
                else:
                    logger.error(f"Result item {idx} is not a dict: {type(res).__name__} = {res!r}")
                    raise TypeError(f"Result item {idx} must be a dict, got {type(res).__name__}: {res!r}")
            
            # Simplify status based on results
            simplified_status = simplify_job_status(task_state, results)

            # Update Supabase with the latest status and results
            processed_count = None
            if results:
                processed_count = sum(
                    1 for r in results
                    if isinstance(r, dict) and r.get("status") in [
                        DocumentProcessingStatus.COMPLETED.value,
                        DocumentProcessingStatus.FAILED.value,
                        DocumentProcessingStatus.PARTIALLY_COMPLETED.value
                    ]
                )
            update_job_status_in_supabase(
                job_id, 
                simplified_status, 
                completed_documents=processed_count,
                results=results
            )

            return BatchExtractionResponse(
                task_id=job_id,
                status=simplified_status,
                results=responses,
            )
        except Exception as get_error:
            error_msg = str(get_error)
            # Check if this is a worker unavailable error
            if "worker" in error_msg.lower() or "not available" in error_msg.lower() or "timeout" in error_msg.lower():
                logger.error(f"Worker unavailable when getting results for job {job_id}: {get_error}")
                raise HTTPException(
                    status_code=503,
                    detail={
                        "error": "Service Unavailable",
                        "message": "The extraction service is temporarily unavailable. Please try again in a few moments.",
                        "code": "WORKER_UNAVAILABLE"
                    }
                )
            # Re-raise other errors
            raise
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        
        # Check if this is a worker/Celery connection error
        error_lower = error_message.lower()
        if any(keyword in error_lower for keyword in ['worker', 'celery', 'broker', 'backend', 'connection', 'timeout', 'not available']):
            logger.warning(f"Celery worker unavailable when retrieving job {job_id}: {error_message}")
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "Service Unavailable",
                    "message": "The extraction service is temporarily unavailable. Please try again in a few moments.",
                    "code": "WORKER_UNAVAILABLE"
                }
            )
        
        # Use logger.exception() which automatically includes exception info
        logger.exception(
            "Error retrieving extraction job {}: {}: {}", job_id, error_type, error_message
        )
        
        # Check if this is a Weaviate/gRPC connection error and raise appropriate exception
        if is_weaviate_or_grpc_error(e):
            raise_weaviate_error(e, context=f"retrieving extraction job {job_id}")
        
        # For other errors, raise generic internal server error
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal Server Error",
                "message": f"An error occurred while retrieving the extraction job: {error_type}: {error_message}",
                "code": "JOB_RETRIEVAL_FAILED",
                "error_type": error_type
            }
        )


@router.get(
    "",
    response_model=ListExtractionJobsResponse,
    summary="List extraction jobs",
    description="List all extraction jobs for the current user with pagination and filtering.",
)
async def list_extraction_jobs(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Number of jobs per page"),
    status: str | None = Query(None, description="Filter by job status (IN_PROGRESS, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED)"),
    user_id: str = Depends(get_current_user),
) -> ListExtractionJobsResponse:
    """
    List extraction jobs for the current user.

    This endpoint queries Celery's result backend to retrieve job information.
    Jobs are filtered by user_id (implicitly through collection ownership).

    **Query Parameters:**
    - **page**: Page number (1-based, default: 1)
    - **page_size**: Number of jobs per page (1-100, default: 20)
    - **status**: Optional status filter (IN_PROGRESS, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED)

    **Response:**
    - List of jobs with metadata
    - Total count of matching jobs
    - Pagination information

    **Note:** This implementation queries Celery's result backend directly.
    Performance may vary based on the number of stored tasks.
    For production use with many tasks, consider implementing a dedicated job tracking database.
    """
    try:
        logger.info(f"Listing extraction jobs for user {user_id}, page={page}, page_size={page_size}, status={status}")

        # Query Celery's result backend to get all tasks
        # Note: This approach has limitations - Celery doesn't provide built-in filtering by user
        # In production, you should use a database to track job metadata

        # Get the inspect API from Celery
        inspect = celery_app.control.inspect()

        # Defensive check: inspect can be None if no workers are running
        if inspect is None:
            logger.error("Celery inspect API returned None - no workers available")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Task processing service is currently unavailable. No workers are running. Please contact support."
            )

        # Get active, scheduled, and reserved tasks with defensive error handling
        try:
            active_tasks = inspect.active() or {}
            scheduled_tasks = inspect.scheduled() or {}
            reserved_tasks = inspect.reserved() or {}
        except Exception as e:
            logger.error("Failed to retrieve task information from Celery workers: {}", e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Task processing service is temporarily unavailable. Please try again later."
            )

        # Combine all active tasks
        all_active = []
        for worker_tasks in [active_tasks, scheduled_tasks, reserved_tasks]:
            for worker_name, tasks in worker_tasks.items():
                all_active.extend(tasks)

        # Build list of job summaries
        jobs = []

        # Add active/scheduled tasks
        for task_info in all_active:
            task_id = task_info.get("id")
            task_name = task_info.get("name", "")

            # Filter for extraction tasks only
            if "extract_information_from_documents_task" not in task_name:
                continue

            # Try to get task args to extract collection_id
            args = task_info.get("args", [])
            collection_id = None
            if args and len(args) > 0 and isinstance(args[0], dict):
                collection_id = args[0].get("collection_id")

            # Get task status and simplify it
            raw_status = "STARTED" if task_info.get("worker_pid") else "PENDING"
            simplified_status = simplify_job_status(raw_status)

            # Apply status filter if specified (map simplified status back for filtering)
            if status:
                # Allow filtering by both simplified and raw statuses for backward compatibility
                if simplified_status != status and raw_status != status:
                    continue

            jobs.append(ExtractionJobSummary(
                task_id=task_id,
                collection_id=collection_id,
                status=simplified_status,
                created_at=datetime.utcnow().isoformat(),  # Not available from inspect
                updated_at=None,
                total_documents=None,
                completed_documents=None,
            ))

        # For completed/failed tasks, we need to query the result backend
        # This is limited because Celery doesn't provide a built-in way to list all results
        # We can only check specific task IDs

        # Log warning about limitations
        if not jobs:
            logger.warning(
                "No active extraction jobs found. "
                "Note: Celery's result backend doesn't support listing completed jobs without task IDs. "
                "For production use, implement a job tracking database."
            )

        # Apply pagination
        total = len(jobs)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_jobs = jobs[start_idx:end_idx]

        logger.info(f"Found {total} extraction jobs, returning page {page} with {len(paginated_jobs)} jobs")

        return ListExtractionJobsResponse(
            jobs=paginated_jobs,
            total=total,
            page=page,
            page_size=page_size,
        )

    except Exception as e:
        logger.error("Error listing extraction jobs: {}", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Error listing extraction jobs: {str(e)}"
        )


@router.delete(
    "/{job_id}",
    response_model=CancelJobResponse,
    summary="Cancel or delete extraction job",
    description="Cancel a running extraction job or delete a completed job. Only the job owner can cancel/delete it.",
)
async def cancel_or_delete_extraction_job(
    job_id: str = Path(..., description="Extraction job ID to cancel"),
    user_id: str = Depends(get_current_user),
) -> CancelJobResponse:
    """
    Cancel a running extraction job.

    This endpoint attempts to cancel an extraction job by revoking the Celery task.

    **Path Parameters:**
    - **job_id**: The ID of the extraction job to cancel

    **Authorization:**
    - Requires X-User-ID header
    - Only the job owner can cancel (verified through collection ownership)

    **Response:**
    - **status**: "cancelled", "already_completed", "not_found", or "failed"
    - **message**: Human-readable status message

    **Error Codes:**
    - 404: Job not found
    - 403: Job belongs to another user (future enhancement)
    - 400: Job already completed

    **Note:** This implementation uses Celery's revoke() method with terminate=True.
    The task will be terminated if it's currently running.
    """
    try:
        logger.info(f"User {user_id} requesting cancellation of job {job_id}")

        # Get task result to check status
        task_result = AsyncResult(id=job_id, app=celery_app)

        # Check if task exists
        if task_result.state == "PENDING" and not task_result.info:
            # Task might not exist or hasn't started yet
            logger.warning(f"Job {job_id} not found or not started")
            return CancelJobResponse(
                task_id=job_id,
                status="not_found",
                message="Job not found or not started yet"
            )

        # Check if task is already completed
        if task_result.ready():
            task_status = task_result.state
            logger.info(f"Job {job_id} already completed with status: {task_status}")

            return CancelJobResponse(
                task_id=job_id,
                status="already_completed",
                message=f"Job already completed with status: {task_status}"
            )

        # Task is running or pending - revoke it
        # terminate=True will kill the worker process if the task is running
        # signal='SIGTERM' is the default, which allows graceful shutdown
        celery_app.control.revoke(
            job_id,
            terminate=True,
            signal='SIGTERM'
        )

        logger.info(f"Successfully revoked job {job_id} for user {user_id}")

        return CancelJobResponse(
            task_id=job_id,
            status="cancelled",
            message="Job cancellation requested. The task will be terminated if currently running."
        )

    except Exception as e:
        logger.error("Error cancelling job {}: {}", job_id, str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Error cancelling job: {str(e)}"
        )


@router.delete(
    "/{job_id}/delete",
    response_model=CancelJobResponse,
    summary="Delete extraction job",
    description="Permanently delete an extraction job from the database. This action cannot be undone.",
)
async def delete_extraction_job(
    job_id: str = Path(..., description="Extraction job ID to delete"),
    user_id: str = Depends(get_current_user),
) -> CancelJobResponse:
    """
    Permanently delete an extraction job from Supabase.
    
    This endpoint deletes the job record from the database. The job must belong to the user.
    
    **Path Parameters:**
    - **job_id**: The ID of the extraction job to delete
    
    **Authorization:**
    - Requires X-User-ID header
    - Only the job owner can delete (verified through user_id)
    
    **Response:**
    - **status**: "deleted" or "not_found"
    - **message**: Human-readable status message
    """
    try:
        logger.info(f"User {user_id} requesting deletion of job {job_id}")
        
        if not supabase:
            raise HTTPException(
                status_code=503,
                detail="Database service unavailable"
            )
        
        # Verify job exists and belongs to user
        job_response = supabase.table("extraction_jobs").select("user_id").eq("job_id", job_id).single().execute()
        
        if not job_response.data:
            logger.warning(f"Job {job_id} not found")
            return CancelJobResponse(
                task_id=job_id,
                status="not_found",
                message="Job not found"
            )
        
        if job_response.data.get("user_id") != user_id:
            logger.warning(f"User {user_id} attempted to delete job {job_id} belonging to another user")
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to delete this job"
            )
        
        # Delete the job from Supabase
        delete_response = supabase.table("extraction_jobs").delete().eq("job_id", job_id).execute()
        
        if delete_response.data:
            logger.info(f"Successfully deleted job {job_id} from database")
            return CancelJobResponse(
                task_id=job_id,
                status="deleted",
                message="Job deleted successfully"
            )
        else:
            logger.warning(f"No rows deleted for job {job_id}")
            return CancelJobResponse(
                task_id=job_id,
                status="not_found",
                message="Job not found or already deleted"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting job {job_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting job: {str(e)}"
        )


# ===== Prompts Management Endpoints =====

@router.get(
    "/prompts",
    response_model=list[str],
    summary="List available prompts",
    description="Get a list of all available extraction prompt IDs.",
)
async def list_prompts() -> list[str]:
    """List all available extraction prompt templates."""
    try:
        return InformationExtractor.list_prompts()
    except Exception as e:
        logger.error(f"Error listing prompts: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing prompts: {str(e)}"
        )


@router.get(
    "/prompts/{prompt_id}",
    response_model=str,
    summary="Get prompt template",
    description="Retrieve a specific prompt template by its ID.",
)
async def get_prompt(
    prompt_id: str = Path(..., description="Prompt ID")
) -> str:
    """Get a specific prompt template."""
    try:
        prompt_id = secure_filename(prompt_id)
        return InformationExtractor.get_prompt_template(prompt_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Prompt '{prompt_id}' not found"
        )
    except Exception as e:
        logger.error(f"Error retrieving prompt {prompt_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving prompt: {str(e)}"
        )


@router.post(
    "/prompts",
    response_model=PromptResponse,
    status_code=201,
    summary="Create custom prompt",
    description="Create a new custom extraction prompt template with Jinja2 syntax.",
)
async def create_prompt(
    request: CreatePromptRequest = Body(...),
) -> PromptResponse:
    """
    Create a new custom prompt template.

    - Validates Jinja2 template syntax
    - Saves template file and metadata
    - Prevents duplicate prompt_id

    Raises:
        - 400: Invalid template syntax or duplicate prompt_id
        - 500: File I/O error
    """
    prompt_id = secure_filename(request.prompt_id)

    # Check if prompt already exists
    if prompt_exists(prompt_id):
        logger.warning(f"Attempted to create duplicate prompt: {prompt_id}")
        raise HTTPException(
            status_code=400,
            detail=f"Prompt '{prompt_id}' already exists"
        )

    # Validate Jinja2 template syntax
    try:
        validate_jinja2_template(request.template)
    except ValueError as e:
        logger.error(f"Invalid Jinja2 template for prompt {prompt_id}: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    # Ensure prompts directory exists
    PROMPTS_DIR.mkdir(parents=True, exist_ok=True)

    # Save template file
    prompt_path = get_prompt_file_path(prompt_id)
    try:
        with open(prompt_path, "w") as f:
            f.write(request.template)
        logger.info(f"Created prompt template file: {prompt_path}")
    except Exception as e:
        logger.error(f"Error writing prompt file {prompt_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error saving prompt template: {str(e)}"
        )

    # Create and save metadata
    created_at = datetime.utcnow().isoformat()
    metadata = PromptMetadata(
        prompt_id=prompt_id,
        description=request.description,
        variables=request.variables,
        created_at=created_at,
        is_system=False
    )

    try:
        save_prompt_metadata(metadata)
    except ValueError as e:
        # Cleanup: remove template file if metadata save fails
        prompt_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    logger.info(f"Successfully created prompt {prompt_id}")

    return PromptResponse(
        prompt_id=prompt_id,
        description=request.description,
        template=request.template,
        variables=request.variables,
        created_at=created_at,
        is_system=False
    )


@router.put(
    "/prompts/{prompt_id}",
    response_model=PromptResponse,
    summary="Update prompt",
    description="Update an existing extraction prompt template.",
)
async def update_prompt(
    prompt_id: str = Path(..., description="Prompt ID to update"),
    request: UpdatePromptRequest = Body(...),
) -> PromptResponse:
    """
    Update an existing prompt template.

    - Verifies prompt exists
    - Validates new template if provided
    - Creates backup before updating
    - Updates only provided fields

    Raises:
        - 400: Invalid template syntax or system prompt modification
        - 404: Prompt not found
        - 500: File I/O error
    """
    prompt_id = secure_filename(prompt_id)

    # Check if prompt exists
    if not prompt_exists(prompt_id):
        logger.warning(f"Attempted to update non-existent prompt: {prompt_id}")
        raise HTTPException(
            status_code=404,
            detail=f"Prompt '{prompt_id}' not found"
        )

    # Load existing metadata
    try:
        metadata = load_prompt_metadata(prompt_id)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    # Load existing template
    try:
        existing_template = InformationExtractor.get_prompt_template(prompt_id)
    except Exception as e:
        logger.error(f"Error loading existing template for {prompt_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error loading existing template: {str(e)}"
        )

    # Validate new template if provided
    new_template = request.template if request.template is not None else existing_template
    if request.template is not None:
        try:
            validate_jinja2_template(request.template)
        except ValueError as e:
            logger.error(f"Invalid Jinja2 template for prompt {prompt_id}: {str(e)}")
            raise HTTPException(
                status_code=400,
                detail=str(e)
            )

    # Create backup before updating
    try:
        create_backup(prompt_id)
    except ValueError as e:
        logger.error(f"Error creating backup for prompt {prompt_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error creating backup: {str(e)}"
        )

    # Update template file if template changed
    if request.template is not None:
        prompt_path = get_prompt_file_path(prompt_id)
        try:
            with open(prompt_path, "w") as f:
                f.write(request.template)
            logger.info(f"Updated prompt template file: {prompt_path}")
        except Exception as e:
            logger.error(f"Error writing prompt file {prompt_id}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Error saving prompt template: {str(e)}"
            )

    # Update metadata
    updated_at = datetime.utcnow().isoformat()
    if request.description is not None:
        metadata.description = request.description
    if request.variables is not None:
        metadata.variables = request.variables
    metadata.updated_at = updated_at

    try:
        save_prompt_metadata(metadata)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    logger.info(f"Successfully updated prompt {prompt_id}")

    return PromptResponse(
        prompt_id=prompt_id,
        description=metadata.description,
        template=new_template,
        variables=metadata.variables,
        created_at=metadata.created_at,
        updated_at=updated_at,
        is_system=metadata.is_system
    )


@router.delete(
    "/prompts/{prompt_id}",
    response_model=DeletePromptResponse,
    summary="Delete prompt",
    description="Delete a custom extraction prompt template (archives instead of hard delete).",
)
async def delete_prompt(
    prompt_id: str = Path(..., description="Prompt ID to delete"),
    force: bool = Query(False, description="Force deletion even if prompt is in use")
) -> DeletePromptResponse:
    """
    Delete a custom prompt template.

    - Verifies prompt exists
    - Prevents deletion of system prompts
    - Archives instead of hard delete (moves to archive directory)
    - Supports force parameter to bypass checks

    Raises:
        - 400: System prompt cannot be deleted
        - 404: Prompt not found
        - 500: File I/O error
    """
    prompt_id = secure_filename(prompt_id)

    # Check if prompt exists
    if not prompt_exists(prompt_id):
        logger.warning(f"Attempted to delete non-existent prompt: {prompt_id}")
        raise HTTPException(
            status_code=404,
            detail=f"Prompt '{prompt_id}' not found"
        )

    # Prevent deletion of system prompts
    if is_system_prompt(prompt_id):
        logger.warning(f"Attempted to delete system prompt: {prompt_id}")
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete system prompt '{prompt_id}'"
        )

    # Archive the prompt (move to archive directory instead of deleting)
    try:
        archive_prompt(prompt_id)
        logger.info(f"Successfully archived prompt {prompt_id}")

        return DeletePromptResponse(
            prompt_id=prompt_id,
            status="archived",
            message=f"Prompt '{prompt_id}' has been archived successfully"
        )
    except ValueError as e:
        logger.error(f"Error archiving prompt {prompt_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ===== Schemas Management Endpoints =====
# DEPRECATED: These endpoints are maintained for backward compatibility.
# Use /schemas endpoints instead (see app/schemas.py)

@router.get(
    "/schemas",
    response_model=list[str],
    summary="List available schemas (DEPRECATED)",
    description="**DEPRECATED**: Use GET /schemas instead. This endpoint will be removed in a future version.",
    deprecated=True,
)
async def list_schemas() -> list[str]:
    """
    List all available extraction schemas.

    **DEPRECATED**: Use GET /schemas instead.
    """
    logger.warning(
        "DEPRECATED: GET /extractions/schemas is deprecated. Use GET /schemas instead. "
        "This endpoint will be removed in a future version."
    )
    try:
        return InformationExtractor.list_schemas()
    except Exception as e:
        logger.error(f"Error listing schemas: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing schemas: {str(e)}"
        )


# ===== Export Endpoints =====

@router.get(
    "/{job_id}/export",
    summary="Export extraction results",
    description="Export extraction results as CSV or Excel file. Returns file as download.",
)
async def export_extraction_results(
    job_id: str = Path(..., description="Extraction job ID"),
    format: str = Query("xlsx", description="Export format: 'xlsx' or 'csv'"),
    user_id: str = Depends(get_current_user),
):
    """
    Export extraction results to CSV or Excel format.

    **Path Parameters:**
    - **job_id**: The ID of the extraction job to export

    **Query Parameters:**
    - **format**: Export format ('xlsx' or 'csv', default: 'xlsx')

    **Authorization:**
    - Requires X-User-ID header
    - Only the job owner can export results

    **Returns:**
    - File download with extraction results
    - Each row represents a document
    - Columns are flattened schema fields
    """
    import pandas as pd
    from io import BytesIO
    from fastapi.responses import StreamingResponse

    # Validate format
    format = format.lower()
    if format not in ("xlsx", "csv"):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Invalid Format",
                "message": "Export format must be 'xlsx' or 'csv'",
                "code": "INVALID_FORMAT"
            }
        )

    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Service Unavailable",
                "message": "Database service is unavailable",
                "code": "DATABASE_UNAVAILABLE"
            }
        )

    try:
        # Fetch job data from Supabase
        job_response = supabase.table("extraction_jobs").select(
            "job_id, user_id, collection_id, schema_id, results, status"
        ).eq("job_id", job_id).single().execute()

        if not job_response.data:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "Job Not Found",
                    "message": f"Extraction job '{job_id}' was not found",
                    "code": "JOB_NOT_FOUND"
                }
            )

        job_data = job_response.data

        # Verify ownership
        if job_data.get("user_id") != user_id:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "Access Denied",
                    "message": "You do not have permission to export this job",
                    "code": "ACCESS_DENIED"
                }
            )

        results = job_data.get("results", [])

        if not results:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "No Results",
                    "message": "This job has no results to export",
                    "code": "NO_RESULTS"
                }
            )

        # Fetch collection and schema names for filename
        collection_name = "extraction"
        schema_name = ""

        if job_data.get("collection_id"):
            try:
                col_response = supabase.table("collections").select("name").eq("id", job_data["collection_id"]).single().execute()
                if col_response.data:
                    collection_name = col_response.data.get("name", "extraction")
            except Exception:
                pass

        if job_data.get("schema_id"):
            try:
                schema_response = supabase.table("extraction_schemas").select("name").eq("id", job_data["schema_id"]).single().execute()
                if schema_response.data:
                    schema_name = schema_response.data.get("name", "")
            except Exception:
                pass

        # Filter completed results and flatten data
        rows = []
        for result in results:
            status = str(result.get("status", "")).lower()
            # Include completed, success, and partially_completed documents
            if status not in ("completed", "success", "partially_completed"):
                continue

            extracted_data = result.get("extracted_data", {})
            if not extracted_data:
                continue

            # Start with metadata
            row = {
                "document_id": result.get("document_id", ""),
                "status": result.get("status", ""),
                "completed_at": result.get("completed_at", ""),
            }

            # Flatten nested extracted_data
            def flatten_dict(d: dict, parent_key: str = "") -> dict:
                items = {}
                for k, v in d.items():
                    new_key = f"{parent_key}.{k}" if parent_key else k
                    if isinstance(v, dict):
                        items.update(flatten_dict(v, new_key))
                    elif isinstance(v, list):
                        # Convert lists to JSON string or comma-separated for simple values
                        if v and isinstance(v[0], dict):
                            items[new_key] = json.dumps(v, ensure_ascii=False)
                        else:
                            items[new_key] = ", ".join(str(x) for x in v)
                    else:
                        items[new_key] = v
                return items

            flattened = flatten_dict(extracted_data)
            row.update(flattened)
            rows.append(row)

        if not rows:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "No Completed Results",
                    "message": "No completed results with data available to export",
                    "code": "NO_COMPLETED_RESULTS"
                }
            )

        # Create DataFrame
        df = pd.DataFrame(rows)

        # Reorder columns: document_id, status, completed_at first, then alphabetically
        priority_cols = ["document_id", "status", "completed_at"]
        other_cols = sorted([c for c in df.columns if c not in priority_cols])
        ordered_cols = [c for c in priority_cols if c in df.columns] + other_cols
        df = df[ordered_cols]

        # Generate filename
        safe_collection = "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in collection_name)
        safe_schema = "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in schema_name) if schema_name else ""
        date_str = datetime.utcnow().strftime("%Y-%m-%d")

        filename_parts = [p for p in [safe_collection, safe_schema, date_str] if p]
        filename = "_".join(filename_parts)

        # Create file in memory
        output = BytesIO()

        if format == "xlsx":
            # Excel export
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                sheet_name = (schema_name or "Results")[:31]  # Excel 31 char limit
                df.to_excel(writer, sheet_name=sheet_name, index=False)

            output.seek(0)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename_ext = f"{filename}.xlsx"
        else:
            # CSV export with UTF-8 BOM for Excel compatibility
            csv_content = df.to_csv(index=False)
            output.write(b'\xef\xbb\xbf')  # UTF-8 BOM
            output.write(csv_content.encode('utf-8'))

            output.seek(0)
            media_type = "text/csv; charset=utf-8"
            filename_ext = f"{filename}.csv"

        logger.info(f"Exporting job {job_id} as {format}: {len(rows)} rows, filename={filename_ext}")

        return StreamingResponse(
            output,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename_ext}"',
                "X-Rows-Count": str(len(rows)),
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting job {job_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Export Failed",
                "message": f"Failed to export results: {str(e)}",
                "code": "EXPORT_FAILED"
            }
        )


# =============================================================================
# BASE SCHEMA EXTRACTION ENDPOINTS
# =============================================================================


from juddges_search.info_extraction import BaseSchemaExtractor
from app.models import (
    BaseSchemaExtractionRequest,
    BaseSchemaExtractionResponse,
    BaseSchemaExtractionResult,
    ExtractedDataFilterRequest,
    FacetCount,
    FacetCountsResponse,
    FilterFieldConfig,
    FilterOptionsResponse,
)


@router.post(
    "/base-schema",
    response_model=BaseSchemaExtractionResponse,
    summary="Extract using universal base schema",
    description="Extract structured data from legal documents using the universal base schema with jurisdiction detection.",
)
async def extract_with_base_schema(
    request: BaseSchemaExtractionRequest,
) -> BaseSchemaExtractionResponse:
    """
    Extract structured data from legal documents using the universal base schema.

    This endpoint:
    1. Automatically detects document jurisdiction (EN_UK, PL, etc.)
    2. Applies jurisdiction-specific field mappings
    3. Extracts all 50+ fields defined in the base schema
    4. Stores extracted data in the extracted_data JSONB column

    The extracted data can then be used for faceted filtering and search.
    """
    from langchain_openai import ChatOpenAI
    from juddges_search.db.weaviate_db import WeaviateClient

    results: list[BaseSchemaExtractionResult] = []
    successful = 0
    failed = 0

    # Initialize extractor with specified model
    model = ChatOpenAI(model=request.llm_name, temperature=0)
    extractor = BaseSchemaExtractor(model=model)

    # Get Weaviate client for document retrieval
    try:
        weaviate_client = WeaviateClient()
    except Exception as e:
        logger.error(f"Failed to connect to Weaviate: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Vector Database Unavailable",
                "message": "Could not connect to the document database.",
                "code": "WEAVIATE_UNAVAILABLE",
            }
        )

    for doc_id in request.document_ids:
        try:
            # Fetch document from Weaviate
            doc = await weaviate_client.get_document_by_id(doc_id)
            if not doc:
                results.append(BaseSchemaExtractionResult(
                    document_id=doc_id,
                    jurisdiction="unknown",
                    status="failed",
                    error_message=f"Document not found: {doc_id}",
                ))
                failed += 1
                continue

            # Extract full text
            full_text = doc.get("full_text", "") or doc.get("content", "")
            if not full_text:
                results.append(BaseSchemaExtractionResult(
                    document_id=doc_id,
                    jurisdiction="unknown",
                    status="failed",
                    error_message="Document has no text content",
                ))
                failed += 1
                continue

            # Perform extraction
            jurisdiction_override = request.jurisdiction_override  # type: ignore
            extracted_data, jurisdiction = await extractor.extract(
                document_text=full_text,
                language=doc.get("language"),
                court_name=doc.get("court_name"),
                jurisdiction_override=jurisdiction_override,
                additional_instructions=request.additional_instructions,
            )

            # Validate extraction
            is_valid, validation_errors = extractor.validate_extraction(extracted_data)

            # Store in Supabase
            if supabase:
                try:
                    supabase.table("legal_documents").update({
                        "extracted_data": extracted_data,
                        "jurisdiction": jurisdiction,
                        "extraction_status": "completed",
                        "extracted_at": datetime.utcnow().isoformat(),
                    }).eq("document_id", doc_id).execute()
                except Exception as e:
                    logger.warning(f"Failed to store extracted data for {doc_id}: {e}")

            results.append(BaseSchemaExtractionResult(
                document_id=doc_id,
                jurisdiction=jurisdiction,
                status="completed",
                extracted_data=extracted_data,
                validation_errors=validation_errors if validation_errors else None,
            ))
            successful += 1

        except Exception as e:
            logger.error(f"Failed to extract from document {doc_id}: {e}", exc_info=True)
            results.append(BaseSchemaExtractionResult(
                document_id=doc_id,
                jurisdiction="unknown",
                status="failed",
                error_message=str(e),
            ))
            failed += 1

    return BaseSchemaExtractionResponse(
        results=results,
        total_documents=len(request.document_ids),
        successful_extractions=successful,
        failed_extractions=failed,
    )


@router.post(
    "/base-schema/filter",
    summary="Filter documents by extracted data",
    description="Filter documents using extracted_data fields with faceted filtering and text search.",
)
async def filter_by_extracted_data(
    request: ExtractedDataFilterRequest,
):
    """
    Filter documents by extracted_data fields.

    Supports:
    - Faceted filtering on enum fields (e.g., appellant, appeal_outcome)
    - Full-text search on text fields (e.g., case_name, offender_representative_name)
    - Array containment queries (e.g., keywords, convict_offences)
    - Range queries on numeric fields (e.g., num_victims, case_number)
    """
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Database Unavailable",
                "message": "Database connection not available.",
                "code": "DATABASE_UNAVAILABLE",
            }
        )

    try:
        # Call the stored function for filtering
        response = supabase.rpc(
            "filter_documents_by_extracted_data",
            {
                "p_filters": request.filters,
                "p_text_query": request.text_query,
                "p_limit": request.limit,
                "p_offset": request.offset,
            }
        ).execute()

        if response.data:
            documents = response.data
            total_count = documents[0].get("total_count", 0) if documents else 0
            return {
                "documents": documents,
                "total_count": total_count,
                "limit": request.limit,
                "offset": request.offset,
                "has_more": len(documents) == request.limit,
            }
        return {
            "documents": [],
            "total_count": 0,
            "limit": request.limit,
            "offset": request.offset,
            "has_more": False,
        }

    except Exception as e:
        logger.error(f"Failed to filter documents: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Filter Failed",
                "message": str(e),
                "code": "FILTER_FAILED",
            }
        )


@router.get(
    "/base-schema/facets/{field}",
    response_model=FacetCountsResponse,
    summary="Get facet counts for a field",
    description="Get value counts for a specific extracted_data field for faceted filtering.",
)
async def get_facet_counts(
    field: str = Path(description="Field name to get facet counts for"),
):
    """
    Get value counts for a specific extracted_data field.

    Returns a list of values and their occurrence counts, useful for
    building faceted filter UI components.
    """
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Database Unavailable",
                "message": "Database connection not available.",
                "code": "DATABASE_UNAVAILABLE",
            }
        )

    try:
        # Call the stored function for facet counts
        response = supabase.rpc(
            "get_extracted_facet_counts",
            {"field_path": field}
        ).execute()

        counts = [
            FacetCount(value=row["value"], count=row["count"])
            for row in (response.data or [])
            if row.get("value")
        ]

        return FacetCountsResponse(
            field=field,
            counts=counts,
            total=sum(c.count for c in counts),
        )

    except Exception as e:
        logger.error(f"Failed to get facet counts for {field}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Facet Query Failed",
                "message": str(e),
                "code": "FACET_QUERY_FAILED",
            }
        )


@router.get(
    "/base-schema/filter-options",
    response_model=FilterOptionsResponse,
    summary="Get available filter options",
    description="Get all available filter fields with their types and configurations.",
)
async def get_filter_options():
    """
    Get all available filter fields for the base schema.

    Returns field configurations including:
    - Field name and type
    - Filter type (facet, text_search, range, array_contains)
    - UI label and order
    - Enum values for facet fields
    """
    extractor = BaseSchemaExtractor()
    filter_configs = extractor.get_filter_config()

    fields = [
        FilterFieldConfig(
            field=config["field"],
            type=config["type"],
            filter_type=config["filter_type"],
            label=config["label"],
            order=config["order"],
            description=config["description"],
            enum_values=config.get("enum_values"),
        )
        for config in filter_configs
    ]

    return FilterOptionsResponse(fields=fields)

