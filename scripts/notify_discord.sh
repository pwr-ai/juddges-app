#!/usr/bin/env bash
# ==============================================================================
# notify_discord.sh
# Send Discord webhook notifications for build and deploy events
#
# Usage:
#   ./scripts/notify_discord.sh build <version> [release_notes_file]
#   ./scripts/notify_discord.sh deploy <version> [success|failure]
#
# Requires DISCORD_WEBHOOK_URL in .env or already set in the environment.
# Fails gracefully (warning only) if the webhook URL is missing or the
# request does not succeed, so it never blocks a build or deploy.
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ------------------------------------------------------------------------------
# Color output (same style as build_and_push_prod.sh / deploy_prod.sh)
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
# Load DISCORD_WEBHOOK_URL from .env if not already in the environment.
# Returns 1 (gracefully) if the URL cannot be found.
# ------------------------------------------------------------------------------
load_webhook_url() {
    if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
        return 0
    fi

    local env_file="${REPO_ROOT}/.env"
    if [[ -f "${env_file}" ]]; then
        # Extract the value without sourcing the whole file (avoids side-effects
        # for variables that may not be safe to export in all contexts).
        DISCORD_WEBHOOK_URL=$(grep '^DISCORD_WEBHOOK_URL=' "${env_file}" \
            | head -1 \
            | cut -d'=' -f2- \
            | tr -d '"' \
            | tr -d "'")
    fi

    if [[ -z "${DISCORD_WEBHOOK_URL:-}" ]]; then
        warn "DISCORD_WEBHOOK_URL not set — skipping Discord notification"
        return 1
    fi
    return 0
}

# ------------------------------------------------------------------------------
# Strip markdown headers, blockquotes, leading underscores, and blank lines
# from a release notes file, then return the first N characters.
# ------------------------------------------------------------------------------
extract_release_summary() {
    local file="$1"
    local max_chars="${2:-500}"

    if [[ ! -f "${file}" ]]; then
        echo "No release notes available."
        return
    fi

    sed '/^#/d; /^>/d; /^_/d; /^$/d' "${file}" \
        | head -20 \
        | cut -c1-"${max_chars}"
}

# ------------------------------------------------------------------------------
# Escape a string for safe embedding inside a JSON double-quoted value.
# Uses python3 when available; falls back to a sed-based approximation.
# ------------------------------------------------------------------------------
json_escape() {
    local raw="$1"
    if command -v python3 &>/dev/null; then
        # json.dumps adds surrounding quotes; strip them off.
        printf '%s' "${raw}" \
            | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()), end='')" \
            | sed 's/^"//; s/"$//'
    else
        # Minimal escaping: backslash, double-quote, and control characters.
        printf '%s' "${raw}" \
            | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g' \
            | tr -d '\r' \
            | awk '{printf "%s\\n", $0}' \
            | sed 's/\\n$//'
    fi
}

# ------------------------------------------------------------------------------
# POST a JSON payload to the Discord webhook.
# Prints a warning (but does not exit) on non-2xx responses.
# ------------------------------------------------------------------------------
send_discord() {
    local payload="$1"
    local http_code

    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -d "${payload}" \
        "${DISCORD_WEBHOOK_URL}")

    if [[ "${http_code}" == "204" || "${http_code}" == "200" ]]; then
        ok "Discord notification sent (HTTP ${http_code})"
    else
        warn "Discord webhook returned HTTP ${http_code} — notification may not have been delivered"
    fi
}

# ------------------------------------------------------------------------------
# Build notification
# Color 3066993 = #2ECC71 (green)
# ------------------------------------------------------------------------------
notify_build() {
    local version="$1"
    local notes_file="${2:-}"

    local git_sha git_branch docker_user description timestamp

    git_sha=$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    git_branch=$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo "unknown")
    docker_user="${DOCKER_USERNAME:-unknown}"
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [[ -n "${notes_file}" && -f "${notes_file}" ]]; then
        description=$(extract_release_summary "${notes_file}" 500)
    else
        description="Build successful."
    fi
    description=$(json_escape "${description}")

    info "Sending build notification for prod-v${version} ..."

    # jq produces the cleanest output when available; otherwise fall back to a
    # printf-based heredoc which is safe for the values we embed here.
    local payload
    if command -v jq &>/dev/null; then
        payload=$(jq -n \
            --arg title    "🏗️  Juddges v${version} — Build Complete" \
            --arg desc     "${description}" \
            --arg version  "prod-v${version}" \
            --arg branch   "${git_branch}" \
            --arg sha      "${git_sha}" \
            --arg fe_image "${docker_user}/juddges-frontend:${version}" \
            --arg be_image "${docker_user}/juddges-backend:${version}" \
            --arg footer   "Juddges CI • $(hostname)" \
            --arg ts       "${timestamp}" \
            '{
              embeds: [{
                title:       $title,
                color:       3066993,
                description: $desc,
                fields: [
                  {name: "Version",        value: ("`" + $version  + "`"), inline: true},
                  {name: "Branch",         value: ("`" + $branch   + "`"), inline: true},
                  {name: "Commit",         value: ("`" + $sha      + "`"), inline: true},
                  {name: "Frontend Image", value: ("`" + $fe_image + "`"), inline: false},
                  {name: "Backend Image",  value: ("`" + $be_image + "`"), inline: false}
                ],
                footer:    {text: $footer},
                timestamp: $ts
              }]
            }')
    else
        payload=$(printf '{
  "embeds": [{
    "title": "🏗️  Juddges v%s — Build Complete",
    "color": 3066993,
    "description": "%s",
    "fields": [
      {"name": "Version",        "value": "`prod-v%s`",                          "inline": true},
      {"name": "Branch",         "value": "`%s`",                                "inline": true},
      {"name": "Commit",         "value": "`%s`",                                "inline": true},
      {"name": "Frontend Image", "value": "`%s/juddges-frontend:%s`",            "inline": false},
      {"name": "Backend Image",  "value": "`%s/juddges-backend:%s`",             "inline": false}
    ],
    "footer":    {"text": "Juddges CI • %s"},
    "timestamp": "%s"
  }]
}' \
            "${version}" \
            "${description}" \
            "${version}" \
            "${git_branch}" \
            "${git_sha}" \
            "${docker_user}" "${version}" \
            "${docker_user}" "${version}" \
            "$(hostname)" \
            "${timestamp}")
    fi

    send_discord "${payload}"
}

# ------------------------------------------------------------------------------
# Deploy notification
# Color 3447003 = #3498DB (blue, success)  |  15158332 = #E74C3C (red, failure)
# ------------------------------------------------------------------------------
notify_deploy() {
    local version="$1"
    local status="${2:-success}"

    local timestamp app_url color title

    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    app_url="${NEXT_PUBLIC_APP_URL:-Not configured}"

    if [[ "${status}" == "success" ]]; then
        color=3447003
        title="🚀  Juddges v${version} — Deployed to Production"
    else
        color=15158332
        title="❌  Juddges v${version} — Deployment Failed"
    fi

    info "Sending deploy notification for prod-v${version} (${status}) ..."

    local payload
    if command -v jq &>/dev/null; then
        payload=$(jq -n \
            --arg title   "${title}" \
            --argjson color "${color}" \
            --arg version "${version}" \
            --arg status  "${status}" \
            --arg server  "$(hostname)" \
            --arg url     "${app_url}" \
            --arg footer  "Juddges Deploy" \
            --arg ts      "${timestamp}" \
            '{
              embeds: [{
                title:  $title,
                color:  $color,
                fields: [
                  {name: "Version", value: ("`prod-v" + $version + "`"), inline: true},
                  {name: "Status",  value: $status,                      inline: true},
                  {name: "Server",  value: ("`" + $server + "`"),        inline: true},
                  {name: "App URL", value: $url,                         inline: false}
                ],
                footer:    {text: $footer},
                timestamp: $ts
              }]
            }')
    else
        payload=$(printf '{
  "embeds": [{
    "title": "%s",
    "color": %s,
    "fields": [
      {"name": "Version", "value": "`prod-v%s`", "inline": true},
      {"name": "Status",  "value": "%s",         "inline": true},
      {"name": "Server",  "value": "`%s`",       "inline": true},
      {"name": "App URL", "value": "%s",         "inline": false}
    ],
    "footer":    {"text": "Juddges Deploy"},
    "timestamp": "%s"
  }]
}' \
            "${title}" \
            "${color}" \
            "${version}" \
            "${status}" \
            "$(hostname)" \
            "${app_url}" \
            "${timestamp}")
    fi

    send_discord "${payload}"
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
    local event="${1:-}"
    local version="${2:-}"

    if [[ -z "${event}" || -z "${version}" ]]; then
        err "Usage: $0 <build|deploy> <version> [notes_file|success|failure]"
        exit 1
    fi

    # Attempt to load the webhook URL; exit 0 (gracefully) if unavailable so
    # callers are never blocked by a missing notification channel.
    load_webhook_url || exit 0

    case "${event}" in
        build)
            notify_build "${version}" "${3:-}"
            ;;
        deploy)
            notify_deploy "${version}" "${3:-success}"
            ;;
        *)
            err "Unknown event '${event}'. Valid values: build, deploy."
            exit 1
            ;;
    esac
}

main "$@"
