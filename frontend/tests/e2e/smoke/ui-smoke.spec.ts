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

test('site footer is not covered by the fixed sidebar overlay', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const footer = page.locator('footer[role="contentinfo"]');
  await expect(footer).toBeVisible();

  // The sidebar is a `fixed inset-y-0 z-50` overlay spanning the full viewport
  // height, and it only renders from the `md` breakpoint up. Below that there
  // is nothing to collide with, so the assertion has no subject.
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  test.skip((await sidebar.count()) === 0, 'sidebar overlay not rendered at this viewport');
  await expect(sidebar).toBeVisible();

  // Hit-test the leftmost piece of footer content rather than comparing
  // rectangles: what matters is that a visitor can actually see and click it,
  // whichever way the layout keeps the overlay off it.
  const label = footer.getByText('WUST Research Project');
  const box = await label.boundingBox();
  expect(box, 'footer label has no layout box').not.toBeNull();

  const hitsFooter = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('footer[role="contentinfo"]') !== null,
    { x: box!.x + 2, y: box!.y + box!.height / 2 },
  );

  expect(hitsFooter, 'sidebar overlay is painted on top of the footer').toBe(true);
});
