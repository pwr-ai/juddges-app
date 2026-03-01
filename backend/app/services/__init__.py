"""
Services Package

Business logic and service layer for Juddges backend.

This package contains:
- audit_service: Audit logging for legal compliance
- retention_service: Data retention and cleanup operations
- search: Meilisearch-backed autocomplete integration
"""

from app.services.audit_service import AuditService, log_audit_background
from app.services.retention_service import RetentionService, RetentionConfig
from app.services.search import MeiliSearchService, SearchServiceError

__all__ = [
    "AuditService",
    "log_audit_background",
    "RetentionService",
    "RetentionConfig",
    "MeiliSearchService",
    "SearchServiceError",
]
