import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';

/**
 * Statistics view on /search/extractions (#708), route-contract coverage.
 *
 * Exercises `POST /extractions/base-schema/aggregate` through the real BFF
 * route and middleware, asserts the cohort line a user reads (not the
 * request/response internals), and follows the drill-back to the list view.
 */

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

test.describe('statistics view contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('renders the cohort line from the aggregate endpoint and drills back to the list', async ({
    page,
    context,
  }) => {
    await setSyntheticSession(context);

    await page.goto('/search/extractions?view=stats&n=100&seed=7&fields=appeal_outcome,decision_date');

    await expect(page.getByText(/320 of 12,907 judgments match/)).toBeVisible();
    await expect(page.getByText(/showing a random sample of 100 \(seed 7\)/)).toBeVisible();

    // A field card actually rendered from the aggregate response — guards
    // FieldCard's rowsFor mapping (kind/multi handling, values/other/null),
    // not just the cohort/sample lines above. Scoped to the field's
    // `<section aria-label>` — the page also renders "dismissed" as part of
    // an unrelated appeal-outcome filter option elsewhere, so an unscoped
    // text lookup is a strict-mode violation.
    const appealOutcomeCard = page.locator('section[aria-label="Appeal outcome"]');
    await expect(appealOutcomeCard.getByRole('heading', { name: /appeal outcome/i })).toBeVisible();
    await expect(appealOutcomeCard.getByText('dismissed', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /show judgments/i }).click();

    await expect(page).toHaveURL(/\/search\/extractions(\?|$)(?!.*view=stats)/);
  });
});
