/**
 * Core user journey E2E: search → save to collection → export.
 *
 * Exercises the integrated flow a legal researcher follows day-to-day, which
 * until now had only piecemeal coverage (search.spec.ts, the collections flow,
 * and the collection-export unit test each cover one slice in isolation):
 *
 *   1. Sign in (real Supabase session via the `authenticatedPage` fixture).
 *   2. Run a search on /search and get a result card back.
 *   3. Select the card and save it to a freshly created collection from the
 *      "Save to Collection" popover.
 *   4. Open the collection at /collections/<id>.
 *   5. Switch to the full-columns table view and export to CSV / Excel.
 *   6. Assert the downloaded file's suggested name and (for CSV) its contents.
 *
 * The journey is run for both the EN and PL UI locales (cookie + localStorage
 * driven — there is no locale segment in the URL).
 *
 * Mocking strategy mirrors collections/complete-collection-flow.spec.ts: every
 * backend call is intercepted at the Next.js `/api/*` route boundary (the only
 * thing Playwright can intercept for browser-originated fetches). This keeps
 * the test deterministic and runnable without a live FastAPI backend, Supabase
 * migrations, or a Meilisearch index. The test still fails if the *frontend*
 * contract between search results, the save popover, the collection page, and
 * the export drops — which is exactly the regression class this guards.
 *
 * NOTE: requires the Playwright `setup` project to have produced the real-auth
 * storage state (`.auth/user.json`). Run via the default config so `setup`
 * executes first, or `npx playwright test --project=setup` once. No backend
 * needs to be running.
 */

import { test, expect } from './helpers/auth-fixture';
import type { Page, Route } from '@playwright/test';
import type { LocaleCode } from '@/lib/i18n/types';

// ─── Fixture data ───────────────────────────────────────────────────────────

const DOC_ID = 'II FSK 1234/21';
const DOC_TITLE = 'Swiss Franc Loan Consumer Ruling';
const DOC_COURT = 'Supreme Court of Poland';
const NEW_COLLECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NEW_COLLECTION_NAME = 'Journey Collection';
// A pre-existing collection so the popover renders its list (and thus the
// "Create New Collection" affordance). When the list is empty the popover only
// shows a "No collections available" message with no create button.
const SEED_COLLECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEED_COLLECTION_NAME = 'Existing Matters';

/** Single Meilisearch hit returned by GET /api/search/documents. */
const MEILI_HIT = {
  id: DOC_ID,
  title: DOC_TITLE,
  summary:
    'Consumer protection ruling on Swiss franc denominated mortgage contracts.',
  case_number: DOC_ID,
  jurisdiction: 'PL',
  court_name: DOC_COURT,
  decision_date: '2023-06-15',
  keywords: ['consumer protection', 'mortgage'],
  source_url: 'https://example.test/case-x',
};

const MEILI_SEARCH_RESPONSE = {
  documents: [MEILI_HIT],
  query: 'swiss franc loan',
  query_time_ms: 12,
  pagination: {
    offset: 0,
    limit: 20,
    loaded_count: 1,
    estimated_total: 1,
    has_more: false,
    next_offset: null,
  },
};

/** Full document payload returned by GET /api/documents/<id>. */
const DOCUMENT_RESPONSE = {
  document: {
    document_id: DOC_ID,
    document_type: 'judgment',
    title: DOC_TITLE,
    date_issued: '2023-06-15',
    issuing_body: { name: DOC_COURT, type: 'court' },
    language: 'pl',
    document_number: DOC_ID,
    country: 'PL',
    full_text: null,
    summary:
      'Consumer protection ruling on Swiss franc denominated mortgage contracts.',
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: ['consumer protection', 'mortgage'],
    score: null,
    court_name: DOC_COURT,
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    source_url: 'https://example.test/case-x',
    base_fields: null,
  },
};

interface MockCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  documents: string[];
  document_count: number;
}

function makeCollection(overrides: Partial<MockCollection> = {}): MockCollection {
  const now = '2026-06-23T12:00:00Z';
  return {
    id: NEW_COLLECTION_ID,
    user_id: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
    name: NEW_COLLECTION_NAME,
    description: null,
    created_at: now,
    updated_at: now,
    documents: [],
    document_count: 0,
    ...overrides,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pin the UI locale before any app code runs. The LanguageProvider resolves the
 * active locale from `localStorage['preferred-locale']` after hydration, and the
 * server reads the `NEXT_LOCALE` cookie — set both so client and server agree.
 */
async function setLocale(page: Page, locale: LocaleCode): Promise<void> {
  await page.context().addCookies([
    {
      name: 'NEXT_LOCALE',
      value: locale,
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.addInitScript((loc) => {
    try {
      window.localStorage.setItem('preferred-locale', loc);
    } catch {
      // localStorage unavailable — cookie still drives SSR.
    }
  }, locale);
}

/**
 * Wire up all backend route mocks for the journey. Captures the create + add
 * request bodies so the test can assert the contract, and serves a collection
 * whose document set grows once the document has been added.
 */
async function mockBackend(page: Page): Promise<{
  getCreateBody: () => { name?: string } | null;
  getAddedDocumentId: () => string | null;
}> {
  const collection = makeCollection();
  // Pre-existing collection returned by the list endpoint so the popover shows
  // its collection list (the "Create New Collection" button lives in that
  // branch — an empty list renders only an informational message).
  const seedCollection = makeCollection({
    id: SEED_COLLECTION_ID,
    name: SEED_COLLECTION_NAME,
  });
  let createBody: { name?: string } | null = null;
  let addedDocumentId: string | null = null;

  // Meilisearch document search (default "text" mode → GET /api/search/documents).
  await page.route('**/api/search/documents*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MEILI_SEARCH_RESPONSE),
    });
  });

  // Collection list + create. The popover fetches the list on open; creating a
  // collection POSTs here and then the list must include it.
  await page.route('**/api/collections', async (route: Route) => {
    if (route.request().method() === 'POST') {
      createBody = JSON.parse(route.request().postData() || '{}');
      collection.name = createBody?.name ?? collection.name;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(collection),
      });
      return;
    }
    // GET — always include the seed collection so the popover list (and its
    // "Create New Collection" button) renders; the freshly created collection
    // is appended once it has been POSTed.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createBody ? [seedCollection, collection] : [seedCollection]),
    });
  });

  // Add a document to the collection.
  await page.route(
    `**/api/collections/${NEW_COLLECTION_ID}/documents`,
    async (route: Route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      addedDocumentId = body?.document_id ?? null;
      if (addedDocumentId && !collection.documents.includes(addedDocumentId)) {
        collection.documents.push(addedDocumentId);
        collection.document_count = collection.documents.length;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    },
  );

  // Read the collection (detail page). Must be registered after the more
  // specific /documents route so it doesn't swallow it.
  await page.route(`**/api/collections/${NEW_COLLECTION_ID}*`, async (route: Route) => {
    if (route.request().url().includes('/documents')) {
      await route.fallback(); // defer to the dedicated /documents handler above
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(collection),
    });
  });

  // Batch document fetch (POST /api/documents/batch). Used by the collection
  // table view (`loadAllCollectionDocuments` → `fetchDocumentsByIds`) to hydrate
  // the full-column table. Returns the *plural* `{ documents: [...] }` shape.
  // Registered before the generic /api/documents/** route so it wins.
  await page.route(`**/api/documents/batch*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: [DOCUMENT_RESPONSE.document] }),
    });
  });

  // Document detail fetched by the collection page for each member doc.
  // Registered AFTER /batch: Playwright tries the most-recently-registered
  // handler first, so this generic one runs first and explicitly falls back to
  // the dedicated /batch (and /search) handlers for those paths.
  await page.route(`**/api/documents/**`, async (route: Route) => {
    const url = route.request().url();
    // Defer the search / batch endpoints to their dedicated handlers.
    if (url.includes('/documents/search') || url.includes('/documents/batch')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DOCUMENT_RESPONSE),
    });
  });

  return {
    getCreateBody: () => createBody,
    getAddedDocumentId: () => addedDocumentId,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const LOCALES: LocaleCode[] = ['en', 'pl'];

test.describe('Core journey: search → save to collection → export', () => {
  test.slow(); // Crosses three pages with several network round-trips.

  for (const locale of LOCALES) {
    test(`[${locale}] search, save to a new collection, then export CSV`, async ({
      authenticatedPage: page,
    }) => {
      await setLocale(page, locale);
      const { getCreateBody, getAddedDocumentId } = await mockBackend(page);

      // ── Step 1: Search ───────────────────────────────────────────────────
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      // The search input has no accessible name of its own; target it by its
      // placeholder (the submit button below carries aria-label="Search").
      const searchInput = page
        .getByPlaceholder(/liability for defective construction/i)
        .first();
      await expect(searchInput).toBeVisible();
      await searchInput.fill('swiss franc loan');
      await page.getByRole('button', { name: /^search$/i }).first().click();

      // Result card renders (data-testid="search-result-card").
      const resultCard = page.getByTestId('search-result-card').first();
      await expect(resultCard).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(DOC_TITLE).first()).toBeVisible();

      // ── Step 2: Select the result and open the save popover ───────────────
      await resultCard.getByRole('checkbox', { name: /select/i }).check();

      // The primary action flips to "Save Selected (1)" once a doc is selected.
      await page
        .getByRole('button', { name: /save selected/i })
        .first()
        .click();

      // The popover is a role=dialog labelled "Save documents to collection".
      const popover = page.getByRole('dialog', {
        name: /save documents to collection/i,
      });
      await expect(popover).toBeVisible();

      // ── Step 3: Create a fresh collection from inside the popover ─────────
      await popover.getByRole('button', { name: /create new collection/i }).click();
      await popover.getByPlaceholder(/collection name/i).fill(NEW_COLLECTION_NAME);
      await popover.getByRole('button', { name: /^add$/i }).click();

      // Contract checks: collection created and our document added to it.
      await expect.poll(() => getCreateBody()).not.toBeNull();
      expect(getCreateBody()?.name).toBe(NEW_COLLECTION_NAME);
      await expect.poll(() => getAddedDocumentId()).toBe(DOC_ID);

      // Success toast confirms the save landed.
      await expect(page.getByText(/saved|success/i).first()).toBeVisible({
        timeout: 10_000,
      });

      // ── Step 4: Open the collection ──────────────────────────────────────
      await page.goto(`/collections/${NEW_COLLECTION_ID}`);
      await page.waitForLoadState('domcontentloaded');

      // The saved document is listed in the collection.
      await expect(page.getByText(DOC_TITLE).first()).toBeVisible({
        timeout: 15_000,
      });

      // ── Step 5: Switch to table view and export to CSV ───────────────────
      await page.getByRole('tab', { name: /table/i }).click();

      const exportButton = page.getByRole('button', { name: /^export$/i });
      await expect(exportButton).toBeEnabled({ timeout: 15_000 });
      await exportButton.click();

      // Trigger the CSV download and capture the file.
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: /csv/i }).click();
      const download = await downloadPromise;

      // ── Step 6: Assert the export contents ───────────────────────────────
      // buildExportFilename slugs the collection name + ISO date, then .csv.
      expect(download.suggestedFilename()).toMatch(
        /^journey-collection-\d{4}-\d{2}-\d{2}\.csv$/,
      );

      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const fs = await import('node:fs/promises');
      const csv = await fs.readFile(downloadPath!, 'utf-8');

      // Header carries the standard columns; the row carries our document.
      expect(csv).toContain('Document ID');
      expect(csv).toContain('Title');
      expect(csv).toContain('Court');
      expect(csv).toContain(DOC_ID);
      expect(csv).toContain(DOC_TITLE);
      expect(csv).toContain(DOC_COURT);
    });
  }
});
