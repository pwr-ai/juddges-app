#!/bin/sh
set -e

echo "======================================"
echo "Juddges Frontend - Runtime Configuration"
echo "======================================"

# Public API URL default (public, harmless). Supabase values have no default:
# a container without them must fail here, not talk to an arbitrary project.
DEFAULT_API_BASE_URL="https://juddges-api.augustyniak.ai"

# Resolve runtime environment variables with fallbacks and export them so the
# Next.js server process sees them. The app reads NEXT_PUBLIC_* through
# computed lookups (frontend/lib/env/server.ts) and serves them to the browser
# from /runtime-env.js, so these values take effect without rebuilding the
# image. Nothing in .next is patched.
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-$DEFAULT_API_BASE_URL}"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"

missing=""
[ -n "$NEXT_PUBLIC_SUPABASE_URL" ] || missing="$missing NEXT_PUBLIC_SUPABASE_URL"
[ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] || missing="$missing NEXT_PUBLIC_SUPABASE_ANON_KEY"
if [ -n "$missing" ]; then
  echo "ERROR: missing required runtime configuration:$missing" >&2
  echo "       Set them in .env (docker compose passes them to the frontend service)." >&2
  exit 1
fi

# Log configuration (mask sensitive data)
echo "Configuration Status:"
echo "  NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL}"
echo "  NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY: $([ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] && echo '***configured***' || echo 'NOT SET')"
echo "  BACKEND_API_KEY: $([ -n "$BACKEND_API_KEY" ] && echo '***configured***' || echo 'NOT SET')"
echo "  Browser config served from: /runtime-env.js (no-store)"
echo "======================================"

# Set server-side environment variables (for API routes)
export BACKEND_API_KEY="${BACKEND_API_KEY:-dummy-key}"

# Start the Next.js server
echo "Starting Next.js server..."
exec "$@"
