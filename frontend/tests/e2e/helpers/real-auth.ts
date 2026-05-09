/**
 * Real-auth helpers for Playwright E2E tests.
 *
 * Unlike `auth-helpers.ts` (which mocks the Supabase browser client via
 * `addInitScript`), these helpers drive the actual login form and depend on
 * a live Supabase backend. Use them for tests that need to exercise the real
 * middleware / cookie behavior — anything that the mock-based path cannot
 * cover (e.g. RSC cache freshness after login, `sb-*-auth-token` cookie
 * presence, or middleware redirects).
 *
 * Required env vars:
 *   - TEST_USER_EMAIL
 *   - TEST_USER_PASSWORD
 */

import { expect, type BrowserContext, type Page } from '@playwright/test';

export interface LoginViaUIOptions {
  email?: string;
  password?: string;
  /**
   * URL the login flow should land on after success. String matches use
   * Playwright's `waitForURL` glob semantics; pass a RegExp for stricter
   * matching. Defaults to the application root (`/`).
   */
  expectRedirectTo?: string | RegExp;
}

const DEFAULT_REDIRECT_PATH = '/';

function resolveCreds(opts?: LoginViaUIOptions): { email: string; password: string } {
  const email = opts?.email ?? process.env.TEST_USER_EMAIL;
  const password = opts?.password ?? process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'real-auth.loginViaUI: TEST_USER_EMAIL and TEST_USER_PASSWORD must be set ' +
        '(either passed in via opts or exposed as environment variables). ' +
        'See frontend/.env.local — values live in the repo-root .env.',
    );
  }

  return { email, password };
}

/**
 * Drive the real login form at `/auth/login` with the provided credentials
 * (or values from the `TEST_USER_*` env vars). Resolves once the post-login
 * navigation completes.
 */
export async function loginViaUI(page: Page, opts?: LoginViaUIOptions): Promise<void> {
  const { email, password } = resolveCreds(opts);
  const expectRedirectTo = opts?.expectRedirectTo ?? DEFAULT_REDIRECT_PATH;

  await page.goto('/auth/login');

  // Wait for the form to be interactive before driving it.
  await page.locator('#email').waitFor({ state: 'visible' });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  await Promise.all([
    // Supabase signInWithPassword + RSC re-render can take ~5s on cold start;
    // 30s leaves headroom for CI.
    page.waitForURL(expectRedirectTo, { timeout: 30_000 }),
    page.getByRole('button', { name: /^sign in$/i }).click(),
  ]);
}

/**
 * Assert that at least one Supabase auth cookie is present on the context.
 * Supabase SSR cookies follow the `sb-<project-ref>-auth-token` (and
 * optional `.<n>` chunked) naming pattern.
 */
export async function expectAuthenticated(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  const authCookies = cookies.filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));

  expect(
    authCookies.length,
    `Expected at least one sb-*-auth-token cookie on the context, found: ${cookies
      .map((c) => c.name)
      .join(', ') || '(none)'}`,
  ).toBeGreaterThan(0);
}
