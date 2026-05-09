/**
 * Session-lifecycle spec: cookie-level auth behaviors that mock-based tests
 * cannot catch.
 *
 * Why a separate spec from the route-matrix and post-login regressions:
 *   - The mock-based helpers (`tests/e2e/helpers/auth-helpers.ts`) stub the
 *     Supabase BROWSER client, so the real `sb-*-auth-token` cookies never
 *     exist on the BrowserContext. That makes it impossible to verify the
 *     two cookie-level contracts this file pins down:
 *       3a — middleware tolerates a malformed `sb-*-auth-token` cookie
 *            (no 5xx; clean 302 to /auth/login; tampered value is replaced
 *            or cleared, never echoed back).
 *       3b — sign-out clears the auth cookies AND the next protected-route
 *            navigation bounces to /auth/login.
 *   - Both tests use a FRESH BrowserContext (via `test.use({ storageState })`
 *     scoping is awkward for mid-test cookie surgery; we drive a real UI
 *     login each time). They deliberately do NOT consume the
 *     `authenticatedPage` fixture in `helpers/auth-fixture.ts` — the
 *     fixture loads a pre-baked storage state, which would prevent us from
 *     observing cookie clearing on sign-out and would defeat 3a's "tamper
 *     the cookie that login just minted" setup.
 *
 * Sign-out selector reference (for future tasks):
 *   - The user menu is a `<button aria-label="User menu">` inside the
 *     navbar. Click it to open the popover. The sign-out control inside
 *     the popover is `<button aria-label="Logout">` with visible text
 *     "Logout" (see `frontend/lib/styles/components/user-card.tsx`).
 *
 * Verification commands (see Task-3 brief):
 *   E2E_BASE_URL=http://localhost:3007 npx playwright test \
 *     tests/e2e/auth/session-lifecycle.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginViaUI, expectAuthenticated } from '../helpers/real-auth';

// CI skip guard — see tests/e2e/auth.setup.ts. This spec does real form login
// and inspects real `sb-*` cookies; placeholder Supabase creds can't satisfy it.
test.skip(
  !!process.env.CI && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
  'requires real Supabase credentials — set TEST_USER_EMAIL/TEST_USER_PASSWORD and NEXT_PUBLIC_SUPABASE_URL to enable',
);

/**
 * Matches Supabase SSR cookie names. Supabase chunks long auth payloads
 * into `sb-<ref>-auth-token`, `sb-<ref>-auth-token.0`, `.1`, etc.
 * Same pattern used by `expectAuthenticated` in helpers/real-auth.ts.
 */
const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Console messages we deliberately tolerate. Mirrors the rationale in
 * post-login-navigation.spec.ts: the dev backend / Supabase proxies
 * sometimes return transient 500/503s for unrelated dashboard endpoints
 * (trending topics, recent extractions, etc.). Filtering them here keeps
 * this spec focused on session-lifecycle regressions.
 */
const TOLERATED_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /Failed to load resource/i,
  /the server responded with a status of (5\d\d)/i,
  /the server responded with a status of (4\d\d)/i,
];

function isToleratedError(text: string): boolean {
  return TOLERATED_ERROR_PATTERNS.some((re) => re.test(text));
}

function attachConsoleErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isToleratedError(text)) return;
    errors.push(text);
  });
  return { errors };
}

async function getAuthCookies(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.filter((cookie) => AUTH_COOKIE_RE.test(cookie.name));
}

test.describe('session lifecycle — cookie-level auth contracts', () => {
  // Force a fresh, cookieless context for every test in this file. Without
  // this, a previous spec's `auth.setup.ts`-loaded storageState (configured
  // at the chromium project level) would pre-seed the page with a valid
  // session — masking the very behavior we're trying to observe (login
  // minting cookies, then surgical tamper / sign-out clearing).
  test.use({ storageState: { cookies: [], origins: [] } });

  test('3a — tampered auth cookie does not 500; cleanly redirects to /auth/login', async ({
    page,
    context,
  }) => {
    const { errors } = attachConsoleErrors(page);

    await loginViaUI(page);
    await expectAuthenticated(context);

    const authCookiesBefore = await getAuthCookies(context);
    expect(
      authCookiesBefore.length,
      'expected at least one sb-*-auth-token cookie after a real login',
    ).toBeGreaterThan(0);

    // Surgically replace each chunk of the auth-token cookie with garbage.
    // We preserve domain/path/expiry so the cookie still ROUND-TRIPS to
    // the server — otherwise the browser would simply drop it and we'd
    // be testing the "no cookie" path (already covered by the route
    // matrix), not the "malformed JWT" path we want to catch here.
    const tamperedValue = 'tampered.garbage.notajwt';
    await context.addCookies(
      authCookiesBefore.map((c) => ({
        name: c.name,
        value: tamperedValue,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
    );

    // Confirm the tamper actually landed on the context before we navigate.
    const tamperedNow = (await getAuthCookies(context)).filter(
      (c) => c.value === tamperedValue,
    );
    expect(
      tamperedNow.length,
      'tamper setup failed: addCookies did not overwrite the auth-token cookies',
    ).toBe(authCookiesBefore.length);

    // Navigate to a protected route and observe how middleware reacts.
    const response = await page.goto('/search', { waitUntil: 'load' });

    // Final URL: middleware bounced us to the login page.
    await expect(page).toHaveURL(/\/auth\/login(\?.*)?$/);

    // No 5xx — middleware caught the malformed JWT, didn't crash the
    // server. (response can be null if Playwright followed a chain of
    // redirects; in that case the final response is the /auth/login GET
    // and the contract still holds — we still assert against status when
    // available.)
    if (response) {
      expect(
        response.status(),
        `expected non-5xx final response, got ${response.status()}`,
      ).toBeLessThan(500);
    }

    // The tampered value must not be echoed back. Acceptable post-states:
    //   (a) cookies cleared entirely (Set-Cookie with Max-Age=0), OR
    //   (b) cookies still present but with a different (real or signal)
    //       value — e.g. Supabase replaced them with logged-out markers.
    const authCookiesAfter = await getAuthCookies(context);
    const stillTampered = authCookiesAfter.filter((c) => c.value === tamperedValue);
    expect(
      stillTampered,
      `tampered cookie value '${tamperedValue}' was echoed back after the bounce; ` +
        `cookies seen: ${authCookiesAfter.map((c) => `${c.name}=${c.value.slice(0, 16)}…`).join(', ')}`,
    ).toEqual([]);

    expect(
      errors,
      `Unexpected console errors during tampered-cookie bounce: ${errors.join(' | ')}`,
    ).toEqual([]);
  });

  test('3b — sign-out clears cookies AND immediate /search bounces to /auth/login', async ({
    page,
    context,
  }) => {
    // Regression this catches: if `signOut()` ever silently fails to call
    // Supabase's cookie-clearing endpoint (or the popover handler stops
    // wiring through to AuthContext.signOut), the auth cookies stay on
    // the BrowserContext. The cookie-count assertion below would then
    // fail (>0 cookies remain), and the subsequent /search nav would
    // succeed instead of bouncing.
    const { errors } = attachConsoleErrors(page);

    await loginViaUI(page);
    await expectAuthenticated(context);

    // Open the user menu popover. Selector matches the navbar in
    // `frontend/components/navbar.tsx` (`aria-label="User menu"`).
    // The Popover is controlled state in the navbar — clicking the
    // trigger calls `onOpenChange(true)` which mounts the
    // `<UserCard>` content (with the Logout button) into a Radix
    // portal. We need to wait for the navbar React tree to fully
    // hydrate before clicking, otherwise the click can land before
    // the Popover's onOpenChange handler is bound and is silently
    // swallowed.
    const userMenuButton = page.getByRole('button', { name: /user menu/i });
    await expect(
      userMenuButton,
      'expected the authenticated navbar to render a "User menu" button',
    ).toBeVisible({ timeout: 15_000 });
    // Confirm the dashboard has hydrated before we open the popover —
    // mirrors the same pattern post-login-navigation.spec.ts uses to
    // guard against pre-hydration clicks.
    await expect(page.locator('a[href="/search"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Click and confirm the popover content actually appeared. Radix
    // Popover with controlled `open` state can occasionally drop the
    // first click in dev (auth-context race during initial hydration).
    // We retry up to 3 times with a short wait between, looking for
    // the Logout button as the signal that the UserCard mounted.
    const logoutButton = page
      .getByRole('button', { name: /sign out|log out|logout/i })
      .first();

    let popoverOpened = false;
    for (let attempt = 0; attempt < 3 && !popoverOpened; attempt++) {
      await userMenuButton.click();
      try {
        await expect(logoutButton).toBeVisible({ timeout: 3_000 });
        popoverOpened = true;
      } catch {
        // The first click may have been swallowed; small wait and
        // try again. We don't fail the test here — the selector-probe
        // block below will produce the actionable error message if
        // the popover truly never mounts.
        await page.waitForTimeout(250);
      }
    }

    // Snapshot the open popover for debugging in case a future redesign
    // moves the sign-out control. Stored under /tmp so it doesn't pollute
    // the repo. Failure to take the screenshot is non-fatal.
    await page
      .screenshot({ path: '/tmp/session-lifecycle-3b-before-signout.png', fullPage: false })
      .catch(() => {
        /* screenshot is debug-only; ignore IO failures */
      });

    // Discover the sign-out control. The current UI uses
    // `<button aria-label="Logout">` with visible text "Logout"
    // (see `frontend/lib/styles/components/user-card.tsx`). The Radix
    // popover renders its content into a portal, so we must give the
    // open animation a moment to land before probing — using
    // `expect(...).toBeVisible({ timeout })` lets Playwright auto-wait
    // through that animation rather than racing on `.count()` which
    // resolves synchronously against the current DOM.
    //
    // We probe a few selector variants in priority order so the test
    // stays robust to small label/role changes (e.g. swapping
    // `<button>` for a Radix `menuitem`).
    const signOutCandidates = [
      page.getByRole('menuitem', { name: /sign out|log out|logout/i }),
      page.getByRole('button', { name: /sign out|log out|logout/i }),
      page.getByText(/^(sign out|log out|logout)$/i),
    ];

    let signOutLocator: ReturnType<Page['getByRole']> | null = null;
    for (const candidate of signOutCandidates) {
      try {
        await expect(candidate.first()).toBeVisible({ timeout: 5_000 });
        signOutLocator = candidate.first();
        break;
      } catch {
        // Try the next selector variant.
      }
    }

    if (!signOutLocator) {
      // Surface the current page DOM so future maintainers can see what
      // the popover actually rendered when this assertion blew up. We
      // log both the header and the body — Radix portals the popover
      // content out of the navbar, so the header HTML alone usually
      // won't show the popover children.
      const headerHtml = await page
        .locator('header')
        .innerHTML()
        .catch(() => 'no header');
      const bodyHtml = await page
        .locator('body')
        .innerHTML()
        .catch(() => 'no body');
      console.log(
        '[debug] could not find sign-out, page header HTML =',
        headerHtml.slice(0, 1500),
      );
      throw new Error(
        `Could not find sign-out control under any of the tried selectors. ` +
          `Header excerpt: ${headerHtml.slice(0, 800)} | ` +
          `Body excerpt: ${bodyHtml.slice(0, 1500)}`,
      );
    }

    // Click sign-out and wait for the post-sign-out navigation. The
    // handler in `user-card.tsx`:
    //   await signOut();
    //   router.push("/auth/login");
    //
    // …drives a navigation to /auth/login. We MUST anchor the
    // `waitForURL` regex to that path — an over-broad regex (e.g. one
    // that also matches `/`) silently resolves immediately because the
    // page is already at `/` post-login, defeating the wait and
    // letting the test sample cookies before `signOut()` finishes.
    await Promise.all([
      page.waitForURL(/\/auth\/login(\?.*)?$/, { timeout: 15_000 }),
      signOutLocator.click(),
    ]);

    // Cookie-count assertion: this is the single most important check
    // in 3b. If sign-out leaves any `sb-*-auth-token` cookie alive on
    // the context, this fails — exactly the regression scenario we're
    // pinning down.
    const cookiesAfterSignOut = await getAuthCookies(context);
    expect(
      cookiesAfterSignOut,
      `expected 0 sb-*-auth-token cookies after sign-out, got ${cookiesAfterSignOut.length}: ` +
        `${cookiesAfterSignOut.map((c) => c.name).join(', ')}`,
    ).toEqual([]);

    // Now hit a protected route and confirm middleware bounces us. This
    // is the "session is fully gone, not just on the client" half of the
    // contract.
    await page.goto('/search', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/auth\/login(\?.*)?$/);

    expect(
      errors,
      `Unexpected console errors during sign-out + protected nav: ${errors.join(' | ')}`,
    ).toEqual([]);
  });
});
