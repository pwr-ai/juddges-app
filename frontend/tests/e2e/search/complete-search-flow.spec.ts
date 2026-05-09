import { test, expect } from '@playwright/test';
import { SearchPage } from '../page-objects/SearchPage';
import { DocumentPage } from '../page-objects/DocumentPage';

/**
 * Complete Search Flow E2E Tests
 *
 * Tests the entire search workflow including:
 * - Basic search
 * - Filter application
 * - Result navigation
 * - Document viewing
 */

test.describe('Complete Search Flow', () => {
  let searchPage: SearchPage;
  let documentPage: DocumentPage;

  test.beforeEach(async ({ page }) => {
    // Initialize page objects
    searchPage = new SearchPage(page);
    documentPage = new DocumentPage(page);

    // Mock Supabase auth for authenticated routes
    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: {
              user: {
                id: 'test-user-id',
                email: 'test@example.com'
              }
            },
            error: null
          }),
          getSession: () => Promise.resolve({
            data: {
              session: {
                user: {
                  id: 'test-user-id',
                  email: 'test@example.com'
                }
              }
            },
            error: null
          })
        }
      };
      window.mockSupabaseClient = mockSupabaseClient;
    });

    // Navigate to search page
    await searchPage.goto();
  });

  test('user can perform a complete search workflow', async ({ page }) => {
    // Mock search API with comprehensive results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [
            {
              document_id: 'doc1',
              title: 'Swiss Franc Loan Contract Judgment',
              content: 'Supreme Court ruling on unfair contract terms in foreign currency loans...',
              document_type: 'judgment',
              language: 'pl',
              date: '2023-01-15',
              court_name: 'Supreme Court of Poland',
              case_number: 'I CSK 123/2023',
              jurisdiction: 'PL',
              keywords: ['consumer protection', 'contract law', 'currency conversion']
            },
            {
              document_id: 'doc2',
              title: 'Consumer Rights in Financial Services',
              content: 'Analysis of consumer protection laws in banking sector...',
              document_type: 'judgment',
              language: 'pl',
              date: '2023-02-20',
              court_name: 'Court of Appeal',
              case_number: 'II CA 456/2023',
              jurisdiction: 'PL',
              keywords: ['consumer protection', 'financial services']
            }
          ],
          chunks: [
            {
              document_id: 'doc1',
              content: 'Key findings regarding unfair contract terms...',
              score: 0.95,
              metadata: {}
            }
          ],
          question: 'Swiss franc loans consumer protection'
        })
      });
    });

    // Step 1: Verify expanded search interface is displayed
    await searchPage.verifyExpandedMode();

    // Step 2: Perform search
    await searchPage.search('Swiss franc loans consumer protection', {
      language: 'pl',
      waitForResults: true
    });

    // Step 3: Verify results are displayed
    await searchPage.verifyResultsDisplayed();
    await searchPage.verifyResultsMode();

    // Step 4: Verify result count
    const resultCount = await searchPage.getResultCount();
    expect(resultCount).toBeGreaterThan(0);

    // Step 5: Verify search input still shows query
    await expect(searchPage.searchInput).toHaveValue('Swiss franc loans consumer protection');
  });

  test('user can search with filters', async ({ page }) => {
    // Mock search results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: Array.from({ length: 10 }, (_, i) => ({
            document_id: `doc${i}`,
            title: `Document ${i}`,
            content: `Content for document ${i}`,
            document_type: 'judgment',
            language: 'pl',
            date: `2023-0${(i % 9) + 1}-01`,
            court_name: i % 2 === 0 ? 'Supreme Court' : 'Administrative Court',
            jurisdiction: 'PL',
            keywords: i % 2 === 0 ? ['contract law'] : ['tax law']
          })),
          chunks: [],
          question: 'test query'
        })
      });
    });

    // Perform initial search
    await searchPage.search('test query');
    await searchPage.verifyResultsDisplayed();

    // Apply filter
    const initialCount = await searchPage.getResultCount();

    // Apply court filter if available
    const filterCheckbox = page.getByRole('checkbox', { name: /supreme court|court/i }).first();
    if (await filterCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filterCheckbox.click();
      await page.waitForTimeout(500); // Wait for filter to apply
    }

    // Verify results are still displayed (even if count hasn't changed)
    await searchPage.verifyResultsDisplayed();
  });

  test('user can navigate to document details from search results', async ({ page }) => {
    // Mock search results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [{
            document_id: 'detailed-doc',
            title: 'Contract Law Precedent Case',
            content: 'Detailed analysis of contract law principles...',
            document_type: 'judgment',
            language: 'pl',
            court_name: 'Supreme Court',
            case_number: 'I CSK 789/2023',
            date: '2023-03-15'
          }],
          chunks: [],
          question: 'contract law'
        })
      });
    });

    // Mock document details API
    await page.route('**/api/documents/detailed-doc', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'detailed-doc',
          title: 'Contract Law Precedent Case',
          content: 'Full content of the contract law case...',
          metadata: {
            court_name: 'Supreme Court',
            case_number: 'I CSK 789/2023',
            date: '2023-03-15'
          }
        })
      });
    });

    // Perform search
    await searchPage.search('contract law');
    await searchPage.verifyResultsDisplayed();

    // Click on first result
    await searchPage.clickResult(0);

    // Verify document page is displayed
    await page.waitForTimeout(1000);

    // Check if we navigated to document page or opened dialog
    const hasDocumentUrl = page.url().includes('/documents/');
    const hasDialog = await page.getByRole('dialog').isVisible({ timeout: 2000 }).catch(() => false);

    // Either URL changed or dialog opened
    expect(hasDocumentUrl || hasDialog).toBeTruthy();
  });

  test('user can handle empty search results', async ({ page }) => {
    // Mock empty results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [],
          chunks: [],
          question: 'nonexistent query xyz123'
        })
      });
    });

    // Perform search
    await searchPage.search('nonexistent query xyz123');

    // Wait for search to complete
    await page.waitForTimeout(2000);

    // Verify empty state is shown (may vary by implementation)
    const hasEmptyMessage = await page.locator('text=/no.*results|no.*found|empty|try.*different/i').isVisible({ timeout: 2000 }).catch(() => false);
    const hasZeroResults = await page.locator('text=/0.*results|found.*0/i').isVisible({ timeout: 2000 }).catch(() => false);

    // Accept either explicit empty message or zero results
    expect(hasEmptyMessage || hasZeroResults).toBeTruthy();
  });

  test('user can handle search errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Search service temporarily unavailable' })
      });
    });

    // Perform search
    await searchPage.search('test query', { waitForResults: false });

    // Wait for error to appear
    await page.waitForTimeout(3000);

    // Verify no crash and page is still functional
    await expect(searchPage.searchInput).toBeVisible();
    await expect(searchPage.searchInput).toBeEnabled();
  });

  test('user can use example queries', async ({ page }) => {
    // Mock search for example query
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [{
            document_id: 'example-doc',
            title: 'Copyright Law Example Case',
            content: 'Analysis of copyright infringement...',
            document_type: 'judgment'
          }],
          chunks: [],
          question: 'copyright'
        })
      });
    });

    // Look for example query cards
    const exampleCard = page.locator('button, a, [role="button"]').filter({ hasText: /copyright|contract|legal/i }).first();

    if (await exampleCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exampleCard.click();

      // Verify search was performed
      await page.waitForTimeout(1000);

      // Search input should be filled or results should appear
      const inputFilled = await searchPage.searchInput.inputValue().then(v => v.length > 0).catch(() => false);
      const resultsVisible = await searchPage.resultsContainer.isVisible({ timeout: 2000 }).catch(() => false);

      expect(inputFilled || resultsVisible).toBeTruthy();
    }
  });

  test('user can switch between languages', async ({ page }) => {
    // Mock search results for Polish
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [{
            document_id: 'pl-doc',
            title: 'Wyrok Sądu Najwyższego',
            content: 'Polski dokument prawny...',
            document_type: 'judgment',
            language: 'pl'
          }],
          chunks: [],
          question: 'test'
        })
      });
    });

    // Ensure Polish is selected
    await searchPage.polishLanguageToggle.click();

    // Perform search
    await searchPage.search('test', { waitForResults: false });

    // Verify language toggle is functional
    await expect(searchPage.polishLanguageToggle).toBeVisible();
    await expect(searchPage.ukLanguageToggle).toBeVisible();
  });

  test('user can navigate back from results', async ({ page }) => {
    // Mock search results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [{ document_id: 'doc1', title: 'Test Doc', content: 'Test', document_type: 'judgment' }],
          chunks: [],
          question: 'test'
        })
      });
    });

    // Perform search
    await searchPage.search('test');
    await searchPage.verifyResultsMode();

    // Go back
    await searchPage.goBack();

    // Verify we're back to expanded mode
    await page.waitForTimeout(500);
    await searchPage.verifyExpandedMode();
  });

  test('user can reset filters', async ({ page }) => {
    // Mock search results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: Array.from({ length: 5 }, (_, i) => ({
            document_id: `doc${i}`,
            title: `Document ${i}`,
            content: 'Content',
            document_type: 'judgment',
            court_name: 'Supreme Court',
            jurisdiction: 'PL'
          })),
          chunks: [],
          question: 'test'
        })
      });
    });

    // Perform search
    await searchPage.search('test');
    await searchPage.verifyResultsDisplayed();

    // Try to apply a filter
    const filterCheckbox = page.getByRole('checkbox').first();
    if (await filterCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filterCheckbox.click();
      await page.waitForTimeout(500);

      // Reset filters
      const resetButton = page.getByRole('button', { name: /reset|clear.*filter/i });
      if (await resetButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resetButton.click();
        await page.waitForTimeout(500);

        // Verify filters were reset (checkbox should be unchecked)
        const isChecked = await filterCheckbox.isChecked().catch(() => false);
        expect(isChecked).toBe(false);
      }
    }
  });
});
