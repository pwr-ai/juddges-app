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
 * route-status.spec.ts) renders straight from `GET /collections`.
 * `CollectionsPage` computes each card's document count from
 * `collection.documents.length` (not the `document_count` field the payload
 * also carries — see #697 for whether the live endpoint's `documents` is
 * ever a mismatched shape), so this spec asserts against `documents`, the
 * field the UI actually reads.
 *
 * Counts mirror `stub-services.mjs`'s `collectionListResponse`:
 * - the extraction collection's `documents` is `EXTRACTABLE_DOCUMENT_IDS`
 *   (2 entries), a fixed fixture.
 * - the flow collection's `documents` is `flowDocumentIds`, a module-level
 *   array only `collection-extraction-flow.spec.ts` mutates; this file's own
 *   `POST /__route-contract/reset` (below, in `beforeEach`) clears it back
 *   to `[]` regardless of what ran before, so it is 0 by the time this test
 *   loads `/collections`.
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

    // Scoped to `main`: the navbar (components/navbar.tsx `NavbarHeading`)
    // also renders an `<h1>Collections</h1>` on this route, so an unscoped
    // `page.getByRole('heading', …)` is a strict-mode violation.
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible();

    // 2 documents: EXTRACTABLE_DOCUMENT_IDS in stub-services.mjs.
    await expect(
      main.getByRole('button', {
        name: 'Collection: Route contract extraction collection. 2 documents. Click to open.',
      }),
    ).toBeVisible();
    // 0 documents: flowDocumentIds, cleared by this test's own reset above.
    await expect(
      main.getByRole('button', {
        name: 'Collection: Route contract flow collection. 0 documents. Click to open.',
      }),
    ).toBeVisible();
  });
});
