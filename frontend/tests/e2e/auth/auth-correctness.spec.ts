/**
 * Auth correctness regressions — two independent contracts that the
 * mock-based suite cannot observe:
 *
 *   5a — An UNCONFIRMED Supabase user (created via the admin API with
 *        `email_confirm: false`) cannot sign in via the password form.
 *        Today the canonical TEST_USER_EMAIL is email-confirmed, so the
 *        mock-based and real-auth specs both happily walk past this
 *        guard. We mint a fresh unconfirmed user, drive the form, and
 *        verify the form blocks the login (URL stays on /auth/login,
 *        an alert is rendered, and NO `sb-*-auth-token` cookie lands
 *        on the BrowserContext). The user is torn down in `afterAll`
 *        whether the test passes or fails.
 *
 *   5b — The OAuth/SSO callback handler at `app/auth/callback/route.ts`
 *        carries a `sanitizeNextPath` helper that ONLY allows in-app
 *        relative redirects (string starts with `/`, not `//`). We
 *        smoke that contract end-to-end via `request.get()` with
 *        `maxRedirects: 0` so we can inspect the `Location` header
 *        without following it. For each `next=` value, we assert the
 *        target is on the SAME ORIGIN as the request — never an
 *        attacker-controlled host. The fact that `code=fake` will
 *        fail the actual code-for-session exchange is fine: the
 *        fallback redirect goes to `/auth/error`, which is still
 *        on-origin, which is the property we care about.
 *
 * Verification command (from frontend/):
 *   E2E_BASE_URL=http://localhost:3007 npx playwright test \
 *     tests/e2e/auth/auth-correctness.spec.ts --project=chromium --reporter=list
 */

import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';

// CI skip guard — see tests/e2e/auth.setup.ts. 5a needs real Supabase admin
// API access to create/delete an unconfirmed user; 5b's open-redirect probes
// require a real Supabase URL behind /auth/callback. Skip the whole spec when
// real credentials are absent.
test.skip(
  !!process.env.CI && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
  'requires real Supabase credentials (TEST_USER_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — not available in default CI',
);

const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;

const ADMIN_URL = process.env.SUPABASE_URL;
const ADMIN_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lenient match: Supabase by default returns "Invalid login credentials"
// for unconfirmed users (no leak of confirmation status). We accept any
// of these patterns as evidence the form blocked the login.
const ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /email.*confirm/i,
  /not.*confirmed/i,
  /please.*verify/i,
  /invalid.*credentials/i,
  /invalid.*login/i,
];

test.describe('5a — unconfirmed user cannot sign in via the form', () => {
  // Use a clean, cookieless context so we observe the post-submit
  // cookie state precisely (the chromium project's storageState would
  // pre-seed a valid session for the canonical TEST_USER and mask the
  // very behavior we want to assert).
  test.use({ storageState: { cookies: [], origins: [] } });

  let adminApi: APIRequestContext | null = null;
  let createdUserId: string | null = null;
  let unconfirmedEmail: string | null = null;
  let unconfirmedPassword: string | null = null;

  test.beforeAll(async () => {
    if (!ADMIN_URL || !ADMIN_KEY) {
      // Skip cleanly per task brief — no creds, no test.
      test.skip(true, 'Supabase admin credentials not available (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    }

    adminApi = await playwrightRequest.newContext({
      baseURL: ADMIN_URL,
      extraHTTPHeaders: {
        apikey: ADMIN_KEY!,
        Authorization: `Bearer ${ADMIN_KEY!}`,
        'Content-Type': 'application/json',
      },
    });

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    unconfirmedEmail = `e2e-unconfirmed-${suffix}@account.com`;
    unconfirmedPassword = 'E2eUnconfirmed!1234';

    const created = await adminApi.post('/auth/v1/admin/users', {
      data: {
        email: unconfirmedEmail,
        password: unconfirmedPassword,
        email_confirm: false,
      },
    });

    if (!created.ok()) {
      const body = await created.text();
      throw new Error(
        `Failed to create unconfirmed test user via Supabase admin API: ` +
          `HTTP ${created.status()} ${body}`,
      );
    }

    const createdJson = (await created.json()) as { id?: string };
    if (!createdJson.id) {
      throw new Error(
        `Supabase admin /auth/v1/admin/users responded without an id: ${JSON.stringify(createdJson)}`,
      );
    }
    createdUserId = createdJson.id;
  });

  test.afterAll(async () => {
    // ALWAYS attempt cleanup, even if the test failed. Wrap in try/catch
    // so a teardown error doesn't mask the real test failure.
    if (adminApi && createdUserId) {
      try {
        const del = await adminApi.delete(`/auth/v1/admin/users/${createdUserId}`);
        if (!del.ok()) {
          // Surface the failure in the test report but don't throw — the
          // real test verdict is what matters here.
          // eslint-disable-next-line no-console
          console.warn(
            `[5a] cleanup: DELETE /auth/v1/admin/users/${createdUserId} returned ` +
              `HTTP ${del.status()} ${await del.text()}`,
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[5a] cleanup: unexpected error deleting user`, err);
      }
    }
    if (adminApi) {
      await adminApi.dispose();
    }
  });

  test('blocks unconfirmed user, leaves URL on /auth/login, no auth cookies set', async ({
    page,
    context,
  }) => {
    if (!unconfirmedEmail || !unconfirmedPassword) {
      test.skip(true, 'unconfirmed user setup did not complete');
      return;
    }

    await page.goto('/auth/login');
    await page.locator('#email').waitFor({ state: 'visible' });

    await page.locator('#email').fill(unconfirmedEmail);
    await page.locator('#password').fill(unconfirmedPassword);

    const submitButton = page.getByRole('button', { name: /^sign in$/i });

    // Click sign-in. Do NOT wait for a successful redirect — we EXPECT
    // the form to surface an inline error and stay put.
    await submitButton.click();

    // Wait until the submit transitions OUT of the "Signing in..." loading
    // state — only then has the supabase call resolved and the form had a
    // chance to render the error alert. The button label flips from
    // "Signing in..." back to "Sign in" when isLoading goes false; we
    // explicitly wait for the loading variant to disappear.
    await expect(
      page.getByRole('button', { name: /signing in/i }),
      'submit button should leave the "Signing in..." loading state once supabase responds',
    ).toHaveCount(0, { timeout: 30_000 });

    // URL must remain on /auth/login. Successful login pushes to '/'.
    await expect(page, 'unconfirmed sign-in must NOT navigate to /').toHaveURL(/\/auth\/login(\?.*)?$/);

    // Now poll for the auth-error alert (the inline `error` block — NOT
    // the email-validation alert). Both render with role=alert, so we
    // distinguish by content: the auth error alert has non-empty text
    // matching one of our accepted patterns. We use `expect.poll` so the
    // assertion auto-retries while React renders the error state.
    await expect
      .poll(
        async () => {
          const alerts = page.getByRole('alert');
          const texts = await alerts.allTextContents();
          return texts.map((t) => t.trim()).filter(Boolean).join(' | ');
        },
        {
          message:
            `expected an auth-error alert with text matching one of ` +
            `${ERROR_PATTERNS.map(String).join(', ')}`,
          timeout: 15_000,
        },
      )
      .toMatch(new RegExp(ERROR_PATTERNS.map((re) => re.source).join('|'), 'i'));

    // No `sb-*-auth-token` cookie should be present on the context.
    const cookies = await context.cookies();
    const authCookies = cookies.filter((c) => AUTH_COOKIE_RE.test(c.name));
    expect(
      authCookies.length,
      `unconfirmed login must NOT mint sb-*-auth-token cookies; ` +
        `found: ${authCookies.map((c) => c.name).join(', ') || '(none)'}`,
    ).toBe(0);
  });
});

test.describe('5b — open-redirect sanitizer rejects external/protocol-relative `next` params', () => {
  // Cookieless context — we're not exercising the auth state, just the
  // redirect contract on /auth/callback.
  test.use({ storageState: { cookies: [], origins: [] } });

  // Target origin is whatever Playwright's baseURL resolves to (set via
  // E2E_BASE_URL=http://localhost:3007 on the verification command).
  // We pull it dynamically rather than hardcoding so the spec stays
  // valid in CI and other environments.
  const cases: ReadonlyArray<{ name: string; nextParam: string; attackerHost?: string }> = [
    {
      name: 'protocol-relative URL (//evil.com)',
      nextParam: '//evil.com',
      attackerHost: 'evil.com',
    },
    {
      name: 'absolute attacker URL (https://attacker.example)',
      nextParam: 'https://attacker.example',
      attackerHost: 'attacker.example',
    },
    {
      name: 'in-app relative path (/search)',
      nextParam: '/search',
    },
    {
      name: 'javascript: pseudo-URL',
      nextParam: 'javascript:alert(1)',
    },
  ];

  for (const { name, nextParam, attackerHost } of cases) {
    test(`sanitizer keeps redirect on-origin for next=${name}`, async ({ request, baseURL }) => {
      expect(baseURL, 'playwright baseURL must be set').toBeDefined();

      // `code=fake` will not exchange successfully — that's intentional.
      // We only care that the redirect target is on-origin in EVERY case.
      const url = `/auth/callback?code=fake&next=${encodeURIComponent(nextParam)}`;
      const res = await request.get(url, { maxRedirects: 0 });

      const status = res.status();
      const location = res.headers()['location'];

      // The route always returns a redirect — either to the sanitized
      // `next` (which falls through to /auth/error after a fake-code
      // exchange failure), or directly to /auth/error. We accept any
      // 3xx with a Location header. If a future refactor returns a 200
      // (e.g. renders an error page in-place) WITHOUT navigating
      // off-origin, that's also safe; we adapt the assertion.
      const isRedirect = status >= 300 && status < 400;

      if (isRedirect) {
        expect(
          location,
          `next=${nextParam} produced ${status} without a Location header`,
        ).toBeDefined();

        // Why we don't compare against baseURL.origin: when the dev
        // server runs inside a docker container and is exposed via
        // a different external port (e.g. internal :3000, external
        // :3007), `new URL(request.url).origin` inside the route handler
        // resolves to the INTERNAL origin. The redirect Location is
        // therefore on the internal origin, NOT on Playwright's
        // baseURL. That difference is benign — it's still on-origin
        // from the perspective of anyone who hits the route handler.
        //
        // What we actually need to assert:
        //   1. The Location host is NOT the attacker-supplied host.
        //   2. The Location host is `localhost` (or the same host as
        //      the request — which for Playwright's `request` fixture
        //      bound to baseURL is `localhost`).
        //   3. The path is on-origin (i.e. starts with `/`, not `//`,
        //      and isn't an absolute attacker URL).
        const target = new URL(location!, baseURL!);

        if (attackerHost) {
          expect(
            target.hostname,
            `next=${nextParam} leaked the attacker host into the redirect target: ${location}`,
          ).not.toBe(attackerHost);

          // Defense-in-depth: the attacker host string must not appear
          // anywhere in the Location header (catches encoded variants).
          expect(
            (location ?? '').toLowerCase(),
            `next=${nextParam} produced a Location that contains the attacker host substring: ${location}`,
          ).not.toContain(attackerHost.toLowerCase());
        }

        // Same-host check: the redirect must point back at the same
        // host the request originated from (localhost in dev/test).
        const requestHostname = new URL(baseURL!).hostname;
        expect(
          target.hostname,
          `next=${nextParam} produced a redirect to a different host: ${location} ` +
            `(expected hostname ${requestHostname})`,
        ).toBe(requestHostname);

        // Path sanity: must be on-origin (start with single `/`, not
        // `//` which would be protocol-relative inside a Location
        // header — covered by the host check above, but cheap to
        // double-pin).
        expect(
          target.pathname.startsWith('/') && !target.pathname.startsWith('//'),
          `next=${nextParam} produced off-origin path: ${target.pathname}`,
        ).toBe(true);

        // Happy-path: when next=/search, the path should be either
        // /search itself (if the implementation ever exchanges the
        // code successfully under the dev key) or /auth/error (the
        // realistic outcome for code=fake). Both are on-origin —
        // that's the property we care about.
        if (nextParam === '/search') {
          expect(
            target.pathname,
            `next=/search should resolve to an on-origin path; got ${target.pathname}`,
          ).toMatch(/^(\/search|\/auth\/error)/);
        }
      } else {
        // Non-redirect outcomes are acceptable IF nothing in the body
        // navigates the browser off-origin. We don't have JS-eval here
        // (we used `request`, not `page`), so a 2xx/4xx with no Location
        // is definitionally on-origin. Just sanity-check we didn't get
        // a redirect we missed.
        expect(
          location,
          `non-3xx response (${status}) for next=${nextParam} unexpectedly carried Location: ${location}`,
        ).toBeUndefined();
      }
    });
  }
});
