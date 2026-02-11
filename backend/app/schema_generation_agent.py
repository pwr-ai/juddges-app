from fastapi import APIRouter

router = APIRouter(
    prefix="/schema-generator-agent",
    tags=["deprecated"],
    deprecated=True,
    include_in_schema=True,
)

# NOTE: This router is kept for API documentation purposes only.
# All functional endpoints have been removed and migrated to:
# - /schemas (app.schemas router)
# - /api/schema-generator (app.api.schema_generator router)


# DEPRECATED ENDPOINTS REMOVED
# The following endpoints have been removed as of v0.4.0:
# - POST /schema-generator-agent/init-agent
#   Replacement: Use POST /schemas/generate instead
# - POST /schema-generator-agent/invoke-schema
#   Replacement: Use POST /schemas/generate/{session_id}/refine instead
#
# See app.schemas and app.api.schema_generator routers for current implementations.
