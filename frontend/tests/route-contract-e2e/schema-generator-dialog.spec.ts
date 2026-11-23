import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';

/**
 * The "Generate Extraction Schema" dialog on /extract must fit its content.
 *
 * The shared `DialogContent` carries `sm:max-w-lg`, which beats an unprefixed
 * `max-w-4xl` from 640px up, so the dialog used to render 512px wide and its
 * content spilled out of it. These assertions pin the width and check that
 * nothing inside overflows horizontally.
 */
test.describe('schema generator dialog', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const reset = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(reset.status()).toBe(204);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('opens wide enough that its content fits', async ({ context }) => {
    await setSyntheticSession(context);
    const page = await context.newPage();

    await page.goto('/extract');
    await page.getByRole('button', { name: 'Generate New' }).click();

    const dialog = page.getByRole('dialog', { name: 'Generate Extraction Schema' });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    // max-w-4xl = 56rem = 896px; anything at 512px means sm:max-w-lg won again.
    expect(box!.width).toBeGreaterThan(800);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);

    const overflowsHorizontally = await dialog.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(overflowsHorizontally).toBe(false);

    await expect(dialog.getByRole('textbox')).toBeInViewport();
    await expect(dialog.getByRole('button', { name: /Generate Schema/ })).toBeInViewport();
  });
});
