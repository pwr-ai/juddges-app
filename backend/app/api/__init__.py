"""
API Package

REST API endpoints for AI-Tax legal compliance features.

This package contains:
- audit: Audit trail API (user's own activity history)
- consent: User consent management API
- legal: Legal documents and GDPR compliance API
"""

from app.api.audit import router as audit_router
from app.api.consent import router as consent_router
from app.api.legal import router as legal_router

__all__ = [
    "audit_router",
    "consent_router",
    "legal_router",
]
