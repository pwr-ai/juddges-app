#!/usr/bin/env bash
# scripts/regen_openapi_types.sh
# Boot the backend in-process, dump its OpenAPI schema, and regenerate
# the TypeScript types in frontend/lib/api/generated/openapi.ts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOT="$REPO_ROOT/scripts/openapi-snapshot.json"

cd "$REPO_ROOT/backend"

# Set minimum env vars so app.server imports cleanly without real services.
# These match the test profile used in backend/tests/app/conftest.py.
export SUPABASE_URL="${SUPABASE_URL:-http://stub.local}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-stub}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-stub}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-stub}"
export BACKEND_API_KEY="${BACKEND_API_KEY:-stub}"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://stub.local}"
export DATABASE_URL="${DATABASE_URL:-postgresql://stub:stub@localhost:5432/stub}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"

poetry run python -c "
import json
from app.server import app
with open('$SNAPSHOT', 'w') as f:
    json.dump(app.openapi(), f, indent=2, sort_keys=True)
print('OpenAPI snapshot written to $SNAPSHOT')
"

cd "$REPO_ROOT/frontend"
npm run gen:openapi
echo 'Frontend types regenerated at frontend/lib/api/generated/openapi.ts'
