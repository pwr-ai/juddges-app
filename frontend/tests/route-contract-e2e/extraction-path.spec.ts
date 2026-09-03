import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

/**
 * The extraction path, end to end, on every pull request (#579).
 *
 * This lives in the route-contract harness rather than under `tests/e2e/`
 * because that is the only Playwright harness in this repo that can actually
 * run the flow:
 *
 *  - `playwright.config.ts:132` scopes the PR-gated smoke project to
 *    `smoke/*.spec.ts`, so a spec anywhere else would be collected by no
 *    project and its job would go green having executed zero tests.
 *  - the smoke job runs unauthenticated against placeholder Supabase env
 *    (`.github/workflows/ci.yml`, and the comment at playwright.config.ts:127),
 *    and `/extract` plus `/extractions/[id]` are behind the login wall.
 *
 * The route-contract harness boots the real standalone Next server against a
 * stub backend, so `frontend/app/api/**` and `frontend/middleware.ts` execute
 * for real instead of being mocked away in the browser, and its check
 * ("Frontend Route Contract (Chromium)") is already required by branch
 * protection.
 *
 * Nothing here is copied from `tests/e2e/schemas/schema-extraction-flow.spec.ts`
 * (issue #575): no `.catch(() => false)`, no assertion that cannot fail, and
 * the closing assertion is extracted data rendered on the page.
 */

const APP_BASE_URL = 'http://127.0.0.1:3006';
const ADAPTER_BASE_URL = 'http://127.0.0.1:4311';
const USER_ID = '11111111-1111-4111-8111-111111111111';

/** Mirrors `IDS.extraction.sequenced` in `stub-services.mjs`. */
const SEQUENCED_JOB_ID = '30000000-0000-4000-8000-000000000007';
const COLLECTION_NAME = 'Route contract extraction collection';
const SCHEMA_NAME = 'Route contract schema';

interface AdapterRequest {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  unexpected?: boolean;
}

interface ServedExtractionState {
  status: string;
  completed_documents: number;
  total_documents: number;
}

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(
    `${ADAPTER_BASE_URL}/__route-contract/reset`,
  );
  expect(response.status()).toBe(204);
}

async function adapterRequests(
  request: APIRequestContext,
): Promise<AdapterRequest[]> {
  const response = await request.get(
    `${ADAPTER_BASE_URL}/__route-contract/requests`,
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { requests: AdapterRequest[] };
  return payload.requests;
}

/**
 * What the stub answered for `GET /extractions/{sequenced}` on each poll, in
 * order. Snapshot reads (`include_results=false`, made by the middleware) are
 * not recorded — they observe the current step without consuming one.
 */
async function extractionSequence(
  request: APIRequestContext,
): Promise<ServedExtractionState[]> {
  const response = await request.get(
    `${ADAPTER_BASE_URL}/__route-contract/extraction-sequence`,
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as {
    served: ServedExtractionState[];
  };
  return payload.served;
}

/**
 * Same synthetic session the route-status contract uses: the stub answers
 * `GET /auth/v1/user` for the `route-contract-valid` token, so the middleware,
 * the BFF routes and the browser Supabase client all see one signed-in user
 * without a real Supabase project.
 */
async function setSyntheticSession(context: BrowserContext): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;
  const session = {
    access_token: 'route-contract-valid',
    refresh_token: 'route-contract-valid-refresh',
    expires_in: 3_600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'route-contract@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-08-06T00:00:00.000Z',
    },
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString('base64url');

  await context.clearCookies();
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${encoded}`,
      url: APP_BASE_URL,
      expires: expiresAt,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

test.describe.serial('extraction path contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
  });

  test.afterEach(async ({ request }) => {
    const requests = await adapterRequests(request);
    expect(requests.filter(({ unexpected }) => unexpected)).toEqual([]);
  });

  test('submits an extraction and shows the extracted data once the job completes', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context);
    const page = await context.newPage();

    await page.goto('/extract');

    // 1. Pick the collection. Selecting it loads the collection's documents
    //    through `/api/collections/[id]/documents` and selects them all, which
    //    is what un-disables the schema dropdown and the submit button.
    await page
      .getByRole('button', { name: 'Select a collection' })
      .click();
    await page.getByRole('option', { name: COLLECTION_NAME }).click();

    // 2. Pick the schema.
    await page.getByRole('button', { name: 'Select a schema' }).click();
    await page.getByRole('option', { name: SCHEMA_NAME }).click();

    // 3. Submit. The button label carries the selected document count, so
    //    matching on it also asserts both documents were selected. Playwright's
    //    click auto-waits for the button to become enabled, which it only does
    //    once document loading and metadata enrichment have finished.
    const submission = page.waitForResponse(
      (response) =>
        response.url() === `${APP_BASE_URL}/api/extractions` &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Start Extraction (2 documents)' })
      .click();
    const submissionResponse = await submission;
    expect(submissionResponse.status()).toBe(202);
    // Read the body immediately: Chromium only retains it while the owning
    // request is held, and reading later raced that eviction in #545.
    const submissionBody = (await submissionResponse.json()) as {
      job_id?: unknown;
    };
    expect(submissionBody.job_id).toBe(SEQUENCED_JOB_ID);
    const jobId = submissionBody.job_id as string;

    // 4. Open the job the submit call actually returned. The extract page does
    //    not navigate on its own — it toasts and refreshes the recent list — so
    //    the spec navigates, but it navigates to the id that came back on the
    //    wire. A hard-coded id here would keep passing with the submit fetch
    //    removed, which is exactly what mutation testing this spec checks.
    const detailResponse = await page.goto(`/extractions/${jobId}`);
    expect(detailResponse?.status()).toBe(200);

    // 5. The observable outcome: extracted values rendered in the results
    //    table. Reaching them takes three polls three seconds apart, hence the
    //    explicit timeout. `COMPLETED` is terminal, so once these are on the
    //    page no later response can take them away.
    await expect(
      page.getByRole('cell', { name: 'II AKa 214/2026' }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('cell', { name: 'II AKa 215/2026' }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', {
        name: 'Appeal outcome recorded for document 1',
      }),
    ).toBeVisible();
    await expect(page.getByText('2 results', { exact: true })).toBeVisible();
    await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();

    // 6. The job was watched *progressing*, not handed a finished result on the
    //    first read. This is asserted from the stub's own record of what it
    //    answered rather than from the browser: loading this page was observed
    //    to issue two polls milliseconds apart, one of whose responses reaches
    //    Chromium with no readable body. The DOM cannot carry the progression
    //    either — a status assertion placed after a poll can resolve before
    //    React applied it or after the next response replaced it, the race
    //    documented at route-status.spec.ts:384 (#524).
    //
    //    The exact sequence is still deterministic, whatever the browser does
    //    with those extra polls. A poll chain that is torn down clears its
    //    timer and sets its `active` flag false (ExtractionJobClient.tsx:193),
    //    so it can never issue a second poll; the surviving chain stops on the
    //    terminal status; and the stub advances exactly one step per arriving
    //    poll. So the served sequence is PENDING, IN_PROGRESS, COMPLETED
    //    however many chains the initial mount started and discarded — the
    //    extra ones only bring the terminal step forward in wall-clock time,
    //    which is why the assertions above allow 30s. A skipped step, a
    //    repeated step or a stub that answers COMPLETED first all fail here.
    const served = await extractionSequence(request);
    expect(served).toEqual([
      { status: 'PENDING', completed_documents: 0, total_documents: 2 },
      { status: 'IN_PROGRESS', completed_documents: 1, total_documents: 2 },
      { status: 'COMPLETED', completed_documents: 2, total_documents: 2 },
    ]);

    await page.close();
  });
});
