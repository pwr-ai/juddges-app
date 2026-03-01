"""Extraction domain package exposing focused subrouters and shared helpers."""

from app.extraction_domain.jobs_router import router as jobs_router
from app.extraction_domain.prompts_router import router as prompts_router
from app.extraction_domain.results_router import router as results_router

__all__ = [
    "jobs_router",
    "prompts_router",
    "results_router",
]
