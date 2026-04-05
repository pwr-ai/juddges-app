"""
Playground API endpoints for testing schema extractions in real-time.

This module provides synchronous extraction for the schema playground,
allowing users to test their schemas against sample documents with
immediate feedback.
"""

import time
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Header, HTTPException, status
from juddges_search.info_extraction.extractor import InformationExtractor
from juddges_search.info_extraction.schema_utils import prepare_schema_from_db
from juddges_search.llms import get_llm
from loguru import logger
from pydantic import BaseModel, Field

from app.core.supabase import get_supabase_client
from app.utils.document_fetcher import get_documents_by_id

router = APIRouter(prefix="/playground", tags=["playground"])

# Use shared Supabase client
supabase = get_supabase_client()


# ==================== Request/Response Models ====================


class PlaygroundExtractionRequest(BaseModel):
    """Request for real-time extraction in playground mode."""

    schema_id: str = Field(
        description="UUID of the schema to use from extraction_schemas table"
    )
    schema_version_id: str | None = Field(
        default=None,
        description="Optional: specific version ID from schema_versions table. If not provided, uses current schema.",
    )
    document_id: str = Field(description="Document ID to extract from")
    extraction_context: str | None = Field(
        default="Extract structured information from the legal document.",
        description="Context instructions for extraction",
    )
    additional_instructions: str | None = Field(
        default=None, description="Additional qualitative instructions"
    )
    language: str = Field(
        default="pl", description="Language for extraction (pl or en)"
    )


class PlaygroundTiming(BaseModel):
    """Timing metrics for playground extraction."""

    total_ms: float
    document_fetch_ms: float
    extraction_ms: float
    started_at: str
    completed_at: str


class PlaygroundExtractionResponse(BaseModel):
    """Response from playground extraction."""

    document_id: str
    schema_id: str
    schema_version: int = Field(description="Version number used for extraction")
    schema_version_id: str | None = Field(description="UUID of the schema version used")
    status: Literal["success", "failed"]
    extracted_data: dict[str, Any] | None = None
    error_message: str | None = None

    # Timing information
    timing: PlaygroundTiming

    # Schema info for UI display
    schema_name: str
    field_count: int

    # Document metadata
    document_title: str | None = None
    document_type: str | None = None


class PlaygroundTestRun(BaseModel):
    """Record of a playground test run for history tracking."""

    id: str
    schema_id: str
    schema_version_id: str | None
    document_id: str
    status: str
    execution_time_ms: int
    created_at: str


# ==================== Helper Functions ====================


def _fetch_schema_with_version(
    schema_id: str, schema_version_id: str | None = None
) -> tuple[dict[str, Any], int, str | None]:
    """
    Fetch schema from database, optionally from a specific version.

    Returns:
        Tuple of (schema_dict, version_number, version_id)
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    if schema_version_id:
        # Fetch specific version
        version_response = (
            supabase.table("schema_versions")
            .select("id, schema_id, version_number, schema_snapshot, field_snapshot")
            .eq("id", schema_version_id)
            .single()
            .execute()
        )

        if not version_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Schema version '{schema_version_id}' not found",
            )

        version_data = version_response.data

        # Get schema name from main table
        schema_response = (
            supabase.table("extraction_schemas")
            .select("name, description")
            .eq("id", schema_id)
            .single()
            .execute()
        )

        schema_name = (
            schema_response.data.get("name", "Unknown")
            if schema_response.data
            else "Unknown"
        )
        schema_description = (
            schema_response.data.get("description", "") if schema_response.data else ""
        )

        return (
            {
                "name": schema_name,
                "description": schema_description,
                "text": version_data["schema_snapshot"],
            },
            version_data["version_number"],
            version_data["id"],
        )
    # Fetch current schema
    response = (
        supabase.table("extraction_schemas")
        .select("name, description, text, schema_version")
        .eq("id", schema_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema '{schema_id}' not found",
        )

    return (
        {
            "name": response.data["name"],
            "description": response.data.get("description", ""),
            "text": response.data["text"],
        },
        response.data.get("schema_version", 1),
        None,
    )


def _save_playground_run(
    schema_id: str,
    schema_version_id: str | None,
    document_id: str,
    user_id: str,
    extraction_result: dict[str, Any],
    execution_time_ms: int,
    status: str,
    error_message: str | None = None,
    document_metadata: dict[str, Any] | None = None,
    model_info: dict[str, Any] | None = None,
) -> str | None:
    """Save playground test run to database for history tracking."""
    if not supabase:
        return None

    try:
        result = (
            supabase.table("playground_test_runs")
            .insert(
                {
                    "schema_id": schema_id,
                    "schema_version_id": schema_version_id,
                    "document_id": document_id,
                    "user_id": user_id,
                    "extraction_result": extraction_result or {},
                    "execution_time_ms": execution_time_ms,
                    "status": status,
                    "error_message": error_message,
                    "document_metadata": document_metadata or {},
                    "model_info": model_info or {},
                }
            )
            .execute()
        )

        if result.data and len(result.data) > 0:
            return result.data[0].get("id")
        return None
    except Exception as e:
        logger.warning(f"Failed to save playground run: {e}")
        return None


# ==================== API Endpoints ====================


@router.post(
    "/extract",
    response_model=PlaygroundExtractionResponse,
    summary="Run playground extraction",
    description="Run synchronous extraction on a single document for real-time playground testing.",
)
async def playground_extract(
    request: PlaygroundExtractionRequest,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> PlaygroundExtractionResponse:
    """
    Run synchronous extraction for playground testing.

    This endpoint performs extraction immediately (not via Celery queue) to provide
    real-time feedback for schema testing. It's designed for single-document testing
    during schema development.

    **Key differences from batch extraction:**
    - Synchronous execution (blocks until complete)
    - Single document only
    - Returns detailed timing information
    - Saves test run for history tracking

    **Request:**
    - schema_id: UUID of the schema to use
    - schema_version_id: Optional specific version to test
    - document_id: Document ID to extract from
    - language: Extraction language (pl or en)

    **Response:**
    - extracted_data: The extraction results
    - timing: Detailed timing breakdown
    - schema info and document metadata
    """
    start_time = time.time()
    started_at = datetime.now(UTC).isoformat()

    logger.info(
        f"Playground extraction started: schema={request.schema_id}, "
        f"doc={request.document_id}, user={x_user_id}"
    )

    try:
        # Step 1: Fetch document from database
        doc_fetch_start = time.time()
        documents = await get_documents_by_id([request.document_id])
        doc_fetch_ms = (time.time() - doc_fetch_start) * 1000

        if not documents:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "Document Not Found",
                    "message": f"Document '{request.document_id}' not found in the database",
                    "code": "DOCUMENT_NOT_FOUND",
                },
            )

        document = documents[0]
        document_title = getattr(document, "title", None) or getattr(
            document, "name", None
        )
        document_type = getattr(document, "document_type", None)
        document_text = getattr(document, "full_text", None) or getattr(
            document, "content", ""
        )

        if not document_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "Empty Document",
                    "message": "Document has no text content to extract from",
                    "code": "EMPTY_DOCUMENT",
                },
            )

        # Step 2: Fetch schema (current or specific version)
        schema_dict, version_number, version_id = _fetch_schema_with_version(
            request.schema_id, request.schema_version_id
        )

        schema_name = schema_dict.get("name", "Unknown")
        schema_text = schema_dict.get("text", {})
        field_count = len(schema_text) if isinstance(schema_text, dict) else 0

        # Step 3: Prepare schema and run extraction
        extraction_start = time.time()

        prepared_schema = prepare_schema_from_db(schema_dict, language=request.language)
        llm = get_llm()
        extractor = InformationExtractor(
            model=llm, prompt_name="info_extraction", schema=prepared_schema
        )

        # Run extraction
        extracted_data = await extractor.extract_information_with_structured_output(
            {
                "extraction_context": request.extraction_context
                or "Extract structured information from the legal document.",
                "additional_instructions": request.additional_instructions or "",
                "language": request.language,
                "full_text": document_text,
            }
        )

        extraction_ms = (time.time() - extraction_start) * 1000

        # Step 4: Calculate timing
        completed_at = datetime.now(UTC).isoformat()
        total_ms = (time.time() - start_time) * 1000

        timing = PlaygroundTiming(
            total_ms=total_ms,
            document_fetch_ms=doc_fetch_ms,
            extraction_ms=extraction_ms,
            started_at=started_at,
            completed_at=completed_at,
        )

        # Step 5: Save test run for history (non-blocking)
        _save_playground_run(
            schema_id=request.schema_id,
            schema_version_id=version_id or request.schema_version_id,
            document_id=request.document_id,
            user_id=x_user_id,
            extraction_result=extracted_data or {},
            execution_time_ms=int(total_ms),
            status="completed",
            document_metadata={
                "title": document_title,
                "type": document_type,
            },
            model_info={
                "model": "gpt-4o",  # Could be made configurable
                "language": request.language,
            },
        )

        logger.info(
            f"Playground extraction completed: schema={request.schema_id}, "
            f"doc={request.document_id}, total_ms={total_ms:.0f}"
        )

        return PlaygroundExtractionResponse(
            document_id=request.document_id,
            schema_id=request.schema_id,
            schema_version=version_number,
            schema_version_id=version_id,
            status="success",
            extracted_data=extracted_data,
            timing=timing,
            schema_name=schema_name,
            field_count=field_count,
            document_title=document_title,
            document_type=document_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        # Calculate timing even for failures
        completed_at = datetime.now(UTC).isoformat()
        total_ms = (time.time() - start_time) * 1000

        error_message = str(e)
        logger.error(
            f"Playground extraction failed: schema={request.schema_id}, "
            f"doc={request.document_id}, error={error_message}"
        )

        # Try to save failed run
        _save_playground_run(
            schema_id=request.schema_id,
            schema_version_id=request.schema_version_id,
            document_id=request.document_id,
            user_id=x_user_id,
            extraction_result={},
            execution_time_ms=int(total_ms),
            status="failed",
            error_message=error_message,
        )

        # Get minimal schema info for response
        try:
            schema_dict, version_number, version_id = _fetch_schema_with_version(
                request.schema_id, request.schema_version_id
            )
            schema_name = schema_dict.get("name", "Unknown")
            field_count = len(schema_dict.get("text", {}))
        except Exception:
            schema_name = "Unknown"
            version_number = 1
            version_id = None
            field_count = 0

        return PlaygroundExtractionResponse(
            document_id=request.document_id,
            schema_id=request.schema_id,
            schema_version=version_number,
            schema_version_id=version_id,
            status="failed",
            error_message=error_message,
            timing=PlaygroundTiming(
                total_ms=total_ms,
                document_fetch_ms=0,
                extraction_ms=0,
                started_at=started_at,
                completed_at=completed_at,
            ),
            schema_name=schema_name,
            field_count=field_count,
        )


@router.get(
    "/runs",
    response_model=list[PlaygroundTestRun],
    summary="List playground test runs",
    description="Get recent playground test runs for a schema.",
)
async def list_playground_runs(
    schema_id: str,
    limit: int = 20,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> list[PlaygroundTestRun]:
    """
    List recent playground test runs for a schema.

    Returns the most recent test runs for the specified schema,
    useful for reviewing extraction history and comparing results.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        response = (
            supabase.table("playground_test_runs")
            .select(
                "id, schema_id, schema_version_id, document_id, status, execution_time_ms, created_at"
            )
            .eq("schema_id", schema_id)
            .eq("user_id", x_user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        if not response.data:
            return []

        return [
            PlaygroundTestRun(
                id=run["id"],
                schema_id=run["schema_id"],
                schema_version_id=run.get("schema_version_id"),
                document_id=run["document_id"],
                status=run["status"],
                execution_time_ms=run.get("execution_time_ms", 0),
                created_at=run["created_at"],
            )
            for run in response.data
        ]
    except Exception as e:
        logger.error(f"Failed to list playground runs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve playground runs: {e!s}",
        )


@router.get(
    "/runs/{run_id}",
    summary="Get playground test run details",
    description="Get full details of a specific playground test run including extraction results.",
)
async def get_playground_run(
    run_id: str,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> dict[str, Any]:
    """
    Get full details of a specific playground test run.

    Returns the complete extraction result and metadata for a test run.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        response = (
            supabase.table("playground_test_runs")
            .select(
                "id, user_id, schema_id, schema_version_id, document_id, "
                "status, extracted_data, error_message, execution_time_ms, "
                "schema_name, schema_version, document_title, created_at"
            )
            .eq("id", run_id)
            .eq("user_id", x_user_id)
            .single()
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Playground run '{run_id}' not found",
            )

        return response.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get playground run {run_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve playground run: {e!s}",
        )
