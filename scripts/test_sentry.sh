#!/usr/bin/env bash
# Smoke-test Sentry wiring by triggering a known error in each backend surface
# (server import path + Celery task path) and flushing it to Sentry.
#
# Usage:
#   SENTRY_DSN=... [SENTRY_RELEASE=prod-vX.Y.Z] ./scripts/test_sentry.sh
#
# After it runs, open your Sentry project and filter by:
#   tags: service=backend   release: <SENTRY_RELEASE or GIT_SHA>
# and look for "JUDDGES SENTRY SMOKE TEST" events (one tagged surface=server,
# one surface=celery_task). The exact issue URL is only available via the
# Sentry API (needs an auth token), so this prints the filter to use instead.
#
# Frontend: trigger a client error in the browser (e.g. a thrown error on a
# test route) — that path is exercised by @sentry/nextjs, not this script.
set -euo pipefail

if [[ -z "${SENTRY_DSN:-}" ]]; then
  echo "ERROR: SENTRY_DSN is not set — nothing would be sent. Aborting." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}/backend"

echo "Sending smoke-test events (release=${SENTRY_RELEASE:-${GIT_SHA:-unset}}) ..."

poetry run python - <<'PY'
import sentry_sdk

from app.sentry import init_sentry

init_sentry()

# Surface 1: server/general path
try:
    raise RuntimeError("JUDDGES SENTRY SMOKE TEST — server surface")
except RuntimeError as exc:
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("surface", "server")
        sentry_sdk.capture_exception(exc)

# Surface 2: simulate a Celery task failure (CeleryIntegration captures real
# task exceptions automatically; here we tag one to verify the pipeline).
try:
    raise ValueError("JUDDGES SENTRY SMOKE TEST — celery_task surface")
except ValueError as exc:
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("surface", "celery_task")
        sentry_sdk.capture_exception(exc)

sentry_sdk.flush(timeout=5)
print("Flushed 2 events to Sentry.")
PY

echo "Done. In Sentry, filter service=backend and search 'JUDDGES SENTRY SMOKE TEST'."
