"""Service health check functions."""

import asyncio
import os
import time
from datetime import UTC, datetime
from urllib.parse import urlsplit

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


# ---------------------------------------------------------------------------
# LLM provider reachability (#546)
# ---------------------------------------------------------------------------
#
# Every LLM surface (chat/RAG, precedents, argumentation, schema generation,
# extraction) dies when the provider rejects the key -- e.g. OpenAI's
# ``401 invalid_project`` -- yet no other probe notices. This check calls
# ``GET {base_url}/models``: it authenticates the key and proves the endpoint
# is reachable without generating a single token. The result is cached for
# ``LLM_HEALTH_CACHE_TTL_SECONDS`` (default 300s) on top of the 30s status
# cache, so polling ``/health/status`` never hammers the provider. Non-healthy
# results are cached for the much shorter ``LLM_HEALTH_FAILURE_CACHE_TTL_SECONDS``
# (default 30s) so recovery (e.g. a rotated key) shows up quickly. An
# ``asyncio.Lock`` with a double-checked re-read keeps concurrent cold polls
# down to a single probe.

_OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"
_llm_health_cache: tuple[float, float, ServiceHealth] | None = None  # (at, ttl, health)
_llm_health_lock: asyncio.Lock | None = None

_STATUS_SEVERITY = {
    ServiceStatus.HEALTHY: 0,
    ServiceStatus.UNKNOWN: 1,
    ServiceStatus.DEGRADED: 2,
    ServiceStatus.UNHEALTHY: 3,
}


def _llm_health_ttl_seconds() -> float:
    try:
        return float(os.getenv("LLM_HEALTH_CACHE_TTL_SECONDS", "300"))
    except ValueError:
        return 300.0


def _llm_failure_ttl_seconds() -> float:
    try:
        return float(os.getenv("LLM_HEALTH_FAILURE_CACHE_TTL_SECONDS", "30"))
    except ValueError:
        return 30.0


def reset_llm_health_cache() -> None:
    """Drop the cached LLM probe so the next check re-probes the provider."""
    global _llm_health_cache, _llm_health_lock
    _llm_health_cache = None
    _llm_health_lock = None


def _safe_endpoint(url: str) -> str:
    """Reduce a URL to ``scheme://host[:port]`` -- no userinfo, path or query.

    ``LLM_BASE_URL`` may embed credentials (``http://user:pw@host/v1``); the
    status payload and logs must never carry them.
    """
    try:
        parts = urlsplit(url)
        host = parts.hostname or ""
        if ":" in host:  # IPv6 literal
            host = f"[{host}]"
        port = f":{parts.port}" if parts.port else ""
    except ValueError:
        return "<invalid url>"
    if not parts.scheme or not host:
        return "<invalid url>"
    return f"{parts.scheme}://{host}{port}"


def _llm_targets() -> dict[str, str]:
    """Endpoints the app's two LLM resolvers actually call.

    ``openai``  -- ``get_llm()``: no ``base_url`` override, so the OpenAI SDK
                   default (or ``OPENAI_BASE_URL`` when set).
    ``default`` -- ``get_default_llm()``: ``LLM_BASE_URL`` when set (e.g. an
                   Ollama/vLLM endpoint); otherwise identical to ``openai``.
    """
    openai_base = (
        os.getenv("OPENAI_BASE_URL")
        or os.getenv("OPENAI_API_BASE")
        or _OPENAI_DEFAULT_BASE_URL
    ).rstrip("/")
    targets = {"openai": openai_base}
    llm_base = (os.getenv("LLM_BASE_URL") or "").rstrip("/")
    if llm_base and llm_base != openai_base:
        targets["default"] = llm_base
    return targets


def _provider_error_code(response: httpx.Response) -> str | None:
    """Extract ``error.code`` (e.g. ``invalid_project``) from an OpenAI-style body."""
    try:
        body = response.json()
    except Exception:
        return None
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            code = error.get("code") or error.get("type")
            return str(code) if code else None
    return None


async def _probe_llm_target(
    client: httpx.AsyncClient, name: str, base_url: str, api_key: str | None
) -> dict:
    """Probe one LLM endpoint. Returns a JSON-safe dict; never contains the key
    or any URL userinfo.

    Auth mirrors the real client: ``get_llm()`` and ``get_default_llm()`` both
    build ``ChatOpenAI`` without an explicit ``api_key``, so each sends
    ``OPENAI_API_KEY`` as a Bearer token to its base URL (``LLM_BASE_URL`` for
    the default one) and cannot be constructed at all without it.
    """
    result: dict = {"endpoint": _safe_endpoint(base_url)}
    if not api_key:
        result.update(
            status=ServiceStatus.UNHEALTHY.value,
            detail="OPENAI_API_KEY is not set",
        )
        return result

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        response = await client.get(f"{base_url}/models", headers=headers)
    except httpx.TimeoutException:
        result.update(
            status=ServiceStatus.UNHEALTHY.value, detail="timeout (unreachable)"
        )
        return result
    except httpx.HTTPError as e:
        result.update(
            status=ServiceStatus.UNHEALTHY.value,
            detail=f"unreachable ({type(e).__name__})",
        )
        return result

    result["http_status"] = response.status_code
    code = _provider_error_code(response) if response.status_code >= 400 else None
    if code:
        result["error_code"] = code
    suffix = f" {code}" if code else ""

    if response.status_code == 200:
        result.update(status=ServiceStatus.HEALTHY.value, detail="ok")
    elif response.status_code in (401, 403):
        result.update(
            status=ServiceStatus.UNHEALTHY.value,
            detail=f"API key rejected (HTTP {response.status_code}{suffix})",
        )
    elif response.status_code == 429:
        result.update(
            status=ServiceStatus.DEGRADED.value,
            detail=f"rate limited or out of quota (HTTP 429{suffix})",
        )
    else:
        result.update(
            status=ServiceStatus.DEGRADED.value,
            detail=f"unexpected HTTP {response.status_code}{suffix}",
        )
    return result


async def check_llm(timeout: float = 5.0) -> ServiceHealth:
    """
    Check that the configured LLM provider(s) accept our credentials.

    Uses the token-free ``GET /models`` endpoint and caches the result for
    ``LLM_HEALTH_CACHE_TTL_SECONDS`` (default 300s). ``last_checked`` on a
    cached result is the time of the real probe.

    Args:
        timeout: Maximum time to wait for each provider in seconds

    Returns:
        ServiceHealth: UNHEALTHY when a key is rejected (401/403), missing, or
        an endpoint is unreachable; DEGRADED on 429/other errors; else HEALTHY.
    """
    global _llm_health_lock
    cached = _llm_cache_lookup()
    if cached is not None:
        return cached
    if _llm_health_lock is None:
        _llm_health_lock = asyncio.Lock()
    async with _llm_health_lock:
        cached = _llm_cache_lookup()  # a concurrent caller may have probed
        if cached is not None:
            return cached
        return await _probe_llm_and_cache(timeout)


def _llm_cache_lookup() -> ServiceHealth | None:
    if _llm_health_cache is None:
        return None
    at, ttl, health = _llm_health_cache
    return health if time.monotonic() - at < ttl else None


async def _probe_llm_and_cache(timeout: float) -> ServiceHealth:
    global _llm_health_cache
    ttl = _llm_health_ttl_seconds()
    now = time.monotonic()
    start_time = time.time()
    targets = _llm_targets()
    api_key = os.getenv("OPENAI_API_KEY") or None

    async with httpx.AsyncClient(timeout=timeout) as client:
        probes = await asyncio.gather(
            *(
                _probe_llm_target(client, name, base_url, api_key)
                for name, base_url in targets.items()
            )
        )
    response_time = (time.time() - start_time) * 1000
    results = dict(zip(targets, probes, strict=True))

    worst = max(
        (ServiceStatus(r["status"]) for r in results.values()),
        key=_STATUS_SEVERITY.__getitem__,
    )
    failures = [
        f"{name} ({r['endpoint']}): {r['detail']}"
        for name, r in results.items()
        if r["status"] != ServiceStatus.HEALTHY.value
    ]

    if worst == ServiceStatus.HEALTHY:
        message = "LLM provider accepts credentials"
        logger.debug("LLM health check successful")
    else:
        message = "LLM features unavailable -- " + "; ".join(failures)
        log = logger.error if worst == ServiceStatus.UNHEALTHY else logger.warning
        log(f"LLM health check: {message}")

    health = ServiceHealth(
        name="llm",
        status=worst,
        response_time_ms=round(response_time, 2),
        message=message,
        error="; ".join(failures) if worst == ServiceStatus.UNHEALTHY else None,
        last_checked=datetime.now(UTC),
        metadata={"targets": results, "cache_ttl_seconds": ttl},
    )
    entry_ttl = ttl if worst == ServiceStatus.HEALTHY else _llm_failure_ttl_seconds()
    _llm_health_cache = (now, entry_ttl, health)
    return health


async def check_all_services() -> dict[str, ServiceHealth]:
    """
    Check health of all services concurrently.

    Returns:
        dict: Dictionary mapping service names to their health status
    """
    logger.info("Running health checks for all services")

    # Run all checks concurrently, capturing exceptions per-service
    service_names = [
        "redis",
        "postgresql",
        "supabase",
        "celery",
        "langfuse",
        "meilisearch",
        "llm",
    ]
    results = await asyncio.gather(
        check_redis(),
        check_postgresql(),
        check_supabase(),
        check_celery(),
        check_langfuse(),
        check_meilisearch(),
        check_llm(),
        return_exceptions=True,  # Prevent one failing check from crashing all others
    )

    # Map results to service names, converting exceptions to unhealthy status
    services: dict[str, ServiceHealth] = {}
    for name, result in zip(service_names, results, strict=False):
        if isinstance(result, BaseException):
            logger.error(f"Health check for {name} raised an exception: {result}")
            services[name] = ServiceHealth(
                name=name,
                status=ServiceStatus.UNHEALTHY,
                message=f"Health check failed with exception: {type(result).__name__}",
                error=str(result),
                last_checked=datetime.now(UTC),
            )
        else:
            services[name] = result

    logger.info(f"Health checks completed: {len(services)} services checked")
    return services
