/**
 * Real-auth infrastructure smoke test.
 *
 * Validates that the `setup` project + `authenticatedPage` fixture round-trip
 * correctly: storage state is produced, loaded into a fresh BrowserContext,
 * `/` renders authenticated UI, and `/search` is reachable via hard `goto`.
 * The login-then-soft-nav-to-search regression is covered by a separate spec.
 */

import { test, expect } from '../helpers/auth-fixture';

// CI skip guard — default CI uses placeholder Supabase credentials, so the
// real-auth setup project can't run. See `tests/e2e/auth.setup.ts`.
test.skip(
  !!process.env.CI && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
  'requires real Supabase credentials — set TEST_USER_EMAIL/TEST_USER_PASSWORD and NEXT_PUBLIC_SUPABASE_URL to enable',
);

test.describe('real-auth foundation smoke', () => {
  test('authenticated home renders user menu and /search is reachable', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');

    // The "User menu" button is only mounted when `user` is non-null in the
    // navbar (see frontend/components/navbar.tsx around the `user ? ...` branch).
    await expect(
      authenticatedPage.getByRole('button', { name: /user menu/i }),
    ).toBeVisible();

    await authenticatedPage.goto('/search');

    await expect(authenticatedPage).toHaveURL(/\/search(\?.*)?$/);
    await expect(authenticatedPage).not.toHaveURL(/\/auth\/login/);
  });
});
