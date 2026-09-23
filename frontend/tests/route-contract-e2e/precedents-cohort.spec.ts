import { expect, test, type APIRequestContext } from '@playwright/test';

import { ADAPTER_BASE_URL, expectNoUnexpectedStubRequests, setSyntheticSession } from './synthetic-session';

/**
 * "In similar cases…" cohort block on /precedents (#726), route-contract
 * coverage. Exercises `POST /precedents/find` through the real BFF route,
 * asserts the grouped block a user reads, and follows a bar click through to
 * the filtered ranked list.
 */

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

test.describe('precedents cohort contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('renders the grouped block and filters the ranked list on a bar click', async ({
    page,
    context,
  }) => {
    await setSyntheticSession(context);

    await page.goto('/precedents');

    await page
      .getByPlaceholder(/describe the fact pattern/i)
      .fill('a juvenile drug appeal with three co-defendants');
    await page.getByRole('button', { name: /search for precedents/i }).click();

    const block = page.getByTestId('cohort-insights');
    await expect(block).toBeVisible();

    // 3 of the 4 cohort members were dismissed — the headline names that
    // bucket (default grouping is `appeal_outcome`, the first of
    // COHORT_GROUP_FIELDS).
    await expect(block).toContainText('In 3 of 4 similar cases: dismissed');

    await expect(page.getByText('R v Dismissed')).toBeVisible();
    await expect(page.getByText('R v Allowed')).toBeVisible();

    // Plotly's y-axis tick label ("dismissed") sits outside the chart's
    // interactive drag layer, so clicking it never reaches the trace's click
    // handler — even with `force`. The bar itself (the filled `<path>` in the
    // point group carrying the outside count label "3") is inside that layer
    // and does register. Located by its count text rather than index, since
    // sort order is a groupCohort implementation detail, not spec.
    const dismissedBar = block
      .locator('g.point', { has: page.locator('text[data-unformatted="3"]') })
      .locator('path');
    await dismissedBar.click({ force: true });

    // The filter chip names the active value and how many ranked results
    // survive it — only `p-dismissed` carries `dismissed` among the two
    // ranked precedents.
    await expect(block).toContainText('Filtered to dismissed');
    await expect(block).toContainText('1 of the ranked results');

    await expect(page.getByText('R v Allowed')).toHaveCount(0);
    await expect(page.getByText('R v Dismissed')).toBeVisible();

    await block.getByRole('button', { name: /clear filter/i }).click();
    await expect(page.getByText('R v Allowed')).toBeVisible();
  });
});
