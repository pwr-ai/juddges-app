/**
 * Middleware route-matrix coverage.
 *
 * Exhaustively exercises the public/protected allow-list enforced by the
 * Supabase auth middleware. Each route in PUBLIC_PAGES / PUBLIC_API /
 * PROTECTED below mirrors the conditions in
 * `frontend/lib/supabase/middleware.ts` (the `if (!user && !startsWith(...))`
 * block around lines 66-83 at the time of writing). If you add or remove
 * a path there, update the matching list below — otherwise this matrix
 * silently drifts out of sync with the real allow-list and stops catching
 * regressions.
 *
 * Test groups:
 *   1. PUBLIC_PAGES, anonymous browser → load without bouncing to /auth/login.
 *   2. PROTECTED, anonymous browser  → redirect to /auth/login.
 *   3. PUBLIC_API, anonymous request → no auth-bounce, no 5xx.
 *   4. PROTECTED, authenticated      → load to themselves (no redirect).
 *
 * Each route is its own `test(...)` so a single allow-list drift fails
 * one specific entry rather than masking failures behind a single test.
 */

import { test, expect } from '@playwright/test';
import { test as authTest } from '../helpers/auth-fixture';

// ---------------------------------------------------------------------------
// Mirrors the allow-list in `frontend/lib/supabase/middleware.ts`.
// If you add a path there, update this list.
// ---------------------------------------------------------------------------
const PUBLIC_PAGES = [
  '/',
  '/about',
  '/ecosystem',
  '/auth/login',
  '/auth/sign-up',
  '/auth/forgot-password',
  '/status',
  '/offline',
] as const;

// Mirrors the allow-list in `frontend/lib/supabase/middleware.ts`.
// If you add a path there, update this list.
const PUBLIC_API = [
  '/api/health',
  '/api/dashboard/stats',
] as const;

// Routes NOT in the middleware allow-list, which therefore require auth.
// Mirrors the allow-list in `frontend/lib/supabase/middleware.ts`.
// If you add a path to the allow-list there, remove it from this list.
const PROTECTED = ['/search', '/chat', '/collections', '/documents'] as const;

/**
 * Escape a string for safe interpolation into a RegExp literal. Used to
 * build the per-URL "page stayed on this path" assertion below.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 1. PUBLIC_PAGES, anonymous browser
// ---------------------------------------------------------------------------
test.describe.parallel('middleware allow-list — public pages, anonymous', () => {
  // Cookie-less context: regardless of any future fixture-level state we
  // pick up, we want this group to test the truly-anonymous path.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const url of PUBLIC_PAGES) {
    test(`GET ${url} loads without bouncing to /auth/login`, async ({ page }) => {
      const response = await page.goto(url, { waitUntil: 'load' });

      // Public routes must NOT be auth-bounced by middleware. The contract
      // we test:
      //   - For URLs OTHER than /auth/login itself: final URL must not be
      //     `/auth/login` (the canonical bounce target).
      //   - For ALL URLs (including the auth-* pages): the final pathname
      //     must still match the requested path. Catches a hypothetical
      //     bounce that goes somewhere unexpected (e.g. to `/`).
      const finalPath = new URL(page.url()).pathname;
      if (url !== '/auth/login') {
        expect(
          finalPath,
          `Public page ${url} was auth-bounced to /auth/login. ` +
            `Middleware allow-list may have drifted.`,
        ).not.toBe('/auth/login');
      }
      expect(
        finalPath === url || finalPath.startsWith(url + '/'),
        `Public page ${url} ended up at ${finalPath} ` +
          `(expected pathname to equal ${url} or start with ${url}/).`,
      ).toBe(true);

      // `page.goto` follows redirects, so the final URL check above is
      // primary. Additionally guard against unexpected 5xx errors that
      // would mask real bugs behind a "didn't redirect to login" pass.
      expect(
        response,
        `Expected a navigation response for public page ${url}`,
      ).not.toBeNull();
      const status = response!.status();
      expect(
        status,
        `Public page ${url} returned ${status}; should be < 500.`,
      ).toBeLessThan(500);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. PROTECTED routes, anonymous browser — must redirect to /auth/login
// ---------------------------------------------------------------------------
test.describe.parallel('middleware allow-list — protected pages, anonymous', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const url of PROTECTED) {
    test(`GET ${url} redirects anonymous user to /auth/login`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'load' });
      // Middleware issues a 307 to /auth/login; Playwright follows the
      // redirect so the final URL is the login page. We assert on the
      // pathname only — middleware preserves search params via
      // `url.clone()`, so a `?next=...` query may be appended in future.
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. PUBLIC_API, anonymous request — must NOT auth-bounce
// ---------------------------------------------------------------------------
test.describe.parallel('middleware allow-list — public API, anonymous', () => {
  for (const url of PUBLIC_API) {
    test(`GET ${url} is not auth-bounced for anonymous caller`, async ({ request }) => {
      const response = await request.get(url, {
        // Don't follow redirects — we want the raw middleware response,
        // not its target.
        maxRedirects: 0,
      });
      const status = response.status();
      const location = response.headers()['location'] ?? '';

      // Contract: middleware does NOT redirect this URL to /auth/login.
      // The endpoint itself may 200 (happy path), 4xx (legitimate input
      // error), or 404 (route not implemented in this build). It must
      // NOT be a 3xx whose Location header points at /auth/login.
      const isAuthBounce =
        status >= 300 && status < 400 && /\/auth\/login/.test(location);
      expect(
        isAuthBounce,
        `Public API ${url} was auth-bounced (status=${status}, location=${location}). ` +
          `Middleware allow-list may have drifted.`,
      ).toBe(false);

      // Also guard against 5xx — those would mask real bugs behind a
      // "no auth-bounce" pass.
      expect(
        status,
        `Public API ${url} returned ${status}; should be < 500.`,
      ).toBeLessThan(500);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. PROTECTED routes, authenticated — must load to themselves
// ---------------------------------------------------------------------------
authTest.describe.parallel(
  'middleware allow-list — protected pages, authenticated',
  () => {
    // Scoped CI skip: the PUBLIC_PAGES / PROTECTED-anonymous / PUBLIC_API
    // blocks above don't need real creds and stay running in CI. Only this
    // describe depends on the real-auth `setup` project's storage state
    // (see tests/e2e/auth.setup.ts). Skip MUST be inside the describe so it
    // doesn't bubble up to a file-level skip that would also skip the
    // anonymous blocks.
    authTest.skip(
      !!process.env.CI && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
      'authenticated route checks require real Supabase credentials — set TEST_USER_EMAIL/TEST_USER_PASSWORD to enable',
    );

    for (const url of PROTECTED) {
      authTest(
        `GET ${url} loads to itself for authenticated user`,
        async ({ authenticatedPage }) => {
          await authenticatedPage.goto(url, { waitUntil: 'load' });

          // Some protected routes may legitimately redirect to a deeper
          // path (e.g. `/documents` → `/documents/<id>` if the app maps
          // the index to a default detail page). Allow either:
          //   - exact: ^<url>(/|?|#|$)
          //   - deeper: ^<url>/...
          // by anchoring on `^[^?#]*<url>` and forbidding /auth/login.
          const pathPattern = new RegExp('^[^?#]*' + escapeRegex(url));
          await expect(authenticatedPage).toHaveURL(pathPattern);
          await expect(authenticatedPage).not.toHaveURL(/\/auth\/login/);
        },
      );
    }
  },
);
