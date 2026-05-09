/**
 * Post-login soft-nav regression spec.
 *
 * Locks in the fix for: after `signInWithPassword` resolved, the form did
 * `router.push('/')` without `router.refresh()`. The RSC cache stayed
 * pre-login, so the very first in-app `<Link>` click to a protected route
 * triggered a soft-nav whose middleware `getUser()` saw no session and
 * bounced the user back to `/auth/login`.
 *
 * The fix in `frontend/components/login-form-enhanced.tsx` is to call
 * `router.refresh()` BEFORE `router.push('/')` so Next invalidates the RSC
 * cache for Server Components and middleware sees the new auth cookies on
 * the next navigation.
 *
 * These tests must use a real UI login (via `loginViaUI`) — NOT the
 * `authenticatedPage` storage-state fixture — for tests 1a and 1b, because
 * the regression lives in the post-login navigation code path itself, not
 * in a pre-loaded session. Test 1c also uses `loginViaUI` for symmetry: a
 * pre-loaded storage state would mask the "appears logged in but no real
 * session" failure mode the test exists to catch.
 *
 * REGRESSION-PROOF EXERCISE (run during implementation, 2026-05-09):
 *   1. With `router.refresh()` present in `login-form-enhanced.tsx`,
 *      all five Task-1 tests pass.
 *   2. Removing `router.refresh()` from `login-form-enhanced.tsx`, waiting
 *      for HMR to apply (verified the file inside the dev container had
 *      `router.push('/')` only, no `refresh()`), and re-running test 1a:
 *      the test STILL passed. In the live Playwright + dev-container
 *      environment we couldn't trigger the middleware-bounce variant of
 *      the bug — `signInWithPassword` sets `sb-*-auth-token` cookies on
 *      the BrowserContext, those cookies travel with the next RSC fetch,
 *      and middleware sees the session. The `router.refresh()` we're
 *      regressing on guards a separate code path (RSC cache freshness on
 *      the post-login `/`) that this end-to-end harness doesn't easily
 *      reach without forcing a stale cache.
 *   3. The line was restored. `git diff frontend/components/login-form-enhanced.tsx`
 *      matches the pre-exercise state.
 *
 * What this spec DOES catch:
 *   - Any regression that lands the user on `/auth/login` after a
 *     successful login (full-page redirect or middleware bounce).
 *   - Auth-context staleness where the navbar still renders the
 *     unauthenticated CTA after login (test 1c).
 *   - Console errors on the post-login navigation path that aren't
 *     pre-tolerated infra noise.
 * What it WOULDN'T catch (open follow-up): a pure RSC-cache-staleness
 * regression where every URL is correct but server-rendered content for
 * `/` is the unauthenticated tree. A Server Component–level assertion
 * would be needed for that, ideally in a future task.
 */

import { test, expect, type Page } from '@playwright/test';
import { loginViaUI } from '../helpers/real-auth';

// CI skip guard — see tests/e2e/auth.setup.ts for context. This whole spec
// performs real form-based login and cannot run with placeholder creds.
test.skip(
  !!process.env.CI && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
  'requires real Supabase credentials — set TEST_USER_EMAIL/TEST_USER_PASSWORD and NEXT_PUBLIC_SUPABASE_URL to enable',
);

/**
 * Routes we want to verify don't bounce after a real login. We only test
 * routes the home page (or its persistent shell — sidebar / footer)
 * actually links to via an `<a href="/...">` anchor; otherwise there's no
 * soft-nav to exercise. Discovery is done dynamically in the test body via
 * `page.locator('a[href="..."]').first()` so that sidebar links from the
 * authenticated dashboard count.
 */
const PROTECTED_ROUTES: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/search', label: 'search' },
  { href: '/chat', label: 'chat' },
  { href: '/collections', label: 'collections' },
  { href: '/documents', label: 'documents' },
];

/**
 * Console messages we deliberately tolerate. The dev backend / Supabase
 * proxies sometimes return 500 / 503 for unrelated dashboard endpoints
 * (e.g. trending topics, recent extractions) — those surface as
 * "Failed to load resource" console errors and have nothing to do with
 * the post-login-nav regression we're guarding. Filtering them keeps the
 * spec focused on auth/navigation regressions and avoids cross-coupling
 * to backend availability.
 */
const TOLERATED_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /Failed to load resource/i,
  /the server responded with a status of (5\d\d)/i,
];

function isToleratedError(text: string): boolean {
  return TOLERATED_ERROR_PATTERNS.some((re) => re.test(text));
}

/**
 * Set up per-test trackers: console errors and the full sequence of URLs
 * the page navigated through. Returns getters for assertions at the end.
 */
function attachNavigationTrace(page: Page): {
  errors: string[];
  navigations: string[];
} {
  const errors: string[] = [];
  const navigations: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isToleratedError(text)) return;
    errors.push(text);
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navigations.push(frame.url());
    }
  });

  return { errors, navigations };
}

/**
 * Returns true if `/auth/login` appears in the navigation trace AFTER the
 * user has reached any post-login URL (i.e. anything that isn't
 * `/auth/login` itself). The login page can legitimately appear multiple
 * times during the login submit (initial load, RSC re-render) — what we're
 * guarding against is a bounce-back to `/auth/login` AFTER the post-login
 * navigation has begun. The bug being regressed: middleware sees no
 * session on the first post-login soft-nav and 302s the user back.
 */
function bouncedToLogin(navigations: string[]): boolean {
  let leftLogin = false;
  for (const url of navigations) {
    const onLogin = /\/auth\/login/.test(url);
    if (!onLogin) {
      leftLogin = true;
      continue;
    }
    if (leftLogin) return true;
  }
  return false;
}

test.describe('post-login soft-nav must not bounce', () => {
  test('1a — login then click <Link> to /search lands on /search (no auth bounce)', async ({
    page,
  }) => {
    const { errors, navigations } = attachNavigationTrace(page);

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });

    // Confirm the authenticated dashboard has hydrated before we click.
    // The "User menu" button only mounts when `user` is non-null in the
    // navbar (see frontend/components/navbar.tsx, the `user ? ...` branch).
    // Without this wait, the click can land on a still-loading shell where
    // the soft-nav handler hasn't taken over yet.
    await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible({
      timeout: 15_000,
    });

    // Discover the first in-app anchor to /search. The authenticated
    // dashboard renders a sidebar with `<Link href="/search">`, plus
    // assorted in-card links / footer links — `.first()` keeps this
    // robust to which of those the dashboard happens to render.
    const searchLink = page.locator('a[href="/search"]').first();
    await expect(searchLink, 'expected at least one in-app anchor to /search').toBeVisible({
      timeout: 10_000,
    });

    // Soft-nav (NOT page.goto) — soft-nav is the failure mode under test.
    // Pair the click with `waitForURL` via `Promise.all` so we don't miss
    // the navigation event between the two awaits. Allow generous time
    // because Turbopack first-render of /search can take >10s in dev.
    await Promise.all([
      page.waitForURL(/\/search(\?.*)?$/, { timeout: 30_000 }),
      searchLink.click(),
    ]);

    await expect(page).toHaveURL(/\/search(\?.*)?$/);
    await expect(page).not.toHaveURL(/\/auth\/login/);

    expect(
      bouncedToLogin(navigations),
      `Mid-flight bounce to /auth/login detected. Navigation trace: ${JSON.stringify(navigations)}`,
    ).toBe(false);

    expect(errors, `Unexpected console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  for (const route of PROTECTED_ROUTES.filter((r) => r.href !== '/search')) {
    test(`1b — login then click <Link> to ${route.href} (skip if no link on /)`, async ({
      page,
    }) => {
      const { errors, navigations } = attachNavigationTrace(page);

      await loginViaUI(page);
      await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });

      // Wait for the authenticated dashboard to hydrate before we click —
      // see rationale on test 1a above.
      await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible({
        timeout: 15_000,
      });

      // Discover whether any anchor to this route is rendered. If none
      // exists, the soft-nav scenario doesn't apply (no link = no click
      // path). Don't fabricate one — skip cleanly so the test matrix
      // stays honest.
      const linkCount = await page.locator(`a[href="${route.href}"]`).count();
      if (linkCount === 0) {
        test.skip(true, `No <a href="${route.href}"> rendered on / — nothing to soft-nav.`);
        return;
      }

      const link = page.locator(`a[href="${route.href}"]`).first();
      await expect(link).toBeVisible({ timeout: 10_000 });

      // Some routes (e.g. /collections) may further redirect; allow a
      // path prefix match. /documents is a list/index page in the app.
      const targetPattern = new RegExp(`${route.href.replace('/', '\\/')}(\\/.*)?(\\?.*)?$`);
      await Promise.all([
        page.waitForURL(targetPattern, { timeout: 30_000 }),
        link.click(),
      ]);

      await expect(page).toHaveURL(targetPattern);
      await expect(page).not.toHaveURL(/\/auth\/login/);

      expect(
        bouncedToLogin(navigations),
        `Mid-flight bounce to /auth/login detected for ${route.href}. ` +
          `Navigation trace: ${JSON.stringify(navigations)}`,
      ).toBe(false);

      expect(errors, `Unexpected console errors: ${errors.join(' | ')}`).toEqual([]);
    });
  }

  test('1c — authenticated UI is rendered after login (user menu visible, no Login button)', async ({
    page,
  }) => {
    const { errors } = attachNavigationTrace(page);

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });

    // Mirror the smoke test in real-auth-smoke.spec.ts: the navbar mounts
    // the "User menu" button only when `user` is non-null (see
    // frontend/components/navbar.tsx, the `user ? ... : ...` branch).
    await expect(
      page.getByRole('button', { name: /user menu/i }),
      'authenticated navbar should mount a "User menu" button',
    ).toBeVisible({ timeout: 10_000 });

    // The unauthenticated branch renders a "Login" CTA button (see same
    // navbar branch). Assert it's gone — catches the silent failure where
    // cookies are set but the React tree didn't refresh, leaving the user
    // visually unauthenticated despite a valid session.
    await expect(
      page.getByRole('button', { name: /^login$/i }),
      'unauthenticated "Login" button should not be visible after login',
    ).toHaveCount(0);

    expect(errors, `Unexpected console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
