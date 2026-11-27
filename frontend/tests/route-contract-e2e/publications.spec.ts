import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
} from './synthetic-session';

/**
 * Signed-out /publications (#762): the verified project and partner lists
 * render from lib/project-content.ts; an empty DB catalog shows nothing and
 * the unrelated reference papers are gone.
 */
test.describe('publications page', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(response.status()).toBe(204);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('signed-out visitor sees only verified publications', async ({ page }) => {
    await page.goto('/publications');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Publications', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Project publications' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Partner publications' })).toBeVisible();

    const bridging = main.getByRole('link', { name: /Bridging AI and Law/ });
    await expect(bridging).toBeVisible();
    await expect(bridging).toHaveAttribute('href', 'https://openreview.net/forum?id=hWjsyTSWrY');
    await expect(bridging).toHaveAttribute('target', '_blank');
    await expect(bridging).toHaveAttribute('rel', /noopener/);
    await expect(main.getByText(/Judges on Trial/)).toBeVisible();

    await expect(main.getByText('No publications available')).toHaveCount(0);
    await expect(main.getByText(/temporarily unavailable/)).toHaveCount(0);
    for (const unrelated of ['FactSelfCheck', 'Unseen Influence', 'Illusion of Progress']) {
      await expect(page.getByText(unrelated)).toHaveCount(0);
    }
  });
});
