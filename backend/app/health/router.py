"""FastAPI router for health check and status endpoints."""

import os
import time
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger

from app.auth import verify_api_key
from app.health.checks import check_all_services
from app.health.models import (
    BasicHealthResponse,
    DependenciesResponse,
    DependencyInfo,
    DetailedStatusResponse,
    ServiceStatus,
    SystemStatus,
)

router = APIRouter(prefix="/health", tags=["Health"])

# Cache for status responses (30 second TTL)
_status_cache: Optional[DetailedStatusResponse] = None
_cache_timestamp: Optional[datetime] = None
_cache_ttl_seconds = 30


def _get_system_status(services: dict) -> SystemStatus:
    """
    Determine overall system status based on individual service health.

    Critical services (redis, postgresql) must be healthy.
    Optional services (supabase, celery, langfuse) can be degraded without affecting system status.

    Args:
        services: Dictionary of service health checks

    Returns:
        SystemStatus: Overall system health status
    """
    critical_services = ["redis", "postgresql"]

    # Check critical services
    for service_name in critical_services:
        if service_name not in services:
            continue

        service_health = services[service_name]
        if service_health.status == ServiceStatus.UNHEALTHY:
            logger.warning(f"Critical service {service_name} is unhealthy")
            return SystemStatus.UNHEALTHY

    # Check for degraded critical services
    for service_name in critical_services:
        if service_name not in services:
            continue

        service_health = services[service_name]
        if service_health.status == ServiceStatus.DEGRADED:
            logger.info(f"Critical service {service_name} is degraded")
            return SystemStatus.DEGRADED

    # All critical services healthy - check optional services
    optional_degraded = False
    for service_name, service_health in services.items():
        if service_name not in critical_services:
            if service_health.status in [
                ServiceStatus.DEGRADED,
                ServiceStatus.UNHEALTHY,
            ]:
                optional_degraded = True
                logger.info(
                    f"Optional service {service_name} is {service_health.status}"
                )

    if optional_degraded:
        return SystemStatus.DEGRADED

    return SystemStatus.HEALTHY


def _is_cache_valid() -> bool:
    """Check if status cache is still valid."""
    if _status_cache is None or _cache_timestamp is None:
        return False

    age = datetime.now(UTC) - _cache_timestamp
    return age < timedelta(seconds=_cache_ttl_seconds)


async def _get_cached_status() -> Optional[DetailedStatusResponse]:
    """Get cached status if available and valid."""
    if _is_cache_valid():
        logger.debug("Returning cached status response")
        return _status_cache
    return None


async def _update_cache(response: DetailedStatusResponse):
    """Update the status cache."""
    global _status_cache, _cache_timestamp
    _status_cache = response
    _cache_timestamp = datetime.now(UTC)
    logger.debug(f"Status cache updated, TTL: {_cache_ttl_seconds}s")


@router.get(
    "",
    response_model=BasicHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Basic health check",
    description="Simple health check endpoint for load balancers and monitoring systems. Always returns 200 OK if the API is running.",
)
async def health_check():
    """
    Basic health check endpoint.

    This is a lightweight endpoint that returns immediately without checking
    dependencies. Use this for load balancer health checks and basic uptime monitoring.

    Returns:
        BasicHealthResponse: Basic health status
    """
    logger.debug("Basic health check called")
    return BasicHealthResponse(
        status="healthy",
        timestamp=datetime.now(UTC),
        version="0.2.0",
    )


@router.get(
    "/healthz",
    response_model=BasicHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Kubernetes-style health check",
    description="Kubernetes/Docker-compatible health check endpoint. Returns 200 OK if API is running. No authentication required.",
)
async def healthz():
    """
    Kubernetes-style health check endpoint.

    This endpoint follows the common /healthz pattern used by Kubernetes and Docker.
    It's a lightweight check that returns immediately without testing dependencies.
    Perfect for container orchestration health probes.

    Returns:
        BasicHealthResponse: Basic health status
    """
    logger.debug("Healthz check called")
    return BasicHealthResponse(
        status="healthy",
        timestamp=datetime.now(UTC),
        version="0.2.0",
    )


@router.get(
    "/status",
    response_model=DetailedStatusResponse,
    summary="Detailed status with service checks",
    description="Comprehensive health status including all service dependencies. Requires API key authentication. Results are cached for 30 seconds.",
    dependencies=[Depends(verify_api_key)],
)
async def detailed_status():
    """
    Detailed health status endpoint.

    Performs health checks on all critical and optional services:
    - Critical: Redis, PostgreSQL
    - Optional: Supabase, Celery, Langfuse

    System status levels:
    - HEALTHY: All critical services are healthy
    - DEGRADED: Critical services healthy but optional services have issues
    - UNHEALTHY: One or more critical services are unhealthy

    Responses are cached for 30 seconds to avoid overwhelming dependencies.

    Returns:
        DetailedStatusResponse: Detailed system status with all service checks

    Raises:
        HTTPException: 503 if system is unhealthy
    """
    logger.info("Detailed status check requested")

    # Check cache first
    cached = await _get_cached_status()
    if cached:
        # If system is unhealthy, return 503
        if cached.status == SystemStatus.UNHEALTHY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=cached.model_dump(),
            )
        return cached

    # Perform health checks
    start_time = time.time()
    services = await check_all_services()
    total_time = (time.time() - start_time) * 1000

    # Determine overall system status
    system_status = _get_system_status(services)

    # Build response
    response = DetailedStatusResponse(
        status=system_status,
        timestamp=datetime.now(UTC),
        version="0.2.0",
        environment=os.getenv("PYTHON_ENV", "production"),
        services=services,
        response_time_ms=round(total_time, 2),
    )

    # Update cache
    await _update_cache(response)

    # Log status
    logger.info(
        f"System status: {system_status.value}, "
        f"services checked: {len(services)}, "
        f"response time: {total_time:.2f}ms"
    )

    # If system is unhealthy, return 503
    if system_status == SystemStatus.UNHEALTHY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=response.model_dump(),
        )

    return response


@router.get(
    "/dependencies",
    response_model=DependenciesResponse,
    summary="List service dependencies",
    description="Returns information about all critical and optional service dependencies. Requires API key authentication.",
    dependencies=[Depends(verify_api_key)],
)
async def list_dependencies():
    """
    List all service dependencies.

    Provides information about which services are critical vs optional,
    helping operators understand the system architecture and dependency graph.

    Returns:
        DependenciesResponse: Information about critical and optional dependencies
    """
    logger.debug("Dependencies list requested")

    critical_deps = {
        "redis": DependencyInfo(
            name="redis",
            critical=True,
            description="In-memory cache for guest sessions and application state",
            health_check_url=None,  # Redis doesn't have HTTP health endpoint
        ),
        "postgresql": DependencyInfo(
            name="postgresql",
            critical=True,
            description="Relational database for conversation state and checkpointing",
            health_check_url=None,  # PostgreSQL doesn't have HTTP health endpoint
        ),
    }

    optional_deps = {
        "supabase": DependencyInfo(
            name="supabase",
            critical=False,
            description="Analytics, user feedback, and additional storage (optional)",
            health_check_url=os.getenv("SUPABASE_URL", "").rstrip("/") + "/rest/v1/"
            if os.getenv("SUPABASE_URL")
            else None,
        ),
        "celery": DependencyInfo(
            name="celery",
            critical=False,
            description="Background task processing for document extraction and schema generation",
            health_check_url=None,  # Celery uses broker for health
        ),
        "langfuse": DependencyInfo(
            name="langfuse",
            critical=False,
            description="LLM observability and tracing platform (optional)",
            health_check_url=os.getenv("LANGFUSE_HOST", "").rstrip("/")
            + "/api/public/health"
            if os.getenv("LANGFUSE_HOST")
            else None,
        ),
    }

    return DependenciesResponse(
        critical=critical_deps,
        optional=optional_deps,
    )


@router.post(
    "/status/invalidate",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Invalidate status cache",
    description="Manually invalidate the status response cache. Next status request will perform fresh checks. Requires API key authentication.",
    dependencies=[Depends(verify_api_key)],
)
async def invalidate_cache():
    """
    Invalidate the status cache.

    Forces the next /status request to perform fresh health checks
    instead of returning cached results. Useful for testing or when
    you need up-to-date status information immediately.

    Returns:
        None: 204 No Content on success
    """
    global _status_cache, _cache_timestamp
    _status_cache = None
    _cache_timestamp = None
    logger.info("Status cache manually invalidated")
