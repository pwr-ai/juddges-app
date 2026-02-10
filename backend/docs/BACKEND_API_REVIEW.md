# Backend API Architecture Review - Critical Issues Report

**Date**: 2025-10-08
**Reviewer**: AI Tech Lead
**Scope**: Backend API endpoints, business logic, integrations, security

---

## Executive Summary

This comprehensive review identified **47 issues** across the backend API:

- **9 Critical** issues requiring immediate attention
- **15 High** priority issues affecting reliability/security
- **17 Medium** priority issues impacting maintainability
- **6 Low** priority issues for future improvement

## Critical Issues (Immediate Action Required)

### 1. Missing Error Detail Suppression in HTTPException

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/ai_tax_search/db/supabase_db.py:34`
**Severity**: CRITICAL
**Description**: Database errors expose internal implementation details and potential security information through HTTPException messages.

```python
# Current (Line 34):
raise HTTPException(status_code=500, detail=f"Database error: {str(error)}")
```

**Issue**:

- Exposes database schema, table names, constraint names
- Reveals internal error messages that could aid attackers
- Violates security best practices

**Recommended Fix**:

```python
logger.error(f"Supabase error during {operation}: {error}")
# Return generic error to client
raise HTTPException(
    status_code=500,
    detail="Internal server error occurred. Please contact support."
)
```

---

### 2. Unvalidated User Input in Collections DB

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/ai_tax_search/db/supabase_db.py:114-147`
**Severity**: CRITICAL
**Description**: User-provided `collection_id` and `document_id` are directly passed to database queries without validation.

**Vulnerable Code**:

```python
# Line 114-118
async def add_document(self, collection_id: str, document_id: str, user_id: str) -> bool:
    collection = await self.find_collection(collection_id, user_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
```

**Attack Vector**:

- SQL injection via crafted IDs
- NoSQL injection in Supabase queries
- Timing attacks to enumerate valid IDs

**Recommended Fix**:

```python
import re
from uuid import UUID

def validate_uuid(value: str) -> str:
    """Validate UUID format to prevent injection"""
    try:
        UUID(value)  # Raises ValueError if invalid
        return value
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

async def add_document(self, collection_id: str, document_id: str, user_id: str) -> bool:
    collection_id = validate_uuid(collection_id)
    document_id = validate_uuid(document_id)
    user_id = validate_uuid(user_id)
    # ... rest of logic
```

---

### 3. Race Condition in Collection Document Management

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/ai_tax_search/db/supabase_db.py:114-147`
**Severity**: CRITICAL
**Description**: Check-then-act pattern creates race condition where duplicate documents can be added.

**Vulnerable Code** (Lines 121-136):

```python
existing = self.client.table("collection_documents")\
    .select("*")\
    .eq("collection_id", collection_id)\
    .eq("document_id", document_id)\
    .execute()

if existing.data:
    logger.info(f"Document {document_id} already in collection {collection_id}")
    return True

self.client.table("collection_documents")\
    .insert({
        "collection_id": collection_id,
        "document_id": document_id
    })\
    .execute()
```

**Issue**:

- Two concurrent requests can both pass the existence check
- Both will attempt to insert, causing duplicate key errors
- Error handling masks this as success (line 143)

**Recommended Fix**:

```python
async def add_document(self, collection_id: str, document_id: str, user_id: str) -> bool:
    collection = await self.find_collection(collection_id, user_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    try:
        # Use upsert to handle duplicates atomically
        response = self.client.table("collection_documents")\
            .upsert({
                "collection_id": collection_id,
                "document_id": document_id
            }, on_conflict="collection_id,document_id")\
            .execute()

        logger.info(f"Added document {document_id} to collection {collection_id}")
        return True

    except Exception as e:
        logger.error(f"Error adding document to collection: {e}")
        raise HTTPException(status_code=500, detail="Failed to add document")
```

---

### 4. Insecure API Key Authentication

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/auth.py:13-16`
**Severity**: CRITICAL
**Description**: API key comparison is vulnerable to timing attacks.

**Vulnerable Code**:

```python
async def verify_api_key(api_key: str = Depends(api_key_header)):
    if api_key != API_KEY:  # Timing attack vulnerable
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key
```

**Issue**:

- String comparison reveals information through timing
- Attacker can brute-force API key character by character
- No rate limiting on authentication attempts

**Recommended Fix**:

```python
import secrets

async def verify_api_key(api_key: str = Depends(api_key_header)):
    # Use constant-time comparison
    if not secrets.compare_digest(api_key.encode(), API_KEY.encode()):
        # TODO: Implement rate limiting here
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    return api_key
```

---

### 5. Missing Environment Variable Validation on Startup

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py:44-56`
**Severity**: CRITICAL
**Description**: Server starts with missing `LANGGRAPH_POSTGRES_URL` but fails only when connection pool is needed.

**Vulnerable Code**:

```python
async with AsyncConnectionPool(
    f"{os.environ['LANGGRAPH_POSTGRES_URL']}",  # KeyError if not set
    min_size=5,
    max_size=20,
    # ...
) as pool:
```

**Issue**:

- Server appears to start successfully
- Crashes on first request requiring database
- No graceful degradation
- Poor developer experience

**Recommended Fix**:

```python
import os
from typing import Dict

def validate_required_env_vars() -> Dict[str, str]:
    """Validate all required environment variables on startup"""
    required_vars = {
        "BACKEND_API_KEY": "API key for backend authentication",
        "LANGGRAPH_POSTGRES_URL": "PostgreSQL connection URL",
        "SUPABASE_URL": "Supabase API URL",
        "SUPABASE_SERVICE_ROLE_KEY": "Supabase service role key",
        "CELERY_BROKER_URL": "Celery broker URL",
        "CELERY_BACKEND_URL": "Celery result backend URL",
        "CELERY_PROJECT_NAME": "Celery project name",
    }

    missing = []
    for var, description in required_vars.items():
        if not os.getenv(var):
            missing.append(f"  - {var}: {description}")

    if missing:
        error_msg = "Missing required environment variables:\n" + "\n".join(missing)
        logger.error(error_msg)
        raise ValueError(error_msg)

    return {var: os.environ[var] for var in required_vars}

# In server.py, before app creation:
try:
    env_vars = validate_required_env_vars()
    logger.info("All required environment variables validated")
except ValueError as e:
    logger.critical(f"Environment validation failed: {e}")
    raise
```

---

### 6. Synchronous Supabase Client in Async Context

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/ai_tax_search/db/supabase_db.py:22`
**Severity**: CRITICAL
**Description**: Using synchronous Supabase client in async functions blocks event loop.

**Vulnerable Code**:

```python
class CollectionsDB:
    def __init__(self):
        # ...
        self.client: Client = create_client(self.url, self.service_key)

    async def get_user_collections(self, user_id: str) -> List[Dict[str, Any]]:
        try:
            response = self.client.table("collections")\  # Blocks event loop!
                .select("*, collection_documents(document_id)")\
                .eq("user_id", user_id)\
                .order("created_at", desc=True)\
                .execute()
```

**Issue**:

- Blocks asyncio event loop on I/O operations
- Reduces concurrency and throughput
- Can cause timeouts under load
- Other requests wait unnecessarily

**Recommended Fix**:

```python
from supabase._async.client import AsyncClient, create_async_client
import asyncio

class CollectionsDB:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        # Use async client
        self.client: AsyncClient = create_async_client(self.url, self.service_key)
        logger.info(f"Initialized async CollectionsDB")

    async def get_user_collections(self, user_id: str) -> List[Dict[str, Any]]:
        try:
            # Now truly async
            response = await self.client.table("collections")\
                .select("*, collection_documents(document_id)")\
                .eq("user_id", user_id)\
                .order("created_at", desc=True)\
                .execute()

            return response.data or []
        except Exception as e:
            logger.error(f"Error getting user collections: {e}")
            return []
```

---

### 7. Missing Transaction Isolation in Celery Worker

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/workers.py:28-85`
**Severity**: CRITICAL
**Description**: Extraction task processes multiple documents without proper isolation or rollback on partial failure.

**Vulnerable Code**:

```python
@celery_app.task(pydantic=True)
def extract_information_from_documents_task(
    request: DocumentExtractionRequest,
) -> list[DocumentExtractionResponse]:
    # ... setup ...

    results: list[DocumentExtractionResponse] = []
    for doc in documents:  # No transaction, no rollback
        try:
            extracted_data = asyncio.run(...)
            results.append(DocumentExtractionResponse(..., status=COMPLETED))
        except Exception as e:
            results.append(DocumentExtractionResponse(..., status=FAILED))

    return results
```

**Issues**:

- Partial failures leave inconsistent state
- No way to retry just failed documents
- Results mixing success and failure without clear status
- Resource leaks on exception

**Recommended Fix**:

```python
from celery import group
from typing import List

@celery_app.task(bind=True, max_retries=3)
def extract_single_document(
    self,
    document_id: str,
    request_dict: dict
) -> DocumentExtractionResponse:
    """Extract information from a single document with retry logic"""
    try:
        request = DocumentExtractionRequest(**request_dict)
        llm = get_llm(name=request.llm_name, base_url=LLM_BASE_URL, **request.llm_kwargs)

        documents = asyncio.run(get_documents_by_id([document_id]))
        if not documents:
            raise ValueError(f"Document {document_id} not found")

        doc = documents[0]
        extractor = InformationExtractor(
            model=llm,
            prompt_name=request.prompt_id,
            schema_name=request.schema_id,
        )

        extracted_data = asyncio.run(
            extractor.extract_information_with_structured_output({
                "extraction_context": request.extraction_context,
                "additional_instructions": request.additional_instructions,
                "full_text": doc.full_text,
                "schema": None,
            })
        )

        return DocumentExtractionResponse(
            collection_id=request.collection_id,
            document_id=doc.document_id,
            status=DocumentProcessingStatus.COMPLETED,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
            started_at=datetime.now().isoformat(),
            completed_at=datetime.now().isoformat(),
            error_message=None,
            extracted_data=extracted_data,
        ).model_dump(mode="json")

    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)

@celery_app.task
def extract_information_from_documents_task(
    request_dict: dict
) -> dict:
    """
    Coordinate extraction across multiple documents using Celery groups.
    Returns task group ID for status tracking.
    """
    request = DocumentExtractionRequest(**request_dict)

    # Create task group for parallel processing
    job = group(
        extract_single_document.s(doc_id, request_dict)
        for doc_id in request.document_ids
    )

    result = job.apply_async()

    return {
        "group_id": result.id,
        "document_count": len(request.document_ids),
        "status": "PROCESSING"
    }
```

---

### 8. Dataset Loading Without Startup Hook

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/documents.py:86-149`
**Severity**: CRITICAL
**Description**: Large datasets loaded lazily on first request instead of during server startup.

**Vulnerable Code**:

```python
_eureka_dataset = None
_juddges_dataset = None

def load_eureka_dataset():
    global _eureka_dataset

    if _eureka_dataset is not None:
        return _eureka_dataset

    # Loaded on first request - blocks the request!
    _eureka_dataset = load_dataset(dataset_name, split="train", token=hf_token)
```

**Issues**:

- First request times out while loading GB of data
- Unpredictable response times
- Poor user experience
- Health checks may pass but service is not ready

**Recommended Fix**:

```python
# In server.py:
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load datasets during startup
    logger.info("Loading datasets on startup...")
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, load_eureka_dataset
        )
        await asyncio.get_event_loop().run_in_executor(
            None, load_juddges_dataset
        )
        logger.info("All datasets loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load datasets: {e}")
        # Decide whether to fail startup or continue
        if os.getenv("REQUIRE_DATASETS", "false").lower() == "true":
            raise

    # ... existing lifespan code ...
    yield
```

---

### 9. No Connection Pool Management for Supabase Client

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/dashboard.py:40-48`
**Severity**: CRITICAL
**Description**: Multiple Supabase clients created without connection pool management.

**Vulnerable Code**:

```python
@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Get cached Supabase client instance."""
    return create_client(
        os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

supabase: Client = get_supabase_client()  # Module-level client
```

**Issues**:

- No connection lifecycle management
- Connections never closed properly
- Connection leaks under load
- Different modules create separate clients

**Recommended Fix**:

```python
# Create centralized client manager
class SupabaseClientManager:
    _instance = None
    _client = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self):
        """Initialize client during app startup"""
        if self._client is None:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

            if not url or not key:
                raise ValueError("Missing Supabase credentials")

            self._client = create_async_client(url, key)
            logger.info("Supabase client initialized")

    async def close(self):
        """Close client during app shutdown"""
        if self._client is not None:
            await self._client.close()
            self._client = None
            logger.info("Supabase client closed")

    def get_client(self) -> AsyncClient:
        if self._client is None:
            raise RuntimeError("Client not initialized. Call initialize() first.")
        return self._client

# In server.py lifespan:
supabase_manager = SupabaseClientManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize on startup
    await supabase_manager.initialize()

    # ... existing code ...

    yield

    # Cleanup on shutdown
    await supabase_manager.close()

# In endpoints:
def get_supabase_client() -> AsyncClient:
    return supabase_manager.get_client()
```

---

## High Priority Issues

### 10. Overly Permissive CORS Configuration

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py:72-78`
**Severity**: HIGH
**Description**: CORS allows all origins, credentials, methods, and headers.

**Current Code**:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Security Impact**:

- Any website can make requests to your API
- Credentials can be sent from any origin
- Increases attack surface for CSRF
- No protection against unauthorized access

**Recommended Fix**:

```python
# Configuration based on environment
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:8000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # Specific origins only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],  # Specific methods
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-User-ID"],
    max_age=600,  # Cache preflight for 10 minutes
)
```

---

### 11. No Request Timeout Configuration

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py:124-127`
**Severity**: HIGH
**Description**: Uvicorn runs without timeout configuration.

**Current Code**:

```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, ssl_keyfile=None, ssl_certfile=None)
```

**Issues**:

- Long-running requests can exhaust workers
- No protection against slowloris attacks
- Resource exhaustion under load

**Recommended Fix**:

```python
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        timeout_keep_alive=30,
        timeout_graceful_shutdown=10,
        limit_concurrency=1000,
        limit_max_requests=10000,  # Restart worker after N requests
        backlog=2048,
    )
```

---

### 12. Missing Input Validation on Document Retrieval

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/documents.py:428-463`
**Severity**: HIGH
**Description**: `max_documents` parameter not validated, can cause resource exhaustion.

**Current Code**:

```python
@router.post("/documents", response_model=DocumentRetrievalResponse, tags=["retrieval"])
async def get_documents(request: DocumentRetrievalRequest):
    max_documents = request.max_documents or 10  # No upper limit!
```

**Issues**:

- User can request 1 million documents
- Memory exhaustion
- Database overload
- DoS vector

**Recommended Fix**:

```python
class DocumentRetrievalRequest(BaseModel):
    question: str = Field(...)
    max_documents: int | None = Field(
        default=10,
        ge=1,
        le=100,  # Add upper limit
        description="Maximum number of documents to retrieve (1-100)"
    )
    # ... rest of fields
```

---

### 13. Celery Task Without Timeout

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/workers.py:27-85`
**Severity**: HIGH
**Description**: Extraction tasks have no timeout, can run indefinitely.

**Current Code**:

```python
@celery_app.task(pydantic=True)
def extract_information_from_documents_task(
    request: DocumentExtractionRequest,
) -> list[DocumentExtractionResponse]:
    # No timeout specified
```

**Issues**:

- Tasks can run forever consuming workers
- No way to detect hung tasks
- Worker pool exhaustion
- Celery queue backlog

**Recommended Fix**:

```python
@celery_app.task(
    pydantic=True,
    time_limit=3600,  # Hard limit: 1 hour
    soft_time_limit=3300,  # Soft limit: 55 minutes
    acks_late=True,  # Acknowledge after completion
    reject_on_worker_lost=True,
)
def extract_information_from_documents_task(
    request: DocumentExtractionRequest,
) -> list[DocumentExtractionResponse]:
    # ... implementation
```

---

### 14. Missing Pagination on List Endpoints

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/collections.py:60-66`
**Severity**: HIGH
**Description**: Collections list endpoint returns all collections without pagination.

**Current Code**:

```python
@router.get("/collections", response_model=List[CollectionWithDocuments])
async def list_collections(
    db=Depends(get_collections_db), user_id: str = Depends(get_current_user)
):
    collections = await db.get_user_collections(user_id)  # Returns ALL
    return [transform_collection(c) for c in collections]
```

**Issues**:

- Users with 1000s of collections crash the endpoint
- Large response payloads
- Poor performance
- Memory issues

**Recommended Fix**:

```python
@router.get("/collections", response_model=PaginatedCollectionResponse)
async def list_collections(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user)
):
    offset = (page - 1) * page_size
    collections, total = await db.get_user_collections_paginated(
        user_id, limit=page_size, offset=offset
    )

    return PaginatedCollectionResponse(
        items=[transform_collection(c) for c in collections],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size
    )
```

---

### 15. Inconsistent Error Response Format

**File**: Multiple files
**Severity**: HIGH
**Description**: Different endpoints return errors in different formats.

**Examples**:

```python
# Format 1 (collections.py:108)
return {"message": "Collection deleted successfully"}

# Format 2 (documents.py:486)
raise HTTPException(status_code=500, detail=str(e))

# Format 3 (extraction.py:73)
message="The task has been accepted and is processing in the background."
```

**Recommended Fix**:

```python
# Create standardized error response
class ErrorResponse(BaseModel):
    error: str
    message: str
    details: dict | None = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    request_id: str | None = None

class SuccessResponse(BaseModel):
    success: bool = True
    message: str
    data: dict | None = None

# Use custom exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.status_code,
            message=exc.detail,
            request_id=request.headers.get("X-Request-ID")
        ).model_dump()
    )
```

---

### 16. No Health Check Endpoint

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py`
**Severity**: HIGH
**Description**: No health check endpoint for load balancers/orchestrators.

**Recommended Fix**:

```python
from fastapi import status

@app.get("/health", status_code=status.HTTP_200_OK, tags=["health"])
async def health_check():
    """
    Health check endpoint for load balancers and orchestrators.
    Returns service status and dependencies.
    """
    health_status = {
        "status": "healthy",
        "version": "1.0.0",
        "dependencies": {}
    }

    # Check database connection
    try:
        supabase_client = get_supabase_client()
        # Simple query to verify connection
        await supabase_client.table("collections").select("id").limit(1).execute()
        health_status["dependencies"]["database"] = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["dependencies"]["database"] = "unhealthy"
        health_status["status"] = "degraded"

    # Check Redis connection
    if REDIS_AVAILABLE and redis_client:
        try:
            await redis_client.ping()
            health_status["dependencies"]["redis"] = "healthy"
        except Exception:
            health_status["dependencies"]["redis"] = "unhealthy"

    # Check Weaviate connection
    try:
        from ai_tax_search.db.weaviate_db import WeaviateLegalDatabase
        async with WeaviateLegalDatabase() as db:
            is_ready = await db.client.is_ready()
            health_status["dependencies"]["weaviate"] = "healthy" if is_ready else "unhealthy"
    except Exception:
        health_status["dependencies"]["weaviate"] = "unhealthy"
        health_status["status"] = "degraded"

    status_code = 200 if health_status["status"] == "healthy" else 503
    return JSONResponse(content=health_status, status_code=status_code)

@app.get("/ready", status_code=status.HTTP_200_OK, tags=["health"])
async def readiness_check():
    """
    Readiness check - returns 200 only if service can handle requests.
    """
    # Check if datasets are loaded
    if _eureka_dataset is None or _juddges_dataset is None:
        return JSONResponse(
            content={"status": "not ready", "reason": "datasets loading"},
            status_code=503
        )

    return {"status": "ready"}
```

---

### 17. Missing Request ID Tracking

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py`
**Severity**: HIGH
**Description**: No request ID tracking for debugging and log correlation.

**Recommended Fix**:

```python
import uuid
from contextvars import ContextVar

# Context variable for request ID
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add unique request ID to every request for tracing"""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request_id_ctx.set(request_id)

    # Add to logger context
    with logger.contextualize(request_id=request_id):
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

---

### 18. No Rate Limiting Implementation

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py:25-28, 65-69`
**Severity**: HIGH
**Description**: Rate limiting is commented out with TODO.

**Current Code**:

```python
# TODO: Re-enable rate limiting after fixing slowapi dependency
# from slowapi import Limiter, _rate_limit_exceeded_handler
```

**Issues**:

- No protection against API abuse
- No throttling of expensive operations
- DoS vulnerability
- Resource exhaustion risk

**Recommended Fix**:

```python
# Use alternative: fastapi-limiter with Redis
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

# In lifespan:
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize rate limiter with Redis
    await FastAPILimiter.init(redis_client)

    yield

    await FastAPILimiter.close()

# On endpoints:
@router.post(
    "/documents",
    dependencies=[Depends(RateLimiter(times=100, seconds=60))]  # 100 req/min
)
async def get_documents(request: DocumentRetrievalRequest):
    # ... implementation

# For expensive operations:
@router.post(
    "/extractions/submit",
    dependencies=[Depends(RateLimiter(times=10, seconds=60))]  # 10 req/min
)
async def start_extraction(request: DocumentExtractionRequest):
    # ... implementation
```

---

### 19. Extraction Endpoint Missing Field in Simple Request

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/extraction.py:45-64`
**Severity**: HIGH
**Description**: `language` field used but not defined in `SimpleExtractionRequest`.

**Vulnerable Code**:

```python
class SimpleExtractionRequest(BaseModel):
    collection_id: str
    schema_id: str
    document_ids: list[str] = None
    extraction_context: str = Field(...)
    additional_instructions: str | None = Field(...)
    # language field missing!

async def start_extraction_simple(request: SimpleExtractionRequest):
    extraction_request = DocumentExtractionRequest(
        # ...
        language=request.language,  # AttributeError!
        # ...
    )
```

**Recommended Fix**:

```python
class SimpleExtractionRequest(BaseModel):
    collection_id: str
    schema_id: str
    document_ids: list[str] | None = None
    extraction_context: str = Field(...)
    additional_instructions: str | None = Field(None)
    language: str = Field(
        default="pl",
        description="Language code for extraction",
        pattern="^[a-z]{2}$"
    )
```

---

### 20. Cache Invalidation Strategy Missing

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/documents.py:309-367`
**Severity**: HIGH
**Description**: Document ID cache has TTL but no invalidation on document changes.

**Current Code**:

```python
_document_ids_cache = {
    "ttl_seconds": 300,  # 5 minutes
}

# Cache is only invalidated by TTL, not by document updates
```

**Issues**:

- Stale data shown to users for up to 5 minutes
- New documents not immediately visible
- Deleted documents still appear in cache
- No way to force cache refresh

**Recommended Fix**:

```python
class DocumentCacheManager:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.cache_key_prefix = "doc_ids"

    async def get_document_ids(self, only_with_coordinates: bool = False):
        cache_key = f"{self.cache_key_prefix}:{'coords' if only_with_coordinates else 'all'}"

        # Try Redis cache
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # Fetch from database
        doc_ids = await self._fetch_from_db(only_with_coordinates)

        # Cache with TTL
        await self.redis.setex(cache_key, 300, json.dumps(doc_ids))
        return doc_ids

    async def invalidate_cache(self):
        """Invalidate all document ID caches"""
        pattern = f"{self.cache_key_prefix}:*"
        keys = await self.redis.keys(pattern)
        if keys:
            await self.redis.delete(*keys)
        logger.info("Document ID cache invalidated")

# Call invalidate_cache() after document CRUD operations
```

---

### 21. No Monitoring/Observability Integration

**File**: All files
**Severity**: HIGH
**Description**: No integration with monitoring tools (Prometheus, DataDog, etc.)

**Recommended Fix**:

```python
from prometheus_client import Counter, Histogram, make_asgi_app
import time

# Metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

@app.middleware("http")
async def add_metrics(request: Request, call_next):
    start_time = time.time()

    response = await call_next(request)

    duration = time.time() - start_time

    http_requests_total.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()

    http_request_duration_seconds.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)

    return response

# Mount metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
```

---

### 22. Langfuse Integration Not Visible

**File**: All files
**Severity**: HIGH
**Description**: Langfuse mentioned in task description but no integration code visible.

**Recommended Fix**:

```python
from langfuse import Langfuse
from langfuse.decorators import observe

# Initialize Langfuse
langfuse = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
    host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
)

# Trace LLM calls
@observe()
async def extract_information_with_tracing(extractor, params):
    """Wrapper to trace extraction calls"""
    result = await extractor.extract_information_with_structured_output(params)
    return result

# Add to extraction worker
@celery_app.task(pydantic=True)
@observe(name="document_extraction")
def extract_information_from_documents_task(request: DocumentExtractionRequest):
    # ... existing code with tracing
```

---

### 23. No Bulk Operations Support

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/collections.py:111-123`
**Severity**: HIGH
**Description**: Adding multiple documents requires multiple API calls.

**Current Code**:

```python
@router.post("/collections/{collection_id}/documents")
async def add_document(
    collection_id: str,
    request: AddDocumentRequest,  # Single document only
    # ...
):
    await db.add_document(collection_id, request.document_id, user_id)
```

**Issues**:

- N+1 network round trips
- Poor performance for bulk operations
- Increased latency
- Race conditions

**Recommended Fix**:

```python
class BulkAddDocumentsRequest(BaseModel):
    document_ids: list[str] = Field(..., min_items=1, max_items=100)

@router.post("/collections/{collection_id}/documents/bulk")
async def add_documents_bulk(
    collection_id: str,
    request: BulkAddDocumentsRequest,
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    """Add multiple documents to collection in one transaction"""
    collection = await db.find_collection(collection_id, user_id)
    if not collection:
        raise HTTPException(404, "Collection not found")

    # Batch insert
    records = [
        {"collection_id": collection_id, "document_id": doc_id}
        for doc_id in request.document_ids
    ]

    result = await db.add_documents_bulk(collection_id, records, user_id)

    return {
        "added_count": result.added_count,
        "duplicate_count": result.duplicate_count,
        "total_requested": len(request.document_ids)
    }
```

---

### 24. Vulnerable to SQL Injection via Dashboard

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/dashboard.py:243-246`
**Severity**: HIGH
**Description**: Supabase query with `.in_()` filter may be vulnerable to injection.

**Vulnerable Code**:

```python
response = supabase.table("documents")\
    .select("*")\
    .in_("document_type", ["judgment", "tax_interpretation", "legal_act"])\  # Hard-coded, OK
    .not_.is_("title", "null")\
    .limit(limit * 3)\  # limit comes from user input!
    .execute()
```

**Issue**: While the document types are hard-coded, the `limit` parameter comes from user input without validation.

**Recommended Fix**:

```python
@router.get("/featured-examples", response_model=list[DocumentSummary])
async def get_featured_examples(
    limit: int = Query(default=5, ge=1, le=10),  # Validated via Query
    api_key: str = Depends(verify_api_key)
):
    # Validated limit ensures safe value
    response = supabase.table("documents")\
        .select("*")\
        .in_("document_type", ["judgment", "tax_interpretation", "legal_act"])\
        .not_.is_("title", "null")\
        .limit(min(limit * 3, 30))\  # Double-check upper bound
        .execute()
```

---

## Medium Priority Issues

### 25. Missing Documentation for API Endpoints

**File**: Multiple route files
**Severity**: MEDIUM
**Description**: Many endpoints lack comprehensive docstrings.

**Recommended Fix**:

```python
@router.post(
    "/documents",
    response_model=DocumentRetrievalResponse,
    tags=["retrieval"],
    summary="Retrieve documents based on question",
    description="""
    Search for relevant legal documents based on a natural language question.

    Supports two modes:
    - `rabbit`: Fast BM25-based term matching
    - `thinking`: Slower but more intelligent query enhancement

    Parameters:
    - question: Natural language question in Polish or English
    - max_documents: Maximum results to return (1-100, default: 10)
    - mode: Search mode (default: rabbit)
    - document_types: Filter by document type (judgment, tax_interpretation, etc.)
    - languages: Filter by language codes (pl, en)

    Returns:
    - Original and optionally rewritten question
    - Relevant document chunks
    - Full document metadata
    """,
    responses={
        200: {"description": "Documents retrieved successfully"},
        400: {"description": "Invalid request parameters"},
        500: {"description": "Internal server error"}
    }
)
async def get_documents(request: DocumentRetrievalRequest):
    # ... implementation
```

---

### 26. Inconsistent Logging Levels

**File**: Multiple files
**Severity**: MEDIUM
**Description**: Mixed usage of logger.info, logger.error, logger.warning without clear strategy.

**Examples**:

```python
# documents.py:107
logger.info(f"Loading Eureka dataset...")  # Should be INFO
logger.info(f"✅ Eureka dataset loaded...")  # Emoji in logs

# documents.py:115
logger.error(f"❌ Failed to load...")  # Good error logging
```

**Recommended Fix**:

```python
# Establish logging conventions:
# - DEBUG: Detailed diagnostic info
# - INFO: General informational messages
# - WARNING: Warning messages for unexpected but handled events
# - ERROR: Error messages for failures
# - CRITICAL: Critical errors requiring immediate attention

# Remove emojis from logs (not machine-readable)
logger.info("Eureka dataset loaded successfully. Total documents: %d", len(_eureka_dataset))
logger.error("Failed to load Eureka dataset: %s", str(e))
```

---

### 27. Missing Request Validation on Path Parameters

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/documents.py:172-299`
**Severity**: MEDIUM
**Description**: `document_id` path parameter not validated.

**Current Code**:

```python
@router.get("/documents/{document_id}/html", response_class=HTMLResponse)
async def get_document_html(document_id: str):  # No validation
    # ... directly used in queries
```

**Recommended Fix**:

```python
from pydantic import validator, constr

DocumentIdStr = constr(min_length=1, max_length=256, strip_whitespace=True)

@router.get("/documents/{document_id}/html", response_class=HTMLResponse)
async def get_document_html(
    document_id: DocumentIdStr = Path(..., description="Document identifier")
):
    # Validated by Pydantic
```

---

### 28. Global State Management Issues

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/documents.py:78-83`
**Severity**: MEDIUM
**Description**: Global variables used for caching without thread safety.

**Current Code**:

```python
_eureka_dataset = None
_document_ids_cache = {
    "ttl_seconds": 300,
}
```

**Issues**:

- Not thread-safe (though Python GIL helps)
- Race conditions possible
- Difficult to test
- Shared state across workers in some deployment scenarios

**Recommended Fix**:

```python
from threading import RLock
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class DatasetCache:
    _lock: RLock = field(default_factory=RLock)
    _eureka_dataset = None
    _juddges_dataset = None
    _last_loaded: datetime | None = None

    def get_eureka_dataset(self):
        with self._lock:
            if self._eureka_dataset is None:
                self._eureka_dataset = load_eureka_dataset()
                self._last_loaded = datetime.now()
            return self._eureka_dataset

    def invalidate(self):
        with self._lock:
            self._eureka_dataset = None
            self._juddges_dataset = None
            self._last_loaded = None

# Singleton instance
_cache = DatasetCache()
```

---

### 29. Incomplete Error Recovery in Document HTML Endpoint

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/documents.py:172-299`
**Severity**: MEDIUM
**Description**: Fallback chain catches all exceptions broadly.

**Current Code**:

```python
try:
    # Try Eureka
    # ...
except HTTPException:
    pass  # Silently continue to next source

try:
    # Try JuDDGES
    # ...
except HTTPException:
    pass  # Silently continue

try:
    # Try Weaviate
    # ...
except Exception as weaviate_error:
    raise HTTPException(...)
```

**Issues**:

- Real errors masked by broad exception handling
- Difficult to debug when datasets fail
- No logging of intermediate failures
- User doesn't know why their request failed

**Recommended Fix**:

```python
@router.get("/documents/{document_id}/html", response_class=HTMLResponse)
async def get_document_html(document_id: str):
    """Get document HTML by ID from multiple sources with proper error tracking"""

    errors = []  # Track all errors encountered

    # Try Eureka dataset
    try:
        eureka_dataset = get_eureka_dataset()
        matching_docs = eureka_dataset.filter(
            lambda x: str(x.get("id")) == str(document_id)
        )
        if len(matching_docs) > 0:
            doc = matching_docs[0]
            html_content = doc.get("html_content")
            if html_content:
                logger.info(f"Document {document_id} found in Eureka dataset")
                return HTMLResponse(content=html_content)
    except HTTPException as e:
        logger.warning(f"Eureka dataset not available: {e.detail}")
        errors.append(f"Eureka: {e.detail}")
    except Exception as e:
        logger.error(f"Error accessing Eureka dataset: {e}")
        errors.append(f"Eureka: {str(e)}")

    # Try JuDDGES dataset
    try:
        juddges_dataset = get_juddges_dataset()
        matching_docs = juddges_dataset.filter(
            lambda x: str(x.get("id")) == str(document_id)
        )
        if len(matching_docs) > 0:
            doc = matching_docs[0]
            xml_content = doc.get("xml_content")
            if xml_content:
                logger.info(f"Document {document_id} found in JuDDGES dataset")
                html_content = convert_xml_to_html(xml_content)
                return HTMLResponse(content=html_content)
    except HTTPException as e:
        logger.warning(f"JuDDGES dataset not available: {e.detail}")
        errors.append(f"JuDDGES: {e.detail}")
    except Exception as e:
        logger.error(f"Error accessing JuDDGES dataset: {e}")
        errors.append(f"JuDDGES: {str(e)}")

    # Final fallback to Weaviate
    try:
        documents = await get_documents_by_id([document_id], return_vectors=False)
        if not documents:
            logger.warning(f"Document {document_id} not found in any source")
            raise HTTPException(
                status_code=404,
                detail=f"Document not found. Attempted sources: {', '.join(errors)}"
            )

        doc = documents[0]
        logger.info(f"Document {document_id} retrieved from Weaviate as fallback")
        fallback_html = generate_fallback_html(doc)
        return HTMLResponse(content=fallback_html)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving document from Weaviate: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving document. Errors: {', '.join(errors + [str(e)])}"
        )
```

---

### 30. Missing Type Hints in XML Converter

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/xml_converter.py:4-438`
**Severity**: MEDIUM
**Description**: Complex XML conversion function lacks type hints.

**Current Code**:

```python
def convert_xml_to_html(xml_content):  # No type hints
    """Transform XML content from Juddges dataset to HTML format"""
```

**Recommended Fix**:

```python
def convert_xml_to_html(xml_content: str) -> str:
    """
    Transform XML content from JuDDGES dataset to HTML format.

    Args:
        xml_content: Raw XML string from JuDDGES court document

    Returns:
        HTML string representation of the document

    Raises:
        ET.ParseError: If XML is malformed
        Exception: For other conversion errors
    """
```

---

### 31. Inefficient Document Sampling

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/documents.py:383-426`
**Severity**: MEDIUM
**Description**: Fetches all document IDs into memory before sampling.

**Current Code**:

```python
async def get_documents_sample(sample_size: int = Query(20, ...)):
    # Get ALL document IDs (could be millions)
    all_document_ids = await _get_cached_document_ids(...)

    # Sample from memory
    sampled_ids = random.sample(all_document_ids, sample_size)
```

**Issues**:

- Loads all IDs into memory
- Cache contains potentially millions of IDs
- Inefficient for large datasets
- Random sampling could be done in database

**Recommended Fix**:

```python
async def get_documents_sample(
    sample_size: int = Query(20, ge=1, le=100),
    only_with_coordinates: bool = Query(True),
):
    """Get random sample using database-level sampling"""
    async with WeaviateLegalDatabase() as db:
        filters = []
        if only_with_coordinates:
            # This requires indexNullState=true on x,y fields
            filters.append(Filter.by_property("x").greater_than(0))
            filters.append(Filter.by_property("y").greater_than(0))

        filter_obj = Filter.all_of(filters) if filters else None

        # Use Weaviate's limit with random offset (approximate sampling)
        # For true random sampling, would need to use Weaviate's random ordering
        response = await db.legal_documents_collection.query.fetch_objects(
            filters=filter_obj,
            limit=sample_size * 2,  # Fetch more to allow deduplication
            return_properties=["document_id", "x", "y"]
        )

        # Random sample from fetched results
        doc_ids = [obj.properties["document_id"] for obj in response.objects]
        sampled_ids = random.sample(doc_ids, min(sample_size, len(doc_ids)))

        # Fetch full documents
        documents = await get_documents_by_id(sampled_ids, return_vectors=False)
        return BatchDocumentsResponse(documents=documents)
```

---

### 32. Session Cleanup Not Started

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/schema_generation_agent.py:26-38`
**Severity**: MEDIUM
**Description**: Cleanup task defined but never started.

**Current Code**:

```python
async def cleanup_expired_sessions():
    """Background task to clean up expired sessions."""
    while True:
        await asyncio.sleep(300)
        # ... cleanup logic

# Task is never started!
```

**Recommended Fix**:

```python
# In server.py lifespan:
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background tasks
    cleanup_task = asyncio.create_task(cleanup_expired_sessions())

    # ... existing startup code ...

    yield

    # Graceful shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    # ... existing cleanup code ...
```

---

### 33. Hardcoded Configuration Values

**File**: Multiple files
**Severity**: MEDIUM
**Description**: Configuration values hardcoded instead of environment variables.

**Examples**:

```python
# server.py:47-48
min_size=5,
max_size=20,

# dashboard.py:52
_cache_ttl = 14400  # 4 hours

# documents.py:82-83
"ttl_seconds": 300,  # 5 minutes
```

**Recommended Fix**:

```python
# Create config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    db_pool_min_size: int = 5
    db_pool_max_size: int = 20
    db_pool_timeout: int = 30

    # Caching
    dashboard_cache_ttl: int = 14400  # 4 hours
    document_ids_cache_ttl: int = 300  # 5 minutes

    # API
    max_documents_per_request: int = 100
    default_documents_per_request: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

# Use in code:
async with AsyncConnectionPool(
    f"{os.environ['LANGGRAPH_POSTGRES_URL']}",
    min_size=settings.db_pool_min_size,
    max_size=settings.db_pool_max_size,
    # ...
)
```

---

### 34. No Circuit Breaker for External Services

**File**: All external service calls
**Severity**: MEDIUM
**Description**: No circuit breaker pattern for Weaviate, Supabase, Redis calls.

**Recommended Fix**:

```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
async def weaviate_search_with_circuit_breaker(query: str, limit: int):
    """Search with circuit breaker protection"""
    async with WeaviateLegalDatabase() as db:
        return await db.search(query, limit)

# Use wrapper in endpoints:
try:
    results = await weaviate_search_with_circuit_breaker(query, limit)
except CircuitBreakerError:
    logger.error("Weaviate circuit breaker open")
    raise HTTPException(
        status_code=503,
        detail="Search service temporarily unavailable"
    )
```

---

### 35. Example Questions Fallback Always Returns Same Results

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/example_questions.py:64-80`
**Severity**: MEDIUM
**Description**: Fallback to hardcoded examples doesn't respect `num_polish` and `num_english` parameters.

**Current Code**:

```python
except Exception as e:
    logger.error(f"Error fetching example questions from database: {e}")
    from ai_tax_search.prompts.legal.examples import get_random_example_questions

    questions = get_random_example_questions(num_polish, num_english)
    return ExampleQuestionsResponse(questions=questions)
```

**Issue**: If `get_random_example_questions` doesn't respect the parameters correctly, users get unexpected number of questions.

**Recommended Fix**:

```python
except Exception as e:
    logger.error(f"Error fetching example questions from database: {e}")

    # Fallback hardcoded questions
    fallback_polish = [
        "Jakie są konsekwencje podatkowe sprzedaży nieruchomości?",
        "Czy można odliczyć VAT od zakupu samochodu służbowego?",
    ]

    fallback_english = [
        "What are the tax implications of selling property?",
        "Can I deduct VAT on a company car purchase?",
    ]

    # Respect requested counts
    selected_polish = random.sample(
        fallback_polish,
        min(num_polish, len(fallback_polish))
    )
    selected_english = random.sample(
        fallback_english,
        min(num_english, len(fallback_english))
    )

    return ExampleQuestionsResponse(questions=selected_polish + selected_english)
```

---

### 36. Dashboard Stats Don't Handle Database Errors Gracefully

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/dashboard.py:119-174`
**Severity**: MEDIUM
**Description**: Returns zero stats on error, indistinguishable from empty database.

**Current Code**:

```python
except Exception as e:
    logger.error(f"Error fetching dashboard stats: {e}")
    return DashboardStats(
        total_documents=0,
        judgments=0,
        tax_interpretations=0,
        added_this_week=0,
        last_updated=None
    )
```

**Issue**:

- User can't distinguish between error and empty database
- No indication of degraded service
- Frontend can't show appropriate error message

**Recommended Fix**:

```python
class DashboardStats(BaseModel):
    total_documents: int
    judgments: int
    tax_interpretations: int
    added_this_week: int
    last_updated: Optional[str] = None
    is_stale: bool = False  # Add flag for stale/error data
    error_message: Optional[str] = None

# In endpoint:
except Exception as e:
    logger.error(f"Error fetching dashboard stats: {e}")

    # Return last cached value if available
    if _stats_cache["data"] is not None:
        stats = _stats_cache["data"]
        stats.is_stale = True
        stats.error_message = "Using cached data due to database error"
        return stats

    # Otherwise return error indication
    raise HTTPException(
        status_code=503,
        detail="Dashboard statistics temporarily unavailable"
    )
```

---

### 37. Mock Schema Generation Task Still in Production Code

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/workers.py:88-181`
**Severity**: MEDIUM
**Description**: Mock implementation with hardcoded delays and fake data.

**Current Code**:

```python
@celery_app.task(bind=True)
def generate_schema_task(self, request_data: dict):
    """
    Mock schema generation task.
    In a real implementation, this would:
    # ...
    """
    # Mock progressive updates
    for i, (step_id, description) in enumerate(steps):
        self.update_state(...)
        time.sleep(3)  # Simulate processing time
```

**Issue**:

- Production code contains mock implementation
- 15-second delay for fake processing
- Returns hardcoded schema
- Confusing for developers

**Recommended Fix**:
Either:

1. Remove entirely if not used
2. Implement properly using schema_generation_agent
3. Move to test fixtures

```python
# If implementing properly:
@celery_app.task(bind=True, max_retries=3)
def generate_schema_task(self, request_data: dict):
    """Generate schema using schema generation agent"""
    try:
        agent = get_or_create_agent(
            agent_id=request_data["agent_id"],
            document_type=request_data["document_type"],
            # ... config
        )

        # Run agent
        result = agent.run(request_data["user_input"])

        return {
            "schema": result.schema,
            "confidence": result.confidence_score,
            "validation_results": result.validation_results,
        }
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

---

### 38. No Input Sanitization in Schema Generator Agent

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/schema_generation_agent.py:92-134`
**Severity**: MEDIUM
**Description**: User prompts passed directly to LLM without sanitization.

**Current Code**:

```python
initial_state = AgentState(
    messages=[],
    user_input=params.prompt,  # Unsanitized user input
    # ...
)
```

**Issues**:

- Prompt injection attacks possible
- Malicious prompts could manipulate agent behavior
- No length limits on user input
- No filtering of special characters

**Recommended Fix**:

```python
import re
from bleach import clean

def sanitize_user_prompt(prompt: str, max_length: int = 5000) -> str:
    """Sanitize user prompt for safe processing"""
    # Remove HTML tags
    sanitized = clean(prompt, tags=[], strip=True)

    # Limit length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]

    # Remove control characters
    sanitized = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', sanitized)

    # Strip excessive whitespace
    sanitized = ' '.join(sanitized.split())

    return sanitized

# In endpoint:
sanitized_prompt = sanitize_user_prompt(params.prompt)

initial_state = AgentState(
    messages=[],
    user_input=sanitized_prompt,
    # ...
)
```

---

### 39. Missing Indexes on Frequently Queried Fields

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/ai_tax_search/db/supabase_db.py`
**Severity**: MEDIUM
**Description**: Database queries without documented index requirements.

**Recommendation**: Document required indexes in migration files:

```sql
-- migrations/001_add_indexes.sql

-- Collections table
CREATE INDEX IF NOT EXISTS idx_collections_user_id
ON collections(user_id);

CREATE INDEX IF NOT EXISTS idx_collections_created_at
ON collections(created_at DESC);

-- Collection documents table
CREATE INDEX IF NOT EXISTS idx_collection_documents_collection_id
ON collection_documents(collection_id);

CREATE INDEX IF NOT EXISTS idx_collection_documents_document_id
ON collection_documents(document_id);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_documents_unique
ON collection_documents(collection_id, document_id);

-- Documents table
CREATE INDEX IF NOT EXISTS idx_documents_document_type
ON documents(document_type);

CREATE INDEX IF NOT EXISTS idx_documents_created_at
ON documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_language
ON documents(language);
```

---

### 40. Extraction Models Don't Track Timestamps Correctly

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/workers.py:56-69`
**Severity**: MEDIUM
**Description**: All timestamps set to same value, losing actual timing information.

**Current Code**:

```python
results.append(
    DocumentExtractionResponse(
        # ...
        created_at=datetime.now().isoformat(),  # All same
        updated_at=datetime.now().isoformat(),
        started_at=datetime.now().isoformat(),
        completed_at=datetime.now().isoformat(),
        # ...
    )
)
```

**Issue**:

- Can't calculate actual processing time
- Can't track task lifecycle properly
- Misleading timestamps

**Recommended Fix**:

```python
@celery_app.task(pydantic=True)
def extract_information_from_documents_task(
    request: DocumentExtractionRequest,
) -> list[DocumentExtractionResponse]:
    # Track overall task start
    task_started_at = datetime.now()

    # ... setup ...

    results: list[DocumentExtractionResponse] = []
    for doc in documents:
        doc_started_at = datetime.now()

        try:
            extracted_data = asyncio.run(...)
            doc_completed_at = datetime.now()

            results.append(
                DocumentExtractionResponse(
                    collection_id=request.collection_id,
                    document_id=doc.document_id,
                    status=DocumentProcessingStatus.COMPLETED,
                    created_at=task_started_at.isoformat(),
                    updated_at=doc_completed_at.isoformat(),
                    started_at=doc_started_at.isoformat(),
                    completed_at=doc_completed_at.isoformat(),
                    error_message=None,
                    extracted_data=extracted_data,
                    processing_duration_seconds=(
                        doc_completed_at - doc_started_at
                    ).total_seconds()
                ).model_dump(mode="json")
            )
        except Exception as e:
            doc_failed_at = datetime.now()
            # ... error handling with correct timestamps
```

---

### 41. Redis Connection Not Properly Managed

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/dashboard.py:17-32`
**Severity**: MEDIUM
**Description**: Redis client created at module level without lifecycle management.

**Current Code**:

```python
try:
    import redis.asyncio as redis
    redis_client = redis.Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        # ...
    )
    REDIS_AVAILABLE = True
except Exception as e:
    redis_client = None
    REDIS_AVAILABLE = False
```

**Issues**:

- Connection never closed
- No connection pool configuration
- No health checking
- Connection errors only caught on import

**Recommended Fix**:

```python
from contextlib import asynccontextmanager

class RedisManager:
    def __init__(self):
        self.client = None
        self.pool = None

    async def initialize(self):
        """Initialize Redis connection pool"""
        try:
            self.pool = redis.ConnectionPool(
                host=os.getenv("REDIS_HOST", "redis"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                password=os.getenv("REDIS_AUTH"),
                decode_responses=True,
                max_connections=20,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=True
            )

            self.client = redis.Redis(connection_pool=self.pool)

            # Test connection
            await self.client.ping()
            logger.info("Redis connection established")
            return True

        except Exception as e:
            logger.warning(f"Redis not available: {e}")
            self.client = None
            self.pool = None
            return False

    async def close(self):
        """Close Redis connections"""
        if self.client:
            await self.client.close()
        if self.pool:
            await self.pool.disconnect()
        logger.info("Redis connections closed")

    @property
    def is_available(self) -> bool:
        return self.client is not None

redis_manager = RedisManager()

# In server.py lifespan:
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Redis
    await redis_manager.initialize()

    # ... existing startup code ...

    yield

    # Cleanup Redis
    await redis_manager.close()

# In endpoints:
if redis_manager.is_available:
    cached_data = await redis_manager.client.get(cache_key)
```

---

## Low Priority Issues

### 42. Inconsistent Response Models Between Endpoints

**File**: Multiple files
**Severity**: LOW
**Description**: Similar operations return different response formats.

**Examples**:

- `/collections` returns `List[CollectionWithDocuments]`
- `/documents/batch` returns `BatchDocumentsResponse` with `documents` field
- `/extractions/results/{task_id}` returns `BatchExtractionResponse` with `results` field

**Recommended Fix**: Standardize response wrappers:

```python
class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int | None = None
    page_size: int | None = None

class SingleItemResponse(BaseModel, Generic[T]):
    item: T

class BatchResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
```

---

### 43. TODO Comments in Production Code

**File**: Multiple files
**Severity**: LOW
**Description**: Many TODO comments indicating incomplete features.

**Examples**:

```python
# server.py:25
# TODO: Re-enable rate limiting after fixing slowapi dependency

# dashboard.py:209
ai_summary=None,  # TODO: Implement AI summary generation

# documents.py:471
# TODO: Implement actual extraction logic
```

**Recommended Action**:

- Convert TODOs to GitHub issues
- Add issue numbers to comments: `# TODO(#123): ...`
- Prioritize and schedule implementation

---

### 44. Hardcoded Language Defaults

**File**: Multiple files
**Severity**: LOW
**Description**: Polish ("pl") hardcoded as default language.

**Examples**:

```python
# dashboard.py:212
language=doc.get("language", "pl"),

# models.py:102
llm_name: Literal["gemini-2.5-flash", ...] = Field("gemini-2.5-flash", ...)
```

**Recommended Fix**:

```python
# config.py
DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "pl")
DEFAULT_LLM = os.getenv("DEFAULT_LLM", "gemini-2.5-flash")

# In code:
from config import DEFAULT_LANGUAGE

language=doc.get("language", DEFAULT_LANGUAGE)
```

---

### 45. Missing API Versioning

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py`
**Severity**: LOW
**Description**: No API versioning strategy.

**Recommended Fix**:

```python
from fastapi import APIRouter

# Version 1 router
v1_router = APIRouter(prefix="/api/v1")

v1_router.include_router(documents_router, prefix="/documents")
v1_router.include_router(collections_router, prefix="/collections")
# ... other routers

app.include_router(v1_router)

# Redirect root API to latest version
@app.get("/api")
async def api_redirect():
    return RedirectResponse("/api/v1/docs")
```

---

### 46. No OpenAPI Tags Organization

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py`
**Severity**: LOW
**Description**: API docs not organized with OpenAPI tag metadata.

**Recommended Fix**:

```python
tags_metadata = [
    {
        "name": "retrieval",
        "description": "Document search and retrieval operations",
    },
    {
        "name": "extraction",
        "description": "Information extraction from documents",
    },
    {
        "name": "collections",
        "description": "Document collection management",
    },
    {
        "name": "dashboard",
        "description": "Dashboard statistics and analytics",
    },
    {
        "name": "health",
        "description": "Health check and monitoring endpoints",
    },
]

app = FastAPI(
    title="AI-Tax Legal Search API",
    description="API for legal document search and information extraction",
    version="1.0.0",
    openapi_tags=tags_metadata,
    lifespan=lifespan
)
```

---

### 47. Missing Request Size Limits

**File**: `/home/laugustyniak/github/legal-ai/AI-Tax/backend/app/server.py`
**Severity**: LOW
**Description**: No limits on request body size.

**Recommended Fix**:

```python
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_request_size: int = 10 * 1024 * 1024):  # 10MB
        super().__init__(app)
        self.max_request_size = max_request_size

    async def dispatch(self, request: Request, call_next):
        if request.method in ["POST", "PUT", "PATCH"]:
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > self.max_request_size:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request too large"}
                )
        return await call_next(request)

app.add_middleware(RequestSizeLimitMiddleware, max_request_size=10 * 1024 * 1024)
```

---

## Summary and Priority Recommendations

### Immediate Actions (Critical - Address This Week)

1. Fix timing attack vulnerability in API key authentication
2. Implement input validation on all collection/document IDs
3. Add environment variable validation on startup
4. Replace synchronous Supabase client with async version
5. Add proper error handling and retry logic to Celery tasks
6. Implement connection pooling for all external services
7. Add health check endpoints
8. Fix race condition in collection document management

### Short-term Actions (High - Address This Month)

1. Implement rate limiting across all endpoints
2. Add request/response validation middleware
3. Implement pagination on all list endpoints
4. Add monitoring and observability (Prometheus/DataDog)
5. Implement circuit breakers for external services
6. Add proper logging with request ID tracking
7. Improve CORS configuration for production
8. Add timeout configuration to all async operations

### Medium-term Actions (Medium - Address This Quarter)

1. Refactor global state management to use proper patterns
2. Implement comprehensive error recovery strategies
3. Add API versioning
4. Improve caching strategy with proper invalidation
5. Complete missing implementations (remove mocks)
6. Add comprehensive API documentation
7. Implement bulk operations for better performance

### Long-term Actions (Low - Backlog)

1. Standardize response formats across all endpoints
2. Add request size limits
3. Improve OpenAPI documentation organization
4. Make language defaults configurable
5. Convert TODO comments to tracked issues

---

## Testing Recommendations

1. **Security Testing**
   - Penetration testing for API key authentication
   - SQL/NoSQL injection testing
   - CORS policy validation
   - Rate limiting effectiveness

2. **Load Testing**
   - Test connection pool exhaustion scenarios
   - Test concurrent request handling
   - Test Celery worker capacity
   - Test database query performance under load

3. **Integration Testing**
   - Test all external service failure scenarios
   - Test circuit breaker behavior
   - Test cache invalidation strategies
   - Test async/await patterns

4. **Unit Testing**
   - Test input validation logic
   - Test error handling paths
   - Test data transformation functions
   - Test caching logic

---

## Documentation Requirements

1. **API Documentation**
   - Complete OpenAPI specs for all endpoints
   - Request/response examples
   - Error code documentation
   - Rate limit policies

2. **Deployment Documentation**
   - Required environment variables
   - Database schema and migrations
   - Index requirements
   - Scaling guidelines

3. **Development Documentation**
   - Architecture decision records (ADRs)
   - Error handling patterns
   - Logging conventions
   - Testing strategies

4. **Operations Documentation**
   - Monitoring and alerting setup
   - Troubleshooting guides
   - Backup and recovery procedures
   - Performance tuning guidelines

---

**End of Report**
