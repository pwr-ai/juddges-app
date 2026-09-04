/**
 * Playwright E2E for /search/extractions — happy path + URL state restoration.
 *
 * Implements the deferred test from PR #138 (issue #142). Covers three flows
 * against the real page (`frontend/app/search/extractions/page.tsx`):
 *
 *   1. Happy path     — text query + enum + numeric-range filters drive the
 *                       result count and serialise into the URL (?q=…&f=…).
 *   2. URL restoration — opening the captured URL in a clean session rehydrates
 *                       the text bar, the active-filter chips, and the drawer
 *                       control selections.
 *   3. Clear-all      — the "Clear all" chip resets the URL to a bare
 *                       /search/extractions and restores the baseline count.
 *
 * Strategy (mocked fallback per #142):
 *   - /search/extractions is behind the auth middleware, so we use the shared
 *     `authenticatedPage` fixture (real Supabase login performed once by the
 *     `setup` project → `.auth/user.json`).
 *   - The data layer is mocked at the network boundary with `route.fulfill`
 *     so the suite is deterministic and fast (≤30 s) without the FastAPI RPC.
 *     The mock derives `total_count` from the POSTed filter body so the count
 *     chip genuinely reflects the active filters rather than a constant.
 *
 * To run against the real backend (real RPC + seeded judgments) instead of the
 * mock, see `tests/e2e/search/README.md`.
 *
 * NOTE: the inline filter drawer on this page renders every group's controls
 * directly (no per-group expand step); the drawer itself now starts
 * *collapsed* behind a "Filters" toggle (see #581 task 2), so every test that
 * touches a drawer-only control expands it first via `expandDrawer`.
 *
 * NOTE (selector scoping): since #139/#275/#276 merged, `offender_gender`
 * ("Gender") is surfaced both in the always-visible `QuickFilters` strip *and*
 * in the advanced `BaseFiltersDrawer`, both rendering an identically-labelled
 * "Female" checkbox (the field's "gender_" prefix is stripped from the option
 * label via `formatEnumOptionLabel` — see #581 — since it duplicates the
 * fieldset legend "Gender"). A bare `getByLabel('Female')` therefore resolves
 * to two nodes and trips Playwright strict mode, and scoping by the drawer's
 * outer container alone is still ambiguous — the drawer also renders a
 * "Victim gender" fieldset with its own "Female" checkbox. Every gender
 * interaction below is instead scoped through the accessible "Gender"
 * fieldset group (`EnumMultiControl` renders `<fieldset><legend>Gender</legend>…`)
 * inside the advanced drawer via the `advancedDrawer` locator (the only
 * filter panel carrying the "Reset" control).
 */

import { test, expect } from '../helpers/auth-fixture';
import type { Locator, Page, Route } from '@playwright/test';
import type {
  BaseSchemaFilterRequest,
  BaseSchemaFilterResponse,
  BaseSchemaFilterResultRow,
} from '../../../types/base-schema-filter';

const FILTER_API = '**/api/extractions/base-schema/filter';
const FACETS_API = '**/api/extractions/base-schema/facets/**';

// Baseline total returned for an unfiltered request. Each active filter shrinks
// the result set by a deterministic amount so assertions on the count chip are
// meaningful and stable.
const BASELINE_TOTAL = 120;

function makeRow(i: number): BaseSchemaFilterResultRow {
  return {
    id: `judgment-${i}`,
    case_number: `CASE/${1000 + i}/2023`,
    title: `Mocked robbery judgment ${i}`,
    jurisdiction: 'UK',
    decision_date: `2023-0${(i % 9) + 1}-15`,
    extracted_data: {},
  };
}

/** Derive a deterministic total from the filter request so the chip updates. */
function totalForRequest(req: BaseSchemaFilterRequest): number {
  let total = BASELINE_TOTAL;
  if (req.text_query && req.text_query.trim() !== '') total -= 40; // text → 80
  if (Array.isArray(req.filters?.offender_gender) && req.filters.offender_gender.length > 0) {
    total -= 30; // + gender → 50
  }
  if (req.filters?.co_def_acc_num !== undefined) total -= 10; // + co-def → 40
  return Math.max(total, 0);
}

/**
 * Install network mocks for the filter + facet endpoints. The filter mock
 * inspects the POST body so the response total tracks the active filters.
 */
async function mockExtractionApis(page: Page): Promise<void> {
  await page.route(FILTER_API, async (route: Route) => {
    const req = (route.request().postDataJSON() ?? {}) as BaseSchemaFilterRequest;
    const total = totalForRequest(req);
    const limit = req.limit ?? 25;
    const offset = req.offset ?? 0;
    const rowCount = Math.min(limit, Math.max(total - offset, 0));
    const response: BaseSchemaFilterResponse = {
      documents: Array.from({ length: rowCount }, (_, i) => makeRow(offset + i + 1)),
      total_count: total,
      limit,
      offset,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  // Facets are fetched lazily by the drawer; return empty so they never 500.
  await page.route(FACETS_API, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ facets: [] }),
    }),
  );
}

/**
 * The advanced `BaseFiltersDrawer` panel — scoped via its `data-testid`
 * (`components/search/BaseFiltersDrawer.tsx`). Used to disambiguate controls
 * that also appear in the always-visible QuickFilters strip (see header
 * note) — a `div`-ancestor filter on the "Reset" button is not narrow enough
 * for this, since every ancestor `div` up to the page root also "has" that
 * button, so `.first()` would resolve to a near-page-root scope instead of
 * the drawer itself.
 */
function advancedDrawer(page: Page): Locator {
  return page.getByTestId('advanced-filters-drawer');
}

/**
 * Expand the collapsed advanced drawer via its "Filters" toggle. Idempotent
 * within a test only in the sense that callers invoke it once before the
 * first drawer-control interaction — the drawer stays expanded afterwards.
 */
async function expandDrawer(page: Page): Promise<void> {
  await advancedDrawer(page).getByRole('button', { name: /^Filters/ }).click();
}

/** The drawer-scoped "Female" (offender_gender = gender_female) enum checkbox. */
function genderFemaleCheckbox(page: Page): Locator {
  return advancedDrawer(page)
    .getByRole('group', { name: 'Gender', exact: true })
    .getByLabel('Female', { exact: true });
}

test.describe('/search/extractions', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockExtractionApis(authenticatedPage);
  });

  test('happy path: text + filters drive results and serialise to the URL', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/search/extractions');

    // Baseline (no filters) → 120.
    await expect(page.getByText(/120 judgments/)).toBeVisible({ timeout: 15_000 });

    // 1. Type "robbery" in the full-text bar → count drops to 80.
    await page.getByLabel('Full-text search').fill('robbery');
    await expect(page.getByText(/80 judgments/)).toBeVisible();

    // 2. Select offender_gender = gender_female ("Female" via formatEnumOptionLabel).
    await expandDrawer(page);
    await genderFemaleCheckbox(page).check();
    await expect(page.getByText(/50 judgments/)).toBeVisible();

    // 3. Active-filter chip "Gender: 1" appears (describeActive → array length).
    const genderChip = page.locator('text=/Gender:\\s*1/');
    await expect(genderChip).toBeVisible();

    // 4. Set co_def_acc_num (Co-defendants count) min to 2 → count drops to 40.
    await page.getByLabel('Co-defendants count minimum').fill('2');
    await expect(page.getByText(/40 judgments/)).toBeVisible();

    // 5. URL carries both the text query and the opaque filter blob.
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('robbery');
    await expect.poll(() => new URL(page.url()).searchParams.get('f')).toBeTruthy();
  });

  test('URL state restoration: opening the captured URL rehydrates UI', async ({
    authenticatedPage: page,
  }) => {
    // Build the same state as the happy path, then capture the URL.
    await page.goto('/search/extractions');
    await expect(page.getByText(/120 judgments/)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Full-text search').fill('robbery');
    await expandDrawer(page);
    await genderFemaleCheckbox(page).check();
    await page.getByLabel('Co-defendants count minimum').fill('2');
    await expect(page.getByText(/40 judgments/)).toBeVisible();

    await expect.poll(() => new URL(page.url()).searchParams.get('f')).toBeTruthy();
    const capturedUrl = page.url();
    expect(capturedUrl).toContain('q=robbery');

    // Fresh navigation (clean session within the same authenticated context).
    await page.goto('/search/extractions'); // reset
    await page.goto(capturedUrl);

    // Text bar restored.
    await expect(page.getByLabel('Full-text search')).toHaveValue('robbery');

    // Two active-filter chips restored (Gender + Co-defendants count).
    await expect(page.locator('text=/Gender:\\s*1/')).toBeVisible();
    await expect(page.getByText('Co-defendants count:', { exact: false })).toBeVisible();

    // Drawer control selections restored (drawer starts collapsed on this
    // fresh navigation too — expand it before asserting on its controls).
    await expandDrawer(page);
    await expect(genderFemaleCheckbox(page)).toBeChecked();
    await expect(page.getByLabel('Co-defendants count minimum')).toHaveValue('2');

    // Count reflects the restored filters (40), not the baseline.
    await expect(page.getByText(/40 judgments/)).toBeVisible();
  });

  test('clear-all resets the URL and restores the baseline count', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/search/extractions');
    await expect(page.getByText(/120 judgments/)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Full-text search').fill('robbery');
    await expandDrawer(page);
    await genderFemaleCheckbox(page).check();
    await expect(page.getByText(/50 judgments/)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('f')).toBeTruthy();

    // Click "Clear all" in the chips bar.
    await page.getByRole('button', { name: 'Clear all' }).click();

    // URL back to a bare /search/extractions (no query string).
    await expect.poll(() => new URL(page.url()).search).toBe('');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/search/extractions');

    // Baseline count restored; the text bar is empty.
    await expect(page.getByText(/120 judgments/)).toBeVisible();
    await expect(page.getByLabel('Full-text search')).toHaveValue('');
  });
});
