---
name: frontend-verify
description: Verify a frontend change before finishing — production build, the PR-gated route-contract Playwright suite, a click-through of the changed flow on the dev server via the playwright MCP, and seal the evidence marker the Stop hook checks. Use after any edit under frontend/ that changes what a user sees or clicks, or when the Stop hook says "frontend/ changed without fresh verification evidence".
---

# frontend-verify

The `Stop` hook (`.claude/settings.json` → `scripts/verify-frontend-evidence.sh --check`)
refuses to end a turn while `frontend/` differs from `origin/main` and no marker
matches the current diff hash. This skill produces that marker honestly. Do the
steps in order; do not write the marker by hand.

## 1. Seal the route-contract evidence

```bash
bash scripts/verify-frontend-evidence.sh --record
```

Builds `frontend/` with the CI route-contract env and runs
`npm run test:e2e:route-contract` (the stub + standalone server start by
themselves). Writes `frontend/test-results/.last-verify.json` **only if the suite
is green**, bound to the sha256 of the current `frontend/` diff. Any later edit
under `frontend/` invalidates it — run `--record` again after the last edit.

If it fails: fix the regression or extend `tests/route-contract-e2e/` — never
skip or loosen an assertion to get the marker.

## 2. Click through the changed flow

With the dev server up (`cd frontend && npm run dev`, `:3026`), drive the
flow you changed using the `playwright` MCP tools (`browser_navigate`,
`browser_snapshot`, `browser_click`, …). Read roles and names from the
accessibility snapshot; assert what a user would see. Note any surprise in
the PR description. This step is evidence, not a gate — the hook only checks
step 1.

## 3. Report

State in the reply: `--record` sealed `<sha>`, route-contract N passed, and
what was clicked through. If a flow must stay green on every PR and has no
spec yet, add one in `frontend/tests/route-contract-e2e/` before finishing.

## Escape hatch

`SKIP_FRONTEND_VERIFY=1` in the session env disables the hook. Use it only
for sessions that cannot run the suite (no `node_modules`, docs-only
hotfix) and say so in the reply.
