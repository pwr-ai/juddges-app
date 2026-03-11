"""Service health check functions."""

import asyncio
import os
import time
from datetime import UTC, datetime

import httpx
import redis.asyncio as aioredis
from celery import Celery
from loguru import logger
from psycopg_pool import AsyncConnectionPool

from app.health.models import ServiceHealth, ServiceStatus


async def check_redis(timeout: float = 3.0) -> ServiceHealth:
    """
    Check Redis cache and session store health.

    Args:
        timeout: Maximum time to wait for response in seconds

    Returns:
        ServiceHealth: Health status of Redis service
    """
    start_time = time.time()
    service_name = "redis"

    try:
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_auth = os.getenv("REDIS_AUTH")

        if not redis_host:
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.UNKNOWN,
                message="Redis host not configured",
                error="REDIS_HOST environment variable not set",
                last_checked=datetime.now(UTC),
            )

        # Create Redis client with timeout
        redis_client = aioredis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_auth,
            socket_connect_timeout=timeout,
            socket_timeout=timeout,
            decode_responses=True,
        )

        try:
            # Ping Redis
            await redis_client.ping()
            response_time = (time.time() - start_time) * 1000

            logger.debug(f"Redis health check successful: {redis_host}:{redis_port}")
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.HEALTHY,
                response_time_ms=round(response_time, 2),
                message=f"Connected to Redis at {redis_host}:{redis_port}",
                last_checked=datetime.now(UTC),
            )
        finally:
            await redis_client.aclose()

    except TimeoutError:
        response_time = (time.time() - start_time) * 1000
        logger.error(f"Redis health check timed out after {timeout}s")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.UNHEALTHY,
            response_time_ms=round(response_time, 2),
            error=f"Connection timeout after {timeout}s",
            last_checked=datetime.now(UTC),
        )
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.error(f"Redis health check failed: {e}")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.UNHEALTHY,
            response_time_ms=round(response_time, 2),
            error=str(e),
            last_checked=datetime.now(UTC),
        )


async def check_postgresql(timeout: float = 3.0) -> ServiceHealth:
    """
    Check PostgreSQL database health.

    Args:
        timeout: Maximum time to wait for response in seconds

    Returns:
        ServiceHealth: Health status of PostgreSQL service
    """
    start_time = time.time()
    service_name = "postgresql"

    try:
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.UNKNOWN,
                message="PostgreSQL URL not configured",
                error="DATABASE_URL environment variable not set",
                last_checked=datetime.now(UTC),
            )

        # Create a temporary connection pool
        async with (
            AsyncConnectionPool(
                db_url,
                min_size=1,
                max_size=1,
                timeout=timeout,
            ) as pool,
            pool.connection() as conn,
        ):
            # Execute simple query
            await conn.execute("SELECT 1")
            response_time = (time.time() - start_time) * 1000

            logger.debug("PostgreSQL health check successful")
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.HEALTHY,
                response_time_ms=round(response_time, 2),
                message="PostgreSQL connection successful",
                last_checked=datetime.now(UTC),
            )

    except TimeoutError:
        response_time = (time.time() - start_time) * 1000
        logger.error(f"PostgreSQL health check timed out after {timeout}s")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.UNHEALTHY,
            response_time_ms=round(response_time, 2),
            error=f"Connection timeout after {timeout}s",
            last_checked=datetime.now(UTC),
        )
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.error(f"PostgreSQL health check failed: {e}")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.UNHEALTHY,
            response_time_ms=round(response_time, 2),
            error=str(e),
            last_checked=datetime.now(UTC),
        )


async def check_supabase(timeout: float = 5.0) -> ServiceHealth:
    """
    Check Supabase (optional analytics/feedback service) health.

    Args:
        timeout: Maximum time to wait for response in seconds

    Returns:
        ServiceHealth: Health status of Supabase service
    """
    start_time = time.time()
    service_name = "supabase"

    try:
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not supabase_url or not supabase_key:
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.UNKNOWN,
                message="Supabase not configured (optional service)",
                last_checked=datetime.now(UTC),
            )

        # Try to create client and make simple REST call
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Check Supabase REST API health
            response = await client.get(
                f"{supabase_url}/rest/v1/",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                },
            )

            response_time = (time.time() - start_time) * 1000

            if response.status_code in [200, 404]:  # 404 is OK, means API is responding
                logger.debug("Supabase health check successful")
                return ServiceHealth(
                    name=service_name,
                    status=ServiceStatus.HEALTHY,
                    response_time_ms=round(response_time, 2),
                    message="Supabase REST API is accessible",
                    last_checked=datetime.now(UTC),
                )
            logger.warning(
                f"Supabase health check returned status {response.status_code}"
            )
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.DEGRADED,
                response_time_ms=round(response_time, 2),
                message=f"Supabase returned unexpected status {response.status_code}",
                last_checked=datetime.now(UTC),
            )

    except TimeoutError:
        response_time = (time.time() - start_time) * 1000
        logger.warning(
            f"Supabase health check timed out after {timeout}s (optional service)"
        )
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=f"Connection timeout after {timeout}s",
            last_checked=datetime.now(UTC),
        )
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.warning(f"Supabase health check failed: {e} (optional service)")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=str(e),
            last_checked=datetime.now(UTC),
        )


async def check_celery(timeout: float = 5.0) -> ServiceHealth:
    """
    Check Celery worker health and availability.

    Args:
        timeout: Maximum time to wait for response in seconds

    Returns:
        ServiceHealth: Health status of Celery workers
    """
    start_time = time.time()
    service_name = "celery"

    try:
        broker_url = os.getenv("CELERY_BROKER_URL")
        backend_url = os.getenv("CELERY_BACKEND_URL")
        project_name = os.getenv("CELERY_PROJECT_NAME", "juddges")

        if not broker_url or not backend_url:
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.UNKNOWN,
                message="Celery not configured (optional service)",
                error="CELERY_BROKER_URL or CELERY_BACKEND_URL not set",
                last_checked=datetime.now(UTC),
            )

        # Create Celery app to inspect workers
        celery_app = Celery(project_name, broker=broker_url, backend=backend_url)

        # Run inspect in executor to avoid blocking
        loop = asyncio.get_event_loop()
        inspect = celery_app.control.inspect(timeout=timeout)

        # Check for active workers
        active_workers = await loop.run_in_executor(None, inspect.active)
        response_time = (time.time() - start_time) * 1000

        if active_workers and len(active_workers) > 0:
            worker_count = len(active_workers)
            logger.debug(
                f"Celery health check successful: {worker_count} workers active"
            )
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.HEALTHY,
                response_time_ms=round(response_time, 2),
                message=f"{worker_count} Celery worker(s) active and processing tasks",
                last_checked=datetime.now(UTC),
            )
        logger.warning("Celery health check found no active workers")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message="No active Celery workers found (background tasks may be delayed)",
            last_checked=datetime.now(UTC),
        )

    except TimeoutError:
        response_time = (time.time() - start_time) * 1000
        logger.warning(
            f"Celery health check timed out after {timeout}s (optional service)"
        )
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=f"Worker inspection timeout after {timeout}s",
            last_checked=datetime.now(UTC),
        )
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.warning(f"Celery health check failed: {e} (optional service)")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=str(e),
            last_checked=datetime.now(UTC),
        )


async def check_langfuse(timeout: float = 5.0) -> ServiceHealth:
    """
    Check Langfuse observability platform health.

    Args:
        timeout: Maximum time to wait for response in seconds

    Returns:
        ServiceHealth: Health status of Langfuse service
    """
    start_time = time.time()
    service_name = "langfuse"

    try:
        langfuse_host = os.getenv("LANGFUSE_HOST")
        langfuse_public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
        langfuse_secret_key = os.getenv("LANGFUSE_SECRET_KEY")

        if not langfuse_host or not langfuse_public_key or not langfuse_secret_key:
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.UNKNOWN,
                message="Langfuse not configured (optional observability service)",
                last_checked=datetime.now(UTC),
            )

        # Check Langfuse health endpoint
        async with httpx.AsyncClient(timeout=timeout) as client:
            health_url = f"{langfuse_host}/api/public/health"
            response = await client.get(health_url)

            response_time = (time.time() - start_time) * 1000

            if response.status_code == 200:
                logger.debug("Langfuse health check successful")
                return ServiceHealth(
                    name=service_name,
                    status=ServiceStatus.HEALTHY,
                    response_time_ms=round(response_time, 2),
                    message="Langfuse observability platform is accessible",
                    last_checked=datetime.now(UTC),
                )
            logger.warning(
                f"Langfuse health check returned status {response.status_code}"
            )
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.DEGRADED,
                response_time_ms=round(response_time, 2),
                message=f"Langfuse returned unexpected status {response.status_code}",
                last_checked=datetime.now(UTC),
            )

    except TimeoutError:
        response_time = (time.time() - start_time) * 1000
        logger.warning(
            f"Langfuse health check timed out after {timeout}s (optional service)"
        )
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=f"Connection timeout after {timeout}s",
            last_checked=datetime.now(UTC),
        )
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.warning(f"Langfuse health check failed: {e} (optional service)")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=str(e),
            last_checked=datetime.now(UTC),
        )


async def check_meilisearch(timeout: float = 3.0) -> ServiceHealth:
    """
    Check Meilisearch search engine health (optional service).

    Args:
        timeout: Maximum time to wait for response in seconds

    Returns:
        ServiceHealth: Health status of Meilisearch service
    """
    from app.services.sync_status import get_sync_status

    start_time = time.time()
    service_name = "meilisearch"
    sync_info = get_sync_status()

    try:
        meilisearch_url = os.getenv("MEILISEARCH_URL")
        if not meilisearch_url:
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.UNKNOWN,
                message="Meilisearch not configured (optional service)",
                last_checked=datetime.now(UTC),
                metadata={"sync": sync_info},
            )

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{meilisearch_url.rstrip('/')}/health")
            response_time = (time.time() - start_time) * 1000

            if response.status_code == 200:
                logger.debug("Meilisearch health check successful")
                status = ServiceStatus.HEALTHY
                if sync_info.get("status") == "stale":
                    status = ServiceStatus.DEGRADED
                return ServiceHealth(
                    name=service_name,
                    status=status,
                    response_time_ms=round(response_time, 2),
                    message="Meilisearch is accessible and healthy"
                    + (" (sync stale)" if status == ServiceStatus.DEGRADED else ""),
                    last_checked=datetime.now(UTC),
                    metadata={"sync": sync_info},
                )
            logger.warning(
                f"Meilisearch health check returned status {response.status_code}"
            )
            return ServiceHealth(
                name=service_name,
                status=ServiceStatus.DEGRADED,
                response_time_ms=round(response_time, 2),
                message=f"Meilisearch returned unexpected status {response.status_code}",
                last_checked=datetime.now(UTC),
            )

    except TimeoutError:
        response_time = (time.time() - start_time) * 1000
        logger.warning(
            f"Meilisearch health check timed out after {timeout}s (optional service)"
        )
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=f"Connection timeout after {timeout}s",
            last_checked=datetime.now(UTC),
        )
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.warning(f"Meilisearch health check failed: {e} (optional service)")
        return ServiceHealth(
            name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=round(response_time, 2),
            message=str(e),
            last_checked=datetime.now(UTC),
        )


async def check_all_services() -> dict[str, ServiceHealth]:
    """
    Check health of all services concurrently.

    Returns:
        dict: Dictionary mapping service names to their health status
    """
    logger.info("Running health checks for all services")

    # Run all checks concurrently
    results = await asyncio.gather(
        check_redis(),
        check_postgresql(),
        check_supabase(),
        check_celery(),
        check_langfuse(),
        check_meilisearch(),
        return_exceptions=False,  # Let exceptions propagate
    )

    # Map results to service names
    services = {
        "redis": results[0],
        "postgresql": results[1],
        "supabase": results[2],
        "celery": results[3],
        "langfuse": results[4],
        "meilisearch": results[5],
    }

    logger.info(f"Health checks completed: {len(services)} services checked")
    return services
