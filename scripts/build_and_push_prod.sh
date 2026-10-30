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
#   ./scripts/build_and_push_prod.sh --yes patch   # Non-interactive (skip confirmations)
#   ./scripts/build_and_push_prod.sh -y minor      # Short form
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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

IMAGES=(
    "frontend:frontend"       # <service-dir>:<image-suffix>
    "backend:backend"         # backend image (also used by backend-worker)
)

# Pinned uv for re-locking backend/uv.lock after the version bump. Keep the uv
# version in step with backend/Dockerfile and the CI setup-uv steps.
UV_IMAGE="ghcr.io/astral-sh/uv:0.13.1-python3.12-trixie-slim"

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
# Set `version` in the [project] table of a pyproject.toml. Anchored to that
# table: other tables may carry a `version = ...` key of their own. Fails if
# the table has no version line, rather than committing an unchanged file.
# ------------------------------------------------------------------------------
set_pyproject_version() {
    local pyproject="$1"
    local version="$2"
    local updated

    updated=$(awk -v v="${version}" '
        /^\[/ { in_project = ($0 == "[project]") }
        in_project && !done && /^version[[:space:]]*=/ {
            print "version = \"" v "\""
            done = 1
            next
        }
        { print }
        END { exit done ? 0 : 1 }
    ' "${pyproject}") || {
        err "No version key in the [project] table of ${pyproject}"
        exit 1
    }
    # Write in place (not mv) so the file keeps its mode and inode.
    printf '%s\n' "${updated}" > "${pyproject}"
}

# ------------------------------------------------------------------------------
# Re-lock backend/uv.lock with the pinned uv, in a container: Python tooling
# never runs on the host. Same uv as backend/Dockerfile and CI.
# ------------------------------------------------------------------------------
lock_backend() {
    docker run --rm \
        -u "$(id -u):$(id -g)" \
        -e HOME=/tmp \
        -e UV_CACHE_DIR=/tmp/uv-cache \
        -e UV_PYTHON_DOWNLOADS=never \
        -v "${REPO_ROOT}/backend:/work" \
        -w /work \
        "${UV_IMAGE}" \
        uv lock
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

    # 2. backend/pyproject.toml ([project] version) + backend/uv.lock
    local pyproject="${REPO_ROOT}/backend/pyproject.toml"
    if [[ -f "${pyproject}" ]]; then
        set_pyproject_version "${pyproject}" "${version}"
        ok "  backend/pyproject.toml"
        # uv.lock records the root project's version, so CI's
        # `uv sync --locked` fails until it is re-locked. `uv lock` without
        # --upgrade keeps every dependency pin as it is.
        lock_backend
        ok "  backend/uv.lock"
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
    else
        build_args=(--build-arg "APP_VERSION=${version}")
    fi

    docker build \
        --target production \
        "${build_args[@]}" \
        --tag "${full_image}:${version}" \
        --tag "${full_image}:latest" \
        --file "${build_context}/Dockerfile" \
        "${build_context}"

    ok "Built ${full_image}:${version}"

    # ------------------------------------------------------------------------
    # Smoke-test the freshly built image BEFORE pushing it. Broken images
    # must never reach Docker Hub. Currently only the backend image has a
    # /health endpoint to smoke-test against; frontend smoke-testing would
    # require a running backend stub.
    # ------------------------------------------------------------------------
    if [[ "${image_suffix}" == "backend" ]]; then
        info "Smoke-testing ${full_image}:${version} before push ..."
        if ! "${SCRIPT_DIR}/smoke_test_images.sh" "${version}"; then
            err "Smoke test failed for ${full_image}:${version} — aborting push."
            exit 1
        fi
        ok "Smoke test passed for ${full_image}:${version}"
    fi

    info "Pushing ${full_image}:${version} ..."
    docker push "${full_image}:${version}"
    docker push "${full_image}:latest"
    ok "Pushed ${full_image}:${version} and :latest"
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
    local bump_arg=""
    local notes_file=""
    local auto_confirm=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -y|--yes)
                auto_confirm=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS] [patch|minor|major|x.y.z]"
                echo ""
                echo "Options:"
                echo "  -y, --yes   Skip all confirmation prompts (non-interactive mode)"
                echo "  -h, --help  Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0                  # Interactive, auto-increment patch"
                echo "  $0 minor            # Interactive, increment minor"
                echo "  $0 --yes patch      # Non-interactive, increment patch"
                echo "  $0 -y 2.1.0         # Non-interactive, explicit version"
                exit 0
                ;;
            *)
                bump_arg="$1"
                shift
                ;;
        esac
    done

    bump_arg="${bump_arg:-patch}"

    info "=== Juddges Production Build & Push ==="
    echo ""

    # Ensure we're releasing exactly what is on origin/main. Images are built
    # from the release commit, so HEAD must be origin/main's tip: building
    # anything else would ship code main never had, or tag a commit main
    # cannot reach.
    cd "${REPO_ROOT}"

    info "Fetching origin/main and tags ..."
    git fetch --quiet --tags origin main

    if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
        err "HEAD is not origin/main. Release from an up-to-date main:"
        err "  git switch main && git pull --ff-only"
        exit 1
    fi

    if [[ -n "$(git status --porcelain)" ]]; then
        err "Working tree has uncommitted changes; the release commit would not match the images."
        exit 1
    fi

    # Resolve version
    local current_version
    current_version=$(get_latest_version)
    local new_version
    new_version=$(resolve_version "${bump_arg}")

    if git rev-parse -q --verify "refs/tags/prod-v${new_version}" >/dev/null; then
        err "Tag prod-v${new_version} already exists."
        exit 1
    fi

    info "Current version: prod-v${current_version}"
    info "New version:     prod-v${new_version}"
    echo ""

    # Confirm
    if [[ "${auto_confirm}" != true ]]; then
        info "This pushes the release commit to main, then builds and pushes the"
        info "images, then pushes tag prod-v${new_version}."
        read -rp "Proceed with release prod-v${new_version}? [y/N] " confirm
        if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
            info "Aborted."
            exit 0
        fi
    else
        ok "Auto-confirmed: proceeding with release prod-v${new_version}"
    fi
    echo ""

    # Load .env for build args, Docker credentials, and OpenAI release notes
    load_env

    # Fail on Docker credentials now, not after the release commit is public.
    ensure_docker_login

    # Sync version across project files
    sync_version "${new_version}"

    notes_file="${REPO_ROOT}/release-notes/prod-v${new_version}.md"
    generate_release_notes "${new_version}" "${notes_file}"
    echo ""

    # Commit and push the release commit BEFORE building. Image builds take
    # minutes, and main moves under them; pushing first claims main while it
    # is still the commit we checked, so a rejected push aborts the release
    # before any image reaches Docker Hub.
    info "Committing version files ..."
    git add \
        "${REPO_ROOT}/VERSION" \
        "${REPO_ROOT}/backend/pyproject.toml" \
        "${REPO_ROOT}/backend/uv.lock" \
        "${REPO_ROOT}/frontend/package.json" \
        "${REPO_ROOT}/.env.example" \
        "${notes_file}"
    if git diff --cached --quiet; then
        # Rerun after a failed build: main already carries this version.
        info "Version files already at ${new_version}; building from HEAD."
    else
        git commit -m "release: prod-v${new_version}"

        info "Pushing release commit to main ..."
        if ! git push origin HEAD:main; then
            err "Push to main was rejected: main moved after the fetch above."
            git reset --keep HEAD~1
            err "Release commit undone locally; nothing was built or pushed."
            err "Pull and run the release again: git pull --ff-only && $0 ${bump_arg}"
            exit 1
        fi
        ok "Pushed release commit $(git rev-parse --short HEAD) to main"
    fi
    echo ""

    # Build and push each image from the release commit
    for entry in "${IMAGES[@]}"; do
        IFS=':' read -r context_dir image_suffix <<< "${entry}"
        build_and_push "${context_dir}" "${image_suffix}" "${new_version}"
        echo ""
    done

    # Tag last: prod-v<version> is the source of truth for releases, so it only
    # appears once its images are on Docker Hub. If a build fails above, main
    # carries the version bump without a tag; rerun with the explicit version
    # (`$0 ${new_version}`) to build and tag it.
    info "Creating git tag prod-v${new_version} ..."
    git tag -a "prod-v${new_version}" -F "${notes_file}"
    git push origin "prod-v${new_version}"
    ok "Created and pushed tag prod-v${new_version}"

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
