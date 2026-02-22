"""
A/B Testing & Experimentation Module

Manages experiments, variant assignments, event tracking, and statistical analysis.
Supports A/B tests, multivariate tests, and feature flags.

Author: Juddges Backend Team
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Depends
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import (
    get_optional_user,
    get_user_db_client,
    AuthenticatedUser,
)


router = APIRouter(prefix="/api/experiments", tags=["Experiments"])


# ===== Models =====


class VariantInput(BaseModel):
    name: str
    description: Optional[str] = None
    is_control: bool = False
    weight: int = Field(default=50, ge=1, le=100)
    config: Optional[Dict[str, Any]] = Field(default_factory=dict)


class CreateExperimentRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    hypothesis: Optional[str] = None
    experiment_type: Literal["ab_test", "multivariate", "feature_flag"] = "ab_test"
    target_audience: Literal[
        "all_users", "new_users", "returning_users", "percentage"
    ] = "all_users"
    target_percentage: int = Field(default=100, ge=1, le=100)
    primary_metric: str = "conversion"
    secondary_metrics: Optional[List[str]] = Field(default_factory=list)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    feature_area: Optional[
        Literal["ui", "search", "chat", "prompts", "navigation", "other"]
    ] = None
    variants: List[VariantInput] = Field(min_length=2)


class UpdateExperimentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    hypothesis: Optional[str] = None
    status: Optional[Literal["draft", "running", "paused", "completed", "archived"]] = (
        None
    )
    target_audience: Optional[
        Literal["all_users", "new_users", "returning_users", "percentage"]
    ] = None
    target_percentage: Optional[int] = Field(default=None, ge=1, le=100)
    primary_metric: Optional[str] = None
    secondary_metrics: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    feature_area: Optional[
        Literal["ui", "search", "chat", "prompts", "navigation", "other"]
    ] = None


class TrackExperimentEventRequest(BaseModel):
    experiment_id: str
    variant_id: str
    event_type: str = Field(min_length=1)
    event_value: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class VariantResult(BaseModel):
    variant_id: str
    variant_name: str
    is_control: bool
    total_users: int
    total_events: int
    conversion_count: int
    conversion_rate: float
    avg_event_value: Optional[float]


class ExperimentResultsResponse(BaseModel):
    experiment_id: str
    experiment_name: str
    status: str
    variants: List[VariantResult]
    total_participants: int
    statistical_significance: Optional[float] = None


# ===== API Endpoints =====


@router.get("")
async def list_experiments(
    status: Optional[str] = None,
    feature_area: Optional[str] = None,
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """List all experiments, optionally filtered by status or feature area."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)
        query = (
            client.table("experiments")
            .select("*, experiment_variants(*)")
            .order("created_at", desc=True)
        )

        if status:
            query = query.eq("status", status)
        if feature_area:
            query = query.eq("feature_area", feature_area)

        result = query.execute()
        return {"experiments": result.data or [], "total": len(result.data or [])}

    except Exception as e:
        logger.error(f"Failed to list experiments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{experiment_id}")
async def get_experiment(
    experiment_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """Get a single experiment with its variants."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)
        result = (
            client.table("experiments")
            .select("*, experiment_variants(*)")
            .eq("id", experiment_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Experiment not found")

        return result.data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get experiment {experiment_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_experiment(
    request: CreateExperimentRequest,
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """Create a new experiment with variants."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)

        # Create the experiment
        experiment_data = {
            "name": request.name,
            "description": request.description,
            "hypothesis": request.hypothesis,
            "experiment_type": request.experiment_type,
            "target_audience": request.target_audience,
            "target_percentage": request.target_percentage,
            "primary_metric": request.primary_metric,
            "secondary_metrics": request.secondary_metrics or [],
            "start_date": request.start_date,
            "end_date": request.end_date,
            "feature_area": request.feature_area,
            "created_by": user.id,
        }

        exp_result = client.table("experiments").insert(experiment_data).execute()
        experiment = exp_result.data[0]

        # Create variants
        variants_data = [
            {
                "experiment_id": experiment["id"],
                "name": v.name,
                "description": v.description,
                "is_control": v.is_control,
                "weight": v.weight,
                "config": v.config or {},
            }
            for v in request.variants
        ]

        var_result = client.table("experiment_variants").insert(variants_data).execute()
        experiment["experiment_variants"] = var_result.data

        logger.info(
            f"Created experiment '{request.name}' with {len(request.variants)} variants (user: {user.id})"
        )
        return experiment

    except Exception as e:
        logger.error(f"Failed to create experiment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{experiment_id}")
async def update_experiment(
    experiment_id: str,
    request: UpdateExperimentRequest,
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """Update an experiment's properties."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)

        update_data = {k: v for k, v in request.dict(exclude_none=True).items()}
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = (
            client.table("experiments")
            .update(update_data)
            .eq("id", experiment_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404, detail="Experiment not found or not authorized"
            )

        logger.info(f"Updated experiment {experiment_id} (user: {user.id})")
        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update experiment {experiment_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active/running")
async def get_active_experiments(
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """Get all currently running experiments with variants - used by frontend for variant assignment."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)
        datetime.utcnow().isoformat()

        result = (
            client.table("experiments")
            .select("*, experiment_variants(*)")
            .eq("status", "running")
            .execute()
        )

        experiments = result.data or []

        # Also get the user's existing assignments
        assignments_result = (
            client.table("experiment_assignments")
            .select("experiment_id, variant_id")
            .eq("user_id", user.id)
            .execute()
        )

        assignments = {}
        for a in assignments_result.data or []:
            assignments[a["experiment_id"]] = a["variant_id"]

        return {
            "experiments": experiments,
            "assignments": assignments,
        }

    except Exception as e:
        logger.error(f"Failed to get active experiments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/assign")
async def assign_variant(
    experiment_id: str,
    variant_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """Assign a user to a variant. Uses upsert to handle re-assignments."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)

        assignment_data = {
            "experiment_id": experiment_id,
            "variant_id": variant_id,
            "user_id": user.id,
            "assigned_at": datetime.utcnow().isoformat(),
        }

        result = (
            client.table("experiment_assignments")
            .upsert(assignment_data, on_conflict="experiment_id,user_id")
            .execute()
        )

        logger.info(
            f"Assigned user {user.id} to variant {variant_id} in experiment {experiment_id}"
        )
        return {
            "status": "assigned",
            "assignment": result.data[0] if result.data else None,
        }

    except Exception as e:
        logger.error(f"Failed to assign variant: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/track")
async def track_experiment_event(
    request: TrackExperimentEventRequest,
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """Track an event for an experiment variant."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)

        event_data = {
            "experiment_id": request.experiment_id,
            "variant_id": request.variant_id,
            "user_id": user.id,
            "event_type": request.event_type,
            "event_value": request.event_value,
            "metadata": request.metadata or {},
            "created_at": datetime.utcnow().isoformat(),
        }

        result = client.table("experiment_events").insert(event_data).execute()
        event_id = result.data[0]["id"] if result.data else None

        logger.info(
            f"Tracked experiment event: {request.event_type} "
            f"(experiment: {request.experiment_id}, variant: {request.variant_id}, user: {user.id})"
        )

        return {"status": "tracked", "event_id": event_id}

    except Exception as e:
        logger.error(f"Failed to track experiment event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{experiment_id}/results")
async def get_experiment_results(
    experiment_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """Get experiment results with per-variant statistics."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        client = get_user_db_client(user)

        # Get experiment info
        exp_result = (
            client.table("experiments")
            .select("*")
            .eq("id", experiment_id)
            .single()
            .execute()
        )

        if not exp_result.data:
            raise HTTPException(status_code=404, detail="Experiment not found")

        experiment = exp_result.data

        # Get variants
        var_result = (
            client.table("experiment_variants")
            .select("*")
            .eq("experiment_id", experiment_id)
            .execute()
        )
        variants = var_result.data or []

        # Get assignments count per variant
        assign_result = (
            client.table("experiment_assignments")
            .select("variant_id")
            .eq("experiment_id", experiment_id)
            .execute()
        )
        assignments = assign_result.data or []

        # Get events per variant
        events_result = (
            client.table("experiment_events")
            .select("variant_id, event_type, event_value")
            .eq("experiment_id", experiment_id)
            .execute()
        )
        events = events_result.data or []

        # Compute per-variant stats
        variant_results = []
        total_participants = 0

        for v in variants:
            vid = v["id"]
            v_assignments = [a for a in assignments if a["variant_id"] == vid]
            v_events = [e for e in events if e["variant_id"] == vid]
            v_conversions = [e for e in v_events if e["event_type"] == "conversion"]
            v_values = [
                e["event_value"] for e in v_events if e.get("event_value") is not None
            ]

            user_count = len(v_assignments)
            total_participants += user_count

            conversion_rate = 0.0
            if user_count > 0:
                len(
                    set(
                        a["variant_id"]
                        for a in v_assignments
                        if any(
                            e["event_type"] == "conversion" and e["variant_id"] == vid
                            for e in v_events
                        )
                    )
                )
                conversion_rate = (
                    round(len(v_conversions) / user_count * 100, 2)
                    if user_count > 0
                    else 0.0
                )

            variant_results.append(
                VariantResult(
                    variant_id=vid,
                    variant_name=v["name"],
                    is_control=v["is_control"],
                    total_users=user_count,
                    total_events=len(v_events),
                    conversion_count=len(v_conversions),
                    conversion_rate=conversion_rate,
                    avg_event_value=round(sum(v_values) / len(v_values), 4)
                    if v_values
                    else None,
                )
            )

        return ExperimentResultsResponse(
            experiment_id=experiment_id,
            experiment_name=experiment["name"],
            status=experiment["status"],
            variants=variant_results,
            total_participants=total_participants,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get experiment results: {e}")
        raise HTTPException(status_code=500, detail=str(e))


logger.info("Experiments module initialized")
