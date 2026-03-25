#!/usr/bin/env bash
# ==============================================================================
# build_and_push_prod.sh
# Build production Docker images, tag with semantic version, push to Docker Hub
#
# Usage:
#   ./scripts/build_and_push_prod.sh              # Auto-increment patch (0.1.0 -> 0.1.1)
#   ./scripts/build_and_push_prod.sh patch         # Same as above
#   ./scripts/build_and_push_prod.sh minor         # Increment minor (0.1.1 -> 0.2.0)
#   ./scripts/build_and_push_prod.sh major         # Increment major (0.2.0 -> 1.0.0)
#   ./scripts/build_and_push_prod.sh 2.1.0         # Use explicit version
#
# Tags are created with 'prod-v' prefix (e.g., prod-v1.2.0) following
# the Gitflow Docker Workflow convention.
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration (DOCKER_USERNAME and DOCKER_TOKEN loaded from .env)
# ------------------------------------------------------------------------------
PROJECT="juddges"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

IMAGES=(
    "frontend:frontend"       # <service-dir>:<image-suffix>
    "backend:backend"         # backend image (also used by backend-worker)
)

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
# Ensure Docker Hub login (uses DOCKER_USERNAME / DOCKER_TOKEN from .env)
# ------------------------------------------------------------------------------
ensure_docker_login() {
    if [[ -z "${DOCKER_USERNAME:-}" ]]; then
        err "DOCKER_USERNAME not set in .env"
        exit 1
    fi
    if [[ -z "${DOCKER_TOKEN:-}" ]]; then
        err "DOCKER_TOKEN not set in .env"
        exit 1
    fi

    DOCKER_HUB_USER="${DOCKER_USERNAME}"

    if docker info 2>/dev/null | grep -q "Username: ${DOCKER_HUB_USER}"; then
        ok "Already logged in to Docker Hub as ${DOCKER_HUB_USER}"
    else
        info "Logging in to Docker Hub as ${DOCKER_HUB_USER} ..."
        echo "${DOCKER_TOKEN}" | docker login -u "${DOCKER_HUB_USER}" --password-stdin
        ok "Logged in to Docker Hub"
    fi
}

# ------------------------------------------------------------------------------
# Get latest version from git tags
# ------------------------------------------------------------------------------
get_latest_version() {
    local latest
    latest=$(git -C "${REPO_ROOT}" tag --list 'prod-v*' --sort=-v:refname | head -1 | sed 's/^prod-v//')
    if [[ -z "${latest}" ]]; then
        # Fallback: check legacy v* tags for migration
        latest=$(git -C "${REPO_ROOT}" tag --list 'v*' --sort=-v:refname | head -1 | sed 's/^v//')
    fi
    if [[ -z "${latest}" ]]; then
        echo "0.0.0"
    else
        echo "${latest}"
    fi
}

# ------------------------------------------------------------------------------
# Increment semantic version
# ------------------------------------------------------------------------------
increment_version() {
    local version="$1"
    local part="${2:-patch}"

    local major minor patch
    IFS='.' read -r major minor patch <<< "${version}"

    case "${part}" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            err "Unknown version part: ${part}. Use major, minor, or patch."
            exit 1
            ;;
    esac

    echo "${major}.${minor}.${patch}"
}

# ------------------------------------------------------------------------------
# Resolve next version
# ------------------------------------------------------------------------------
resolve_version() {
    local arg="${1:-patch}"
    local current
    current=$(get_latest_version)

    # Check if arg is an explicit version (x.y.z format)
    if [[ "${arg}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "${arg}"
    else
        increment_version "${current}" "${arg}"
    fi
}

# ------------------------------------------------------------------------------
# Sync version across project files
# ------------------------------------------------------------------------------
sync_version() {
    local version="$1"

    info "Syncing version ${version} across project files ..."

    # 1. VERSION file (plain text)
    echo "${version}" > "${REPO_ROOT}/VERSION"
    ok "  VERSION"

    # 2. backend/pyproject.toml
    local pyproject="${REPO_ROOT}/backend/pyproject.toml"
    if [[ -f "${pyproject}" ]]; then
        sed -i "s/^version = \".*\"/version = \"${version}\"/" "${pyproject}"
        ok "  backend/pyproject.toml"
    else
        warn "  backend/pyproject.toml not found, skipping"
    fi

    # 3. frontend/package.json
    local pkg_json="${REPO_ROOT}/frontend/package.json"
    if [[ -f "${pkg_json}" ]]; then
        sed -i "s/\"version\": \".*\"/\"version\": \"${version}\"/" "${pkg_json}"
        ok "  frontend/package.json"
    else
        warn "  frontend/package.json not found, skipping"
    fi

    # 4. .env.example — update or add JUDDGES_IMAGE_TAG line
    local env_example="${REPO_ROOT}/.env.example"
    if [[ -f "${env_example}" ]]; then
        if grep -q "^# JUDDGES_IMAGE_TAG=" "${env_example}"; then
            sed -i "s/^# JUDDGES_IMAGE_TAG=.*/# JUDDGES_IMAGE_TAG=${version}/" "${env_example}"
        elif grep -q "^JUDDGES_IMAGE_TAG=" "${env_example}"; then
            sed -i "s/^JUDDGES_IMAGE_TAG=.*/JUDDGES_IMAGE_TAG=${version}/" "${env_example}"
        fi
        ok "  .env.example"
    fi

    echo ""
}

# ------------------------------------------------------------------------------
# Load .env for frontend build args
# ------------------------------------------------------------------------------
load_env() {
    local env_file="${REPO_ROOT}/.env"
    if [[ -f "${env_file}" ]]; then
        info "Loading build args from .env"
        set -a
        # shellcheck disable=SC1090
        source "${env_file}"
        set +a
    else
        err ".env file not found at ${env_file}"
        err "Copy .env.example to .env and fill in values."
        exit 1
    fi
}

# ------------------------------------------------------------------------------
# Generate release notes with OpenAI
# ------------------------------------------------------------------------------
generate_release_notes() {
    local version="$1"
    local output_file="$2"

    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
        err "OPENAI_API_KEY not set in .env"
        err "It is required for automatic release note generation."
        exit 1
    fi

    info "Generating release notes for prod-v${version} ..."
    python3 "${REPO_ROOT}/scripts/generate_release_notes.py" \
        --version "${version}" \
        --output "${output_file}"
    ok "Release notes saved to ${output_file}"
}

# ------------------------------------------------------------------------------
# Build and push a single image
# ------------------------------------------------------------------------------
build_and_push() {
    local context_dir="$1"
    local image_suffix="$2"
    local version="$3"

    local full_image="${DOCKER_HUB_USER}/${PROJECT}-${image_suffix}"
    local build_context="${REPO_ROOT}/${context_dir}"

    info "Building ${full_image}:${version} ..."

    local build_args=()
    if [[ "${context_dir}" == "frontend" ]]; then
        build_args=(
            --build-arg "NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-}"
            --build-arg "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-}"
            --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
        )
    fi

    docker build \
        --target production \
        "${build_args[@]}" \
        --tag "${full_image}:${version}" \
        --tag "${full_image}:latest" \
        --file "${build_context}/Dockerfile" \
        "${build_context}"

    ok "Built ${full_image}:${version}"

    info "Pushing ${full_image}:${version} ..."
    docker push "${full_image}:${version}"
    docker push "${full_image}:latest"
    ok "Pushed ${full_image}:${version} and :latest"
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
    local bump_arg="${1:-patch}"
    local notes_file=""

    info "=== Juddges Production Build & Push ==="
    echo ""

    # Ensure we're in a clean git state
    cd "${REPO_ROOT}"

    if [[ -n "$(git status --porcelain)" ]]; then
        warn "Working tree has uncommitted changes."
        warn "The version tag will be created on the current HEAD anyway."
        echo ""
    fi

    # Resolve version
    local current_version
    current_version=$(get_latest_version)
    local new_version
    new_version=$(resolve_version "${bump_arg}")

    info "Current version: prod-v${current_version}"
    info "New version:     prod-v${new_version}"
    echo ""

    # Confirm
    read -rp "Proceed with build and push prod-v${new_version}? [y/N] " confirm
    if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
        info "Aborted."
        exit 0
    fi
    echo ""

    # Load .env for build args, Docker credentials, and OpenAI release notes
    load_env

    # Sync version across project files
    sync_version "${new_version}"

    # Login to Docker Hub
    ensure_docker_login

    # Build and push each image
    for entry in "${IMAGES[@]}"; do
        IFS=':' read -r context_dir image_suffix <<< "${entry}"
        build_and_push "${context_dir}" "${image_suffix}" "${new_version}"
        echo ""
    done

    notes_file="${REPO_ROOT}/release-notes/prod-v${new_version}.md"
    generate_release_notes "${new_version}" "${notes_file}"
    echo ""

    # Commit version-synced files
    info "Committing version files ..."
    git add \
        "${REPO_ROOT}/VERSION" \
        "${REPO_ROOT}/backend/pyproject.toml" \
        "${REPO_ROOT}/frontend/package.json" \
        "${REPO_ROOT}/.env.example" \
        "${notes_file}"
    git commit -m "release: prod-v${new_version}" || warn "Nothing to commit (files already up to date)"

    # Create git tag
    info "Creating git tag prod-v${new_version} ..."
    git tag -a "prod-v${new_version}" -F "${notes_file}"
    ok "Created tag prod-v${new_version}"

    # Push commit and tag to remote
    read -rp "Push commit and tag prod-v${new_version} to origin? [y/N] " push_tag
    if [[ "${push_tag}" == "y" || "${push_tag}" == "Y" ]]; then
        git push origin HEAD
        git push origin "prod-v${new_version}"
        ok "Pushed commit and tag prod-v${new_version} to origin"
    fi

    # Send Discord notification
    if [[ -f "${REPO_ROOT}/scripts/notify_discord.sh" ]]; then
        info "Sending Discord notification ..."
        bash "${REPO_ROOT}/scripts/notify_discord.sh" build "${new_version}" "${notes_file}" || true
    fi
    echo ""
    ok "=== Build complete ==="
    echo ""
    info "Images pushed:"
    for entry in "${IMAGES[@]}"; do
        IFS=':' read -r _ image_suffix <<< "${entry}"
        echo "  ${DOCKER_HUB_USER}/${PROJECT}-${image_suffix}:${new_version}"
        echo "  ${DOCKER_HUB_USER}/${PROJECT}-${image_suffix}:latest"
    done
    echo ""
    info "Release notes:"
    echo "  ${notes_file}"
    echo ""
    info "Deploy on production host with:"
    echo "  ./scripts/deploy_prod.sh ${new_version}"
    echo "  # or"
    echo "  ./scripts/deploy_prod.sh          # uses :latest"
}

main "$@"
