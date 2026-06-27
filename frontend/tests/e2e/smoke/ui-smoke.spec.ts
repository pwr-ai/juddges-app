import { test, expect } from '@playwright/test';

/**
 * Backend-free UI smoke suite (#171).
 *
 * Validates that the app shell renders on key PUBLIC routes when the frontend
 * is started with placeholder Supabase env and no backend — exactly the
 * environment the PR-gated CI job provides. These specs deliberately avoid
 * auth (no `setup` dependency) and any data that requires the API, so they are
 * fast and stable enough to gate every PR. Their job is to catch build/render
 * regressions (a broken build, a client-side crash, a missing route) before
 * merge — not to exercise product flows (that is the full dispatch suite).
 */

// Public routes that render without authentication or a live backend.
const PUBLIC_ROUTES = ['/', '/auth/login', '/about'];

for (const route of PUBLIC_ROUTES) {
  test(`public route ${route} renders without error`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(
      response!.status(),
      `${route} returned HTTP ${response!.status()}`,
    ).toBeLessThan(400);

    // Every route gets a non-empty <title> from the root layout metadata.
    await expect(page).toHaveTitle(/.+/);

    // The Next.js client-side error overlay must not be present.
    await expect(page.getByText('Application error')).toHaveCount(0);
  });
}

test('homepage renders a non-empty app shell', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toBeEmpty();
});
