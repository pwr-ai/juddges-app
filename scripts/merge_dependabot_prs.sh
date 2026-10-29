#!/usr/bin/env bash
# scripts/merge_dependabot_prs.sh
# Merge Dependabot PRs one at a time: wait until the PR is up to date with main
# and its required checks are green, then merge. A merge puts the next PR behind
# main, so it gets an `@dependabot rebase` comment. Pushing to a Dependabot
# branch ourselves would make Dependabot stop managing the PR, so this script
# never runs `gh pr update-branch`.
#
# Skipped required checks count as passed, the same way branch protection
# treats them.
#
# Usage:
#   ./scripts/merge_dependabot_prs.sh 776 777
#   GH_REPO=pwr-ai/juddges-app ./scripts/merge_dependabot_prs.sh 776
#
# Exits 0 once every PR is merged or no longer open, 1 on a failed/cancelled
# required check, a failed merge, or after ~80 minutes on one PR.
set -u

[ $# -ge 1 ] || { echo "usage: $0 <pr-number>..." >&2; exit 2; }
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
log() { echo "[$(date +%H:%M:%S)] $*"; }

behind() {
  local main head
  main=$(gh api "repos/$R/git/ref/heads/main" -q .object.sha)
  head=$(gh pr view "$1" -R "$R" --json headRefOid -q .headRefOid)
  gh api "repos/$R/compare/$main...$head" -q .behind_by
}

asked_at=0  # ask for a rebase straight away on the first PR that is behind
for n in "$@"; do
  for _ in $(seq 1 240); do  # up to ~80 min per PR
    state=$(gh pr view "$n" -R "$R" --json state -q .state)
    if [ "$state" != OPEN ]; then log "#$n is $state, skipping"; continue 2; fi
    b=$(behind "$n")
    if [ "$b" != 0 ]; then
      # Re-ask Dependabot every 15 min if it has not caught up.
      if [ $(( $(date +%s) - asked_at )) -gt 900 ]; then
        gh pr comment "$n" -R "$R" --body "@dependabot rebase" >/dev/null
        asked_at=$(date +%s); log "#$n behind by $b, asked for a rebase"
      fi
      sleep 20; continue
    fi
    checks=$(gh pr checks "$n" -R "$R" --required --json bucket \
      -q '[.[].bucket | if . == "skipping" then "pass" else . end] | unique | join(",")' 2>/dev/null)
    case "$checks" in
      pass)
        if gh pr merge "$n" -R "$R" --merge --delete-branch; then log "#$n merged"; else log "#$n merge failed"; exit 1; fi
        asked_at=0
        continue 2 ;;
      *fail*|*cancel*)
        log "#$n required checks failed: $checks"
        gh pr checks "$n" -R "$R" --required
        exit 1 ;;
      *) sleep 20 ;;
    esac
  done
  log "#$n timed out"; exit 1
done
log "done"
