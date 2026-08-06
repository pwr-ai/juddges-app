# Deterministic Route Contract E2E Design

## Goal

Gate pull requests with one Chromium-only production test that proves dynamic
pages preserve exact HTTP, authentication, method, and upstream failure
contracts without real credentials or external services.

## Architecture

The gate builds Next.js once with both public service URLs pointing at a local
loopback adapter. Before Playwright starts, a preparation script copies
`public/` and `.next/static/` into Next's standalone output. A dedicated
Playwright config then starts that adapter and the generated
`.next/standalone/frontend/server.js`, selects only
`tests/route-contract-e2e`, uses one worker with no retries, and blocks service
workers. This keeps the test independent of the real-auth setup and prevents
the application service worker from manufacturing a false-positive 503.

The adapter implements only the Supabase auth/REST and backend endpoints used by
the selected route matrix. Scenario IDs and synthetic session cookies select
the response deterministically. A control endpoint resets and returns a
sanitized request log, so every status attributed to an upstream response must
also prove the exact upstream method/path and call count. The adapter binds only
to `127.0.0.1` and never reads repository secrets.

## Contract Matrix

| Area | Request | Expected wire result | Additional proof |
|---|---|---:|---|
| Dynamic owner pages | authenticated known chat, collection, document, schema, extraction | 200 | route-specific response content and exactly one matching adapter read |
| Dynamic missing pages | authenticated chat, collection, document, schema, extraction misses | 404 | route-specific adapter read, not a generic Next miss |
| Upstream preservation | authenticated extraction scenarios returning 404, 422, 429, 503 | same status | exactly one matching adapter call |
| Unknown route | authenticated `GET /__route-contract-missing` | 404 | zero domain adapter reads |
| Unknown method | authenticated `POST` and `DELETE` to extraction detail | 405 and exact `Allow` | zero domain adapter reads |
| Anonymous page | protected dynamic page without a cookie | 307 to `/auth/login` with exact `next` | no domain adapter read |
| Anonymous BFF | extraction BFF without a cookie | 401 JSON; HEAD has an empty body | no domain adapter read |
| Invalid session | protected page/BFF with the invalid synthetic session | 307 / 401 | auth adapter called, no domain read |
| Auth outage | protected page/BFF with the outage synthetic session | 503 | auth adapter called, zero domain reads |

Playwright request context uses `maxRedirects: 0` whenever the wire redirect or
method response is under test. Browser navigation is retained for dynamic page
responses and asserts both the main-resource status and final URL. Expected 404
and 503 cases cannot pass merely because Next has no handler or a network is
down: adapter logs and response content are part of the assertion.

## Files

- `frontend/tests/route-contract-e2e/stub-services.mjs`: loopback Supabase/backend adapter, scenario fixtures, readiness/control endpoints, sanitized request log.
- `frontend/tests/route-contract-e2e/route-status.spec.ts`: exact browser and HTTP contract matrix.
- `frontend/playwright.route-contract.config.ts`: isolated single-project lifecycle and safety settings.
- `frontend/scripts/prepare-route-contract-standalone.mjs`: stages static and public assets beside the generated standalone server.
- `frontend/tests/unit/test-harness/route-contract-harness.test.ts`: locks the standalone and lint lifecycle in a focused Jest contract.
- `frontend/package.json`: explicit preparation, standalone start, lint, and test commands for the route-contract project.
- `.github/workflows/ci.yml`: a bounded PR job that installs, builds with loopback URLs, runs the project, and uploads diagnostics on failure.

## CI Lifecycle

The job runs in the repository-pinned Playwright image, installs with `npm ci`,
builds with fixed loopback public URLs, stages the standalone runtime through
the npm pre-script, and then executes the dedicated test script. Playwright
owns both web servers and terminates them on completion. The checked-in harness
sources are part of `npm run validate`. The job has a hard timeout and uploads
the Playwright report, test results, and sanitized adapter/server logs on
failure. The existing UI smoke job and manual full browser matrix remain
unchanged.

## Non-goals

- No real Supabase user or `TEST_USER_*` secret.
- No multi-browser coverage.
- No browser request interception for middleware or server component fetches.
- No replacement of the deeper production Jest contracts.
