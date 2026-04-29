import asyncio
import os
import time
from datetime import UTC, datetime
from typing import Any

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
from app.utils.document_fetcher import get_documents_by_id

load_dotenv()
BROKER_URL = os.environ["CELERY_BROKER_URL"]
BACKEND_URL = os.environ["CELERY_BACKEND_URL"]
PROJECT_NAME = os.environ["CELERY_PROJECT_NAME"]
LLM_BASE_URL = os.getenv("LLM_BASE_URL")

celery_app = Celery(PROJECT_NAME, broker=BROKER_URL, backend=BACKEND_URL)

# Explicitly register task modules so the worker knows about them.
# NOTE: autodiscover_tasks(["app.tasks"]) only finds ``app.tasks.tasks``
# (a file named tasks.py), not arbitrarily named modules like
# ``meilisearch_sync.py``.  Using conf.imports is explicit and avoids the
# circular-import hazard (meilisearch_sync imports celery_app from here).
celery_app.conf.imports = [
    "app.tasks.meilisearch_sync",
    "app.tasks.reasoning_line_pipeline",
    "app.tasks.digest_notifications",
    "app.tasks.maintenance",
]

# Celery Beat schedule — periodic background jobs
celery_app.conf.beat_schedule = {
    "meilisearch-full-sync-every-6h": {
        "task": "meilisearch.full_sync",
        "schedule": 6 * 60 * 60,  # every 6 hours
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
    "vacuum-analyze-judgments-weekly": {
        "task": "maintenance.vacuum_analyze",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),
    },
}
celery_app.conf.timezone = "UTC"


def _update_job_results_in_supabase(
    job_id: str,
    results: list[dict[str, Any]],
    completed_documents: int,
    status: str = "STARTED",
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
        update_data = {
            "results": results,
            "completed_documents": completed_documents,
            "status": status,
            "updated_at": datetime.now(UTC).isoformat(),
        }

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
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(ConnectionError, OSError, TimeoutError),
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
      up to 2 times (3 attempts total) with exponential backoff (60s base, 300s max)
    - Schema/validation errors: Not retried, fail immediately
    - Other errors: Mark all documents as failed and return failed results

    Retry strategy:
    - Uses Celery's autoretry_for to handle most connection errors automatically
    - Database errors from Supabase are retried with connection error strategy

    Note: The InformationExtractor also has built-in retry logic for LLM API calls,
    so transient LLM errors are handled at multiple levels.

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
    except (ConnectionError, OSError, TimeoutError) as e:
        # These are already configured in autoretry_for, but we can customize retry behavior here
        # Note: Celery's autoretry_for will handle these automatically, this is just for logging
        logger.warning(
            f"Retryable connection error (attempt {self.request.retries + 1}/{self.max_retries + 1}): {type(e).__name__}: {e}"
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


# Mock Celery task for schema generation
@celery_app.task(bind=True)
def generate_schema_task(self, request_data: dict):
    """
    Mock schema generation task.
    In a real implementation, this would:
    1. Initialize the schema generator agent
    2. Analyze sample documents from the collection
    3. Generate and refine the schema
    4. Return the final schema
    """

    user_input = request_data["user_input"]
    collection_id = request_data.get("collection_id", "general")

    # Mock progressive updates
    steps = [
        ("problem_analysis", "Analyzing extraction requirements"),
        ("data_assessment", "Examining sample documents"),
        ("schema_generation", "Creating initial schema"),
        ("schema_refinement", "Optimizing schema structure"),
        ("validation", "Validating against sample data"),
    ]

    for i, (step_id, description) in enumerate(steps):
        self.update_state(
            state="PROGRESS",
            meta={
                "current_step": step_id,
                "description": description,
                "progress": (i + 1) / len(steps) * 100,
            },
        )
        time.sleep(3)  # Simulate processing time

    # Mock generated schema based on user input
    mock_schema = {
        "name": f"Generated Schema for {collection_id}",
        "description": f"AI-generated schema based on: {user_input}",
        "schema": {
            "extracted_entities": {
                "type": "array",
                "description": "Key entities mentioned in the document",
                "items": {"type": "string"},
                "required": True,
            },
            "legal_concepts": {
                "type": "array",
                "description": "Legal concepts and terms identified",
                "items": {"type": "string"},
                "required": True,
            },
            "dates": {
                "type": "array",
                "description": "Important dates found in the document",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string"},
                        "description": {"type": "string"},
                    },
                },
                "required": False,
            },
            "amounts": {
                "type": "array",
                "description": "Financial amounts and monetary values",
                "items": {
                    "type": "object",
                    "properties": {
                        "amount": {"type": "number"},
                        "currency": {"type": "string"},
                        "context": {"type": "string"},
                    },
                },
                "required": False,
            },
            "key_findings": {
                "type": "string",
                "description": "Summary of key findings from the document",
                "required": True,
            },
        },
    }

    return {
        "schema": mock_schema,
        "confidence": 0.92,
        "validation_results": {
            "valid": True,
            "tested_documents": 5,
            "success_rate": 0.95,
        },
    }
