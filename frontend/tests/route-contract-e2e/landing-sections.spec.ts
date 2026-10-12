import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
} from './synthetic-session';

/**
 * Signed-out landing page (#759): the project sections (partners, results,
 * publications, team) render and the sign-in entry point stays reachable.
 */
test.describe('landing sections', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(response.status()).toBe(204);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('signed-out visitor sees the project sections', async ({ page }) => {
    await page.goto('/');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: /international consortium/i })).toBeVisible();
    await expect(main.getByRole('heading', { name: /what we delivered/i })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Publications', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'The team', exact: true })).toBeVisible();

    await expect(page.locator('#partners')).toBeVisible();
    await expect(page.locator('#results')).toBeVisible();
    await expect(page.locator('#publications')).toBeVisible();
    await expect(page.locator('#team')).toBeVisible();

    await expect(page.locator('#team')).toContainText('Kamil Tagowski');
    await expect(page.locator('#publications')).toContainText('Schematize');

    await expect(page.getByRole('link', { name: 'Sign In' }).first()).toHaveAttribute(
      'href',
      '/auth/login',
    );
  });
});
