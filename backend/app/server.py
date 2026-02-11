import asyncio
import os
import warnings
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import RedirectResponse
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langserve import add_routes
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from loguru import logger

from juddges_search.chains.chat import chat_chain
from juddges_search.chains.enhance_query import enhance_query_chain
from juddges_search.chains.qa import chain
from juddges_search.db.weaviate_pool import cleanup_weaviate_pool, get_weaviate_pool
from app.auth import verify_api_key
from app.collections import router as collections_router
from app.publications import router as publications_router
from app.dashboard import router as dashboard_router
from app.documents import router as documents_router
from app.example_questions import router as example_questions_router
from app.extraction import router as extraction_router
from app.schema_generation_agent import router as schema_generator_agent_router
from app.schemas import router as schemas_router, cleanup_expired_sessions
from app.api.schema_generator import router as schema_generator_router
from app.playground import router as playground_router
from app.evaluations import router as evaluations_router
from app.summarization import router as summarization_router
from app.precedents import router as precedents_router
from app.deduplication import router as deduplication_router
from app.versioning import router as versioning_router
from app.ocr import router as ocr_router
from app.clustering import router as clustering_router
from app.recommendations import router as recommendations_router
from app.research_assistant import router as research_assistant_router
from app.topic_modeling import router as topic_modeling_router
from app.experiments import router as experiments_router
from app.argumentation import router as argumentation_router
from app.embeddings_api import router as embeddings_router
from app.marketplace import router as marketplace_router
from app.timeline_extraction import router as timeline_router
from app.graphql_api.router import graphql_router

# Import Day 1 feature routers
from app.guest_sessions import router as guest_sessions_router
from app.analytics import router as analytics_router
from app.feedback import router as feedback_router

# Import audit trail and compliance routers
from app.api.audit import router as audit_router
from app.api.consent import router as consent_router
from app.api.legal import router as legal_router
from app.api.sso import router as sso_router

# Import health check router
from app.health import router as health_router

# Import LangChain cache setup
from app.langchain_cache import setup_langchain_cache

# Rate limiting imports
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Suppress SSL ResourceWarnings from httpx/supabase/langchain clients
warnings.filterwarnings("ignore", category=ResourceWarning, message=".*ssl.SSLSocket.*")


def validate_environment_variables():
    """
    Validate all required environment variables at startup.

    Raises:
        ValueError: If any required environment variable is missing
    """
    required_vars = {
        "BACKEND_API_KEY": "API key for backend authentication",
        "LANGGRAPH_POSTGRES_URL": "PostgreSQL URL for LangGraph checkpointer (local db:5432/juddges)",
        "WEAVIATE_URL": "Weaviate vector database URL",
        "OPENAI_API_KEY": "OpenAI API key for LLM operations",
    }

    optional_vars = {
        "SUPABASE_URL": "Supabase project URL (for analytics and feedback)",
        "SUPABASE_SERVICE_ROLE_KEY": "Supabase service role key (for analytics and feedback)",
        "REDIS_HOST": "Redis host for guest sessions (default: localhost)",
        "REDIS_PORT": "Redis port for guest sessions (default: 6379)",
        "REDIS_AUTH": "Redis password for guest sessions",
        "PYTHON_ENV": "Python environment (development/production)",
        "LANGFUSE_PUBLIC_KEY": "Langfuse public key (for observability)",
        "LANGFUSE_SECRET_KEY": "Langfuse secret key (for observability)",
        "LANGFUSE_HOST": "Langfuse host URL (for observability)",
    }

    missing_required = []
    missing_optional = []

    # Check required variables
    for var_name, description in required_vars.items():
        value = os.getenv(var_name)
        if not value:
            missing_required.append(f"  - {var_name}: {description}")
            logger.error(f"Missing required environment variable: {var_name}")
        else:
            # Mask sensitive values in logs
            masked_value = value[:4] + "..." if len(value) > 4 else "***"
            logger.info(f"Environment variable {var_name}: {masked_value}")

    # Check optional variables
    for var_name, description in optional_vars.items():
        value = os.getenv(var_name)
        if not value:
            missing_optional.append(f"  - {var_name}: {description}")
            logger.warning(f"Optional environment variable not set: {var_name}")
        else:
            # Mask sensitive values in logs
            if "KEY" in var_name or "TOKEN" in var_name or "AUTH" in var_name:
                masked_value = value[:4] + "..." if len(value) > 4 else "***"
            else:
                masked_value = value
            logger.info(f"Environment variable {var_name}: {masked_value}")

    # Raise error if required variables are missing
    if missing_required:
        error_msg = "Missing required environment variables:\n" + "\n".join(
            missing_required
        )
        logger.error(error_msg)
        raise ValueError(error_msg)

    if missing_optional:
        warning_msg = (
            "Missing optional environment variables (some features may be disabled):\n"
            + "\n".join(missing_optional)
        )
        logger.warning(warning_msg)

    logger.info("Environment variable validation completed successfully")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifespan - startup and shutdown events.

    This handles:
    1. Environment variable validation
    2. Database connection pool setup
    3. Dataset preloading
    4. Supabase client initialization
    """
    logger.info("Starting application startup sequence...")

    # Step 1: Validate environment variables
    try:
        validate_environment_variables()
    except ValueError as e:
        logger.error(f"Environment validation failed: {e}")
        raise

    # Step 2: Setup LangChain cache
    try:
        logger.info("Setting up LangChain PostgreSQL cache...")
        setup_langchain_cache()
    except Exception as e:
        logger.error(f"Failed to setup LangChain cache: {e}")
        logger.warning("Continuing without LangChain cache")

    # Step 3: Initialize application state
    app.state.agent = None
    app.state.initial_state = None

    # Step 4: Setup database connection pool
    logger.info("Setting up PostgreSQL connection pool...")
    async with AsyncConnectionPool(
        f"{os.environ['LANGGRAPH_POSTGRES_URL']}",
        min_size=5,
        max_size=20,
        max_idle=300,  # 5 minutes
        max_lifetime=3600,  # 1 hour
        kwargs={
            "autocommit": True,  # required by saver setup
            "row_factory": dict_row,  # saver accesses rows by name
            "prepare_threshold": None,  # avoid _pg3_* prepared stmt collisions
        },
    ) as pool:
        app.state.checkpointer = AsyncPostgresSaver(pool)
        logger.info("PostgreSQL connection pool initialized successfully")

        # Step 4b: Setup Weaviate connection pool
        use_weaviate_pool = os.getenv("WEAVIATE_USE_POOL", "true").lower() == "true"
        if use_weaviate_pool:
            try:
                logger.info("Setting up Weaviate connection pool...")
                weaviate_pool = get_weaviate_pool()
                await weaviate_pool.connect()
                app.state.weaviate_pool = weaviate_pool
                logger.info("Weaviate connection pool initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Weaviate connection pool: {e}")
                logger.warning("Continuing without Weaviate connection pool (will use per-request connections)")
                app.state.weaviate_pool = None
        else:
            logger.info("Weaviate connection pooling disabled (WEAVIATE_USE_POOL=false)")
            app.state.weaviate_pool = None

        # Step 5: Supabase client (now uses shared singleton from app.core.supabase)
        logger.info("Using shared Supabase client from app.core.supabase")

        # Step 6: Preload datasets (DISABLED - datasets are loaded on-demand)
        # Dataset preloading has been disabled to speed up application startup.
        # Datasets will be loaded automatically when first requested.
        logger.info("Dataset preloading disabled - datasets will load on first request")

        # Step 7: Start background task for session cleanup
        logger.info("Starting session cleanup background task...")
        cleanup_task = asyncio.create_task(cleanup_expired_sessions())
        logger.info("Session cleanup background task started successfully")

        logger.info("Application startup completed successfully")

        # Yield control to the application
        yield

        # Cleanup: Cancel the cleanup task on shutdown
        logger.info("Stopping session cleanup background task...")
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            logger.info("Session cleanup background task cancelled successfully")

        # Cleanup on shutdown
        logger.info("Starting application shutdown sequence...")

        # Cleanup Weaviate connection pool (safely handles case where pool doesn't exist)
        try:
            logger.info("Disconnecting Weaviate connection pool...")
            await cleanup_weaviate_pool()
            logger.info("Weaviate connection pool cleaned up successfully")
        except Exception as e:
            logger.error(f"Error cleaning up Weaviate connection pool: {e}")

    # Cleanup resources
    del app.state.checkpointer
    del app.state.agent
    logger.info("Application shutdown completed successfully")


# Configure API key authentication at module level
API_KEY = os.getenv("BACKEND_API_KEY")
if not API_KEY:
    raise ValueError("BACKEND_API_KEY environment variable not set")


def custom_openapi():
    """
    Custom OpenAPI schema generation that handles LangServe route issues.

    LangServe generates Pydantic models dynamically which can cause issues
    during OpenAPI schema generation. This function catches those errors
    and generates a valid OpenAPI schema by excluding problematic routes.
    """
    from fastapi.openapi.utils import get_openapi

    if app.openapi_schema:
        return app.openapi_schema

    try:
        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        app.openapi_schema = openapi_schema
        return app.openapi_schema
    except Exception as e:
        logger.error(f"Failed to generate full OpenAPI schema: {e}")
        logger.warning("Generating partial OpenAPI schema without LangServe routes")

        # Filter out LangServe routes that cause issues
        filtered_routes = [
            route
            for route in app.routes
            if not any(
                path in str(getattr(route, "path", ""))
                for path in ["/qa", "/chat", "/enhance_query"]
            )
        ]

        try:
            openapi_schema = get_openapi(
                title=app.title,
                version=app.version,
                description=app.description
                + " (Note: LangServe endpoints excluded from schema)",
                routes=filtered_routes,
            )
            app.openapi_schema = openapi_schema
            return app.openapi_schema
        except Exception as fallback_error:
            logger.error(
                f"Failed to generate even partial OpenAPI schema: {fallback_error}"
            )
            # Return minimal valid schema
            return {
                "openapi": "3.1.0",
                "info": {
                    "title": app.title,
                    "version": app.version,
                    "description": "OpenAPI schema generation failed. See server logs.",
                },
                "paths": {},
            }


app = FastAPI(
    lifespan=lifespan,
    title="Juddges Legal Research API",
    description="Backend API for Juddges legal research platform with intelligent search, audit trail, and legal compliance",
    version="0.3.0",
    openapi_tags=[
        {
            "name": "deprecated",
            "description": "⚠️ **Deprecated endpoints** - These endpoints are deprecated and will be removed in v0.4.0. Please migrate to the recommended alternatives listed in each endpoint's documentation.",
        },
    ],
)

# Override default OpenAPI schema generation
app.openapi = custom_openapi

# Configure rate limiting with Redis backend
logger.info("Configuring rate limiting...")
redis_host = os.getenv("REDIS_HOST", "redis")
redis_port = os.getenv("REDIS_PORT", "6379")
redis_auth = os.getenv("REDIS_AUTH", "")

# Build Redis connection URL
redis_url = f"redis://{redis_host}:{redis_port}"
if redis_auth:
    redis_url = f"redis://:{redis_auth}@{redis_host}:{redis_port}"

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100 per minute", "1000 per hour"],
    storage_uri=redis_url,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
logger.info(
    f"Rate limiting enabled: 100 req/min, 1000 req/hour (storage: {redis_host}:{redis_port})"
)

# Configure CORS with environment-based origins
# In development: Allow localhost and common dev ports
# In production: Restrict to specific frontend domains
ALLOWED_ORIGINS = (
    os.getenv("ALLOWED_ORIGINS", "").split(",")
    if os.getenv("ALLOWED_ORIGINS")
    else [
        "http://localhost:3000",  # Next.js development
        "http://localhost:3006",  # Frontend container
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3006",
        "http://localhost:8004",  # Backend API docs
    ]
)

# Add production origins if set
if os.getenv("VIRTUAL_HOST_FRONTEND"):
    frontend_host = os.getenv("VIRTUAL_HOST_FRONTEND")
    ALLOWED_ORIGINS.extend(
        [
            f"https://{frontend_host}",
            f"http://{frontend_host}",  # For local testing
        ]
    )

logger.info(f"CORS allowed origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # Specific origins only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-User-ID", "X-Request-ID"],
)

# Add GZip compression middleware for better performance
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses to protect against common attacks."""
    response = await call_next(request)

    # X-Content-Type-Options: Prevent MIME type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"

    # X-Frame-Options: Prevent clickjacking attacks
    response.headers["X-Frame-Options"] = "DENY"

    # X-XSS-Protection: Enable browser XSS protection
    response.headers["X-XSS-Protection"] = "1; mode=block"

    # Strict-Transport-Security: Force HTTPS connections
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )

    # Referrer-Policy: Control referrer information
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    return response


@app.middleware("http")
async def add_cache_headers(request, call_next):
    """Add HTTP cache headers for static and cacheable content."""
    response = await call_next(request)

    # Add cache headers for dashboard stats and other cacheable endpoints
    if "/dashboard/stats" in request.url.path:
        response.headers["Cache-Control"] = "public, max-age=14400"  # 4 hours
    elif "/dashboard/" in request.url.path:
        response.headers["Cache-Control"] = "public, max-age=3600"  # 1 hour
    elif "/collections" in request.url.path:
        response.headers["Cache-Control"] = "public, max-age=1800"  # 30 minutes
    elif (
        "/legal/dpa" in request.url.path
        or "/legal/retention-policies" in request.url.path
    ):
        response.headers["Cache-Control"] = (
            "public, max-age=86400"  # 24 hours (legal docs rarely change)
        )

    return response


@app.get("/")
async def redirect_root_to_docs():
    return RedirectResponse("/docs")


# Add routes with API key protection
add_routes(app, chain, path="/qa", dependencies=[Depends(verify_api_key)])
add_routes(app, chat_chain, path="/chat", dependencies=[Depends(verify_api_key)])

add_routes(
    app,
    enhance_query_chain,
    path="/enhance_query",
    dependencies=[Depends(verify_api_key)],
)

# Include existing routers
app.include_router(documents_router, dependencies=[Depends(verify_api_key)])
app.include_router(collections_router, dependencies=[Depends(verify_api_key)])
app.include_router(publications_router, dependencies=[Depends(verify_api_key)])
app.include_router(extraction_router, dependencies=[Depends(verify_api_key)])
app.include_router(schemas_router, dependencies=[Depends(verify_api_key)])
app.include_router(
    schema_generator_agent_router, dependencies=[Depends(verify_api_key)]
)
app.include_router(schema_generator_router, dependencies=[Depends(verify_api_key)])
app.include_router(example_questions_router, dependencies=[Depends(verify_api_key)])
app.include_router(dashboard_router, dependencies=[Depends(verify_api_key)])
app.include_router(playground_router, dependencies=[Depends(verify_api_key)])
app.include_router(evaluations_router, dependencies=[Depends(verify_api_key)])
app.include_router(summarization_router, dependencies=[Depends(verify_api_key)])
app.include_router(precedents_router, dependencies=[Depends(verify_api_key)])
app.include_router(deduplication_router, dependencies=[Depends(verify_api_key)])
app.include_router(versioning_router, dependencies=[Depends(verify_api_key)])
app.include_router(ocr_router, dependencies=[Depends(verify_api_key)])
app.include_router(clustering_router, dependencies=[Depends(verify_api_key)])
app.include_router(recommendations_router, dependencies=[Depends(verify_api_key)])
app.include_router(research_assistant_router, dependencies=[Depends(verify_api_key)])
app.include_router(topic_modeling_router, dependencies=[Depends(verify_api_key)])
app.include_router(argumentation_router, dependencies=[Depends(verify_api_key)])
app.include_router(embeddings_router, dependencies=[Depends(verify_api_key)])
app.include_router(marketplace_router, dependencies=[Depends(verify_api_key)])
app.include_router(timeline_router, dependencies=[Depends(verify_api_key)])

# Experiments - uses JWT authentication (implemented in endpoints)
app.include_router(experiments_router)

# Include Day 1 feature routers
# Guest sessions - no API key required (public endpoint)
app.include_router(guest_sessions_router)

# Analytics and feedback - use JWT authentication (implemented in endpoints)
# These endpoints support both authenticated and anonymous users
# Authentication is handled per-endpoint with get_optional_user dependency
app.include_router(analytics_router)
app.include_router(feedback_router)

# Include audit trail and compliance routers (JWT authentication required)
# These endpoints are for authenticated users only
app.include_router(audit_router)
app.include_router(consent_router)
app.include_router(legal_router)

# SSO management endpoints (JWT authentication with admin checks in endpoints)
# check-domain is public, admin endpoints require admin role
app.include_router(sso_router)

# Health check and status monitoring
# Note: /health is public, /health/status requires API key (configured in router)
app.include_router(health_router)

# GraphQL API endpoint (API key authenticated)
# Provides flexible data querying with subscriptions via WebSocket
app.include_router(
    graphql_router,
    prefix="/graphql",
    tags=["graphql"],
    dependencies=[Depends(verify_api_key)],
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, ssl_keyfile=None, ssl_certfile=None)
