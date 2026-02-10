# How to Implement Audit Logging in Your Endpoints

This guide shows you how to add comprehensive audit logging to your FastAPI endpoints for legal compliance.

## Prerequisites

- FastAPI application running
- Database migration `002_audit_trail_and_compliance.sql` applied
- Supabase connection configured

## Quick Start

### 1. Basic Audit Logging

Add audit logging to any endpoint:

```python
from fastapi import APIRouter, Depends, BackgroundTasks
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.services import log_audit_background

router = APIRouter()

@router.post("/api/analyze")
async def analyze_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    # Your business logic
    result = perform_analysis(document_id)

    # Log the action (non-blocking)
    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="analysis",
        input_data={"document_id": document_id},
        output_data={"result": result},
        resource_type="document",
        resource_id=document_id
    )

    return result
```

### 2. Logging Query Operations

For search/query endpoints:

```python
from app.services import AuditService

@router.post("/api/search")
async def search_documents(
    query: str,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    # Perform search
    results = search_engine.search(query)

    # Log query (non-blocking)
    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="query",
        input_data={"query": query},
        output_data={"result_count": len(results)},
        model_used="vector-search-v1"
    )

    return results
```

### 3. Logging Document Access

Track document views and downloads:

```python
@router.get("/api/documents/{document_id}")
async def get_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    # Get document
    document = fetch_document(document_id)

    # Log document view
    background_tasks.add_task(
        AuditService.log_document_access,
        user_id=user.id,
        document_id=document_id,
        action="view",
        metadata={"title": document.title}
    )

    return document

@router.get("/api/documents/{document_id}/download")
async def download_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    # Generate download
    file_data = generate_download(document_id)

    # Log download
    background_tasks.add_task(
        AuditService.log_document_access,
        user_id=user.id,
        document_id=document_id,
        action="download"
    )

    return StreamingResponse(file_data, media_type="application/pdf")
```

### 4. Logging Data Exports

Track when users export data:

```python
@router.get("/api/exports/my-data")
async def export_my_data(
    format: str,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    # Generate export
    export_data = generate_export(user.id, format)

    # Log export
    background_tasks.add_task(
        AuditService.log_export,
        user_id=user.id,
        export_type="user_data",
        metadata={"format": format, "size": len(export_data)}
    )

    return export_data
```

## Advanced Usage

### 5. Capturing Request Details

Include HTTP details in audit logs:

```python
from fastapi import Request

@router.post("/api/action")
async def perform_action(
    request: Request,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    # Your logic
    result = do_something()

    # Log with HTTP details
    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="action",
        http_method=request.method,
        api_endpoint=str(request.url.path),
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent")
    )

    return result
```

### 6. Tracking Performance

Log request duration:

```python
import time

@router.post("/api/analysis")
async def analyze(
    data: dict,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    start_time = time.time()

    # Your logic
    result = perform_analysis(data)

    # Calculate duration
    duration_ms = int((time.time() - start_time) * 1000)

    # Log with duration
    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="analysis",
        input_data=data,
        output_data=result,
        duration_ms=duration_ms
    )

    return result
```

### 7. Error Logging

Log failures for debugging:

```python
@router.post("/api/process")
async def process_data(
    data: dict,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    try:
        result = process(data)

        # Log success
        log_audit_background(
            background_tasks,
            user_id=user.id,
            action_type="process",
            input_data=data,
            output_data=result,
            http_status_code=200
        )

        return result

    except Exception as e:
        # Log error
        log_audit_background(
            background_tasks,
            user_id=user.id,
            action_type="process",
            input_data=data,
            error_message=str(e),
            http_status_code=500
        )

        raise HTTPException(status_code=500, detail=str(e))
```

### 8. Middleware for Automatic Logging

Create middleware to automatically log all requests:

```python
from starlette.middleware.base import BaseHTTPMiddleware
import time

class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)

        # Extract user from request state (if authenticated)
        user = getattr(request.state, "user", None)

        if user and should_audit(request.url.path):
            # Log in background
            await AuditService.log_action(
                user_id=user.id,
                action_type=infer_action_type(request),
                http_method=request.method,
                api_endpoint=str(request.url.path),
                http_status_code=response.status_code,
                duration_ms=duration_ms,
                ip_address=request.client.host
            )

        return response

# Add to app
app.add_middleware(AuditMiddleware)
```

## Filtering Sensitive Data

### 9. Sanitizing Input Data

```python
from app.services import AuditService

@router.post("/api/authenticate")
async def authenticate(
    credentials: dict,
    background_tasks: BackgroundTasks
):
    # Sanitize sensitive data before logging
    sanitized_input = {
        "username": credentials.get("username"),
        # Don't log password!
        "password": "[REDACTED]"
    }

    result = auth.login(credentials)

    log_audit_background(
        background_tasks,
        user_id=result.user_id,
        action_type="user_login",
        input_data=sanitized_input  # Use sanitized version
    )

    return result
```

The `AuditService` automatically sanitizes common sensitive fields, but you can add additional sanitization for your specific needs.

## Session Tracking

### 10. Linking Actions to Sessions

```python
from fastapi import Cookie

@router.post("/api/query")
async def query(
    query: str,
    session_id: str = Cookie(None),
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user)
):
    result = search(query)

    # Include session_id in audit log
    log_audit_background(
        background_tasks,
        user_id=user.id,
        session_id=session_id,  # Links multiple actions together
        action_type="query",
        input_data={"query": query}
    )

    return result
```

## Testing Audit Logging

### 11. Unit Testing

```python
import pytest
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_audit_logging():
    with patch('app.services.AuditService.log_action', new=AsyncMock()) as mock_log:
        # Call your endpoint
        response = await client.post("/api/action", json={...})

        # Verify audit log was created
        mock_log.assert_called_once()
        call_args = mock_log.call_args[1]
        assert call_args['user_id'] == "test-user"
        assert call_args['action_type'] == "action"
```

### 12. Integration Testing

```python
@pytest.mark.asyncio
async def test_audit_trail_creation():
    # Perform action
    response = await authenticated_client.post("/api/action")
    assert response.status_code == 200

    # Verify audit log was created
    audit_logs = await AuditService.get_user_audit_trail(
        user_id="test-user",
        start_date=datetime.now() - timedelta(minutes=5)
    )

    assert len(audit_logs['audit_logs']) >= 1
    assert audit_logs['audit_logs'][0]['action_type'] == "action"
```

## Best Practices

### DO:
- ✅ Use background tasks for audit logging (non-blocking)
- ✅ Log both successful and failed operations
- ✅ Include session_id when available
- ✅ Sanitize sensitive data before logging
- ✅ Use appropriate action_type from predefined list
- ✅ Log resource_type and resource_id for tracking
- ✅ Include metadata for context

### DON'T:
- ❌ Block the request waiting for audit log
- ❌ Log passwords, tokens, or API keys
- ❌ Store unencrypted sensitive data
- ❌ Log excessive data (keep logs concise)
- ❌ Ignore audit logging errors (log them separately)
- ❌ Use custom action types without adding to database

## Monitoring and Maintenance

### 13. Checking Audit Log Health

```python
from app.services import RetentionService

# Check audit log statistics
async def check_audit_health():
    # Get recent log count
    result = await supabase.table("audit_logs")\
        .select("id", count="exact")\
        .gte("created_at", datetime.now() - timedelta(days=7))\
        .execute()

    recent_logs = result.count

    if recent_logs < expected_minimum:
        logger.warning(f"Low audit log volume: {recent_logs} logs in last 7 days")

    return {"status": "healthy", "recent_logs": recent_logs}
```

### 14. Scheduled Cleanup

```python
import asyncio
from app.services import RetentionService

async def daily_cleanup_job():
    """Run this as a scheduled job (cron/scheduler)"""

    # Cleanup expired sessions
    result = await RetentionService.cleanup_expired_sessions()
    logger.info(f"Cleaned up {result['deleted_count']} expired sessions")

    # Archive old audit logs (monthly)
    if datetime.now().day == 1:
        result = await RetentionService.archive_expired_audit_logs()
        logger.info(f"Archived {result['archived_count']} audit logs")

# Run with asyncio
asyncio.run(daily_cleanup_job())
```

## Troubleshooting

**Problem:** Audit logs not appearing

**Solution:**
1. Check background tasks are executing:
   ```python
   # Add debugging
   background_tasks.add_task(debug_task, "Audit task queued")
   ```
2. Verify Supabase connection
3. Check RLS policies allow insertion

**Problem:** Performance degradation

**Solution:**
1. Ensure using background tasks (not blocking)
2. Check database indexes are created
3. Monitor audit log table size
4. Consider archiving old logs

**Problem:** Missing audit logs for some users

**Solution:**
1. Verify authentication is working
2. Check user_id is correctly extracted
3. Review RLS policies
4. Check for errors in application logs

## Additional Resources

- [Audit Trail API Reference](../reference/audit-trail-api.md)
- [FastAPI Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [GDPR Compliance Guide](https://gdpr.eu/)
