#!/usr/bin/env bash
# ==============================================================================
# deploy_dev.sh
# Development environment (hot reload) for Juddges App
#
# Dev is the "juddges-dev" Compose project and prod is "juddges-app", so dev
# runs next to production on one host without touching its containers. Dev
# images are built locally from the mounted source tree and never pushed.
# Dev shares the production Supabase project, so its writes land in prod data.
#
# Usage:
#   ./scripts/deploy_dev.sh start       Build if needed, start, wait until it answers
#   ./scripts/deploy_dev.sh stop        Stop all dev services
#   ./scripts/deploy_dev.sh restart     Restart all dev services
#   ./scripts/deploy_dev.sh logs        View logs (snapshot)
#   ./scripts/deploy_dev.sh logs-f      Follow logs in real time
#   ./scripts/deploy_dev.sh build       Build images (with cache)
#   ./scripts/deploy_dev.sh rebuild     Build images without cache
#   ./scripts/deploy_dev.sh status      Show container status
#   ./scripts/deploy_dev.sh shell-be    Open shell in backend container
#   ./scripts/deploy_dev.sh shell-fe    Open shell in frontend container
#   ./scripts/deploy_dev.sh test-be     Run backend tests (pytest)
#   ./scripts/deploy_dev.sh test-fe     Run frontend tests (jest)
#   ./scripts/deploy_dev.sh clean       Remove containers and volumes
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="docker-compose.dev.yml"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_PROJECT="juddges-dev"
PROD_PROJECT="juddges-app"

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

# COMPOSE_PROJECT_NAME (from the shell or .env) outranks `name:` in the compose
# file. Pointed at prod, `stop` would tear production down and `clean`
# (`down -v --remove-orphans`) would delete its containers as orphans.
check_project() {
    local project
    project=$(dc config 2>/dev/null | awk '/^name:/ {print $2; exit}')
    if [[ "${project}" != "${DEV_PROJECT}" ]]; then
        err "Dev compose project resolves to '${project:-<config error>}', expected '${DEV_PROJECT}'."
        err "Remove COMPOSE_PROJECT_NAME from your shell and from .env."
        exit 1
    fi
}

# Poll a URL until it answers or the attempts run out.
wait_for_url() {
    local name="$1" url="$2" attempts="$3"
    local i
    for i in $(seq 1 "${attempts}"); do
        if curl -s -o /dev/null --max-time 10 "${url}"; then
            ok "${name} is responding (${url})"
            return 0
        fi
        sleep 5
    done
    warn "${name} not responding yet at ${url}. Check: ./scripts/deploy_dev.sh logs-f"
}

# ------------------------------------------------------------------------------
# Commands
# ------------------------------------------------------------------------------
cmd_start() {
    info "Starting dev environment (project ${DEV_PROJECT}; prod stays in ${PROD_PROJECT}) ..."
    dc up -d --build
    ok "Dev environment started"
    # The backend loads models on start and the first Next.js page compiles on
    # demand, so both can lag behind a container that is already "running".
    wait_for_url "Backend dev" "http://localhost:8004/health/healthz" 24
    wait_for_url "Frontend dev" "http://localhost:3007/" 12
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
    echo "Usage: ./scripts/deploy_dev.sh <command>"
    echo ""
    echo "Commands:"
    echo "  start       Build if needed, start (detached), wait until it answers"
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
        help|-h|--help) ;;
        *) check_project ;;
    esac

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
