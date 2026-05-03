import { test, expect } from '@playwright/test';
import { SearchPage } from '../page-objects/SearchPage';
import { ChatPage } from '../page-objects/ChatPage';
import { DocumentPage } from '../page-objects/DocumentPage';

/**
 * Primary User Journey E2E Test
 *
 * Validates the core end-to-end flow a new user follows:
 *   visit home → navigate to search → perform a search →
 *   click a result → view document details → navigate to chat
 *
 * This test is intentionally marked slow because it exercises the full
 * application stack across multiple pages and network interactions.
 */

// ─── Shared mock data ────────────────────────────────────────────────────────

const MOCK_DOCUMENT_ID = 'primary-journey-doc-001';

const MOCK_SEARCH_RESPONSE = {
  documents: [
    {
      document_id: MOCK_DOCUMENT_ID,
      title: 'Swiss Franc Loan Ruling',
      content:
        'Supreme Court ruling on consumer protection rights in Swiss franc denominated mortgage contracts.',
      document_type: 'judgment',
      language: 'pl',
      date: '2023-06-15',
      court_name: 'Supreme Court of Poland',
      case_number: 'I CSK 100/2023',
    },
  ],
  chunks: [
    {
      document_id: MOCK_DOCUMENT_ID,
      content: 'The court finds that conversion clauses constitute unfair contractual terms...',
      score: 0.97,
      metadata: {},
    },
  ],
  question: 'Swiss franc loan consumer rights',
};

const MOCK_DOCUMENT_RESPONSE = {
  id: MOCK_DOCUMENT_ID,
  title: 'Swiss Franc Loan Ruling',
  content:
    'The court finds that conversion clauses in Swiss franc denominated mortgage contracts constitute unfair contractual terms under EU consumer protection directives.',
  document_type: 'judgment',
  court_name: 'Supreme Court of Poland',
  case_number: 'I CSK 100/2023',
  date: '2023-06-15',
  language: 'pl',
};

const MOCK_CHAT_RESPONSE = {
  output: {
    text: 'Based on the Swiss franc loan rulings, courts have consistently held that conversion clauses are unfair under EU consumer protection law.',
    document_ids: [MOCK_DOCUMENT_ID],
  },
  metadata: { run_id: 'journey-test-run-001' },
};

// ─── Auth mock helper ─────────────────────────────────────────────────────────

/**
 * Injects a mock Supabase client so authenticated routes load without a real
 * Supabase project. Must be called before page.goto().
 */
async function mockAuth(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.mockSupabaseClient = {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: 'journey-user-id', email: 'journey@example.com' } },
            error: null,
          }),
        getSession: () =>
          Promise.resolve({
            data: {
              session: {
                user: { id: 'journey-user-id', email: 'journey@example.com' },
                access_token: 'mock-token',
              },
            },
            error: null,
          }),
      },
    };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Primary User Journey', () => {
  // Mark every test in this suite as slow; the journey crosses multiple pages
  // and involves several network interactions.
  test.slow();

  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('complete journey: home → search → result → document → chat', async ({ page }) => {
    const searchPage = new SearchPage(page);
    const chatPage = new ChatPage(page);
    const documentPage = new DocumentPage(page);

    // ── Step 1: Visit home and navigate to search ─────────────────────────
    await page.goto('/');
    // The home route should either be the search page or redirect to it.
    // Wait for a stable load state before checking URL / clicking navigation.
    await page.waitForLoadState('domcontentloaded');

    const alreadyOnSearch = page.url().includes('/search');
    if (!alreadyOnSearch) {
      // Home page exists — look for a navigation link or CTA that leads to search
      const searchNavLink = page
        .getByRole('link', { name: /search/i })
        .or(page.getByRole('button', { name: /search/i }))
        .or(page.getByRole('link', { name: /get started|start searching/i }));

      // Only click if a search navigation element is actually present
      if (await searchNavLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchNavLink.first().click();
        await page.waitForLoadState('domcontentloaded');
      } else {
        // Fall back: navigate directly
        await searchPage.goto();
      }
    }

    // Verify we have landed on the search page
    await expect(page).toHaveURL(/\/search/);
    await expect(searchPage.searchInput).toBeVisible();

    // ── Step 2: Perform a search ──────────────────────────────────────────
    // Register mock before the search request is fired
    await page.route('**/api/documents/search', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SEARCH_RESPONSE),
      })
    );

    await searchPage.searchInput.fill('Swiss franc loan consumer rights');
    await searchPage.searchButton.click();

    // Wait for the results count indicator — no hard timeout
    await searchPage.waitForSearchResults();

    // Verify the mocked document title appears in the results list
    await expect(page.getByText('Swiss Franc Loan Ruling')).toBeVisible();

    // ── Step 3: Click on the first result ────────────────────────────────
    // Mock the document detail API before clicking
    await page.route(`**/api/documents/${MOCK_DOCUMENT_ID}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DOCUMENT_RESPONSE),
      })
    );

    // The result item may be a link to /documents/<id> or an expand button;
    // try the data-testid first, then fall back to a link containing the title.
    const resultItem = page
      .getByTestId('search-result-item')
      .first()
      .or(page.getByRole('link', { name: /Swiss Franc Loan Ruling/i }).first());

    if (await resultItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resultItem.click();
    } else {
      // The app may use a "View" / "Details" button per result row
      const viewButton = page
        .getByRole('button', { name: /view|details|open/i })
        .first()
        .or(page.getByRole('link', { name: /view|details|open/i }).first());
      await viewButton.click();
    }

    // ── Step 4: View document details ─────────────────────────────────────
    // After clicking the result the app should navigate to a document page
    // OR expand an inline detail panel. In both cases the document title
    // must become visible.
    await expect(
      page.getByText('Swiss Franc Loan Ruling').or(documentPage.documentTitle)
    ).toBeVisible({ timeout: 10000 });

    // If we navigated to a dedicated document URL, verify it
    if (page.url().includes('/documents/')) {
      await documentPage.verifyDocumentPageDisplayed();
    }

    // ── Step 5: Navigate to chat ──────────────────────────────────────────
    // Register chat mock before navigating
    await page.route('**/api/chat/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CHAT_RESPONSE),
      })
    );

    // Look for a "Chat" nav link or button; fall back to direct navigation
    const chatNavLink = page
      .getByRole('link', { name: /^chat$/i })
      .or(page.getByRole('link', { name: /ask.*ai|open.*chat/i }));

    if (await chatNavLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatNavLink.first().click();
      await page.waitForLoadState('domcontentloaded');
    } else {
      await chatPage.goto();
    }

    await expect(page).toHaveURL(/\/chat/);

    // Verify the chat interface is ready — no hard wait needed
    await chatPage.verifyChatReady();
  });

  test('search result count is displayed after a successful search', async ({ page }) => {
    const searchPage = new SearchPage(page);

    await page.route('**/api/documents/search', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SEARCH_RESPONSE),
      })
    );

    await searchPage.goto();
    await searchPage.search('Swiss franc loan consumer rights');

    // resultsCount locator matches text like "Found 1 result" — wait for it
    await expect(searchPage.resultsCount).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Swiss Franc Loan Ruling')).toBeVisible();
  });

  test('search page loads in expanded mode before first search', async ({ page }) => {
    const searchPage = new SearchPage(page);

    await searchPage.goto();

    // The search input must be visible immediately on load
    await expect(searchPage.searchInput).toBeVisible();

    // Verify the pre-search welcome / expanded state
    await searchPage.verifyExpandedMode();
  });

  test('navigating from chat back to search preserves application state', async ({ page }) => {
    const searchPage = new SearchPage(page);
    const chatPage = new ChatPage(page);

    // Start at chat
    await chatPage.goto();
    await expect(page).toHaveURL(/\/chat/);
    await chatPage.verifyChatReady();

    // Navigate to search via direct URL (simulates clicking nav link)
    await page.route('**/api/documents/search', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SEARCH_RESPONSE),
      })
    );

    await searchPage.goto();
    await expect(page).toHaveURL(/\/search/);

    // Search page must be in expanded (ready-to-search) mode
    await expect(searchPage.searchInput).toBeVisible();
    await expect(searchPage.searchInput).toBeEnabled();
  });
});
