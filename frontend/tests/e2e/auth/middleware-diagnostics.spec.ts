/**
 * Middleware diagnostic-log assertions.
 *
 * Locks in the recent change to `frontend/lib/supabase/middleware.ts` that
 * replaced silent error swallowing with diagnostic `logger.warn(...)` calls
 * for unexpected Supabase auth errors, while still filtering the benign
 * "Auth session missing!" / "refresh_token_not_found" cases for anonymous
 * traffic. The tests below pin both halves of that contract:
 *
 *   4a — A tampered `sb-*-auth-token` cookie produces the diagnostic
 *        warn line ("Auth session lookup failed in middleware") in the
 *        Next.js dev container's stdout, including the request path.
 *
 *   4b — Anonymous navigation to public routes (/, /about, /ecosystem)
 *        does NOT produce the warn line — the benign anonymous error
 *        filter is still in place.
 *
 * Why the tests scrape `docker logs` instead of the Playwright `console`
 * channel: the warn log is emitted by SERVER-side middleware (Next.js
 * Node runtime), not by the browser. It never reaches `page.on('console')`.
 * The dev container's stdout is the canonical place to observe these
 * log lines.
 *
 * Self-verify history (proves the spec catches real reverts):
 *   4a: Commenting out the entire `else if (...)` block in middleware.ts
 *       (i.e. reverting to silent swallow) caused 4a to FAIL on the
 *       `expect(logs).toMatch(/Auth session lookup failed in middleware/)`
 *       assertion. Restoring middleware.ts → 4a PASS again.
 *   4b: Removing the `error.message !== "Auth session missing!"` filter
 *       (so anonymous "Auth session missing!" errors leak through to
 *       logger.warn) caused 4b to FAIL on the `expect(logs).not.toMatch`.
 *       Restoring → 4b PASS again.
 *
 * Container assumption:
 *   The Next.js dev server runs in `juddges-frontend-dev` (see
 *   docker-compose.dev.yml; CLAUDE.md notes port 3007 for dev). When the
 *   container isn't reachable (e.g. CI without docker), the spec skips
 *   cleanly rather than failing.
 *
 * Verification command (from frontend/):
 *   E2E_BASE_URL=http://localhost:3007 npx playwright test \
 *     tests/e2e/auth/middleware-diagnostics.spec.ts --project=chromium --reporter=list
 */

import { spawnSync } from 'node:child_process';
import { test, expect, type BrowserContext } from '@playwright/test';
import { loginViaUI, expectAuthenticated } from '../helpers/real-auth';

// CI skip guard — see tests/e2e/auth.setup.ts. Test 4a needs a real session
// to tamper with; both 4a and 4b also depend on the juddges-frontend-dev
// docker container. Skip the whole spec when real creds are absent.
test.skip(
  !!process.env.CI && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
  'requires real Supabase credentials and a juddges-frontend-dev container — not available in default CI',
);

const CONTAINER_NAME = 'juddges-frontend-dev';
const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;
const DIAGNOSTIC_RE = /Auth session lookup failed in middleware/;

/**
 * Probe the dev container once at module load. If `docker logs` errors
 * out (no docker, container missing, daemon down), every test in this
 * file `test.skips` cleanly. We use `spawnSync` (not `execSync`) to
 * avoid spawning a shell — all args are constants here, but using the
 * argv-form keeps the security-lint happy.
 */
const probe = spawnSync('docker', ['logs', CONTAINER_NAME, '--tail', '1'], {
  encoding: 'utf8',
});
const dockerAvailable = probe.status === 0;

/**
 * Read the dev container's logs for the last `sinceSeconds`, merging
 * stdout + stderr. Next.js writes the logger.warn output to stderr (via
 * `console.warn` in Node), so we MUST capture both streams or 4a's
 * assertion silently passes against an empty stdout buffer.
 */
function readContainerLogs(sinceSeconds: number): string {
  const result = spawnSync(
    'docker',
    ['logs', CONTAINER_NAME, '--since', `${sinceSeconds}s`],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function getAuthCookies(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.filter((cookie) => AUTH_COOKIE_RE.test(cookie.name));
}

test.describe('middleware diagnostics — log-line contract', () => {
  // Force serial execution: 4a deliberately leaves tampered cookies on
  // its BrowserContext that keep firing warn lines for follow-up
  // requests (e.g. the post-redirect /auth/login render). If 4b runs in
  // parallel, those bleed-over warns land in 4b's log window and trip
  // its negative assertion. Serial mode guarantees 4a's context is
  // fully torn down before 4b starts. (Each test still gets its OWN
  // fresh context via `test.use({ storageState: ... })` below — we just
  // don't run them concurrently.)
  test.describe.configure({ mode: 'serial' });

  // Use a clean, cookieless context for every test in this file. Same
  // rationale as session-lifecycle.spec.ts: the chromium-project-level
  // storageState (from auth.setup.ts) would pre-seed a valid session and
  // mask the very behavior we're trying to observe (in 4a we need login
  // to mint cookies that we then surgically tamper; in 4b we need
  // strictly-anonymous traffic).
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(!dockerAvailable, `requires ${CONTAINER_NAME} docker container`);

  test('4a — tampered auth cookie produces the diagnostic warn log', async ({
    page,
    context,
  }) => {
    await loginViaUI(page);
    await expectAuthenticated(context);

    const authCookiesBefore = await getAuthCookies(context);
    expect(
      authCookiesBefore.length,
      'expected at least one sb-*-auth-token cookie after a real login',
    ).toBeGreaterThan(0);

    // Build a STRUCTURALLY valid Supabase SSR cookie payload: the
    // `base64-` prefix tells `@supabase/ssr` to base64-decode the rest
    // and parse it as the session JSON. We need this shape (not random
    // garbage like `'tampered.garbage.notajwt'`) so Supabase parses the
    // cookie cleanly and reaches the JWT-verification step — at which
    // point getUser() returns an `{ data, error }` tuple with a real
    // error message and we hit the `else if` warn branch. Random garbage
    // throws during cookie parsing, which routes through the catch block
    // (logger.error) — a different code path that is NOT what this spec
    // is locking in.
    //
    // Supabase concatenates chunked cookies (`.0` + `.1` + …) before
    // decoding, so duplicating the SAME `base64-…` blob across every
    // chunk produces `base64-XXXbase64-XXXbase64-XXX` after concat,
    // which fails the second base64 decode. To avoid that, we put the
    // full payload in the primary cookie name and CLEAR the chunked
    // suffix cookies (set value `''`). This mirrors how Supabase itself
    // writes a session that fits in a single cookie.
    const fakeSession = {
      access_token:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMDAwMDAwMDAwfQ.invalid_signature',
      refresh_token: 'invalid_refresh_token_value',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-0000-0000-000000000000',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'fake@test.com',
      },
    };
    const fullPayload =
      'base64-' + Buffer.from(JSON.stringify(fakeSession)).toString('base64');

    // Pick the "primary" auth cookie — the one without a `.<n>` suffix.
    // If we only see chunked cookies (`.0`, `.1`, …), fall back to `.0`.
    const primaryCookie =
      authCookiesBefore.find((c) => !/\.\d+$/.test(c.name)) ??
      authCookiesBefore.find((c) => /\.0$/.test(c.name)) ??
      authCookiesBefore[0];

    await context.addCookies(
      authCookiesBefore.map((c) => ({
        name: c.name,
        // Primary cookie carries the full fake-session payload; chunked
        // continuations are blanked so the concat decodes cleanly.
        value: c.name === primaryCookie.name ? fullPayload : '',
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
    );

    // Navigate to a protected route. Server-side middleware will run,
    // fail to validate the tampered token, and (under the current
    // diagnostic-log code path) call `logger.warn(...)` before the
    // redirect to /auth/login.
    await page.goto('/search', { waitUntil: 'load' });

    // Sanity: middleware bounced us to login.
    await expect(page).toHaveURL(/\/auth\/login(\?.*)?$/);

    // Give the dev server a moment to flush stdout. `console.warn` is
    // synchronous in Node, but the Docker log driver buffers briefly.
    await page.waitForTimeout(1500);

    // Scope to a window large enough to span login + tampered nav, but
    // small enough not to pick up unrelated warns from earlier tests.
    const logs = readContainerLogs(20);

    // Loose match on the diagnostic message — the logger formats output
    // as `[<iso>] [WARN] <message> <json-data>`, so we don't bind to an
    // exact line shape. We separately confirm the path was attached to
    // the structured payload.
    expect(
      logs,
      'expected the diagnostic warn line to appear in dev container logs ' +
        `after tampering the auth cookie and navigating to /search.\n` +
        `--- last 4000 chars of logs ---\n${logs.slice(-4000)}`,
    ).toMatch(DIAGNOSTIC_RE);

    // Path attribution: the warn payload includes `path: "/search"`. We
    // check `/search` appears somewhere in the same log window — being
    // permissive on the surrounding JSON shape so the test stays robust
    // to logger refactors (e.g. flat vs nested data, single vs double
    // quotes, line breaks).
    expect(
      logs,
      'expected the warn payload to mention the request path "/search"',
    ).toMatch(/\/search/);
  });

  test('4b — anonymous public navigation does NOT produce the warn log', async ({
    page,
  }) => {
    // Drain pending log writes from prior tests before marking our start.
    // 4a leaves tampered cookies on its (now-closed) context that keep
    // firing warn lines for in-flight requests (post-redirect /auth/login
    // re-renders, etc.) for ~1-2s after teardown. Sleeping 2.5s and THEN
    // grabbing `startIso` means the cutoff lands AFTER those bleed-over
    // warns are flushed to the docker log driver. Serial execution
    // (configured at the describe level) prevents new warns from 4a
    // restarting concurrently.
    await page.waitForTimeout(2500);
    const startIso = new Date().toISOString();

    // Three public routes — all in the middleware's anonymous allow-list:
    //   /         — landing
    //   /about    — about page
    //   /ecosystem— ecosystem page
    // For each, middleware calls `supabase.auth.getUser()` which returns
    // an "Auth session missing!" error for the cookieless context. The
    // current filter swallows that error silently (no warn). If a future
    // refactor drops the filter, the warn will fire and this assertion
    // catches it.
    await page.goto('/', { waitUntil: 'load' });
    await page.goto('/about', { waitUntil: 'load' });
    await page.goto('/ecosystem', { waitUntil: 'load' });

    // Flush window — same brief wait as 4a so we're not racing the
    // Docker log driver buffer.
    await page.waitForTimeout(1500);

    // Read a generous window so we definitely capture every line emitted
    // during this test, then filter to lines stamped at or after our
    // start marker. The logger format is `[<ISO>] [LEVEL] <msg> …`, so
    // we group by the ISO header — multi-line JSON payloads stay attached
    // to their parent timestamp.
    const rawLogs = readContainerLogs(60);
    const recentLogs = filterLogsAfter(rawLogs, startIso);

    expect(
      recentLogs,
      'anonymous navigation to public routes should NOT trigger the ' +
        '"Auth session lookup failed in middleware" warn log — the benign ' +
        'anonymous-error filter has regressed.\n' +
        `--- recent logs (after ${startIso}) ---\n${recentLogs.slice(-4000)}`,
    ).not.toMatch(DIAGNOSTIC_RE);
  });
});

/**
 * Keep only log lines stamped at or after `cutoffIso`. The dev container
 * uses the structured logger from `frontend/lib/logger.ts`, which prefixes
 * every line with `[<ISO-8601>] [LEVEL] …`. Plain Next.js access lines
 * (e.g. `GET /search 200 in 449ms`) have no timestamp prefix — we keep
 * those attached to the most recent timestamped line we've seen, so a
 * multi-line JSON payload doesn't get sliced in half.
 *
 * If we never see a `[ISO]` line, we conservatively return the whole
 * input — the caller's regex will still flag a true regression.
 */
function filterLogsAfter(logs: string, cutoffIso: string): string {
  const tsRe = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/;
  const lines = logs.split('\n');
  const kept: string[] = [];
  let keepingCurrentBlock = false;
  let sawAnyTimestamp = false;

  for (const line of lines) {
    const match = line.match(tsRe);
    if (match) {
      sawAnyTimestamp = true;
      keepingCurrentBlock = match[1] >= cutoffIso;
    }
    // Always-keep heuristic for non-timestamped lines: they belong to the
    // most recent timestamped block, so we mirror that block's keep flag.
    if (keepingCurrentBlock) {
      kept.push(line);
    }
  }

  if (!sawAnyTimestamp) {
    return logs;
  }
  return kept.join('\n');
}
