#!/usr/bin/env bash
# ==============================================================================
# smoke_test_images.sh
#
# Verify that a freshly built backend image starts up cleanly and
# responds to /health within 30 seconds. Designed to be called from
# scripts/build_and_push_prod.sh AFTER docker build but BEFORE docker push,
# so that broken images never reach Docker Hub.
#
# Usage:
#   ./scripts/smoke_test_images.sh [TAG]
#
# Environment:
#   DOCKER_USERNAME      — registry namespace (default: juddges)
#   SMOKE_CONTAINER_PORT — internal port the prod image listens on (default: 8002,
#                          matches gunicorn --bind in backend/Dockerfile)
#   SMOKE_HOST_PORT      — host port to bind for the smoke test (default: 18004,
#                          chosen high to avoid clashes with dev/prod ports)
#   SMOKE_TIMEOUT        — max seconds to wait for /health (default: 30)
# ==============================================================================
set -euo pipefail

TAG="${1:-latest}"
DOCKER_USERNAME="${DOCKER_USERNAME:-juddges}"
CONTAINER_PORT="${SMOKE_CONTAINER_PORT:-8002}"
HOST_PORT="${SMOKE_HOST_PORT:-18004}"
TIMEOUT="${SMOKE_TIMEOUT:-30}"

NETWORK="juddges-smoke-$$"
BACKEND_NAME="juddges-backend-smoke-$$"
IMAGE="${DOCKER_USERNAME}/juddges-backend:${TAG}"

cleanup() {
    set +e
    docker rm -f "$BACKEND_NAME" >/dev/null 2>&1
    docker network rm "$NETWORK" >/dev/null 2>&1
}
trap cleanup EXIT

echo "[smoke] Creating ephemeral network ${NETWORK}"
docker network create "$NETWORK" >/dev/null

echo "[smoke] Starting backend container (image: ${IMAGE})"
docker run -d --name "$BACKEND_NAME" --network "$NETWORK" \
    -e SUPABASE_URL="http://stub" \
    -e SUPABASE_ANON_KEY="stub" \
    -e SUPABASE_SERVICE_ROLE_KEY="stub" \
    -e BACKEND_API_KEY="smoke-key" \
    -e OPENAI_API_KEY="stub" \
    -e DATABASE_URL="postgresql://stub:stub@localhost:5432/stub" \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    "$IMAGE" >/dev/null

echo "[smoke] Waiting up to ${TIMEOUT}s for http://localhost:${HOST_PORT}/health ..."
for i in $(seq 1 "$TIMEOUT"); do
    if curl -fs "http://localhost:${HOST_PORT}/health" >/dev/null 2>&1; then
        echo "[smoke] PASS: backend /health responded after ${i}s"
        exit 0
    fi
    # Bail out early if container has already crashed
    if ! docker ps --filter "name=^/${BACKEND_NAME}$" --format '{{.Names}}' | grep -q "$BACKEND_NAME"; then
        echo "[smoke] FAILED: container exited before /health became ready" >&2
        echo "[smoke] Container logs (last 80 lines):" >&2
        docker logs --tail=80 "$BACKEND_NAME" >&2 || true
        exit 1
    fi
    sleep 1
done

echo "[smoke] FAILED: /health did not respond within ${TIMEOUT}s" >&2
echo "[smoke] Container logs (last 80 lines):" >&2
docker logs --tail=80 "$BACKEND_NAME" >&2 || true
exit 1
