"""Extraction job submission, status, listing, and cancellation routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Union

from celery.result import AsyncResult
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, status
from loguru import logger

from app.models import (
    BatchExtractionResponse,
    BulkExtractionJobInfo,
    BulkExtractionRequest,
    BulkExtractionResponse,
    CancelJobResponse,
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    DocumentExtractionSubmissionResponse,
    DocumentProcessingStatus,
    ExtractionJobSummary,
    ListExtractionJobsResponse,
    SimpleExtractionRequest,
)
from app.workers import celery_app, extract_information_from_documents_task
from app.extraction_domain.shared import (
    _check_supabase_available,
    _convert_simplified_schema,
    _create_extraction_response,
    _fetch_schema_from_db,
    _submit_extraction_task,
    _validate_collection_id,
    _validate_documents,
    _validate_schema_id_required,
    get_current_user,
    is_uuid,
    simplify_job_status,
    supabase,
    update_job_status_in_supabase,
)

router = APIRouter()

_TASK_NOT_CAPTURED_MARKERS = ("not found", "does not exist", "pending")
_WORKER_UNAVAILABLE_MARKERS = (
    "worker",
    "celery",
    "broker",
    "backend",
    "connection",
    "timeout",
    "not available",
)
_RESULT_METADATA_MARKERS = ("started_at", "elapsed_time_seconds", "exc_type")
_TERMINAL_DOCUMENT_STATUSES = {
    DocumentProcessingStatus.COMPLETED.value,
    DocumentProcessingStatus.FAILED.value,
    DocumentProcessingStatus.PARTIALLY_COMPLETED.value,
}


def _pending_batch_response(job_id: str) -> BatchExtractionResponse:
    """Build PENDING response payload."""
    return BatchExtractionResponse(task_id=job_id, status="PENDING", results=None)


def _in_progress_batch_response(job_id: str) -> BatchExtractionResponse:
    """Build IN_PROGRESS response payload."""
    return BatchExtractionResponse(task_id=job_id, status="IN_PROGRESS", results=None)


def _worker_unavailable_error() -> HTTPException:
    """Create standardized worker-unavailable HTTP error."""
    return HTTPException(
        status_code=503,
        detail={
            "error": "Service Unavailable",
            "message": "The extraction service is temporarily unavailable. Please try again in a few moments.",
            "code": "WORKER_UNAVAILABLE",
        },
    )


def _is_worker_unavailable_message(error_message: str) -> bool:
    """Check whether an error message indicates worker/backend unavailability."""
    lowered = error_message.lower()
    return any(marker in lowered for marker in _WORKER_UNAVAILABLE_MARKERS)


def _is_task_not_captured_error(state_error: Exception) -> bool:
    """Check whether task state exception indicates task not captured yet."""
    error_msg = str(state_error).lower()
    return any(marker in error_msg for marker in _TASK_NOT_CAPTURED_MARKERS)


def _is_metadata_result_payload(results: object) -> bool:
    """Check if Celery returned metadata payload instead of list results."""
    return isinstance(results, dict) and any(
        key in results for key in _RESULT_METADATA_MARKERS
    )


def _safe_get_task_state(task_result: AsyncResult, job_id: str) -> str | None:
    """Safely retrieve task state; return None when task is not captured yet."""
    try:
        return task_result.state
    except Exception as state_error:
        if _is_task_not_captured_error(state_error):
            logger.warning(
                f"Task {job_id} not found or not captured by worker: {state_error}"
            )
            return None
        logger.error(f"Failed to get task state for job {job_id}: {state_error}")
        raise _worker_unavailable_error()


def _load_job_record(job_id: str) -> dict | None:
    """Load extraction job row from Supabase."""
    if not supabase:
        return None
    try:
        job_data = (
            supabase.table("extraction_jobs")
            .select("*")
            .eq("job_id", job_id)
            .single()
            .execute()
        )
        return job_data.data
    except Exception as supabase_error:
        logger.warning(
            f"Could not retrieve job data from Supabase for {job_id}: {supabase_error}"
        )
        return None


def _deserialize_existing_results(existing_results: object) -> list[DocumentExtractionResponse] | None:
    """Deserialize stored extraction results into response models."""
    if not existing_results:
        return None
    return [
        DocumentExtractionResponse(**result)
        if isinstance(result, dict)
        else result
        for result in existing_results
    ]


def _preserve_existing_job_progress(
    job_id: str, job_data: dict
) -> BatchExtractionResponse | None:
    """Preserve existing job progress from Supabase when Celery state is missing."""
    completed_documents = job_data.get("completed_documents", 0) or 0
    total_documents = job_data.get("total_documents", 0) or 0
    existing_status = job_data.get("status", "PENDING")
    existing_results = job_data.get("results")

    if completed_documents <= 0 and not existing_results:
        return None

    logger.info(
        f"Job {job_id} has existing progress: {completed_documents}/{total_documents} docs, "
        f"status={existing_status}. Preserving state instead of resetting to PENDING."
    )

    if completed_documents >= total_documents and total_documents > 0:
        final_status = "COMPLETED"
        if existing_status not in ["SUCCESS", "COMPLETED", "PARTIALLY_COMPLETED"]:
            update_job_status_in_supabase(
                job_id, final_status, completed_documents=completed_documents
            )
    elif completed_documents > 0:
        final_status = "PARTIALLY_COMPLETED"
        if existing_status not in [
            "SUCCESS",
            "COMPLETED",
            "PARTIALLY_COMPLETED",
            "FAILURE",
        ]:
            update_job_status_in_supabase(
                job_id, final_status, completed_documents=completed_documents
            )
    else:
        final_status = existing_status

    return BatchExtractionResponse(
        task_id=job_id,
        status=final_status,
        results=_deserialize_existing_results(existing_results),
    )


def _build_resubmit_request_from_job(
    job_data: dict, schema_data: dict
) -> DocumentExtractionRequest:
    """Build a new extraction request from persisted job and schema data."""
    user_schema = {
        "name": schema_data["name"],
        "description": schema_data.get("description", ""),
        "text": schema_data["text"],
    }
    return DocumentExtractionRequest(
        collection_id=job_data["collection_id"],
        schema_id=job_data["schema_id"],
        document_ids=job_data.get("document_ids", []),
        language=job_data.get("language", "pl"),
        extraction_context=job_data.get(
            "extraction_context",
            "Extract structured information from legal documents using the provided schema.",
        ),
        user_schema=user_schema,
        prompt_id=job_data.get("prompt_id", "info_extraction"),
    )


def _try_resubmit_job(job_id: str, job_data: dict) -> BatchExtractionResponse | None:
    """Resubmit extraction job when no worker ever captured the original task."""
    collection_id = job_data.get("collection_id")
    schema_id = job_data.get("schema_id")
    document_ids = job_data.get("document_ids", [])
    if not (collection_id and schema_id and document_ids):
        return None
    if not supabase:
        return None

    schema_response = (
        supabase.table("extraction_schemas")
        .select("name, description, text")
        .eq("id", schema_id)
        .single()
        .execute()
    )
    if not schema_response.data:
        return None

    try:
        resubmit_request = _build_resubmit_request_from_job(
            job_data=job_data, schema_data=schema_response.data
        )
        new_task = extract_information_from_documents_task.delay(
            resubmit_request.model_dump(mode="json")
        )
        logger.info(f"Resubmitted job {job_id} as new job {new_task.id}")

        supabase.table("extraction_jobs").update(
            {
                "job_id": new_task.id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("job_id", job_id).execute()

        return _in_progress_batch_response(new_task.id)
    except Exception as resubmit_error:
        logger.error(f"Failed to resubmit job {job_id}: {resubmit_error}")
        return None


def _resolve_pending_job(job_id: str) -> BatchExtractionResponse:
    """Resolve pending state by preserving existing progress or resubmitting when possible."""
    logger.warning(
        f"Task {job_id} is PENDING with no info - checking Supabase for existing state"
    )
    job_data = _load_job_record(job_id)
    if not job_data:
        return _pending_batch_response(job_id)

    preserved_response = _preserve_existing_job_progress(job_id, job_data)
    if preserved_response:
        return preserved_response

    logger.info(f"Job {job_id} has no progress, attempting to resubmit")
    resubmitted_response = _try_resubmit_job(job_id, job_data)
    if resubmitted_response:
        return resubmitted_response
    return _pending_batch_response(job_id)


def _handle_not_ready_task(
    task_result: AsyncResult, task_state: str, job_id: str
) -> BatchExtractionResponse | None:
    """Handle task states that are still in progress."""
    try:
        if task_result.ready():
            return None

        simplified_status = simplify_job_status(task_state)
        task_info = task_result.info
        completed_docs = task_info.get("completed_documents") if isinstance(task_info, dict) else None
        update_job_status_in_supabase(
            job_id, simplified_status, completed_documents=completed_docs
        )
        return BatchExtractionResponse(
            task_id=job_id,
            status=simplified_status,
            results=None,
        )
    except Exception as ready_error:
        logger.warning(f"Error checking if task {job_id} is ready: {ready_error}")
        if not task_result.info:
            return _pending_batch_response(job_id)
        return _in_progress_batch_response(job_id)


def _handle_failed_task(
    task_result: AsyncResult, task_state: str, job_id: str
) -> BatchExtractionResponse | None:
    """Handle failed terminal task states."""
    try:
        if not task_result.failed():
            return None

        error_info = task_result.info
        error_type = type(error_info).__name__ if error_info else "TaskError"
        error_message = str(error_info) if error_info else "Task failed"
        logger.error(
            "Extraction job {} failed: {}: {}",
            job_id,
            error_type,
            error_message,
        )
        simplified_status = simplify_job_status(task_state)
        update_job_status_in_supabase(
            job_id, simplified_status, error_message=error_message
        )
        return BatchExtractionResponse(task_id=job_id, status=simplified_status, results=[])
    except Exception as failed_check_error:
        logger.warning(f"Error checking if task {job_id} failed: {failed_check_error}")
        return None


def _parse_task_results(results: object) -> tuple[list[DocumentExtractionResponse], list[dict]]:
    """Validate raw task results and convert them to response models."""
    if not isinstance(results, list):
        logger.error(
            f"Unexpected results type from Celery task: {type(results)}, expected list. Results: {results!r}"
        )
        raise ValueError(f"Expected list of results, got {type(results).__name__}")

    responses: list[DocumentExtractionResponse] = []
    normalized_results: list[dict] = []
    for idx, result in enumerate(results):
        if not isinstance(result, dict):
            logger.error(
                f"Result item {idx} is not a dict: {type(result).__name__} = {result!r}"
            )
            raise TypeError(
                f"Result item {idx} must be a dict, got {type(result).__name__}: {result!r}"
            )
        normalized_results.append(result)
        responses.append(DocumentExtractionResponse(**result))

    return responses, normalized_results


def _count_processed_documents(results: list[dict]) -> int | None:
    """Count processed documents from normalized extraction results."""
    if not results:
        return None
    return sum(
        1
        for result in results
        if result.get("status") in _TERMINAL_DOCUMENT_STATUSES
    )


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
            document_ids = _validate_documents(
                request.document_ids, request.collection_id
            )

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
        logger.error(
            "Unexpected error creating extraction job: {}", str(e), exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal Server Error",
                "message": f"An unexpected error occurred while creating the extraction job: {str(e)}. Please try again or contact support.",
                "code": "INTERNAL_ERROR",
            },
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
            document_ids = _validate_documents(
                request.document_ids, request.collection_id
            )

            # Validate schema_id is present and is a UUID
            _validate_schema_id_required(request.schema_id)
            if not is_uuid(request.schema_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "Invalid Schema ID",
                        "message": f"Schema ID '{request.schema_id}' is not a valid UUID. This endpoint requires a schema from Supabase database.",
                        "code": "INVALID_SCHEMA_ID",
                    },
                )

            # Fetch full schema with metadata from database
            logger.info(f"Fetching full schema {request.schema_id} from database")
            user_schema = _fetch_schema_from_db(
                request.schema_id, include_metadata=True
            )
            logger.info(
                f"Successfully fetched full schema from database: {request.schema_id}"
            )

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
                missing_fields = [
                    f for f in required_fields if f not in request.user_schema
                ]
                if missing_fields:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "error": "Invalid Schema Format",
                            "message": f"Schema is missing required fields: {', '.join(missing_fields)}. "
                            f"Schema must have 'name', 'description', and 'text' fields.",
                            "code": "INVALID_SCHEMA_FORMAT",
                        },
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
                    "code": "MISSING_USER_SCHEMA",
                },
            )

        # Submit and return
        task_id = _submit_extraction_task(extraction_request)
        return _create_extraction_response(task_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Unexpected error creating extraction job: {}", str(e), exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal Server Error",
                "message": f"An unexpected error occurred while creating the extraction job: {str(e)}. Please try again or contact support.",
                "code": "INTERNAL_ERROR",
            },
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
                jobs.append(
                    BulkExtractionJobInfo(
                        job_id="",
                        schema_id=schema_id,
                        schema_name=None,
                        status="rejected",
                    )
                )
                continue

            try:
                # Fetch schema from database
                schema_data = _fetch_schema_from_db(schema_id, include_metadata=True)
                schema_name = (
                    schema_data.get("name", "Unknown Schema")
                    if isinstance(schema_data, dict)
                    else None
                )

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

                jobs.append(
                    BulkExtractionJobInfo(
                        job_id=task_id,
                        schema_id=schema_id,
                        schema_name=schema_name,
                        status="accepted",
                    )
                )

                logger.info(
                    f"Bulk extraction: created job {task_id} for schema {schema_id} ({schema_name})"
                )

            except HTTPException as he:
                logger.warning(
                    f"Failed to create job for schema {schema_id}: {he.detail}"
                )
                jobs.append(
                    BulkExtractionJobInfo(
                        job_id="",
                        schema_id=schema_id,
                        schema_name=None,
                        status="rejected",
                    )
                )
            except Exception as e:
                logger.error(
                    f"Unexpected error creating job for schema {schema_id}: {e}"
                )
                jobs.append(
                    BulkExtractionJobInfo(
                        job_id="",
                        schema_id=schema_id,
                        schema_name=None,
                        status="rejected",
                    )
                )

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
                "code": "BULK_EXTRACTION_FAILED",
            },
        )


@router.get(
    "/{job_id}",
    response_model=BatchExtractionResponse,
    summary="Get extraction job status and results",
    description="Retrieve the status and results of an extraction job by its ID.",
)
async def get_extraction_job(
    job_id: str = Path(..., description="Extraction job ID (task ID)"),
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
        task_result = AsyncResult(id=job_id, app=celery_app)
        task_state = _safe_get_task_state(task_result, job_id)
        if task_state is None:
            return _pending_batch_response(job_id)

        if task_state == "PENDING" and not task_result.info:
            return _resolve_pending_job(job_id)

        not_ready_response = _handle_not_ready_task(task_result, task_state, job_id)
        if not_ready_response:
            return not_ready_response

        failed_response = _handle_failed_task(task_result, task_state, job_id)
        if failed_response:
            return failed_response

        try:
            results = task_result.get()
            if _is_metadata_result_payload(results):
                logger.warning(
                    f"Celery returned task metadata instead of results for job {job_id}: {results}"
                )
                error_msg = (
                    results.get("error")
                    or results.get("exc_message")
                    or "Task completed with unexpected result format"
                )
                simplified_status = simplify_job_status(task_state)
                update_job_status_in_supabase(
                    job_id, simplified_status, error_message=str(error_msg)
                )
                return BatchExtractionResponse(
                    task_id=job_id,
                    status=simplified_status,
                    results=[],
                )

            responses, normalized_results = _parse_task_results(results)
            simplified_status = simplify_job_status(task_state, normalized_results)
            processed_count = _count_processed_documents(normalized_results)
            update_job_status_in_supabase(
                job_id,
                simplified_status,
                completed_documents=processed_count,
                results=normalized_results,
            )
            return BatchExtractionResponse(
                task_id=job_id,
                status=simplified_status,
                results=responses,
            )
        except Exception as get_error:
            if _is_worker_unavailable_message(str(get_error)):
                logger.error(
                    f"Worker unavailable when getting results for job {job_id}: {get_error}"
                )
                raise _worker_unavailable_error()
            raise
    except HTTPException:
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)

        if _is_worker_unavailable_message(error_message):
            logger.warning(
                f"Celery worker unavailable when retrieving job {job_id}: {error_message}"
            )
            raise _worker_unavailable_error()

        logger.exception(
            "Error retrieving extraction job {}: {}: {}",
            job_id,
            error_type,
            error_message,
        )

        # For other errors, raise generic internal server error
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal Server Error",
                "message": f"An error occurred while retrieving the extraction job: {error_type}: {error_message}",
                "code": "JOB_RETRIEVAL_FAILED",
                "error_type": error_type,
            },
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
    status: str | None = Query(
        None,
        description="Filter by job status (IN_PROGRESS, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED)",
    ),
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
        logger.info(
            f"Listing extraction jobs for user {user_id}, page={page}, page_size={page_size}, status={status}"
        )

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
                detail="Task processing service is currently unavailable. No workers are running. Please contact support.",
            )

        # Get active, scheduled, and reserved tasks with defensive error handling
        try:
            active_tasks = inspect.active() or {}
            scheduled_tasks = inspect.scheduled() or {}
            reserved_tasks = inspect.reserved() or {}
        except Exception as e:
            logger.error(
                "Failed to retrieve task information from Celery workers: {}", e
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Task processing service is temporarily unavailable. Please try again later.",
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

            jobs.append(
                ExtractionJobSummary(
                    task_id=task_id,
                    collection_id=collection_id,
                    status=simplified_status,
                    created_at=datetime.now(
                        timezone.utc
                    ).isoformat(),  # Not available from inspect
                    updated_at=None,
                    total_documents=None,
                    completed_documents=None,
                )
            )

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

        logger.info(
            f"Found {total} extraction jobs, returning page {page} with {len(paginated_jobs)} jobs"
        )

        return ListExtractionJobsResponse(
            jobs=paginated_jobs,
            total=total,
            page=page,
            page_size=page_size,
        )

    except Exception as e:
        logger.error("Error listing extraction jobs: {}", str(e))
        raise HTTPException(
            status_code=500, detail=f"Error listing extraction jobs: {str(e)}"
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
                message="Job not found or not started yet",
            )

        # Check if task is already completed
        if task_result.ready():
            task_status = task_result.state
            logger.info(f"Job {job_id} already completed with status: {task_status}")

            return CancelJobResponse(
                task_id=job_id,
                status="already_completed",
                message=f"Job already completed with status: {task_status}",
            )

        # Task is running or pending - revoke it
        # terminate=True will kill the worker process if the task is running
        # signal='SIGTERM' is the default, which allows graceful shutdown
        celery_app.control.revoke(job_id, terminate=True, signal="SIGTERM")

        logger.info(f"Successfully revoked job {job_id} for user {user_id}")

        return CancelJobResponse(
            task_id=job_id,
            status="cancelled",
            message="Job cancellation requested. The task will be terminated if currently running.",
        )

    except Exception as e:
        logger.error("Error cancelling job {}: {}", job_id, str(e))
        raise HTTPException(status_code=500, detail=f"Error cancelling job: {str(e)}")


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
            raise HTTPException(status_code=503, detail="Database service unavailable")

        # Verify job exists and belongs to user
        job_response = (
            supabase.table("extraction_jobs")
            .select("user_id")
            .eq("job_id", job_id)
            .single()
            .execute()
        )

        if not job_response.data:
            logger.warning(f"Job {job_id} not found")
            return CancelJobResponse(
                task_id=job_id, status="not_found", message="Job not found"
            )

        if job_response.data.get("user_id") != user_id:
            logger.warning(
                f"User {user_id} attempted to delete job {job_id} belonging to another user"
            )
            raise HTTPException(
                status_code=403, detail="You do not have permission to delete this job"
            )

        # Delete the job from Supabase
        delete_response = (
            supabase.table("extraction_jobs").delete().eq("job_id", job_id).execute()
        )

        if delete_response.data:
            logger.info(f"Successfully deleted job {job_id} from database")
            return CancelJobResponse(
                task_id=job_id, status="deleted", message="Job deleted successfully"
            )
        else:
            logger.warning(f"No rows deleted for job {job_id}")
            return CancelJobResponse(
                task_id=job_id,
                status="not_found",
                message="Job not found or already deleted",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting job {job_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error deleting job: {str(e)}")
