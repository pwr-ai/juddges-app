import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  APP_BASE_URL,
  adapterRequests,
  extractionSequence,
  resetAdapter,
  setSyntheticSession,
} from './support';

/**
 * The research flow a user actually performs, as one PR-gated spec (#692):
 * search judgments → pick several results → save them to a collection → start
 * a schema extraction on that collection → read the extracted data.
 *
 * `extraction-path.spec.ts` covers the back half from `/extract` onwards. This
 * spec starts at `/search` and walks to `/extract` the way a user does — save
 * popover, "View Collection" toast action, collection page, then the collection
 * picker on `/extract` — so a regression in result selection, the save popover,
 * the toast action or the collection page fails here, and nowhere else on a
 * pull request.
 *
 * The LLM step is stubbed on purpose: `stub-services.mjs` walks a job for the
 * flow collection through PENDING → IN_PROGRESS → COMPLETED, one step per
 * poll, so the spec proves the UI's polling contract and not a model's output.
 * A live variant belongs in a nightly workflow (#696), never in the required
 * checks.
 */

/** Mirrors `FLOW` in `stub-services.mjs`. */
const FLOW_COLLECTION_ID = '50000000-0000-4000-8000-000000000002';
const FLOW_COLLECTION_NAME = 'Route contract flow collection';
const FLOW_JOB_ID = '30000000-0000-4000-8000-000000000008';
const SCHEMA_NAME = 'Route contract schema';

/**
 * Six hits come back; five are selected. Selecting a strict subset is what
 * proves per-result selection works — "Select All" would pass with the
 * checkboxes removed.
 */
const SEARCH_QUERY = 'route contract flow';
const SELECTED = [1, 2, 3, 4, 5] as const;
const flowDocumentId = (n: number): string => `route-contract-flow-document-${n}`;
const flowTitle = (n: number): string => `Route contract flow judgment ${n}`;

async function flowCollectionDocumentIds(
  request: Parameters<typeof resetAdapter>[0],
): Promise<string[]> {
  const response = await request.get(
    `${ADAPTER_BASE_URL}/__route-contract/flow-collection`,
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { document_ids: string[] };
  return payload.document_ids;
}

test.describe.serial('collection → extraction flow contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
  });

  test.afterEach(async ({ request }) => {
    const requests = await adapterRequests(request);
    expect(requests.filter(({ unexpected }) => unexpected)).toEqual([]);
  });

  test('search → select 5 → save to collection → extract → results', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context);
    const page = await context.newPage();

    await test.step('search returns the stubbed judgments', async () => {
      await page.goto('/search');
      await page.getByRole('textbox', { name: 'Search documents' }).fill(SEARCH_QUERY);
      await page.getByRole('textbox', { name: 'Search documents' }).press('Enter');
      await expect(
        page.getByRole('checkbox', { name: `Select ${flowTitle(6)}` }),
      ).toBeVisible();
    });

    await test.step('select five of the six results', async () => {
      for (const n of SELECTED) {
        await page
          .getByRole('checkbox', { name: `Select ${flowTitle(n)}` })
          .click();
      }
      // The button label carries the count, so this asserts the store counted
      // exactly the five clicks — not four, not all six.
      await expect(
        page.getByRole('button', { name: 'Save Selected (5)' }),
      ).toBeVisible();
    });

    await test.step('save the selection to the flow collection', async () => {
      await page.getByRole('button', { name: 'Save Selected (5)' }).click();
      const popover = page.getByRole('dialog', {
        name: 'Save documents to collection',
      });
      await popover.getByRole('button', { name: FLOW_COLLECTION_NAME }).click();
      await popover
        .getByRole('button', { name: 'Save 5 documents to collection' })
        .click();

      // The success toast is the user's confirmation. Its count is computed
      // from settled POSTs, so it doubles as the assertion that all five
      // `/api/collections/{id}/documents` calls came back 2xx.
      await expect(
        page.getByText('5 documents saved to collection'),
      ).toBeVisible();

      // Asserted from the stub's own record: the BFF forwarded exactly the
      // five selected ids, and nothing for the unselected sixth.
      expect((await flowCollectionDocumentIds(request)).sort()).toEqual(
        SELECTED.map(flowDocumentId).sort(),
      );
    });

    await test.step('the toast action opens the collection with the five documents', async () => {
      // "Start Extraction" is also wired on this toast in the popover, but
      // `showSuccessToast` renders only the primary action, so a user can only
      // get here through "View Collection" (#709). The spec takes the
      // path the product actually offers.
      await page.getByRole('button', { name: 'View Collection' }).click();
      await expect(page).toHaveURL(
        `${APP_BASE_URL}/collections/${FLOW_COLLECTION_ID}`,
      );
      await expect(
        page.getByRole('heading', { name: FLOW_COLLECTION_NAME }),
      ).toBeVisible();
      for (const n of SELECTED) {
        await expect(page.getByText(flowTitle(n))).toBeVisible();
      }
      await expect(page.getByText(flowTitle(6))).toHaveCount(0);
    });

    await test.step('start an extraction on that collection', async () => {
      await page.goto('/extract');
      await page.getByRole('button', { name: 'Select a collection' }).click();
      await page.getByRole('option', { name: FLOW_COLLECTION_NAME }).click();
      // The schema dropdown stays disabled until the collection's documents
      // loaded and were selected, so this click is also that assertion.
      await page.getByRole('button', { name: 'Select a schema' }).click();
      await page.getByRole('option', { name: SCHEMA_NAME }).click();
    });

    let jobId = '';
    await test.step('submit the extraction for the five documents', async () => {
      const submission = page.waitForResponse(
        (response) =>
          response.url() === `${APP_BASE_URL}/api/extractions` &&
          response.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: 'Start Extraction (5 documents)' })
        .click();
      const submissionResponse = await submission;
      expect(submissionResponse.status()).toBe(202);
      const body = (await submissionResponse.json()) as { job_id?: unknown };
      // The stub keys the job on the POSTed `collection_id`; getting the flow
      // job back proves the extract page submitted the collection picked above.
      expect(body.job_id).toBe(FLOW_JOB_ID);
      jobId = body.job_id as string;
    });

    await test.step('the job is watched to completion and the data renders', async () => {
      const detailResponse = await page.goto(`/extractions/${jobId}`);
      expect(detailResponse?.status()).toBe(200);

      await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('5 results', { exact: true })).toBeVisible();
      for (const n of SELECTED) {
        await expect(
          page.getByRole('cell', { name: `Flow outcome for judgment ${n}` }),
        ).toBeVisible();
      }

      // Progression, not a finished answer on the first read — same reasoning
      // as extraction-path.spec.ts step 6.
      expect(await extractionSequence(request, FLOW_JOB_ID)).toEqual([
        { status: 'PENDING', completed_documents: 0, total_documents: 5 },
        { status: 'IN_PROGRESS', completed_documents: 3, total_documents: 5 },
        { status: 'COMPLETED', completed_documents: 5, total_documents: 5 },
      ]);
    });

    await page.close();
  });
});
