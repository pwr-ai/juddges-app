"""
Standardized error handling for the application.

This module provides consistent error classes and response formats
for all API endpoints.
"""

from enum import Enum
from typing import Any
from fastapi import HTTPException
from pydantic import BaseModel, Field


class ErrorCode(str, Enum):
    """Standardized error codes for the application."""

    # Validation errors (400)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    EMPTY_DOCUMENT_LIST = "EMPTY_DOCUMENT_LIST"
    INVALID_COLLECTION_ID = "INVALID_COLLECTION_ID"
    INVALID_SCHEMA_ID = "INVALID_SCHEMA_ID"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"

    # Not found errors (404)
    SCHEMA_NOT_FOUND = "SCHEMA_NOT_FOUND"
    COLLECTION_NOT_FOUND = "COLLECTION_NOT_FOUND"
    DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND"
    JOB_NOT_FOUND = "JOB_NOT_FOUND"

    # External service errors (503)
    DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
    VECTOR_DB_UNAVAILABLE = "VECTOR_DB_UNAVAILABLE"
    LLM_SERVICE_UNAVAILABLE = "LLM_SERVICE_UNAVAILABLE"

    # Task/Processing errors (500/503)
    TASK_SUBMISSION_FAILED = "TASK_SUBMISSION_FAILED"
    GENERATION_TIMEOUT = "GENERATION_TIMEOUT"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"

    # Rate limiting (429)
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"

    # Authentication/Authorization (401/403)
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"

    # Generic errors (500)
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ErrorDetail(BaseModel):
    """Standardized error response format."""

    error: str = Field(
        description="Short error title/type",
        examples=["Validation Error", "Schema Not Found"]
    )
    message: str = Field(
        description="Detailed user-friendly error message",
        examples=["The provided collection ID is invalid"]
    )
    code: ErrorCode = Field(
        description="Machine-readable error code for client handling"
    )
    details: dict[str, Any] | None = Field(
        default=None,
        description="Additional context about the error"
    )

    @classmethod
    def from_exception(
        cls,
        exc: Exception,
        code: ErrorCode,
        user_message: str | None = None
    ) -> "ErrorDetail":
        """
        Create error detail from an exception.

        Args:
            exc: The exception that was raised
            code: Error code to associate with this error
            user_message: Optional user-friendly message (defaults to str(exc))

        Returns:
            ErrorDetail instance with formatted error information
        """
        return cls(
            error=exc.__class__.__name__,
            message=user_message or str(exc),
            code=code,
            details={"exception_type": type(exc).__name__}
        )


class AppException(Exception):
    """Base application exception with HTTP status code support."""

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        status_code: int = 500,
        details: dict[str, Any] | None = None
    ) -> None:
        """
        Initialize application exception.

        Args:
            message: User-friendly error message
            code: Standardized error code
            status_code: HTTP status code (default: 500)
            details: Additional error context
        """
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
        super().__init__(message)

    def to_http_exception(self) -> HTTPException:
        """
        Convert to FastAPI HTTPException.

        Returns:
            HTTPException with standardized error detail
        """
        return HTTPException(
            status_code=self.status_code,
            detail=ErrorDetail(
                error=self.__class__.__name__,
                message=self.message,
                code=self.code,
                details=self.details
            ).model_dump()
        )


# Specific exception classes for common scenarios

class ValidationError(AppException):
    """Raised when request validation fails."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.VALIDATION_ERROR,
            status_code=400,
            details=details
        )


class EmptyCollectionError(AppException):
    """Raised when a collection has no documents."""

    def __init__(self, collection_id: str) -> None:
        super().__init__(
            message=f"Collection '{collection_id}' contains no documents",
            code=ErrorCode.EMPTY_DOCUMENT_LIST,
            status_code=400,
            details={"collection_id": collection_id}
        )


class SchemaNotFoundError(AppException):
    """Raised when a schema cannot be found."""

    def __init__(self, schema_id: str) -> None:
        super().__init__(
            message=f"Schema '{schema_id}' not found",
            code=ErrorCode.SCHEMA_NOT_FOUND,
            status_code=404,
            details={"schema_id": schema_id}
        )


class CollectionNotFoundError(AppException):
    """Raised when a collection cannot be found."""

    def __init__(self, collection_id: str) -> None:
        super().__init__(
            message=f"Collection '{collection_id}' not found",
            code=ErrorCode.COLLECTION_NOT_FOUND,
            status_code=404,
            details={"collection_id": collection_id}
        )


class DatabaseError(AppException):
    """Raised when database operations fail."""

    def __init__(self, message: str = "Database operation failed", details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.DATABASE_UNAVAILABLE,
            status_code=503,
            details=details
        )


class VectorDBError(AppException):
    """Raised when vector database operations fail."""

    def __init__(self, message: str = "Vector database operation failed", details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.VECTOR_DB_UNAVAILABLE,
            status_code=503,
            details=details
        )


class TaskSubmissionError(AppException):
    """Raised when task submission to Celery fails."""

    def __init__(self, message: str = "Failed to submit task for processing", details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.TASK_SUBMISSION_FAILED,
            status_code=503,
            details=details
        )


class RateLimitError(AppException):
    """Raised when rate limits are exceeded."""

    def __init__(self, message: str = "Rate limit exceeded. Please try again later.") -> None:
        super().__init__(
            message=message,
            code=ErrorCode.RATE_LIMIT_EXCEEDED,
            status_code=429
        )


class GenerationTimeoutError(AppException):
    """Raised when AI generation operations timeout."""

    def __init__(self, message: str = "Generation operation timed out") -> None:
        super().__init__(
            message=message,
            code=ErrorCode.GENERATION_TIMEOUT,
            status_code=504
        )


# Error handler decorator for route handlers
def handle_errors(func):
    """
    Decorator to handle errors in route handlers.

    Usage:
        @router.post("/endpoint")
        @handle_errors
        async def my_endpoint(...):
            # Your code here
    """
    from functools import wraps
    from loguru import logger

    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except AppException as e:
            logger.error(f"Application error in {func.__name__}: {e.message}", exc_info=True)
            raise e.to_http_exception()
        except HTTPException:
            # Re-raise HTTPExceptions as-is
            raise
        except Exception as e:
            logger.exception(f"Unexpected error in {func.__name__}")
            raise AppException(
                message="An unexpected error occurred",
                code=ErrorCode.INTERNAL_ERROR,
                details={"error": str(e)}
            ).to_http_exception()

    return wrapper
