"""
Evaluation API endpoints for rating extraction quality.

This module provides endpoints for creating and managing extraction evaluations,
which form the ground truth dataset for measuring schema accuracy.
"""

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query, status
from loguru import logger
from pydantic import BaseModel, Field

from app.core.supabase import get_supabase_client

router = APIRouter(prefix="/evaluations", tags=["evaluations"])

# Use shared Supabase client
supabase = get_supabase_client()


# ==================== Request/Response Models ====================


class FieldEvaluation(BaseModel):
    """Evaluation of a single extracted field."""

    field_path: str = Field(description="Dot-notation path (e.g., 'parties.0.name')")
    field_name: str = Field(description="Display name of the field")
    is_correct: bool = Field(description="Whether the extracted value is correct")
    extracted_value: Optional[Any] = Field(
        default=None, description="The value that was extracted"
    )
    evaluator_notes: Optional[str] = Field(default=None, max_length=500)


class CreateEvaluationRequest(BaseModel):
    """Request to create an extraction evaluation."""

    schema_version_id: str = Field(
        description="UUID of the schema version being evaluated"
    )
    document_id: str = Field(description="Document ID")
    playground_run_id: Optional[str] = Field(
        default=None, description="Optional link to playground test run"
    )

    overall_rating: Literal["correct", "incorrect"] = Field(
        description="Overall extraction quality rating"
    )
    overall_notes: Optional[str] = Field(default=None, max_length=2000)

    field_evaluations: list[FieldEvaluation] = Field(
        default_factory=list, description="Field-level evaluations"
    )
    extracted_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Snapshot of extracted data at evaluation time",
    )


class UpdateEvaluationRequest(BaseModel):
    """Request to update an existing evaluation."""

    overall_rating: Optional[Literal["correct", "incorrect"]] = None
    overall_notes: Optional[str] = None
    field_evaluations: Optional[list[FieldEvaluation]] = None


class EvaluationResponse(BaseModel):
    """Response containing evaluation details."""

    id: str
    schema_version_id: str
    document_id: str
    playground_run_id: Optional[str]
    overall_rating: str
    overall_notes: Optional[str]
    extracted_data: dict[str, Any]
    evaluator_user_id: Optional[str]
    created_at: str
    updated_at: str
    field_evaluations: list[FieldEvaluation] = Field(default_factory=list)


class AccuracyStats(BaseModel):
    """Accuracy statistics for evaluations."""

    total_evaluations: int
    correct_count: int
    incorrect_count: int
    accuracy_rate: float = Field(
        description="Percentage of correct evaluations (0-100)"
    )
    total_fields_evaluated: int
    correct_fields: int
    field_accuracy_rate: float = Field(
        description="Percentage of correct fields (0-100)"
    )


class SchemaEvaluationsResponse(BaseModel):
    """Response containing evaluations for a schema with stats."""

    schema_id: str
    schema_version_id: Optional[str]
    stats: AccuracyStats
    evaluations: list[EvaluationResponse]
    total: int
    page: int
    page_size: int


# ==================== Helper Functions ====================


def _get_field_evaluations(evaluation_id: str) -> list[FieldEvaluation]:
    """Fetch field evaluations for an evaluation."""
    if not supabase:
        return []

    try:
        response = (
            supabase.table("extraction_field_evaluations")
            .select("*")
            .eq("evaluation_id", evaluation_id)
            .execute()
        )

        if not response.data:
            return []

        return [
            FieldEvaluation(
                field_path=fe["field_path"],
                field_name=fe["field_name"],
                is_correct=fe["is_correct"],
                extracted_value=fe.get("extracted_value"),
                evaluator_notes=fe.get("evaluator_notes"),
            )
            for fe in response.data
        ]
    except Exception as e:
        logger.warning(f"Failed to fetch field evaluations: {e}")
        return []


def _save_field_evaluations(
    evaluation_id: str, field_evaluations: list[FieldEvaluation]
) -> None:
    """Save field evaluations to database."""
    if not supabase or not field_evaluations:
        return

    try:
        # Delete existing field evaluations for this evaluation
        supabase.table("extraction_field_evaluations").delete().eq(
            "evaluation_id", evaluation_id
        ).execute()

        # Insert new field evaluations
        records = [
            {
                "evaluation_id": evaluation_id,
                "field_path": fe.field_path,
                "field_name": fe.field_name,
                "is_correct": fe.is_correct,
                "extracted_value": fe.extracted_value,
                "evaluator_notes": fe.evaluator_notes,
            }
            for fe in field_evaluations
        ]

        if records:
            supabase.table("extraction_field_evaluations").insert(records).execute()
    except Exception as e:
        logger.error(f"Failed to save field evaluations: {e}")
        raise


def _calculate_accuracy_stats(schema_version_id: str) -> AccuracyStats:
    """Calculate accuracy statistics for a schema version."""
    if not supabase:
        return AccuracyStats(
            total_evaluations=0,
            correct_count=0,
            incorrect_count=0,
            accuracy_rate=0.0,
            total_fields_evaluated=0,
            correct_fields=0,
            field_accuracy_rate=0.0,
        )

    try:
        # Try to use the database function
        result = supabase.rpc(
            "get_schema_version_accuracy", {"p_schema_version_id": schema_version_id}
        ).execute()

        if result.data and len(result.data) > 0:
            row = result.data[0]
            return AccuracyStats(
                total_evaluations=row.get("total_evaluations", 0) or 0,
                correct_count=row.get("correct_count", 0) or 0,
                incorrect_count=row.get("incorrect_count", 0) or 0,
                accuracy_rate=float(row.get("accuracy_rate", 0) or 0),
                total_fields_evaluated=row.get("total_fields_evaluated", 0) or 0,
                correct_fields=row.get("correct_fields", 0) or 0,
                field_accuracy_rate=float(row.get("field_accuracy_rate", 0) or 0),
            )
    except Exception as e:
        logger.warning(f"Failed to call get_schema_version_accuracy: {e}")

    # Fallback: calculate manually
    try:
        # Get evaluation counts
        evals = (
            supabase.table("extraction_evaluations")
            .select("id, overall_rating")
            .eq("schema_version_id", schema_version_id)
            .execute()
        )

        if not evals.data:
            return AccuracyStats(
                total_evaluations=0,
                correct_count=0,
                incorrect_count=0,
                accuracy_rate=0.0,
                total_fields_evaluated=0,
                correct_fields=0,
                field_accuracy_rate=0.0,
            )

        total = len(evals.data)
        correct = sum(1 for e in evals.data if e["overall_rating"] == "correct")
        incorrect = total - correct

        # Get field evaluation counts
        eval_ids = [e["id"] for e in evals.data]
        field_evals = (
            supabase.table("extraction_field_evaluations")
            .select("is_correct")
            .in_("evaluation_id", eval_ids)
            .execute()
        )

        total_fields = len(field_evals.data) if field_evals.data else 0
        correct_fields = sum(1 for f in (field_evals.data or []) if f["is_correct"])

        return AccuracyStats(
            total_evaluations=total,
            correct_count=correct,
            incorrect_count=incorrect,
            accuracy_rate=round(correct * 100.0 / total, 2) if total > 0 else 0.0,
            total_fields_evaluated=total_fields,
            correct_fields=correct_fields,
            field_accuracy_rate=round(correct_fields * 100.0 / total_fields, 2)
            if total_fields > 0
            else 0.0,
        )
    except Exception as e:
        logger.error(f"Failed to calculate accuracy stats: {e}")
        return AccuracyStats(
            total_evaluations=0,
            correct_count=0,
            incorrect_count=0,
            accuracy_rate=0.0,
            total_fields_evaluated=0,
            correct_fields=0,
            field_accuracy_rate=0.0,
        )


# ==================== API Endpoints ====================


@router.post(
    "",
    response_model=EvaluationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create evaluation",
    description="Create a new extraction evaluation with overall and field-level ratings.",
)
async def create_evaluation(
    request: CreateEvaluationRequest,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> EvaluationResponse:
    """
    Create a new extraction evaluation.

    This endpoint creates a ground truth evaluation for an extraction result,
    including both overall quality rating and field-level ratings.

    **Request:**
    - schema_version_id: The specific schema version being evaluated
    - document_id: The document that was extracted
    - overall_rating: 'correct' or 'incorrect'
    - field_evaluations: Array of field-level ratings

    **Note:** Only one evaluation can exist per schema_version + document combination.
    If an evaluation already exists, use PUT to update it.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        # Check if evaluation already exists
        existing = (
            supabase.table("extraction_evaluations")
            .select("id")
            .eq("schema_version_id", request.schema_version_id)
            .eq("document_id", request.document_id)
            .execute()
        )

        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": "Evaluation Exists",
                    "message": "An evaluation already exists for this schema version and document. Use PUT to update it.",
                    "code": "EVALUATION_EXISTS",
                    "existing_id": existing.data[0]["id"],
                },
            )

        # Create evaluation
        now = datetime.now(timezone.utc).isoformat()
        result = (
            supabase.table("extraction_evaluations")
            .insert(
                {
                    "schema_version_id": request.schema_version_id,
                    "document_id": request.document_id,
                    "playground_run_id": request.playground_run_id,
                    "overall_rating": request.overall_rating,
                    "overall_notes": request.overall_notes,
                    "extracted_data": request.extracted_data,
                    "evaluator_user_id": x_user_id,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create evaluation",
            )

        evaluation = result.data[0]
        evaluation_id = evaluation["id"]

        # Save field evaluations
        if request.field_evaluations:
            _save_field_evaluations(evaluation_id, request.field_evaluations)

        logger.info(
            f"Created evaluation {evaluation_id} for schema_version={request.schema_version_id}, "
            f"document={request.document_id}, rating={request.overall_rating}"
        )

        return EvaluationResponse(
            id=evaluation_id,
            schema_version_id=evaluation["schema_version_id"],
            document_id=evaluation["document_id"],
            playground_run_id=evaluation.get("playground_run_id"),
            overall_rating=evaluation["overall_rating"],
            overall_notes=evaluation.get("overall_notes"),
            extracted_data=evaluation.get("extracted_data", {}),
            evaluator_user_id=evaluation.get("evaluator_user_id"),
            created_at=evaluation["created_at"],
            updated_at=evaluation["updated_at"],
            field_evaluations=request.field_evaluations,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create evaluation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create evaluation: {str(e)}",
        )


@router.get(
    "/{evaluation_id}",
    response_model=EvaluationResponse,
    summary="Get evaluation",
    description="Get a specific evaluation by ID.",
)
async def get_evaluation(
    evaluation_id: str,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> EvaluationResponse:
    """Get a specific evaluation by ID."""
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        result = (
            supabase.table("extraction_evaluations")
            .select("*")
            .eq("id", evaluation_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Evaluation '{evaluation_id}' not found",
            )

        evaluation = result.data
        field_evaluations = _get_field_evaluations(evaluation_id)

        return EvaluationResponse(
            id=evaluation["id"],
            schema_version_id=evaluation["schema_version_id"],
            document_id=evaluation["document_id"],
            playground_run_id=evaluation.get("playground_run_id"),
            overall_rating=evaluation["overall_rating"],
            overall_notes=evaluation.get("overall_notes"),
            extracted_data=evaluation.get("extracted_data", {}),
            evaluator_user_id=evaluation.get("evaluator_user_id"),
            created_at=evaluation["created_at"],
            updated_at=evaluation["updated_at"],
            field_evaluations=field_evaluations,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get evaluation {evaluation_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get evaluation: {str(e)}",
        )


@router.put(
    "/{evaluation_id}",
    response_model=EvaluationResponse,
    summary="Update evaluation",
    description="Update an existing evaluation.",
)
async def update_evaluation(
    evaluation_id: str,
    request: UpdateEvaluationRequest,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> EvaluationResponse:
    """
    Update an existing evaluation.

    Only updates the fields that are provided in the request.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        # Check evaluation exists and user has access
        existing = (
            supabase.table("extraction_evaluations")
            .select("*")
            .eq("id", evaluation_id)
            .single()
            .execute()
        )

        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Evaluation '{evaluation_id}' not found",
            )

        # Build update data
        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}

        if request.overall_rating is not None:
            update_data["overall_rating"] = request.overall_rating
        if request.overall_notes is not None:
            update_data["overall_notes"] = request.overall_notes

        # Update main evaluation
        result = (
            supabase.table("extraction_evaluations")
            .update(update_data)
            .eq("id", evaluation_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update evaluation",
            )

        # Update field evaluations if provided
        if request.field_evaluations is not None:
            _save_field_evaluations(evaluation_id, request.field_evaluations)

        evaluation = result.data[0]
        field_evaluations = (
            request.field_evaluations
            if request.field_evaluations is not None
            else _get_field_evaluations(evaluation_id)
        )

        logger.info(f"Updated evaluation {evaluation_id}")

        return EvaluationResponse(
            id=evaluation["id"],
            schema_version_id=evaluation["schema_version_id"],
            document_id=evaluation["document_id"],
            playground_run_id=evaluation.get("playground_run_id"),
            overall_rating=evaluation["overall_rating"],
            overall_notes=evaluation.get("overall_notes"),
            extracted_data=evaluation.get("extracted_data", {}),
            evaluator_user_id=evaluation.get("evaluator_user_id"),
            created_at=evaluation["created_at"],
            updated_at=evaluation["updated_at"],
            field_evaluations=field_evaluations,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update evaluation {evaluation_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update evaluation: {str(e)}",
        )


@router.delete(
    "/{evaluation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete evaluation",
    description="Delete an evaluation and its field evaluations.",
)
async def delete_evaluation(
    evaluation_id: str,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> None:
    """Delete an evaluation and its field evaluations."""
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        # Check evaluation exists
        existing = (
            supabase.table("extraction_evaluations")
            .select("id")
            .eq("id", evaluation_id)
            .single()
            .execute()
        )

        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Evaluation '{evaluation_id}' not found",
            )

        # Delete (cascade will handle field evaluations)
        supabase.table("extraction_evaluations").delete().eq(
            "id", evaluation_id
        ).execute()

        logger.info(f"Deleted evaluation {evaluation_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete evaluation {evaluation_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete evaluation: {str(e)}",
        )


@router.get(
    "/schema/{schema_id}",
    response_model=SchemaEvaluationsResponse,
    summary="Get schema evaluations",
    description="Get all evaluations for a schema with accuracy statistics.",
)
async def get_schema_evaluations(
    schema_id: str,
    schema_version_id: Optional[str] = Query(
        None, description="Filter by specific version"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> SchemaEvaluationsResponse:
    """
    Get all evaluations for a schema with accuracy statistics.

    Returns evaluations optionally filtered by schema version, along with
    aggregated accuracy statistics.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        # Get schema versions for this schema
        if schema_version_id:
            version_ids = [schema_version_id]
        else:
            versions = (
                supabase.table("schema_versions")
                .select("id")
                .eq("schema_id", schema_id)
                .execute()
            )
            version_ids = [v["id"] for v in (versions.data or [])]

        if not version_ids:
            return SchemaEvaluationsResponse(
                schema_id=schema_id,
                schema_version_id=schema_version_id,
                stats=AccuracyStats(
                    total_evaluations=0,
                    correct_count=0,
                    incorrect_count=0,
                    accuracy_rate=0.0,
                    total_fields_evaluated=0,
                    correct_fields=0,
                    field_accuracy_rate=0.0,
                ),
                evaluations=[],
                total=0,
                page=page,
                page_size=page_size,
            )

        # Get evaluations with pagination
        query = (
            supabase.table("extraction_evaluations")
            .select("*", count="exact")
            .in_("schema_version_id", version_ids)
        )

        # Get total count
        count_result = query.execute()
        total = count_result.count or 0

        # Get paginated results
        offset = (page - 1) * page_size
        result = (
            supabase.table("extraction_evaluations")
            .select("*")
            .in_("schema_version_id", version_ids)
            .order("created_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        evaluations = []
        for eval_data in result.data or []:
            field_evals = _get_field_evaluations(eval_data["id"])
            evaluations.append(
                EvaluationResponse(
                    id=eval_data["id"],
                    schema_version_id=eval_data["schema_version_id"],
                    document_id=eval_data["document_id"],
                    playground_run_id=eval_data.get("playground_run_id"),
                    overall_rating=eval_data["overall_rating"],
                    overall_notes=eval_data.get("overall_notes"),
                    extracted_data=eval_data.get("extracted_data", {}),
                    evaluator_user_id=eval_data.get("evaluator_user_id"),
                    created_at=eval_data["created_at"],
                    updated_at=eval_data["updated_at"],
                    field_evaluations=field_evals,
                )
            )

        # Calculate stats (use first version_id if filtering by version, otherwise aggregate)
        stats_version_id = (
            schema_version_id
            if schema_version_id
            else (version_ids[0] if version_ids else None)
        )
        stats = (
            _calculate_accuracy_stats(stats_version_id)
            if stats_version_id
            else AccuracyStats(
                total_evaluations=0,
                correct_count=0,
                incorrect_count=0,
                accuracy_rate=0.0,
                total_fields_evaluated=0,
                correct_fields=0,
                field_accuracy_rate=0.0,
            )
        )

        return SchemaEvaluationsResponse(
            schema_id=schema_id,
            schema_version_id=schema_version_id,
            stats=stats,
            evaluations=evaluations,
            total=total,
            page=page,
            page_size=page_size,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get schema evaluations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get evaluations: {str(e)}",
        )


@router.get(
    "/document/{document_id}",
    response_model=list[EvaluationResponse],
    summary="Get document evaluations",
    description="Get all evaluations for a specific document across all schemas.",
)
async def get_document_evaluations(
    document_id: str,
    schema_id: Optional[str] = Query(None, description="Filter by specific schema"),
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> list[EvaluationResponse]:
    """
    Get all evaluations for a specific document.

    Returns evaluation history for a document, optionally filtered by schema.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        query = (
            supabase.table("extraction_evaluations")
            .select("*")
            .eq("document_id", document_id)
        )

        if schema_id:
            # Get version IDs for the schema
            versions = (
                supabase.table("schema_versions")
                .select("id")
                .eq("schema_id", schema_id)
                .execute()
            )
            version_ids = [v["id"] for v in (versions.data or [])]
            if version_ids:
                query = query.in_("schema_version_id", version_ids)

        result = query.order("created_at", desc=True).execute()

        evaluations = []
        for eval_data in result.data or []:
            field_evals = _get_field_evaluations(eval_data["id"])
            evaluations.append(
                EvaluationResponse(
                    id=eval_data["id"],
                    schema_version_id=eval_data["schema_version_id"],
                    document_id=eval_data["document_id"],
                    playground_run_id=eval_data.get("playground_run_id"),
                    overall_rating=eval_data["overall_rating"],
                    overall_notes=eval_data.get("overall_notes"),
                    extracted_data=eval_data.get("extracted_data", {}),
                    evaluator_user_id=eval_data.get("evaluator_user_id"),
                    created_at=eval_data["created_at"],
                    updated_at=eval_data["updated_at"],
                    field_evaluations=field_evals,
                )
            )

        return evaluations
    except Exception as e:
        logger.error(f"Failed to get document evaluations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get evaluations: {str(e)}",
        )


@router.get(
    "/stats/{schema_version_id}",
    response_model=AccuracyStats,
    summary="Get accuracy stats",
    description="Get accuracy statistics for a specific schema version.",
)
async def get_accuracy_stats(
    schema_version_id: str,
    x_user_id: str = Header(..., alias="X-User-ID"),
) -> AccuracyStats:
    """Get accuracy statistics for a schema version."""
    return _calculate_accuracy_stats(schema_version_id)
