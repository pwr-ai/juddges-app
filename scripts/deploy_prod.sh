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

# Expected services that must be running after deploy
REQUIRED_SERVICES=("frontend" "backend" "meilisearch" "backend-worker" "backend-beat")

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
# Pre-flight checks
# ------------------------------------------------------------------------------
preflight_checks() {
    info "Running pre-flight checks ..."

    # Check Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        err "Docker daemon is not running. Start Docker and try again."
        exit 1
    fi
    ok "Docker daemon is running"

    # Check available disk space (warn if < 5GB free)
    local avail_kb
    avail_kb=$(df --output=avail "${REPO_ROOT}" 2>/dev/null | tail -1 | tr -d ' ')
    if [[ -n "${avail_kb}" ]]; then
        local avail_gb=$(( avail_kb / 1024 / 1024 ))
        if [[ ${avail_gb} -lt 5 ]]; then
            warn "Low disk space: ${avail_gb}GB available (< 5GB). Deployments may fail."
        else
            ok "Disk space: ${avail_gb}GB available"
        fi
    fi

    # Log current running container versions for rollback reference
    info "Current container versions:"
    local container_id
    for svc in "${REQUIRED_SERVICES[@]}"; do
        container_id=$(docker compose -f "${COMPOSE_FILE}" ps -q "${svc}" 2>/dev/null || true)
        if [[ -n "${container_id}" ]]; then
            local img
            img=$(docker inspect --format='{{.Config.Image}}' "${container_id}" 2>/dev/null || echo "unknown")
            echo "  ${svc}: ${img}"
        else
            echo "  ${svc}: not running"
        fi
    done
    echo ""
}

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
# Check individual service health
# ------------------------------------------------------------------------------
check_service_status() {
    local svc="$1"
    local status
    status=$(docker compose -f "${COMPOSE_FILE}" ps --format json "${svc}" 2>/dev/null | \
        timeout 5 python3 -c "
import sys, json
data = sys.stdin.read().strip()
if not data:
    print('missing')
    sys.exit()
for line in data.split('\n'):
    if not line: continue
    try:
        svc = json.loads(line)
        state = svc.get('State', '').lower()
        health = svc.get('Health', '').lower()
        if state != 'running':
            print('stopped')
        elif 'unhealthy' in health:
            print('unhealthy')
        elif 'healthy' in health:
            print('healthy')
        else:
            print('running')
    except:
        print('unknown')
" 2>/dev/null || echo "unknown")
    echo "${status}"
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
        local all_ok=true
        local status_line=""

        for svc in "${REQUIRED_SERVICES[@]}"; do
            local svc_status
            svc_status=$(check_service_status "${svc}")
            status_line="${status_line} ${svc}=${svc_status}"

            if [[ "${svc_status}" == "unhealthy" || "${svc_status}" == "stopped" || "${svc_status}" == "missing" ]]; then
                all_ok=false
            elif [[ "${svc_status}" != "healthy" && "${svc_status}" != "running" ]]; then
                all_ok=false
            fi
        done

        if ${all_ok}; then
            all_healthy=true
            break
        fi

        sleep 5
        elapsed=$((elapsed + 5))
        echo -ne "\r  [${elapsed}s/${max_wait}s]${status_line}"
    done
    echo ""

    if ${all_healthy}; then
        ok "All services are running!"
    else
        warn "Health check timed out after ${max_wait}s. Service status:"
        for svc in "${REQUIRED_SERVICES[@]}"; do
            local svc_status
            svc_status=$(check_service_status "${svc}")
            if [[ "${svc_status}" != "healthy" && "${svc_status}" != "running" ]]; then
                err "  ${svc}: ${svc_status}"
            else
                ok "  ${svc}: ${svc_status}"
            fi
        done
        warn "To rollback, run: ./scripts/deploy_prod.sh --rollback"
        warn "To check logs:    docker compose -f ${COMPOSE_FILE} logs <service-name>"
    fi

    # Log deployment
    echo "$(date -Iseconds) deployed ${tag} from $(hostname)" >> "${DEPLOY_LOG}"
}

# ------------------------------------------------------------------------------
# Post-deploy validation
# ------------------------------------------------------------------------------
post_deploy_validation() {
    info "Running post-deploy validation ..."
    local validation_passed=true

    # Test frontend HTTP response
    info "Checking frontend (http://localhost:3006/) ..."
    if curl -sf --max-time 10 http://localhost:3006/ >/dev/null 2>&1; then
        ok "Frontend is responding with HTTP 200"
    else
        warn "Frontend is not responding on http://localhost:3006/"
        warn "  This may be expected if frontend is only exposed via reverse proxy."
        validation_passed=false
    fi

    # Test backend health endpoint
    info "Checking backend health (http://localhost:8002/health/healthz) ..."
    if curl -sf --max-time 10 http://localhost:8002/health/healthz >/dev/null 2>&1; then
        ok "Backend health endpoint is responding"
    else
        warn "Backend health endpoint is not responding on http://localhost:8002/health/healthz"
        warn "  This may be expected if ports are only exposed within Docker network."
        validation_passed=false
    fi

    if ! ${validation_passed}; then
        warn "Post-deploy validation had warnings. Services may still be healthy inside Docker."
        warn "Check container-level health: docker compose -f ${COMPOSE_FILE} ps"
        warn "To rollback if needed:        ./scripts/deploy_prod.sh --rollback"
    else
        ok "Post-deploy validation passed"
    fi
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

    # Pre-flight checks
    preflight_checks

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

    # Post-deploy validation
    post_deploy_validation

    echo ""
    ok "=== Deployment complete ==="
    echo ""

    # Send Discord notification
    if [[ -f "${REPO_ROOT}/scripts/notify_discord.sh" ]]; then
        info "Sending Discord notification ..."
        bash "${REPO_ROOT}/scripts/notify_discord.sh" deploy "${tag}" "success" || true
    fi
    echo ""

    # Show final status
    docker compose -f "${COMPOSE_FILE}" ps
    echo ""
    info "Logs: docker compose -f ${COMPOSE_FILE} logs -f"
}

main "$@"
