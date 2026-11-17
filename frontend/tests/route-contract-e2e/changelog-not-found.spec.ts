import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  setSyntheticSession,
  expectNoUnexpectedStubRequests,
} from './synthetic-session';

/**
 * #881: an unknown /changelog/<version> must render the normal 404 page, not
 * the app error boundary ("Something Went Wrong" + a Supabase configuration
 * message that blames the deploy).
 */
test.describe('changelog not found', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(response.status()).toBe(204);
    await setSyntheticSession(context);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('unknown version shows Page Not Found, not the error boundary', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const response = await page.goto('/changelog/v999.999.999');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('Page Not Found', { exact: false })).toBeVisible();
    await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Supabase browser configuration', { exact: false })).toHaveCount(0);
    expect(errors.filter((m) => m.includes('Supabase'))).toEqual([]);
  });
});
