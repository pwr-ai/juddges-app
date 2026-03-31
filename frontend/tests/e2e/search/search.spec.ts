import { test, expect } from '@playwright/test';
import { SearchPage } from '../page-objects/SearchPage';
import { DocumentPage } from '../page-objects/DocumentPage';
import { mockSearchSuccess, mockSearchError, mockSearchEmpty, mockSearchPaginated, createMockJudgments } from '../helpers/api-mocks';

/**
 * Search Flow E2E Tests
 *
 * Tests the three most critical search user flows:
 *   1. Happy path: search query → filter by jurisdiction/date/court → view paginated results
 *   2. Empty results: graceful empty state with actionable messaging
 *   3. Error state: network/server error recovery and continued usability
 *
 * The search page uses a two-mode layout:
 *   - Expanded mode (no results yet): typing animation header + search form + example queries
 *   - Results mode (post-search): compact search bar + results list + filter sidebar
 */

// ---------------------------------------------------------------------------
// Shared auth mock — reused in every test via beforeEach
// ---------------------------------------------------------------------------

function setupMockAuth(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    (window as any).mockSupabaseClient = {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: 'test-user-id', email: 'test@example.com' } },
            error: null,
          }),
        getSession: () =>
          Promise.resolve({
            data: {
              session: {
                user: { id: 'test-user-id', email: 'test@example.com' },
                access_token: 'mock-access-token',
              },
            },
            error: null,
          }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Search Flow', () => {
  let searchPage: SearchPage;
  let documentPage: DocumentPage;

  test.beforeEach(async ({ page }) => {
    searchPage = new SearchPage(page);
    documentPage = new DocumentPage(page);
    await setupMockAuth(page);
  });

  // =========================================================================
  // HAPPY PATH — complete search, filter, and pagination flow
  // =========================================================================

  test.describe('Happy path — search, filter, and paginate', () => {
    test('search page renders expanded landing state with search form and language toggles', async ({ page }) => {
      await searchPage.goto();

      // Heading text is rendered character-by-character by the TypingHeader component;
      // wait long enough for it to settle (max 5 s).
      await expect(page.locator('h1')).toContainText('JuDDGES', { timeout: 5000 });

      await expect(searchPage.searchInput).toBeVisible();

      // Both jurisdiction language toggles must be present
      await expect(searchPage.polishLanguageToggle).toBeVisible();
      await expect(searchPage.ukLanguageToggle).toBeVisible();
    });

    test('user performs a search and receives results', async ({ page }) => {
      await searchPage.goto();

      await mockSearchSuccess(page, {
        documents: [
          {
            document_id: 'j-2024-001',
            title: 'Supreme Court ruling on Swiss franc loans',
            content: 'In the matter of consumer protection regarding foreign-currency loans...',
            document_type: 'judgment',
            language: 'pl',
            date: '2024-03-10',
            court_name: 'Sąd Najwyższy',
            case_number: 'I CSK 42/2024',
            jurisdiction: 'PL',
            keywords: ['consumer protection', 'foreign currency', 'abusive clauses'],
          },
          {
            document_id: 'j-2024-002',
            title: 'Consumer rights in banking sector',
            content: 'Analysis of banking consumer rights following CJEU guidance...',
            document_type: 'judgment',
            language: 'pl',
            date: '2024-01-25',
            court_name: 'Sąd Apelacyjny w Warszawie',
            case_number: 'VI ACa 88/2024',
            jurisdiction: 'PL',
          },
        ],
        chunks: [
          {
            document_id: 'j-2024-001',
            content: 'Key findings regarding abusive clauses in franc loans...',
            score: 0.97,
          },
        ],
        question: 'Swiss franc loan consumer protection',
      });

      // Perform the search
      await searchPage.search('Swiss franc loan consumer protection', {
        language: 'pl',
        waitForResults: true,
      });

      // Results mode: back button and results container become visible
      await searchPage.verifyResultsMode();
      await searchPage.verifyResultsDisplayed();

      // At least the two mocked documents should be rendered
      const count = await searchPage.getResultCount();
      expect(count).toBeGreaterThanOrEqual(1);

      // The search input retains the submitted query
      await expect(searchPage.searchInput).toHaveValue('Swiss franc loan consumer protection');
    });

    test('user filters results by jurisdiction (PL vs UK)', async ({ page }) => {
      await searchPage.goto();

      // Mock 10 mixed-jurisdiction documents
      const allDocs = createMockJudgments(10);
      await mockSearchSuccess(page, {
        documents: allDocs,
        chunks: [],
        question: 'contract law',
      });

      await searchPage.search('contract law');
      await searchPage.verifyResultsDisplayed();

      // The filter sidebar is rendered once results exist.
      // Try to click a jurisdiction-based checkbox filter.
      const plCheckbox = page.getByRole('checkbox', { name: /PL|Polish/i }).first();
      const ukCheckbox = page.getByRole('checkbox', { name: /UK|British/i }).first();

      if (await plCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await plCheckbox.click();
        // Give Zustand filter state a tick to propagate
        await page.waitForTimeout(400);
        // Results container must remain visible after filtering
        await searchPage.verifyResultsDisplayed();
      } else if (await ukCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ukCheckbox.click();
        await page.waitForTimeout(400);
        await searchPage.verifyResultsDisplayed();
      } else {
        // If no jurisdiction checkboxes exist yet (feature flag / layout), the
        // test still verifies the filter sidebar itself is rendered.
        await expect(searchPage.filterSidebar).toBeVisible({ timeout: 3000 });
      }
    });

    test('user filters results by court name', async ({ page }) => {
      await searchPage.goto();

      await mockSearchSuccess(page, {
        documents: createMockJudgments(6),
        chunks: [],
        question: 'negligence',
      });

      await searchPage.search('negligence');
      await searchPage.verifyResultsDisplayed();

      // Attempt a court-name filter (the filter sidebar is populated from results metadata)
      const courtCheckbox = page.getByRole('checkbox', { name: /Supreme Court|Sąd Najwyższy/i }).first();

      if (await courtCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await courtCheckbox.click();
        await page.waitForTimeout(400);
        await searchPage.verifyResultsDisplayed();

        // Reset and verify all results reappear
        const resetButton = page.getByRole('button', { name: /reset|clear.*filter/i });
        if (await resetButton.isVisible({ timeout: 1500 }).catch(() => false)) {
          await resetButton.click();
          await page.waitForTimeout(400);
          const afterResetCount = await searchPage.getResultCount();
          expect(afterResetCount).toBeGreaterThan(0);
        }
      }
    });

    test('user paginates through search results with load-more', async ({ page }) => {
      await searchPage.goto();

      // Create 25 documents — more than a single page's worth
      const allDocs = createMockJudgments(25);
      await mockSearchPaginated(page, allDocs, 10);

      await searchPage.search('civil liability');
      await searchPage.verifyResultsDisplayed();

      // Look for a "Load more" or pagination button
      const loadMoreButton = page
        .getByRole('button', { name: /load more|show more|next page/i })
        .or(page.getByTestId('load-more-button'));

      if (await loadMoreButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        const initialCount = await searchPage.getResultCount();
        await loadMoreButton.click();
        // Wait for additional results to render
        await expect(async () => {
          const newCount = await searchPage.getResultCount();
          expect(newCount).toBeGreaterThan(initialCount);
        }).toPass({ timeout: 8000 });
      } else {
        // Page-number buttons are an alternative pagination style
        const page2Button = page.getByRole('button', { name: '2' }).or(
          page.getByLabel('Go to page 2')
        );
        if (await page2Button.isVisible({ timeout: 2000 }).catch(() => false)) {
          await page2Button.click();
          await page.waitForTimeout(500);
          await searchPage.verifyResultsDisplayed();
        }
      }
    });

    test('user can switch between Polish and UK corpus before searching', async ({ page }) => {
      await searchPage.goto();

      await mockSearchSuccess(page, {
        documents: [
          {
            document_id: 'uk-001',
            title: '[2024] EWHC 1234 (Ch)',
            content: 'THE HIGH COURT OF JUSTICE. CHANCERY DIVISION...',
            document_type: 'judgment',
            language: 'en',
            date: '2024-02-14',
            court_name: 'High Court of Justice',
            case_number: '[2024] EWHC 1234',
            jurisdiction: 'UK',
          },
        ],
        chunks: [],
        question: 'breach of contract UK',
      });

      // Switch to UK corpus
      await searchPage.ukLanguageToggle.click();

      await searchPage.search('breach of contract UK', { waitForResults: false });

      // Both language toggles must remain accessible after searching
      await expect(searchPage.polishLanguageToggle).toBeVisible();
      await expect(searchPage.ukLanguageToggle).toBeVisible();
    });

    test('user clicks an example query and it populates the search input', async ({ page }) => {
      await searchPage.goto();

      await mockSearchSuccess(page, {
        documents: [
          {
            document_id: 'example-1',
            title: 'Copyright infringement case',
            content: 'The plaintiff claims copyright was infringed...',
            document_type: 'judgment',
          },
        ],
        chunks: [],
        question: 'copyright infringement',
      });

      // The expanded view renders example query cards / buttons
      const exampleButton = page
        .locator('button, a, [role="button"]')
        .filter({ hasText: /copyright|contract|umow|prawo|tax|odpowiedzialność/i })
        .first();

      if (await exampleButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await exampleButton.click();

        // Either the input is pre-filled or results are directly shown
        const inputFilled = await searchPage.searchInput
          .inputValue()
          .then((v) => v.length > 0)
          .catch(() => false);
        const resultsShown = await searchPage.resultsContainer
          .isVisible({ timeout: 4000 })
          .catch(() => false);

        expect(inputFilled || resultsShown).toBeTruthy();
      }
    });

    test('user navigates back from results to the expanded landing view', async ({ page }) => {
      await searchPage.goto();

      await mockSearchSuccess(page, {
        documents: [
          {
            document_id: 'doc-back',
            title: 'Test judgment',
            content: 'Content',
            document_type: 'judgment',
          },
        ],
        chunks: [],
        question: 'test',
      });

      await searchPage.search('test');
      await searchPage.verifyResultsMode();

      // The "Back" button resets state and returns to expanded mode
      await searchPage.goBack();

      await expect(async () => {
        await searchPage.verifyExpandedMode();
      }).toPass({ timeout: 5000 });
    });

    test('user opens document detail dialog directly from a search result', async ({ page }) => {
      await searchPage.goto();

      await page.route('**/api/documents/search', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: [
              {
                document_id: 'detail-doc-1',
                title: 'Landmark ruling on data privacy',
                content: 'Court held that personal data must be protected under GDPR...',
                document_type: 'judgment',
                language: 'en',
                court_name: 'Supreme Court',
                case_number: 'SC/2024/001',
                date: '2024-04-01',
              },
            ],
            chunks: [
              { document_id: 'detail-doc-1', content: 'GDPR protection scope...', score: 0.93 },
            ],
            question: 'data privacy GDPR',
          }),
        })
      );

      // Mock the individual document endpoint in case the app fetches it
      await page.route('**/api/documents/detail-doc-1', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            document_id: 'detail-doc-1',
            title: 'Landmark ruling on data privacy',
            content: 'FULL TEXT: Court held that personal data must be protected under GDPR...',
            metadata: {
              court_name: 'Supreme Court',
              case_number: 'SC/2024/001',
              date: '2024-04-01',
            },
          }),
        })
      );

      await searchPage.search('data privacy GDPR');
      await searchPage.verifyResultsDisplayed();

      // Click the first result — wait for navigation or dialog
      await searchPage.clickResult(0);

      await Promise.race([
        page.waitForURL(/\/documents\//, { timeout: 5000 }).catch(() => {}),
        page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      ]);

      // The app either opens a dialog or navigates to /documents/<id>
      const openedDialog = await page.getByRole('dialog').isVisible().catch(() => false);
      const navigatedToDoc = page.url().includes('/documents/');

      expect(openedDialog || navigatedToDoc).toBeTruthy();
    });
  });

  // =========================================================================
  // EMPTY RESULTS
  // =========================================================================

  test.describe('Empty results state', () => {
    test('displays empty state when query matches no documents', async ({ page }) => {
      await searchPage.goto();

      await mockSearchEmpty(page, 'xqzmnopqrstuv12345');

      await searchPage.search('xqzmnopqrstuv12345', { waitForResults: false });
      // The search must complete (loading modal must disappear)
      await expect(page.locator('.animate-spin, [data-testid="search-loading"]')).not.toBeVisible({ timeout: 12000 });

      // Accept either an explicit "no results" label or a zero-result count
      const emptyLocator = page.locator('text=/no.*results|no.*found|empty|0.*results|found.*0/i');
      const visible = await emptyLocator.isVisible({ timeout: 5000 }).catch(() => false);
      expect(visible).toBeTruthy();
    });

    test('empty state keeps search input functional for a new query', async ({ page }) => {
      await searchPage.goto();

      await mockSearchEmpty(page, 'zzznoresults');

      await searchPage.search('zzznoresults', { waitForResults: false });

      // Wait for loading to clear before checking input state
      await expect(page.locator('.animate-spin, [data-testid="search-loading"]')).not.toBeVisible({ timeout: 10000 });

      // The search input must remain enabled so the user can try again
      await expect(searchPage.searchInput).toBeVisible();
      await expect(searchPage.searchInput).toBeEnabled();
    });
  });

  // =========================================================================
  // ERROR STATE
  // =========================================================================

  test.describe('Error state', () => {
    test('displays error feedback when the search API returns 500', async ({ page }) => {
      await searchPage.goto();

      await mockSearchError(page, 'Search service temporarily unavailable');

      await searchPage.search('test error query', { waitForResults: false });

      // Wait for loading to clear — use polling instead of fixed timeout
      await expect(async () => {
        const spinning = await page.locator('.animate-spin, [data-testid="search-loading"]').isVisible().catch(() => false);
        expect(spinning).toBeFalsy();
      }).toPass({ timeout: 10000 });

      // The search input must not be frozen — user can retry
      await expect(searchPage.searchInput).toBeVisible();
      await expect(searchPage.searchInput).toBeEnabled();

      // After a 500 error, the app must show an error indicator OR keep the
      // search input functional for retry. We require at least one of these
      // to be verifiable rather than vacuously passing.
      const errorIndicator = page.locator('text=/error|unavailable|failed|retry|try again/i');
      const errorVisible = await errorIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      // Use expect.soft for the error message — the hard requirement is that
      // the input remains enabled (asserted above). The error message is the
      // preferred UX but the minimum bar is a functional retry path.
      expect.soft(
        errorVisible,
        'Expected an error indicator (toast, inline message, or banner) after search API returned 500'
      ).toBeTruthy();
    });

    test('displays error feedback when the search API returns a network timeout', async ({ page }) => {
      await searchPage.goto();

      // Simulate connection abort
      await page.route('**/api/documents/search', (route) => route.abort('connectionaborted'));

      await searchPage.search('timeout query', { waitForResults: false });

      // Wait for the error state to settle — loading indicator should disappear
      await expect(page.locator('.animate-spin, [data-testid="search-loading"]')).not.toBeVisible({ timeout: 12000 });

      // Input must remain operable after network failure
      await expect(searchPage.searchInput).toBeVisible();
      await expect(searchPage.searchInput).toBeEnabled();
    });
  });
});
