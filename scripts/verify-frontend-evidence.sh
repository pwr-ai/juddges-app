#!/usr/bin/env bash
# Evidence gate for frontend changes made by a coding agent (#694).
#
#   --check    Claude Code `Stop` hook. Exit 0 when frontend/ is unchanged or
#              the change was verified; exit 2 (blocks the stop, reason on
#              stderr) when frontend/ changed and no fresh evidence exists.
#   --record   Run the verification (production build with the route-contract
#              env, then the route-contract Playwright suite) and write the
#              marker only if it is green. This is the only writer of the marker.
#   --hash     Print the current frontend diff hash (what --record would seal).
#
# The marker binds the evidence to the exact diff: any later edit under
# frontend/ changes the hash and re-arms the gate. A marker that merely exists
# proves nothing — that is the "passes while testing nothing" failure this repo
# has already had.
#
# Escape hatch: SKIP_FRONTEND_VERIFY=1 disables --check (docs-only sessions,
# hotfixes). Explicit, never the default.
set -euo pipefail

# Anchored to this script's own location, never to the caller's cwd: a hook may
# run from anywhere, and a cwd-derived root outside the repo made every git
# query fail and the gate pass silently.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "frontend-verify: $SCRIPT_DIR is not inside a git repository — cannot evaluate the gate" >&2
  exit 0
fi
MARKER="$ROOT/frontend/test-results/.last-verify.json"   # test-results/ is gitignored
MAX_BLOCKS=3                                             # loop guard per diff hash
SKILL_HINT='run /frontend-verify (or: bash scripts/verify-frontend-evidence.sh --record)'

frontend_hash() {
  # Committed + staged + unstaged changes under frontend/ since the merge base
  # with origin/main, plus the contents of untracked files there. Falls back to
  # HEAD when origin/main is unknown (fresh clone without the remote).
  local base
  base="$(git -C "$ROOT" merge-base origin/main HEAD 2>/dev/null || git -C "$ROOT" rev-parse HEAD)"
  {
    git -C "$ROOT" diff "$base" -- frontend/
    git -C "$ROOT" ls-files --others --exclude-standard -z -- frontend/ \
      | while IFS= read -r -d '' f; do printf '\n--- untracked: %s\n' "$f"; cat "$ROOT/$f"; done
  } | sha256sum | cut -d' ' -f1
}

frontend_changed() {
  local base
  base="$(git -C "$ROOT" merge-base origin/main HEAD 2>/dev/null || git -C "$ROOT" rev-parse HEAD)"
  [ -n "$(git -C "$ROOT" diff --name-only "$base" -- frontend/)" ] ||
    [ -n "$(git -C "$ROOT" ls-files --others --exclude-standard -- frontend/)" ]
}

marker_field() { # $1 = field; empty when the file or field is missing
  [ -f "$MARKER" ] || return 0
  node -e 'try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=m[process.argv[2]];if(v!==undefined&&v!==null)process.stdout.write(String(v))}catch{}' "$MARKER" "$1"
}

write_marker() { # $1 = diffSha, $2 = routeContract, $3 = blocks
  mkdir -p "$(dirname "$MARKER")"
  printf '{"diffSha": "%s", "at": "%s", "routeContract": "%s", "blocks": %s}\n' \
    "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" "$3" > "$MARKER"
}

check() {
  if [ "${SKIP_FRONTEND_VERIFY:-0}" = "1" ]; then
    echo "frontend-verify: skipped (SKIP_FRONTEND_VERIFY=1)" >&2
    exit 0
  fi
  frontend_changed || exit 0
  local now sealed blocks
  now="$(frontend_hash)"
  sealed="$(marker_field diffSha)"
  if [ "$sealed" = "$now" ] && [ "$(marker_field routeContract)" = "pass" ]; then
    exit 0
  fi
  # Loop guard: block at most MAX_BLOCKS times for the same unverified diff,
  # then let the stop through with a loud note rather than trap the session.
  blocks=0
  if [ "$(marker_field blockedSha)" = "$now" ]; then
    blocks="$(marker_field blocks)"; blocks="${blocks:-0}"
  fi
  if [ "$blocks" -ge "$MAX_BLOCKS" ]; then
    echo "frontend-verify: frontend/ changed and still unverified after $MAX_BLOCKS blocks — letting the stop through; the PR must state that no route-contract run was made" >&2
    exit 0
  fi
  mkdir -p "$(dirname "$MARKER")"
  printf '{"diffSha": "%s", "routeContract": "%s", "blockedSha": "%s", "blocks": %s}\n' \
    "$sealed" "$(marker_field routeContract)" "$now" "$((blocks + 1))" > "$MARKER"
  echo "frontend/ changed without fresh verification evidence — $SKILL_HINT before finishing (block $((blocks + 1))/$MAX_BLOCKS)" >&2
  exit 2
}

record() {
  local sha
  sha="$(frontend_hash)"
  cd "$ROOT/frontend"
  export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4311 \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=route-contract-anon \
    NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4311 \
    API_BASE_URL=http://127.0.0.1:4311 \
    BACKEND_API_KEY=route-contract-backend-key \
    NEXT_TELEMETRY_DISABLED=1
  echo "frontend-verify: building (route-contract env) …"
  npm run build
  echo "frontend-verify: running the route-contract suite …"
  if npm run test:e2e:route-contract; then
    if [ "$sha" != "$(frontend_hash)" ]; then
      echo "frontend-verify: frontend/ changed while the suite ran — not sealing; run --record again" >&2
      exit 1
    fi
    write_marker "$sha" pass 0
    echo "frontend-verify: sealed $sha"
  else
    write_marker "$sha" fail 0
    echo "frontend-verify: route-contract suite failed — marker records the failure, gate stays armed" >&2
    exit 1
  fi
}

case "${1:-}" in
  --check) check ;;
  --record) record ;;
  --hash) frontend_hash ;;
  *) echo "usage: $0 --check | --record | --hash" >&2; exit 64 ;;
esac
