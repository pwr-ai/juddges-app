"""Regression tests for extraction module decomposition seams."""

from __future__ import annotations

import importlib


def test_extraction_domain_modules_exist() -> None:
    """Extraction domain should be split into dedicated modules."""
    modules = (
        "app.extraction_domain.shared",
        "app.extraction_domain.jobs_router",
        "app.extraction_domain.prompts_router",
        "app.extraction_domain.results_router",
    )
    for module_name in modules:
        assert importlib.import_module(module_name)


def test_extraction_router_exposes_composed_subrouters() -> None:
    """Root extraction module should expose composed routers."""
    extraction_module = importlib.import_module("app.extraction")

    assert hasattr(extraction_module, "jobs_router")
    assert hasattr(extraction_module, "prompts_router")
    assert hasattr(extraction_module, "results_router")

    route_paths = {route.path for route in extraction_module.router.routes}
    assert "/extractions/{job_id}" in route_paths
    assert "/extractions/prompts" in route_paths
    assert "/extractions/base-schema/filter-options" in route_paths
