#!/usr/bin/env bash
# scripts/merge_pr_when_green.sh
# Keep a PR up to date with main (merge, not rebase) and merge it once the
# required checks are green. Required checks are strict, so another PR landing
# first just triggers one more update-and-wait round.
#
# A required check skipped by its job-level `if:` (the paths filter in ci.yml
# skips the whole suite for a scripts/docs-only PR) counts as passed, the same
# way branch protection treats it.
#
# Usage:
#   ./scripts/merge_pr_when_green.sh 797
#   GH_REPO=pwr-ai/juddges-app ./scripts/merge_pr_when_green.sh 797
#
# Exits 0 once the PR is merged (or no longer open), 1 on a failed/cancelled
# required check or after ~90 minutes.
set -u

n=${1:?usage: $0 <pr-number>}
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
log() { echo "[$(date +%H:%M:%S)] $*"; }

for _ in $(seq 1 270); do  # up to ~90 min
  state=$(gh pr view "$n" -R "$R" --json state -q .state)
  [ "$state" != OPEN ] && { log "#$n is $state"; exit 0; }
  main=$(gh api "repos/$R/git/ref/heads/main" -q .object.sha)
  head=$(gh pr view "$n" -R "$R" --json headRefOid -q .headRefOid)
  behind=$(gh api "repos/$R/compare/$main...$head" -q .behind_by)
  if [ "$behind" != 0 ]; then
    gh pr update-branch "$n" -R "$R" >/dev/null && log "#$n was $behind behind, merged main in"
    sleep 30; continue
  fi
  checks=$(gh pr checks "$n" -R "$R" --required --json bucket \
    -q '[.[].bucket | if . == "skipping" then "pass" else . end] | unique | join(",")' 2>/dev/null)
  case "$checks" in
    pass)
      if gh pr merge "$n" -R "$R" --merge --delete-branch; then log "#$n merged"; exit 0; fi
      log "#$n merge attempt failed, retrying"; sleep 20 ;;
    *fail*|*cancel*)
      log "#$n required checks failed: $checks"; gh pr checks "$n" -R "$R" --required; exit 1 ;;
    *) sleep 20 ;;
  esac
done
log "#$n timed out"; exit 1
