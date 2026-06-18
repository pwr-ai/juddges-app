"""Regression tests for extraction module decomposition seams."""

from __future__ import annotations

import importlib


def _collect_route_paths(router) -> set[str]:
    # fastapi >= 0.137 stores included routers as `_IncludedRouter` wrappers
    # carrying an `include_context` (prefix + included APIRouter); older
    # versions flatten everything into APIRoute objects with `.path`.
    paths: set[str] = set()
    for route in router.routes:
        path = getattr(route, "path", None)
        if path is not None:
            paths.add(path)
            continue
        ctx = getattr(route, "include_context", None)
        if ctx is not None:
            prefix = getattr(ctx, "prefix", "")
            for sub in _collect_route_paths(ctx.included_router):
                paths.add(prefix + sub)
    return paths


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

    route_paths = _collect_route_paths(extraction_module.router)
    assert "/extractions/{job_id}" in route_paths
    assert "/extractions/prompts" in route_paths
    assert "/extractions/base-schema/filter-options" in route_paths
