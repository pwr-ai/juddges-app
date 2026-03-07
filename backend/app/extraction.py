"""Extraction API router composed from focused domain subrouters."""

from __future__ import annotations

from fastapi import APIRouter

from app.extraction_domain import jobs_router, prompts_router, results_router
from app.extraction_domain.shared import get_current_user, simplify_job_status

router = APIRouter(tags=["extraction"])

# Preserve existing public API paths under /extractions.
router.include_router(jobs_router, prefix="/extractions")
router.include_router(prompts_router, prefix="/extractions")
router.include_router(results_router, prefix="/extractions")

__all__ = [
    "get_current_user",
    "jobs_router",
    "prompts_router",
    "results_router",
    "router",
    "simplify_job_status",
]
