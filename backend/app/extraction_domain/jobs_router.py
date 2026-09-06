"""Extraction job submission, status, listing, and cancellation routes."""

from __future__ import annotations

import os
from datetime import UTC, datetime

from celery.result import AsyncResult
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    HTTPException,
    Path,
    Query,
    Request,
    status,
)
from loguru import logger
from supabase import PostgrestAPIError, StorageException

from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.extraction_domain.shared import (
    _check_supabase_available,
    _convert_simplified_schema,
    _create_extraction_response,
    _enforce_max_documents,
    _fetch_schema_from_db,
    _submit_extraction_task,
    _validate_collection_id,
    _validate_documents,
    _validate_schema_id_required,
    is_uuid,
    simplify_job_status,
    supabase,
    update_job_status_in_supabase,
)
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
from app.rate_limiter import limiter
from app.services.audit_service import log_audit_background
from app.workers import celery_app, extract_information_from_documents_task

EXTRACTION_SUBMIT_RATE_LIMIT: str = os.getenv(
    "EXTRACTION_SUBMIT_RATE_LIMIT", "10/minute"
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
_JOB_STATE_FIELDS = (
    "job_id, user_id, status, completed_documents, total_documents, attempts"
)
_JOB_RECOVERY_FIELDS = (
    f"{_JOB_STATE_FIELDS}, collection_id, schema_id, document_ids, "
    "language, extraction_context, prompt_id"
)
_JOB_RESULTS_FIELDS = "job_id, user_id, results"
_TERMINAL_DOCUMENT_STATUSES = {
    DocumentProcessingStatus.COMPLETED.value,
    DocumentProcessingStatus.FAILED.value,
    DocumentProcessingStatus.PARTIALLY_COMPLETED.value,
}


def _audit_extraction_job(
    background_tasks: BackgroundTasks,
    *,
    user_id: str,
    action_type: str,
    job_id: str,
    document_ids: list[str] | None = None,
    collection_id: str | None = None,
    api_endpoint: str | None = None,
) -> None:
    """Record an extraction-job state change in the compliance trail (#559).

    Extraction is where judgment text is handed to an LLM, so which user ran
    which schema over which documents is the AI-processing record the trail
    exists to hold. Scheduled as a background task; AuditService swallows its
    own failures, so this cannot affect the submission.
    """
    log_audit_background(
        background_tasks,
        user_id=user_id,
        action_type=action_type,
        input_data={
            "job_id": job_id,
            "collection_id": collection_id,
            "document_count": len(document_ids) if document_ids is not None else None,
        },
        resource_type="extraction_job",
        resource_id=job_id,
        api_endpoint=api_endpoint,
    )


def _pending_batch_response(job_id: str) -> BatchExtractionResponse:
    """Build PENDING response payload."""
    return BatchExtractionResponse(task_id=job_id, status="PENDING", results=None)


def _in_progress_batch_response(job_id: str) -> BatchExtractionResponse:
    """Build IN_PROGRESS response payload."""
    return BatchExtractionResponse(task_id=job_id, status="IN_PROGRESS", results=None)


def _with_optional_results(
    response: BatchExtractionResponse, include_results: bool
) -> BatchExtractionResponse:
    """Strip heavy result payloads from ownership/status-only reads."""
    if include_results:
        return response
    return response.model_copy(update={"results": None})


def _optional_count(value: object) -> int | None:
    """Coerce a persisted counter to an int, or None when it is not one."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _with_job_progress(
    response: BatchExtractionResponse,
    job_record: dict,
    completed_documents: int | None = None,
) -> BatchExtractionResponse:
    """Attach the persisted attempt and progress counters to a job response.

    These live on the `extraction_jobs` row, not in Celery state, so every
    response path in the detail endpoint has to copy them across. `attempts` is
    what tells the UI a job was interrupted and resumed instead of run once;
    without it the counters never leave the database.

    Fields stay None when the row does not carry a usable value — a missing
    counter is not a zero.
    """
    return response.model_copy(
        update={
            "attempts": _optional_count(job_record.get("attempts")),
            "completed_documents": (
                completed_documents
                if completed_documents is not None
                else _optional_count(job_record.get("completed_documents"))
            ),
            "total_documents": _optional_count(job_record.get("total_documents")),
        }
    )


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
        # Broad catch: Celery task state access can raise connection errors,
        # backend unavailability, or kombu/amqp exceptions.
        if _is_task_not_captured_error(state_error):
            logger.warning(
                f"Task {job_id} not found or not captured by worker: {state_error}"
            )
            return None
        logger.error(f"Failed to get task state for job {job_id}: {state_error}")
        raise _worker_unavailable_error()


def _load_owned_job_fields(job_id: str, user_id: str, fields: str) -> dict:
    """Load selected fields from one owned job without revealing hidden rows.

    The user filter is part of the same database read as the job filter.  A
    missing row and an RLS-hidden/other-user row therefore share the exact 404
    contract, while database failures stay distinguishable as 503.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Extraction job store unavailable",
        )
    try:
        response = (
            supabase.table("extraction_jobs")
            .select(fields)
            .eq("job_id", job_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as lookup_error:
        logger.error(
            f"Could not verify extraction job access for {job_id}: {lookup_error}"
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Extraction job store unavailable",
        ) from lookup_error

    rows = response.data or []
    if isinstance(rows, dict):
        rows = [rows]
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extraction job not found",
        )
    return rows[0]


def _load_owned_job_record(job_id: str, user_id: str) -> dict:
    """Load only ownership and state fields used by the normal polling path."""
    return _load_owned_job_fields(job_id, user_id, _JOB_STATE_FIELDS)


def _load_owned_job_recovery_record(job_id: str, user_id: str) -> dict:
    """Load resubmission fields only after Celery has lost the task state."""
    return _load_owned_job_fields(job_id, user_id, _JOB_RECOVERY_FIELDS)


def _load_owned_job_results_record(job_id: str, user_id: str) -> dict:
    """Load persisted results only when the caller requested result details."""
    return _load_owned_job_fields(job_id, user_id, _JOB_RESULTS_FIELDS)


def _verify_job_ownership(job_id: str, user_id: str) -> None:
    """Retain the explicit mutation authorization contract for cancellation."""
    if supabase is None:
        return
    try:
        owner = (
            supabase.table("extraction_jobs")
            .select("user_id")
            .eq("job_id", job_id)
            .single()
            .execute()
        )
    except Exception as lookup_error:
        logger.warning(f"Cancellation ownership check skipped: {lookup_error}")
        return

    owner_id = (owner.data or {}).get("user_id") if owner.data else None
    if owner_id is not None and owner_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to modify this job",
        )


def _request_job_cancellation(job_id: str) -> None:
    """Record a cancellation request for the running task to observe.

    `status` cannot carry this: its CHECK constraint has no CANCELLED value and
    the application maps cancellation onto FAILURE, so a dedicated timestamp is
    the only place a *pending* cancellation can live without the reaper mistaking
    the job for a healthy one.
    """
    if supabase is None:
        return
    try:
        supabase.table("extraction_jobs").update(
            {"cancel_requested_at": datetime.now(UTC).isoformat()}
        ).eq("job_id", job_id).execute()
    except Exception as flag_error:
        # Revoke still runs, so a queued job is stopped either way; only the
        # cooperative stop for an already-running job is lost.
        logger.warning(f"Could not flag job {job_id} as cancelled: {flag_error}")


def _deserialize_existing_results(
    existing_results: object,
) -> list[DocumentExtractionResponse] | None:
    """Deserialize stored extraction results into response models."""
    if not existing_results:
        return None
    return [
        DocumentExtractionResponse(**result) if isinstance(result, dict) else result
        for result in existing_results
    ]


def _preserve_existing_job_progress(
    job_id: str, job_data: dict
) -> BatchExtractionResponse | None:
    """Preserve existing job progress from Supabase when Celery state is missing."""
    completed_documents = job_data.get("completed_documents", 0) or 0
    total_documents = job_data.get("total_documents", 0) or 0
    existing_status = str(job_data.get("status", "PENDING")).upper()
    existing_results = job_data.get("results")

    failure_statuses = {"FAILURE", "FAILED"}
    cancellation_statuses = {"CANCELLED", "CANCELED", "REVOKED"}
    successful_statuses = {"SUCCESS", "COMPLETED"}

    if existing_status in failure_statuses:
        final_status = "FAILED"
    elif existing_status in cancellation_statuses:
        final_status = "CANCELLED"
    elif existing_status == "PARTIALLY_COMPLETED":
        final_status = "PARTIALLY_COMPLETED"
    else:
        result_statuses = {
            str(
                result.get("status", "")
                if isinstance(result, dict)
                else getattr(result, "status", "")
            )
            .lower()
            .replace("documentprocessingstatus.", "")
            for result in existing_results or []
        }
        if result_statuses and result_statuses <= {"failed"}:
            final_status = "FAILED"
        elif "failed" in result_statuses or "partially_completed" in result_statuses:
            final_status = "PARTIALLY_COMPLETED"
        elif existing_status in successful_statuses or (
            completed_documents >= total_documents and total_documents > 0
        ):
            final_status = "COMPLETED"
        elif completed_documents > 0:
            final_status = "PARTIALLY_COMPLETED"
        else:
            final_status = existing_status

    if (
        completed_documents <= 0
        and not existing_results
        and existing_status
        not in failure_statuses
        | cancellation_statuses
        | successful_statuses
        | {"PARTIALLY_COMPLETED"}
    ):
        return None

    logger.info(
        f"Job {job_id} has existing progress: {completed_documents}/{total_documents} docs, "
        f"status={existing_status}. Preserving state instead of resetting to PENDING."
    )

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
        # Re-enqueue under the SAME task id. Minting a new one used to require
        # rewriting `job_id` on the row, which broke the row-to-task identity
        # for anything already holding the old id (polling clients, the results
        # endpoint, publication links) and reset the attempt history.
        extract_information_from_documents_task.apply_async(
            args=[resubmit_request.model_dump(mode="json")],
            task_id=job_id,
        )
        logger.info(f"Resubmitted job {job_id} under its original id")

        supabase.table("extraction_jobs").update(
            {
                "status": "PENDING",
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ).eq("job_id", job_id).execute()

        return _in_progress_batch_response(job_id)
    except Exception as resubmit_error:
        # Broad catch: resubmit involves both Celery task submission and
        # Supabase update; either can raise arbitrary exceptions.
        logger.exception(f"Failed to resubmit job {job_id}: {resubmit_error}")
        return None


def _resolve_pending_job(
    job_id: str,
    user_id: str,
    job_state: dict,
    include_results: bool = True,
) -> BatchExtractionResponse:
    """Resolve pending state by preserving existing progress or resubmitting when possible."""
    logger.warning(
        f"Task {job_id} is PENDING with no info - checking Supabase for existing state"
    )
    preserved_response = _preserve_existing_job_progress(job_id, job_state)
    if preserved_response:
        if not include_results:
            return preserved_response
        result_data = _load_owned_job_results_record(job_id, user_id)
        return (
            _preserve_existing_job_progress(job_id, {**job_state, **result_data})
            or preserved_response
        )

    recovery_data = _load_owned_job_recovery_record(job_id, user_id)
    job_data = {**job_state, **recovery_data}
    preserved_response = _preserve_existing_job_progress(job_id, job_data)
    if preserved_response:
        if not include_results:
            return preserved_response
        result_data = _load_owned_job_results_record(job_id, user_id)
        return (
            _preserve_existing_job_progress(job_id, {**job_data, **result_data})
            or preserved_response
        )

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
        completed_docs = (
            task_info.get("completed_documents")
            if isinstance(task_info, dict)
            else None
        )
        update_job_status_in_supabase(
            job_id, simplified_status, completed_documents=completed_docs
        )
        return BatchExtractionResponse(
            task_id=job_id,
            status=simplified_status,
            results=None,
        )
    except Exception as ready_error:
        # Broad catch: Celery task.ready() can raise backend/connection errors.
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
        return BatchExtractionResponse(
            task_id=job_id, status=simplified_status, results=[]
        )
    except Exception as failed_check_error:
        # Broad catch: Celery task.failed() can raise backend/connection errors.
        logger.warning(f"Error checking if task {job_id} failed: {failed_check_error}")
        return None


def _parse_task_results(
    results: object,
) -> tuple[list[DocumentExtractionResponse], list[dict]]:
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
        1 for result in results if result.get("status") in _TERMINAL_DOCUMENT_STATUSES
    )


@router.post(
    "",
    response_model=DocumentExtractionSubmissionResponse,
    status_code=202,
    summary="Create extraction job",
    description="Submit a new extraction job. Supports both full and simple modes.",
)
@limiter.limit(EXTRACTION_SUBMIT_RATE_LIMIT)
async def create_extraction_job(
    request: Request,
    payload: DocumentExtractionRequest | SimpleExtractionRequest,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user),
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
        if isinstance(payload, SimpleExtractionRequest):
            # Validate documents
            document_ids = _validate_documents(
                payload.document_ids, payload.collection_id
            )

            # Validate and fetch schema
            _validate_schema_id_required(payload.schema_id)
            schema_id = payload.schema_id
            user_schema = None

            if is_uuid(schema_id):
                # Fetch schema from Supabase database
                logger.info(f"Fetching schema {schema_id} from database")
                user_schema = _fetch_schema_from_db(schema_id, include_metadata=False)
                user_schema = _convert_simplified_schema(user_schema)
                schema_id = None  # Clear schema_id to prevent file lookup
                logger.info("Successfully fetched schema from database")

            extraction_request = DocumentExtractionRequest(
                collection_id=payload.collection_id,
                schema_id=schema_id,
                user_schema=user_schema,
                extraction_context=payload.extraction_context,
                additional_instructions=payload.additional_instructions,
                prompt_id="info_extraction",
                language=payload.language,
                document_ids=document_ids,
            )
        else:
            extraction_request = payload

        # Validate and submit
        _enforce_max_documents(
            extraction_request.document_ids, extraction_request.collection_id
        )
        _validate_collection_id(extraction_request.collection_id)
        task_id = _submit_extraction_task(extraction_request, user_id=user.id)
        _audit_extraction_job(
            background_tasks,
            user_id=user.id,
            action_type="extraction_job_created",
            job_id=task_id,
            document_ids=extraction_request.document_ids,
            collection_id=extraction_request.collection_id,
            api_endpoint=request.url.path,
        )
        return _create_extraction_response(task_id)

    except HTTPException:
        raise
    except Exception as e:
        # Broad catch: task submission involves Celery, Supabase, and schema
        # validation; any of these may raise arbitrary exceptions.
        logger.exception("Unexpected error creating extraction job: {}", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal Server Error",
                "message": f"An unexpected error occurred while creating the extraction job: {e!s}. Please try again or contact support.",
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
@limiter.limit(EXTRACTION_SUBMIT_RATE_LIMIT)
async def create_extraction_job_db(
    request: Request,
    payload: DocumentExtractionRequest | SimpleExtractionRequest,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user),
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
        if isinstance(payload, SimpleExtractionRequest):
            # Validate documents
            document_ids = _validate_documents(
                payload.document_ids, payload.collection_id
            )

            # Validate schema_id is present and is a UUID
            _validate_schema_id_required(payload.schema_id)
            if not is_uuid(payload.schema_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "Invalid Schema ID",
                        "message": f"Schema ID '{payload.schema_id}' is not a valid UUID. This endpoint requires a schema from Supabase database.",
                        "code": "INVALID_SCHEMA_ID",
                    },
                )

            # Fetch full schema with metadata from database
            logger.info(f"Fetching full schema {payload.schema_id} from database")
            user_schema = _fetch_schema_from_db(
                payload.schema_id, include_metadata=True
            )
            logger.info(
                f"Successfully fetched full schema from database: {payload.schema_id}"
            )

            extraction_request = DocumentExtractionRequest(
                collection_id=payload.collection_id,
                schema_id=None,
                user_schema=user_schema,
                extraction_context=payload.extraction_context,
                additional_instructions=payload.additional_instructions,
                prompt_id="info_extraction",
                language=payload.language,
                document_ids=document_ids,
            )
        else:
            # Validate user_schema has required fields if provided
            if payload.user_schema is not None:
                required_fields = ["name", "description", "text"]
                missing_fields = [
                    f for f in required_fields if f not in payload.user_schema
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
            extraction_request = payload

        # Validate collection and schema
        _enforce_max_documents(
            extraction_request.document_ids, extraction_request.collection_id
        )
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
        task_id = _submit_extraction_task(extraction_request, user_id=user.id)
        _audit_extraction_job(
            background_tasks,
            user_id=user.id,
            action_type="extraction_job_created",
            job_id=task_id,
            document_ids=extraction_request.document_ids,
            collection_id=extraction_request.collection_id,
            api_endpoint=request.url.path,
        )
        return _create_extraction_response(task_id)

    except HTTPException:
        raise
    except Exception as e:
        # Broad catch: task submission involves Celery, Supabase, and schema
        # validation; any of these may raise arbitrary exceptions.
        logger.exception("Unexpected error creating extraction job: {}", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal Server Error",
                "message": f"An unexpected error occurred while creating the extraction job: {e!s}. Please try again or contact support.",
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
@limiter.limit(EXTRACTION_SUBMIT_RATE_LIMIT)
async def create_bulk_extraction(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: BulkExtractionRequest = Body(...),
    user: AuthenticatedUser = Depends(get_current_user),
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
        document_ids = _validate_documents(payload.document_ids, payload.collection_id)
        _validate_collection_id(payload.collection_id)
        _check_supabase_available()

        jobs = []

        for schema_id in payload.schema_ids:
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
                    collection_id=payload.collection_id,
                    schema_id=None,
                    user_schema=schema_data,
                    extraction_context=payload.extraction_context,
                    prompt_id="info_extraction",
                    language=payload.language,
                    document_ids=document_ids,
                )

                # Submit to Celery
                task_id = _submit_extraction_task(extraction_request, user_id=user.id)
                _audit_extraction_job(
                    background_tasks,
                    user_id=user.id,
                    action_type="extraction_job_created",
                    job_id=task_id,
                    document_ids=document_ids,
                    collection_id=payload.collection_id,
                    api_endpoint=request.url.path,
                )

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
                # Broad catch: per-schema job creation involves Celery + Supabase.
                logger.exception(
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
            total_schemas=len(payload.schema_ids),
            total_documents=len(document_ids),
            auto_export=payload.auto_export,
            scheduled_at=payload.scheduled_at,
            message=f"Created {accepted_count} extraction jobs for {len(document_ids)} documents.",
        )
    except HTTPException:
        raise
    except Exception as e:
        # Broad catch: bulk extraction orchestrates multiple Celery + Supabase calls.
        logger.exception(f"Unexpected error in bulk extraction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Bulk Extraction Failed",
                "message": f"An error occurred while creating bulk extraction jobs: {e!s}",
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
    include_results: bool = Query(
        True, description="Include per-document extraction results"
    ),
    user: AuthenticatedUser = Depends(get_current_user),
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
        if not is_uuid(job_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Extraction job not found",
            )
        job_record = _load_owned_job_record(job_id, user.id)
        task_result = AsyncResult(id=job_id, app=celery_app)
        task_state = _safe_get_task_state(task_result, job_id)
        if task_state is None:
            return _with_job_progress(
                _with_optional_results(
                    _resolve_pending_job(
                        job_id, user.id, job_record, include_results=include_results
                    ),
                    include_results,
                ),
                job_record,
            )

        if task_state == "PENDING" and not task_result.info:
            return _with_job_progress(
                _with_optional_results(
                    _resolve_pending_job(
                        job_id, user.id, job_record, include_results=include_results
                    ),
                    include_results,
                ),
                job_record,
            )

        not_ready_response = _handle_not_ready_task(task_result, task_state, job_id)
        if not_ready_response:
            return _with_job_progress(
                _with_optional_results(not_ready_response, include_results), job_record
            )

        failed_response = _handle_failed_task(task_result, task_state, job_id)
        if failed_response:
            return _with_job_progress(
                _with_optional_results(failed_response, include_results), job_record
            )

        if not include_results:
            persisted_response = _preserve_existing_job_progress(job_id, job_record)
            if persisted_response:
                return _with_job_progress(
                    _with_optional_results(persisted_response, False), job_record
                )
            return _with_job_progress(
                BatchExtractionResponse(
                    task_id=job_id,
                    status=simplify_job_status(task_state),
                    results=None,
                ),
                job_record,
            )

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
                return _with_job_progress(
                    _with_optional_results(
                        BatchExtractionResponse(
                            task_id=job_id,
                            status=simplified_status,
                            results=[],
                        ),
                        include_results,
                    ),
                    job_record,
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
            # The row was read before the task finished, so its
            # completed_documents is stale here; the freshly counted value is
            # the one just written back to Supabase.
            return _with_job_progress(
                _with_optional_results(
                    BatchExtractionResponse(
                        task_id=job_id,
                        status=simplified_status,
                        results=responses,
                    ),
                    include_results,
                ),
                job_record,
                completed_documents=processed_count,
            )
        except Exception as get_error:
            # Broad catch: Celery task.get() can raise backend errors, celery.exceptions,
            # or worker-specific exceptions when fetching results.
            if _is_worker_unavailable_message(str(get_error)):
                logger.error(
                    f"Worker unavailable when getting results for job {job_id}: {get_error}"
                )
                raise _worker_unavailable_error()
            raise
    except HTTPException:
        raise
    except Exception as e:
        # Broad catch: get_extraction_job interacts with Celery and Supabase;
        # either can raise arbitrary exceptions including connection failures.
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


# Map the simplified, user-facing status filter values to every raw value the
# ``extraction_jobs.status`` column may hold for that state. The column may store
# raw Celery states (PENDING/STARTED/SUCCESS/FAILURE/REVOKED) or already-simplified
# names depending on the write path, so each set includes both. COMPLETED and
# PARTIALLY_COMPLETED both subsume SUCCESS and cannot be distinguished at the column
# level (that distinction needs the per-document results JSON).
_API_STATUS_TO_DB_VALUES: dict[str, list[str]] = {
    "IN_PROGRESS": ["PENDING", "STARTED", "PROCESSING", "RETRY", "IN_PROGRESS"],
    "COMPLETED": ["SUCCESS", "COMPLETED"],
    "PARTIALLY_COMPLETED": [
        "SUCCESS",
        "PARTIAL_FAILURE",
        "COMPLETED_WITH_FAILURES",
        "PARTIALLY_COMPLETED",
    ],
    "FAILED": ["FAILURE", "FAILED"],
    "CANCELLED": ["REVOKED", "CANCELLED"],
}


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
    user: AuthenticatedUser = Depends(get_current_user),
) -> ListExtractionJobsResponse:
    """
    List extraction jobs for the current user.

    Jobs are fetched directly from the ``extraction_jobs`` Supabase table,
    filtered by the authenticated user's ``user_id``.  Only this user's own
    jobs are returned — the previous Celery global inspect API (which exposed
    every in-flight task across all users) has been replaced.

    **Query Parameters:**
    - **page**: Page number (1-based, default: 1)
    - **page_size**: Number of jobs per page (1-100, default: 20)
    - **status**: Optional status filter (IN_PROGRESS, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED)

    **Response:**
    - List of jobs with metadata
    - Total count of matching jobs
    - Pagination information

    **Behavior change vs. prior implementation:** terminal jobs
    (COMPLETED / FAILED / CANCELLED) are now included because they are
    stored in the database.  Previously only Celery in-flight tasks were
    visible.
    """
    user_id = user.id
    try:
        logger.info(
            f"Listing extraction jobs for user {user_id}, page={page}, page_size={page_size}, status={status}"
        )

        if not supabase:
            raise HTTPException(
                status_code=503,
                detail="Database service unavailable",
            )

        # Build user-scoped query against the extraction_jobs table.
        query = (
            supabase.table("extraction_jobs")
            .select(
                "job_id, collection_id, status, created_at, updated_at, "
                "total_documents, completed_documents",
                count="exact",
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
        )

        if status:
            db_status_values = _API_STATUS_TO_DB_VALUES.get(status, [status])
            query = query.in_("status", db_status_values)

        # Apply pagination at the DB level.
        offset = (page - 1) * page_size
        query = query.range(offset, offset + page_size - 1)

        db_response = query.execute()

        rows = db_response.data or []
        total = db_response.count if db_response.count is not None else len(rows)

        jobs = [
            ExtractionJobSummary(
                task_id=row["job_id"],
                collection_id=row.get("collection_id"),
                status=simplify_job_status(row.get("status") or "PENDING"),
                created_at=row.get("created_at") or datetime.now(UTC).isoformat(),
                updated_at=row.get("updated_at"),
                total_documents=row.get("total_documents"),
                completed_documents=row.get("completed_documents"),
            )
            for row in rows
        ]

        logger.info(
            f"Found {total} extraction jobs for user {user_id}, "
            f"returning page {page} with {len(jobs)} jobs"
        )

        return ListExtractionJobsResponse(
            jobs=jobs,
            total=total,
            page=page,
            page_size=page_size,
        )

    except HTTPException:
        raise
    except Exception as e:
        # Broad catch: listing jobs queries Supabase which can raise
        # arbitrary connection/postgrest exceptions.
        logger.exception("Error listing extraction jobs: {}", str(e))
        raise HTTPException(
            status_code=500, detail=f"Error listing extraction jobs: {e!s}"
        )


@router.delete(
    "/{job_id}",
    response_model=CancelJobResponse,
    summary="Cancel or delete extraction job",
    description="Cancel a running extraction job or delete a completed job. Only the job owner can cancel/delete it.",
)
async def cancel_or_delete_extraction_job(
    background_tasks: BackgroundTasks,
    job_id: str = Path(..., description="Extraction job ID to cancel"),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CancelJobResponse:
    """
    Cancel a running extraction job.

    This endpoint attempts to cancel an extraction job by revoking the Celery task.

    **Path Parameters:**
    - **job_id**: The ID of the extraction job to cancel

    **Authorization:**
    - Requires Authorization: Bearer <JWT>
    - Only the job owner can cancel (verified through collection ownership)

    **Response:**
    - **status**: "cancelled", "already_completed", "not_found", or "failed"
    - **message**: Human-readable status message

    **Error Codes:**
    - 404: Job not found
    - 403: Job belongs to another user
    - 400: Job already completed

    **Note:** This implementation uses Celery's revoke() method with terminate=True.
    The task will be terminated if it's currently running.
    """
    user_id = user.id
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

        # Ownership check: load the DB record and verify the caller owns the job
        # before issuing the Celery revoke.  Mirrors the delete path exactly.
        _verify_job_ownership(job_id, user_id)

        # Record the request first, then revoke. Two mechanisms cover the two
        # states a job can be in:
        #
        # * Not yet started — `revoke` stops the worker from ever running it.
        # * Already running — the task polls `cancel_requested_at` between
        #   documents and stops at a clean boundary, keeping the partial results
        #   it has already persisted.
        #
        # `terminate=True` is deliberately not used. SIGTERM kills the prefork
        # child mid-document, and with task_acks_late the un-acked message is
        # then redelivered and the job restarts from the beginning.
        _request_job_cancellation(job_id)
        celery_app.control.revoke(job_id)

        logger.info(f"Successfully revoked job {job_id} for user {user_id}")

        _audit_extraction_job(
            background_tasks,
            user_id=user_id,
            action_type="extraction_job_cancelled",
            job_id=job_id,
        )

        return CancelJobResponse(
            task_id=job_id,
            status="cancelled",
            message=(
                "Job cancellation requested. A queued job is dropped immediately; "
                "a running job stops after the document it is currently processing."
            ),
        )

    except HTTPException:
        # Ownership 403 / explicit HTTP errors must propagate unchanged, not be
        # re-wrapped as a 500 by the broad handler below.
        raise
    except Exception as e:
        # Broad catch: Celery revoke() and task state access can raise arbitrary
        # broker/connection exceptions.
        logger.exception("Error cancelling job {}: {}", job_id, str(e))
        raise HTTPException(status_code=500, detail=f"Error cancelling job: {e!s}")


@router.delete(
    "/{job_id}/delete",
    response_model=CancelJobResponse,
    summary="Delete extraction job",
    description="Permanently delete an extraction job from the database. This action cannot be undone.",
)
async def delete_extraction_job(
    background_tasks: BackgroundTasks,
    job_id: str = Path(..., description="Extraction job ID to delete"),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CancelJobResponse:
    """
    Permanently delete an extraction job from Supabase.

    This endpoint deletes the job record from the database. The job must belong to the user.

    **Path Parameters:**
    - **job_id**: The ID of the extraction job to delete

    **Authorization:**
    - Requires Authorization: Bearer <JWT>
    - Only the job owner can delete (verified through user_id)

    **Response:**
    - **status**: "deleted" or "not_found"
    - **message**: Human-readable status message
    """
    user_id = user.id
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
            _audit_extraction_job(
                background_tasks,
                user_id=user_id,
                action_type="extraction_job_deleted",
                job_id=job_id,
            )
            return CancelJobResponse(
                task_id=job_id, status="deleted", message="Job deleted successfully"
            )
        logger.warning(f"No rows deleted for job {job_id}")
        return CancelJobResponse(
            task_id=job_id,
            status="not_found",
            message="Job not found or already deleted",
        )

    except HTTPException:
        raise
    except (PostgrestAPIError, StorageException) as e:
        logger.exception(f"Error deleting job {job_id}: {e!s}")
        raise HTTPException(status_code=500, detail=f"Error deleting job: {e!s}")
