#!/usr/bin/env bash
# ==============================================================================
# docker-dev.sh
# Development environment helper for Juddges App
#
# Usage:
#   ./docker-dev.sh start       Start dev environment
#   ./docker-dev.sh stop        Stop all dev services
#   ./docker-dev.sh restart     Restart all dev services
#   ./docker-dev.sh logs        View logs (snapshot)
#   ./docker-dev.sh logs-f      Follow logs in real time
#   ./docker-dev.sh build       Build images (with cache)
#   ./docker-dev.sh rebuild     Build images without cache
#   ./docker-dev.sh status      Show container status
#   ./docker-dev.sh shell-be    Open shell in backend container
#   ./docker-dev.sh shell-fe    Open shell in frontend container
#   ./docker-dev.sh test-be     Run backend tests (pytest)
#   ./docker-dev.sh test-fe     Run frontend tests (jest)
#   ./docker-dev.sh clean       Remove containers and volumes
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="docker-compose.dev.yml"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Service names (must match docker-compose.dev.yml)
SVC_FRONTEND="frontend-dev"
SVC_BACKEND="backend-dev"
SVC_WORKER="backend-worker-dev"

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
# Compose wrapper
# ------------------------------------------------------------------------------
dc() {
    docker compose -f "${REPO_ROOT}/${COMPOSE_FILE}" "$@"
}

# ------------------------------------------------------------------------------
# Commands
# ------------------------------------------------------------------------------
cmd_start() {
    info "Starting dev environment ..."
    dc up -d
    ok "Dev environment started"
    echo ""
    cmd_status
    echo ""
    info "Frontend:    http://localhost:3007"
    info "Backend API: http://localhost:8004"
    info "API Docs:    http://localhost:8004/docs"
}

cmd_stop() {
    info "Stopping dev environment ..."
    dc down
    ok "Dev environment stopped"
}

cmd_restart() {
    info "Restarting dev environment ..."
    dc restart
    ok "Dev environment restarted"
}

cmd_logs() {
    dc logs --tail=100
}

cmd_logs_f() {
    dc logs -f
}

cmd_build() {
    info "Building dev images (with cache) ..."
    dc build
    ok "Build complete"
}

cmd_rebuild() {
    info "Building dev images (no cache) ..."
    dc build --no-cache
    ok "Rebuild complete"
}

cmd_status() {
    dc ps
}

cmd_shell_be() {
    info "Opening shell in backend container ..."
    dc exec "${SVC_BACKEND}" bash
}

cmd_shell_fe() {
    info "Opening shell in frontend container ..."
    dc exec "${SVC_FRONTEND}" sh
}

cmd_test_be() {
    info "Running backend tests ..."
    dc exec "${SVC_BACKEND}" poetry run pytest "$@"
}

cmd_test_fe() {
    info "Running frontend tests ..."
    dc exec "${SVC_FRONTEND}" npm run test "$@"
}

cmd_clean() {
    warn "This will remove all dev containers AND volumes (cache, node_modules, etc.)"
    read -rp "Continue? [y/N] " confirm
    if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
        info "Aborted."
        return
    fi
    info "Cleaning dev environment ..."
    dc down -v --remove-orphans
    ok "Dev environment cleaned"
}

cmd_help() {
    echo ""
    echo "Usage: ./docker-dev.sh <command>"
    echo ""
    echo "Commands:"
    echo "  start       Start dev environment (detached)"
    echo "  stop        Stop all dev services"
    echo "  restart     Restart all dev services"
    echo "  logs        View logs (last 100 lines)"
    echo "  logs-f      Follow logs in real time"
    echo "  build       Build images (with cache)"
    echo "  rebuild     Build images without cache"
    echo "  status      Show container status"
    echo "  shell-be    Open shell in backend container"
    echo "  shell-fe    Open shell in frontend container"
    echo "  test-be     Run backend tests (pytest)"
    echo "  test-fe     Run frontend tests (jest)"
    echo "  clean       Remove containers and volumes"
    echo "  help        Show this help message"
    echo ""
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
    local cmd="${1:-help}"
    shift 2>/dev/null || true

    case "${cmd}" in
        start)      cmd_start ;;
        stop)       cmd_stop ;;
        restart)    cmd_restart ;;
        logs)       cmd_logs ;;
        logs-f)     cmd_logs_f ;;
        build)      cmd_build ;;
        rebuild)    cmd_rebuild ;;
        status|ps)  cmd_status ;;
        shell-be)   cmd_shell_be ;;
        shell-fe)   cmd_shell_fe ;;
        test-be)    cmd_test_be "$@" ;;
        test-fe)    cmd_test_fe "$@" ;;
        clean)      cmd_clean ;;
        help|-h|--help) cmd_help ;;
        *)
            err "Unknown command: ${cmd}"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
