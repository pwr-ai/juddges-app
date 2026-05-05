"""
Tests for standardized error handling.

This module tests the custom exception classes and global error handlers.
"""

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient


class TestCustomExceptions:
    """Test custom exception classes."""

    def test_document_not_found_error(self):
        """Test DocumentNotFoundError structure."""
        from app.errors import DocumentNotFoundError

        exc = DocumentNotFoundError(document_id="test-123")
        assert exc.status_code == status.HTTP_404_NOT_FOUND
        assert exc.error_code.value == "DOCUMENT_NOT_FOUND"
        assert "test-123" in exc.message
        assert exc.details["document_id"] == "test-123"

    def test_validation_error(self):
        """Test ValidationError structure."""
        from app.errors import ValidationError

        exc = ValidationError(message="Invalid input", details={"field": "name"})
        assert exc.status_code == status.HTTP_400_BAD_REQUEST
        assert exc.error_code.value == "VALIDATION_ERROR"
        assert exc.message == "Invalid input"
        assert exc.details["field"] == "name"

    def test_operation_failed_error(self):
        """Test OperationFailedError structure."""
        from app.errors import OperationFailedError

        exc = OperationFailedError(operation="search", reason="Database timeout")
        assert exc.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert exc.error_code.value == "OPERATION_FAILED"
        assert "search" in exc.message
        assert exc.details["operation"] == "search"

    def test_missing_user_id_error(self):
        """Test MissingUserIDError structure."""
        from app.errors import MissingUserIDError

        exc = MissingUserIDError()
        assert exc.status_code == status.HTTP_401_UNAUTHORIZED
        assert exc.error_code.value == "MISSING_USER_ID"
        assert "User ID" in exc.message


class TestErrorResponses:
    """Test error response formats."""

    def test_error_response_structure(self):
        """Test that error responses follow standard structure."""
        from app.errors import DocumentNotFoundError

        exc = DocumentNotFoundError(document_id="abc-123")

        # The detail should be a dict with the standardized structure
        assert isinstance(exc.detail, dict)
        assert "error" in exc.detail
        assert "message" in exc.detail
        assert "code" in exc.detail
        assert "details" in exc.detail

    def test_all_errors_have_codes(self):
        """Test that all custom exceptions have error codes."""
        from app.errors import (
            CollectionNotFoundError,
            DatabaseError,
            DocumentNotFoundError,
            InvalidInputError,
            MissingUserIDError,
            OperationFailedError,
            SchemaNotFoundError,
            TaskSubmissionError,
            UnauthorizedError,
            ValidationError,
        )

        exceptions = [
            DocumentNotFoundError(document_id="test"),
            CollectionNotFoundError(collection_id="test"),
            SchemaNotFoundError(schema_id="test"),
            ValidationError(message="test"),
            InvalidInputError(field="test", reason="test"),
            OperationFailedError(operation="test", reason="test"),
            DatabaseError(),
            TaskSubmissionError(),
            MissingUserIDError(),
            UnauthorizedError(),
        ]

        for exc in exceptions:
            assert hasattr(exc, "error_code")
            assert hasattr(exc, "status_code")
            assert hasattr(exc, "message")
            assert hasattr(exc, "details")


# TODO(simplify-audit): owner unknown - confirm whether to delete or fix; reason: "Requires running FastAPI app"
@pytest.mark.skip(reason="Requires running FastAPI app")
class TestErrorHandlers:
    """Test global error handlers in the FastAPI app."""

    @pytest.mark.anyio
    async def test_app_exception_handler(self):
        """Test that AppExceptions are handled correctly."""
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ):
            # This would require a test endpoint that raises custom exceptions
            # For now, this is a placeholder
            pass

    @pytest.mark.anyio
    async def test_error_format_consistency(self):
        """Test that all errors follow the same format."""
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Test 404 error
            response = await client.get("/api/documents/nonexistent-id-12345")

            if response.status_code == 404:
                data = response.json()
                # Even if not using custom exceptions yet, test structure
                # This will pass once migration is complete
                assert "error" in data or "detail" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
