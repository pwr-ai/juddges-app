import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';

/**
 * Hand-written (#695) — the planner/generator agents need an interactive MCP
 * loop against a running app, which this environment cannot drive
 * unattended; see the PR body for what was and wasn't run.
 *
 * `/collections` (list view, not the detail page already covered by
 * route-status.spec.ts) renders straight from `GET /collections`. The stub
 * always answers `documents: []` for both fixture rows
 * (`stub-services.mjs` `collectionListResponse`), while `CollectionsPage`
 * computes each card's document count from `collection.documents.length`
 * rather than the `document_count` field the stub also sends — so both
 * cards render "0 documents" regardless of the real count. That mismatch is
 * exactly the kind of drift a UI-level assertion catches and a wire-only
 * check (route-status.spec.ts only checks `/collections` isn't asserted
 * there at all) would miss.
 */

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

test.describe('collections list contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('renders both fixture collections with their document counts', async ({
    page,
    context,
  }) => {
    await setSyntheticSession(context);

    await page.goto('/collections');

    await expect(page.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible();

    await expect(
      page.getByRole('button', {
        name: 'Collection: Route contract extraction collection. 0 documents. Click to open.',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Collection: Route contract flow collection. 0 documents. Click to open.',
      }),
    ).toBeVisible();
  });
});
