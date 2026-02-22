#!/usr/bin/env bash
# ==============================================================================
# deploy_prod.sh
# Pull Docker images from Docker Hub and deploy on production host
#
# Usage:
#   ./scripts/deploy_prod.sh              # Deploy :latest images
#   ./scripts/deploy_prod.sh 0.2.0        # Deploy specific version
#   ./scripts/deploy_prod.sh --status      # Show running containers status
#   ./scripts/deploy_prod.sh --rollback    # Rollback to previous version
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration (DOCKER_USERNAME loaded from .env)
# ------------------------------------------------------------------------------
PROJECT="juddges"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
ENV_FILE="${REPO_ROOT}/.env"
DEPLOY_LOG="${REPO_ROOT}/.deploy-history"

# ------------------------------------------------------------------------------
# Color output
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ------------------------------------------------------------------------------
# Show current deployment status
# ------------------------------------------------------------------------------
show_status() {
    info "=== Deployment Status ==="
    echo ""

    info "Running containers:"
    docker compose -f "${COMPOSE_FILE}" ps
    echo ""

    info "Current images:"
    for image in "${IMAGES[@]}"; do
        local current
        current=$(docker inspect --format='{{index .Config.Image}}' "$(docker ps -q --filter "ancestor=${image}:*" | head -1)" 2>/dev/null || echo "not running")
        echo "  ${image}: ${current}"
    done
    echo ""

    if [[ -f "${DEPLOY_LOG}" ]]; then
        info "Recent deployments:"
        tail -5 "${DEPLOY_LOG}"
    fi
}

# ------------------------------------------------------------------------------
# Get previous version from deploy history
# ------------------------------------------------------------------------------
get_previous_version() {
    if [[ -f "${DEPLOY_LOG}" && $(wc -l < "${DEPLOY_LOG}") -ge 2 ]]; then
        tail -2 "${DEPLOY_LOG}" | head -1 | awk '{print $3}'
    else
        err "No previous version found in deploy history."
        exit 1
    fi
}

# ------------------------------------------------------------------------------
# Pull images
# ------------------------------------------------------------------------------
pull_images() {
    local tag="$1"

    for image in "${IMAGES[@]}"; do
        info "Pulling ${image}:${tag} ..."
        docker pull "${image}:${tag}"
        ok "Pulled ${image}:${tag}"
    done
}

# ------------------------------------------------------------------------------
# Deploy with docker compose
# ------------------------------------------------------------------------------
deploy() {
    local tag="$1"

    info "Deploying with tag: ${tag}"

    # Export the tag for docker-compose interpolation
    export JUDDGES_IMAGE_TAG="${tag}"

    # Stop existing containers gracefully
    info "Stopping current containers ..."
    docker compose -f "${COMPOSE_FILE}" down --timeout 30

    # Start with new images
    info "Starting containers with ${tag} images ..."
    docker compose -f "${COMPOSE_FILE}" up -d

    # Wait for health checks
    info "Waiting for services to become healthy ..."
    local max_wait=120
    local elapsed=0
    local all_healthy=false

    while [[ ${elapsed} -lt ${max_wait} ]]; do
        local unhealthy
        unhealthy=$(docker compose -f "${COMPOSE_FILE}" ps --format json 2>/dev/null | \
            python3 -c "
import sys, json
lines = sys.stdin.read().strip().split('\n')
unhealthy = 0
for line in lines:
    if not line: continue
    try:
        svc = json.loads(line)
        health = svc.get('Health', svc.get('Status', ''))
        if 'unhealthy' in health.lower():
            unhealthy += 1
    except: pass
print(unhealthy)
" 2>/dev/null || echo "0")

        local running
        running=$(docker compose -f "${COMPOSE_FILE}" ps --status running --format json 2>/dev/null | \
            python3 -c "import sys; print(len([l for l in sys.stdin.read().strip().split('\n') if l]))" 2>/dev/null || echo "0")

        if [[ "${running}" -ge 3 && "${unhealthy}" -eq 0 ]]; then
            all_healthy=true
            break
        fi

        sleep 5
        elapsed=$((elapsed + 5))
        echo -n "."
    done
    echo ""

    if ${all_healthy}; then
        ok "All services are running!"
    else
        warn "Some services may not be fully healthy yet. Check with: docker compose -f ${COMPOSE_FILE} ps"
    fi

    # Log deployment
    echo "$(date -Iseconds) deployed ${tag} from $(hostname)" >> "${DEPLOY_LOG}"
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
    local arg="${1:-latest}"

    info "=== Juddges Production Deployment ==="
    echo ""

    cd "${REPO_ROOT}"

    # Handle special commands
    case "${arg}" in
        --status|-s)
            show_status
            exit 0
            ;;
        --rollback|-r)
            local prev
            prev=$(get_previous_version)
            warn "Rolling back to version: ${prev}"
            read -rp "Confirm rollback to ${prev}? [y/N] " confirm
            if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
                info "Aborted."
                exit 0
            fi
            arg="${prev}"
            ;;
    esac

    # Load .env
    if [[ ! -f "${ENV_FILE}" ]]; then
        err ".env file not found at ${ENV_FILE}"
        err "Copy .env.example to .env and fill in production values."
        exit 1
    fi
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a

    if [[ -z "${DOCKER_USERNAME:-}" ]]; then
        err "DOCKER_USERNAME not set in .env"
        exit 1
    fi
    DOCKER_HUB_USER="${DOCKER_USERNAME}"

    IMAGES=(
        "${DOCKER_HUB_USER}/${PROJECT}-frontend"
        "${DOCKER_HUB_USER}/${PROJECT}-backend"
    )

    local tag="${arg}"

    info "Version to deploy: ${tag}"
    info "Compose file:      ${COMPOSE_FILE}"
    echo ""

    # Show what's currently running
    info "Currently running:"
    docker compose -f "${COMPOSE_FILE}" ps 2>/dev/null || echo "  (nothing running)"
    echo ""

    # Confirm
    read -rp "Deploy v${tag}? [y/N] " confirm
    if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
        info "Aborted."
        exit 0
    fi
    echo ""

    # Pull images
    pull_images "${tag}"
    echo ""

    # Deploy
    deploy "${tag}"

    echo ""
    ok "=== Deployment complete ==="
    echo ""

    # Show final status
    docker compose -f "${COMPOSE_FILE}" ps
    echo ""
    info "Logs: docker compose -f ${COMPOSE_FILE} logs -f"
}

main "$@"
