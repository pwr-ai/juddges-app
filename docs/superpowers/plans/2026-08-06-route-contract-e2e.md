# Route Contract E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic Chromium-only pull-request gate for exact dynamic route HTTP contracts.

**Architecture:** Build the production frontend against one loopback adapter that emulates the required Supabase and backend calls. Run a dedicated single-worker Playwright project with synthetic sessions, exact status assertions, upstream call-count proof, blocked service workers, and bounded CI lifecycle.

**Tech Stack:** Next.js 15, Playwright 1.62, Node HTTP server, GitHub Actions.

---

### Task 1: Isolated Chromium project and adapter contract

**Files:**
- Create: `frontend/playwright.route-contract.config.ts`
- Create: `frontend/tests/route-contract-e2e/stub-services.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: Write the failing project discovery check**

Run before creating the config:

```bash
cd frontend
CI=1 npx playwright test --config=playwright.route-contract.config.ts --list
```

Expected: FAIL because the dedicated config does not exist.

- [ ] **Step 2: Create the isolated config**

Define exactly one project named `chromium-route-contract`, matching only
`tests/route-contract-e2e/**/*.spec.ts`, with `workers: 1`, `fullyParallel:
false`, `retries: 0`, `serviceWorkers: "block"`, and base URL
`http://127.0.0.1:3006`. Configure two Playwright-owned web servers:

```ts
webServer: [
  {
    command: "node tests/route-contract-e2e/stub-services.mjs",
    url: "http://127.0.0.1:4311/__route-contract/ready",
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  {
    command: "npm start",
    url: "http://127.0.0.1:3006/__route-contract-ready",
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
]
```

Use a real public route for the Next readiness probe if the named sentinel does
not exist; readiness must only detect liveness and must not be an asserted test
case.

- [ ] **Step 3: Implement the minimal loopback adapter**

Bind to `127.0.0.1:4311`, reject unexpected hosts/methods, and implement:

```js
GET  /__route-contract/ready     -> 200
POST /__route-contract/reset     -> 204 and clear request log
GET  /__route-contract/requests  -> 200 JSON sanitized request log
GET  /auth/v1/user               -> user, invalid-session 401, or outage 503
GET  /rest/v1/chats              -> owner row or empty result
GET  required collection/document/schema/extraction backend paths
```

Scenario IDs must return deterministic 200/404/422/429/503 responses. Log only
method and parsed pathname/query; never log cookies or Authorization headers.
Exit non-zero on bind errors and close cleanly on SIGTERM/SIGINT.

- [ ] **Step 4: Add the explicit npm command**

Add:

```json
"test:e2e:route-contract": "playwright test --config=playwright.route-contract.config.ts --max-failures=1"
```

- [ ] **Step 5: Verify project discovery and adapter readiness**

Run:

```bash
cd frontend
CI=1 npx playwright test --config=playwright.route-contract.config.ts --list
node tests/route-contract-e2e/stub-services.mjs
```

Expected: the list contains only `chromium-route-contract`; the adapter starts
on loopback and its readiness endpoint returns 200. Stop the adapter and verify
no process remains.

- [ ] **Step 6: Commit the infrastructure**

```bash
git add frontend/playwright.route-contract.config.ts frontend/tests/route-contract-e2e/stub-services.mjs frontend/package.json
git commit -m "test(routes): add isolated chromium harness" -m "Refs #411"
```

### Task 2: Exact route and upstream status matrix

**Files:**
- Create: `frontend/tests/route-contract-e2e/route-status.spec.ts`
- Modify: `frontend/tests/route-contract-e2e/stub-services.mjs`

- [ ] **Step 1: Write the exact failing matrix**

Create serial tests for the matrix in the design. Use helpers with explicit
signatures:

```ts
async function resetAdapter(request: APIRequestContext): Promise<void>;
async function adapterRequests(request: APIRequestContext): Promise<AdapterRequest[]>;
async function setSyntheticSession(context: BrowserContext, mode: "valid" | "invalid" | "outage"): Promise<void>;
async function expectWireStatus(request: APIRequestContext, method: string, path: string, status: number): Promise<APIResponse>;
```

For page cases, call `page.goto` and compare `response.status()` with strict
equality. For redirects and methods, call `request.fetch` with `maxRedirects:
0`. Assert exact `Location`, `Allow`, JSON/content type, empty HEAD bodies, final
browser URL, adapter method/path, and call count. Assert zero domain reads for
anonymous, invalid-session, auth-outage, unknown-route, and unsupported-method
cases.

- [ ] **Step 2: Run against the production build to verify failure**

Run:

```bash
cd frontend
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4311 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=route-contract-anon \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4311 \
API_BASE_URL=http://127.0.0.1:4311 \
BACKEND_API_KEY=route-contract-backend-key npm run build
CI=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4311 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=route-contract-anon \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4311 \
API_BASE_URL=http://127.0.0.1:4311 \
BACKEND_API_KEY=route-contract-backend-key npm run test:e2e:route-contract
```

Expected: initial failures identify the missing adapter endpoints or mismatched
fixtures; a generic Next 404 must not satisfy a dynamic missing test because
the adapter-call assertion also fails.

- [ ] **Step 3: Complete only the adapter fixtures required by failures**

Add exact route patterns and payloads based on the existing production contract
fixtures in chat, collections, documents, schemas, and extractions. Preserve
the extraction upstream mapping `404 -> 404`, `422 -> 422`, `429 -> 429`, and
`503 -> 503`; do not generalize this behavior to document or schema routes.

- [ ] **Step 4: Re-run until the full matrix passes**

Run the command from Step 2. Expected: all route-contract tests PASS with one
Chromium project, one worker, zero retries, and no skipped tests.

- [ ] **Step 5: Commit the matrix**

```bash
git add frontend/tests/route-contract-e2e/route-status.spec.ts frontend/tests/route-contract-e2e/stub-services.mjs
git commit -m "test(routes): assert exact production statuses" -m "Refs #411"
```

### Task 3: Pull-request CI gate and diagnostics

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a failing workflow assertion to the review checklist**

Before editing, verify that no current PR job runs the command:

```bash
rg -n "test:e2e:route-contract|Frontend Route Contract" .github/workflows/ci.yml
```

Expected: no matches.

- [ ] **Step 2: Add the bounded dedicated job**

Add `frontend-route-contract` for pull requests and manual dispatch. Use the
pinned `mcr.microsoft.com/playwright:v1.62.1-jammy` image, Node 24, `npm ci`, a
single production build with all service URLs set to `http://127.0.0.1:4311`,
then `npm run test:e2e:route-contract` with the same runtime environment. Set
`timeout-minutes: 12`. Do not use real credentials or depend on the broad
authenticated Playwright setup.

- [ ] **Step 3: Upload actionable failure evidence**

On failure, upload `frontend/playwright-report/`, `frontend/test-results/`, and
the sanitized adapter/Next logs emitted by the dedicated config. Retain them
for 14 days. Ensure artifact upload itself still runs when the test step fails.

- [ ] **Step 4: Validate workflow and frontend gates**

Run:

```bash
cd frontend
npm run validate
npm run typecheck
npm test -- --runInBand --coverage=false
CI=1 npx playwright test --config=playwright.route-contract.config.ts --list
cd ..
git diff --check
```

Expected: validation, typecheck, 2438-or-more unit tests, project discovery, and
diff check PASS. Confirm the route project has no setup dependency, no skipped
tests, no external URL, no service worker, one worker, and zero retries.

- [ ] **Step 5: Commit CI and design documents**

```bash
git add .github/workflows/ci.yml
git add -f docs/superpowers/specs/2026-08-06-route-contract-e2e-design.md docs/superpowers/plans/2026-08-06-route-contract-e2e.md
git commit -m "test(ci): gate route contracts on pull requests" -m "Refs #411"
```

### Task 4: Review, PR, and merge readiness

**Files:**
- Review all files changed from `origin/main`.

- [ ] **Step 1: Self-review scope and safety**

Run `git diff --check origin/main...HEAD`, inspect every changed file, verify no
generated build/report/log artifact is tracked, and verify the worktree is
clean.

- [ ] **Step 2: Obtain two independent reviews**

First obtain spec/security approval for every #411 acceptance item. Only after
that passes, obtain code-quality approval for process lifecycle, isolation,
status false positives, and CI behavior. Fix every finding with a new commit
and re-run the affected review.

- [ ] **Step 3: Push and open the PR**

Push `test/411-route-contract-e2e` and open a PR to `main` titled
`test(routes): gate route-contract E2E on pull requests`, with `Closes #411`,
the exact matrix, local verification, and safety notes. Do not include tool or
co-author attribution.

- [ ] **Step 4: Verify live CI**

Wait for all required checks, including `Frontend Route Contract (Chromium)`.
If a check fails, inspect the actual job log, fix the root cause in a new
commit, repeat both reviews for the delta, and wait for the replacement run.
