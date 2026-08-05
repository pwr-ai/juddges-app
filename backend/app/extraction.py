"""Extraction API router composed from focused domain subrouters."""

from __future__ import annotations

from fastapi import APIRouter

from app.extraction_domain import jobs_router, prompts_router, results_router
from app.extraction_domain.shared import simplify_job_status

router = APIRouter(tags=["extraction"])

# Register static paths before the catch-all ``/{job_id}`` job routes. FastAPI
# resolves matching routes in registration order, so putting jobs first makes
# one-segment collections such as ``/prompts`` resolve as job IDs.
router.include_router(prompts_router, prefix="/extractions")
router.include_router(results_router, prefix="/extractions")
router.include_router(jobs_router, prefix="/extractions")

__all__ = [
    "jobs_router",
    "prompts_router",
    "results_router",
    "router",
    "simplify_job_status",
]
