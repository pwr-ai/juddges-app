"""
Authentication Tiers
====================

This module documents and re-exports the authentication dependencies used
across the Juddges backend API. It provides a single place to understand
and reference the auth tier hierarchy.

Auth Tier Hierarchy
-------------------

PUBLIC
    No authentication required. Anyone can call these endpoints.
    Examples: /health, /health/healthz, GET /blog/posts, guest sessions.

API_KEY
    Service-to-service authentication via the ``X-API-Key`` header.
    The key is compared using constant-time comparison to prevent timing
    attacks. This tier is used for most data endpoints called from the
    Next.js frontend or other trusted services.
    Source: ``app.auth.verify_api_key``

USER
    JWT Bearer token required (issued by Supabase Auth). The token is
    validated against the Supabase admin API. Endpoints at this tier
    operate with the authenticated user's identity and respect RLS
    policies when a user-scoped Supabase client is used.
    Source: ``app.core.auth_jwt.get_current_user``

ADMIN
    JWT Bearer token required AND the authenticated user must have the
    admin role (``service_role`` or ``app_metadata.is_admin == true``).
    This tier is used for privileged operations such as viewing all
    users, platform statistics, and system health details.
    Source: ``app.core.auth_jwt.require_admin``

MIXED (Optional JWT)
    Some endpoints accept both authenticated and anonymous callers.
    When a valid JWT is present it is used to associate the action with
    a user; when absent the endpoint operates in anonymous mode.
    Source: ``app.core.auth_jwt.get_optional_user``

Router-to-Tier Mapping
-----------------------
See ``app.server`` for the authoritative router registration block which
documents which tier each router uses.

Quick reference (as registered in server.py):

    PUBLIC:
        health_router           — /health (basic check, no auth)
        guest_sessions_router   — /api/guest-sessions (public session init)

    API_KEY:
        LangServe /qa, /chat, /enhance_query
        documents_router        — /documents (search, retrieval)
        collections_router      — /collections
        publications_router     — /publications
        extraction_router       — /extraction
        schemas_router          — /schemas
        schema_generator_router — /api/schema-generator
        example_questions_router
        dashboard_router
        playground_router
        evaluations_router
        summarization_router
        precedents_router
        deduplication_router
        versioning_router
        ocr_router
        clustering_router
        recommendations_router
        research_assistant_router
        topic_modeling_router
        argumentation_router
        embeddings_router
        marketplace_router
        timeline_router
        search_router
        graphql_router          — /graphql
        health_router           — /health/status (API key protected sub-route)

    API_KEY + USER (JWT for writes):
        blog_router             — /blog (API_KEY at router level;
                                  write sub-routes also require JWT:
                                  POST .../like, POST .../bookmark,
                                  GET /bookmarks, /blog/admin/*)
        experiments_router      — JWT enforced per-endpoint

    ADMIN (JWT + admin role):
        admin_router            — /api/admin (require_admin on every endpoint)

    MIXED (API_KEY at router level + optional JWT per endpoint):
        analytics_router        — /api/analytics (router: API_KEY,
                                  endpoints: get_optional_user)

    MIXED (no router-level auth + optional JWT per endpoint):
        feedback_router         — /api/feedback (router: PUBLIC,
                                  endpoints: get_optional_user)
        audit_router            — JWT enforced per-endpoint
        consent_router          — JWT enforced per-endpoint
        legal_router            — PUBLIC (static legal documents)
        blog_router             — /blog (public GET routes need no auth,
                                  protected routes use get_current_user)
"""

# Re-export existing auth functions with clear tier names so callers can
# import from this module without needing to know the underlying location.
#
# No behavioral changes — this is documentation and import consolidation only.

from app.auth import verify_api_key as require_api_key  # noqa: F401
from app.core.auth_jwt import get_current_user as require_user  # noqa: F401
from app.core.auth_jwt import get_optional_user as optional_user  # noqa: F401
from app.core.auth_jwt import require_admin  # noqa: F401

# ---------------------------------------------------------------------------
# Tier name constants — use these as documentation anchors in new routers.
# ---------------------------------------------------------------------------

# Tier labels (strings, for documentation / logging only — not enforced at
# runtime). New routers should include a comment like:
#   # AUTH TIER: API_KEY
# at the top of their file to make the tier explicit.

AUTH_TIER_PUBLIC: str = "PUBLIC"
AUTH_TIER_API_KEY: str = "API_KEY"
AUTH_TIER_USER: str = "USER"
AUTH_TIER_ADMIN: str = "ADMIN"
AUTH_TIER_MIXED: str = "MIXED"
