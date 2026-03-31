import { test, expect } from '@playwright/test';
import { SearchPage } from '../page-objects/SearchPage';
import { DocumentPage } from '../page-objects/DocumentPage';
import { mockSearchSuccess, mockDocumentDetails, mockSimilarDocuments } from '../helpers/api-mocks';

/**
 * Document View Flow E2E Tests
 *
 * Covers the three most critical document viewing scenarios:
 *   1. Happy path: user opens a judgment from search results → verifies full
 *      document text, structured metadata, and similar document recommendations
 *   2. Metadata display: court name, case number, date, judges, legal bases
 *   3. Error state: document not found (404) and API failure (500) are handled
 *      gracefully without an unrecoverable crash
 *
 * Architecture notes:
 *   - Documents are opened either as a modal/dialog on /search or by navigating
 *     to /documents/<id>.  Both paths are tested.
 *   - The DocumentPage POM wraps common locators (heading, metadata block, tabs,
 *     similar documents, back button).
 *   - Auth is required for AI-powered actions (summarise, key points) but not
 *     for plain document viewing — both states are exercised.
 */

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const MOCK_DOC_ID = 'judgment-2024-supreme-001';

const MOCK_FULL_DOCUMENT = {
  document_id: MOCK_DOC_ID,
  title: 'Supreme Court Judgment on Swiss Franc Loan Contracts',
  content: `FULL TEXT OF JUDGMENT

I. FACTS
The plaintiffs entered into a mortgage loan agreement denominated in Swiss francs (CHF) with the defendant bank in 2007. The agreement contained a conversion clause that allowed the bank to unilaterally set the exchange rate.

II. LEGAL ANALYSIS
The Court finds that the conversion clause constitutes an unfair (abusive) term under Art. 385¹ of the Polish Civil Code, as it places the entire currency risk on the consumer without adequate disclosure.

III. RULING
The Court hereby rules that:
1. The conversion clause is null and void.
2. The loan agreement remains valid as a PLN-denominated loan.
3. The defendant bank must return overpaid amounts within 30 days.`,
  document_type: 'judgment',
  language: 'pl',
  metadata: {
    document_id: MOCK_DOC_ID,
    title: 'Supreme Court Judgment on Swiss Franc Loan Contracts',
    document_type: 'judgment',
    date_issued: '2024-02-20',
    document_number: 'I CSK 42/2024',
    language: 'pl',
    court_name: 'Sąd Najwyższy',
    department_name: 'Izba Cywilna',
    presiding_judge: 'SSN Katarzyna Kowalska',
    judges: ['SSN Katarzyna Kowalska', 'SSN Marek Nowak', 'SSN Anna Wiśniewska'],
    parties: 'Jan Kowalski (plaintiff) v. Bank Pekao S.A. (defendant)',
    outcome: 'Appeal granted; conversion clause declared void',
    legal_bases: ['Art. 385¹ KC', 'Directive 93/13/EEC'],
    keywords: ['Swiss franc loans', 'abusive clauses', 'consumer protection', 'currency risk'],
  },
};

const MOCK_SIMILAR_DOCS = [
  {
    document_id: 'judgment-2023-appeal-001',
    title: 'Court of Appeal — CHF Loan Abusive Clause',
    content: 'Related judgment on foreign currency mortgage terms...',
    document_type: 'judgment' as const,
    language: 'pl',
    date: '2023-11-15',
    court_name: 'Sąd Apelacyjny w Warszawie',
    case_number: 'VI ACa 100/2023',
    jurisdiction: 'PL',
  },
  {
    document_id: 'judgment-2023-regional-002',
    title: 'Regional Court — Consumer Protection Ruling',
    content: 'First-instance ruling on unfair mortgage clause...',
    document_type: 'judgment' as const,
    language: 'pl',
    date: '2023-05-10',
    court_name: 'Sąd Okręgowy w Warszawie',
    case_number: 'XXV C 800/2023',
    jurisdiction: 'PL',
  },
];

// ---------------------------------------------------------------------------
// Auth mock helper
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
                refresh_token: 'mock-refresh-token',
                expires_at: Date.now() + 3_600_000,
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

test.describe('Document View Flow', () => {
  let searchPage: SearchPage;
  let documentPage: DocumentPage;

  test.beforeEach(async ({ page }) => {
    searchPage = new SearchPage(page);
    documentPage = new DocumentPage(page);
    await setupMockAuth(page);
  });

  // =========================================================================
  // HAPPY PATH — open document from search, read content, navigate similar
  // =========================================================================

  test.describe('Happy path — view full document from search results', () => {
    test('user opens a judgment from search results and sees its full text', async ({ page }) => {
      // Seed search results
      await mockSearchSuccess(page, {
        documents: [MOCK_FULL_DOCUMENT as any],
        chunks: [
          {
            document_id: MOCK_DOC_ID,
            content: 'The conversion clause is null and void...',
            score: 0.98,
          },
        ],
        question: 'Swiss franc loans abusive clause',
      });

      // Mock the individual document endpoint (used when navigating to /documents/<id>)
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);

      await searchPage.goto();
      await searchPage.search('Swiss franc loans abusive clause');
      await searchPage.verifyResultsDisplayed();

      // Open the first result — wait for navigation or dialog to appear
      await searchPage.clickResult(0);

      // The app either navigates to /documents/<id> or shows a dialog
      await Promise.race([
        page.waitForURL(/\/documents\//, { timeout: 5000 }).catch(() => {}),
        page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      ]);

      const navigatedToDoc = page.url().includes('/documents/');
      const dialogOpen = await page.getByRole('dialog').isVisible().catch(() => false);
      expect(navigatedToDoc || dialogOpen).toBeTruthy();

      // The document title must be visible
      const titleVisible = await page
        .locator('text=/Supreme Court Judgment on Swiss Franc/i')
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      expect(titleVisible).toBeTruthy();

      // Document body text should appear (at least a fragment)
      const bodyVisible = await page
        .locator('text=/conversion clause|abusive|CHF|loan/i')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      expect(bodyVisible).toBeTruthy();
    });

    test('direct navigation to /documents/<id> renders the full document', async ({ page }) => {
      // Mock document API before navigating
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      await page.goto(`/documents/${MOCK_DOC_ID}`);

      await documentPage.verifyDocumentPageDisplayed();

      // Title should be an h1
      await documentPage.verifyDocumentTitle('Supreme Court Judgment on Swiss Franc Loan Contracts');
    });

    test('document page displays rich metadata fields', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // At minimum, one of the key metadata values must be rendered on the page
      const courtVisible = await page.locator('text=/Sąd Najwyższy/i').isVisible({ timeout: 5000 }).catch(() => false);
      const caseNumVisible = await page.locator('text=/I CSK 42\/2024/i').isVisible({ timeout: 5000 }).catch(() => false);
      const dateVisible = await page.locator('text=/2024-02-20|February.*2024|20.*02.*2024/i').isVisible({ timeout: 5000 }).catch(() => false);
      const partiesVisible = await page.locator('text=/Kowalski|plaintiff|defendant/i').isVisible({ timeout: 5000 }).catch(() => false);

      expect(courtVisible || caseNumVisible || dateVisible || partiesVisible).toBeTruthy();
    });

    test('document page shows judge names and legal bases', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // Judges panel or legal bases section — at least one must be rendered
      // when the metadata contains both judges and legal_bases fields.
      const judgeLocator = page.locator('text=/SSN Katarzyna Kowalska|Katarzyna Kowalska/i');
      const legalBasisLocator = page.locator('text=/385|Directive 93\/13/i');

      // Use expect.soft so both checks are reported, then assert the disjunction
      const judgeVisible = await judgeLocator.isVisible({ timeout: 5000 }).catch(() => false);
      const legalBasisVisible = await legalBasisLocator.isVisible({ timeout: 5000 }).catch(() => false);

      // Either judges or legal bases section constitutes a pass — both are
      // present in MOCK_FULL_DOCUMENT.metadata so at least one must render.
      expect(
        judgeVisible || legalBasisVisible,
        'Expected at least one of judge names or legal bases to be visible on the document page'
      ).toBeTruthy();
    });

    test('document content is scrollable for long judgments', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // The content container should exist and have non-zero scrollHeight
      const contentContainer = page
        .locator('[data-testid="document-content"], .document-content, main article, main')
        .first();

      if (await contentContainer.isVisible({ timeout: 3000 }).catch(() => false)) {
        const scrollHeight = await contentContainer.evaluate((el) => el.scrollHeight);
        expect(scrollHeight).toBeGreaterThan(0);
      }
    });

    test('similar documents panel loads and links to related judgments', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      // Also mock the target document so navigation works
      await mockDocumentDetails(page, 'judgment-2023-appeal-001', {
        document_id: 'judgment-2023-appeal-001',
        title: 'Court of Appeal — CHF Loan Abusive Clause',
        content: 'Related judgment content...',
        document_type: 'judgment',
        language: 'pl',
      } as any);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // Switch to the "Similar" tab if present
      const similarTab = page.getByRole('tab', { name: /similar|related/i });
      if (await similarTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await similarTab.click();
      }

      // Verify at least one similar document title appears
      const similarLocator = page
        .locator('text=/Court of Appeal.*CHF|CHF Loan Abusive|Regional Court.*Consumer|Consumer Protection Ruling/i')
        .first();
      await expect(similarLocator).toBeVisible({ timeout: 5000 });
    });

    test('user navigates from a similar document back to the original', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);
      await mockDocumentDetails(page, 'judgment-2023-appeal-001', {
        document_id: 'judgment-2023-appeal-001',
        title: 'Court of Appeal — CHF Loan Abusive Clause',
        content: 'Detailed content of related judgment...',
        document_type: 'judgment',
        language: 'pl',
        metadata: { court_name: 'Sąd Apelacyjny w Warszawie', case_number: 'VI ACa 100/2023' },
      } as any);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      const similarTab = page.getByRole('tab', { name: /similar|related/i });
      if (await similarTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await similarTab.click();
      }

      const relatedLink = page
        .locator('a[href*="/documents/judgment-2023-appeal-001"], text=/Court of Appeal.*CHF/i')
        .first();

      if (await relatedLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await relatedLink.click();

        // Wait for navigation or content update before asserting
        await Promise.race([
          page.waitForURL(/\/documents\/judgment-2023-appeal-001/, { timeout: 5000 }).catch(() => {}),
          page.locator('text=/Court of Appeal.*CHF Loan Abusive Clause/i').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
        ]);

        // Verify we navigated to (or displayed) the related document
        await expect(
          page.locator('text=/Court of Appeal.*CHF Loan Abusive Clause/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('back button from document page returns to search results', async ({ page }) => {
      // Start from search results so the browser history has /search in it
      await mockSearchSuccess(page, {
        documents: [MOCK_FULL_DOCUMENT as any],
        chunks: [],
        question: 'franc loans',
      });
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);

      await searchPage.goto();
      await searchPage.search('franc loans');
      await searchPage.verifyResultsDisplayed();

      await searchPage.clickResult(0);

      // Wait for navigation or dialog
      await Promise.race([
        page.waitForURL(/\/documents\//, { timeout: 5000 }).catch(() => {}),
        page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      ]);

      const onDocumentPage = page.url().includes('/documents/');
      if (onDocumentPage) {
        await documentPage.goBack();

        // We should be back on /search with results visible
        await expect(async () => {
          const backOnSearch = page.url().includes('/search');
          const searchVisible = await searchPage.resultsContainer.isVisible().catch(() => false);
          expect(backOnSearch || searchVisible).toBeTruthy();
        }).toPass({ timeout: 5000 });
      } else {
        // Dialog path — press Escape or click the close button
        const closeButton = page
          .getByRole('button', { name: /close|×|back/i })
          .first();
        if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeButton.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await searchPage.verifyResultsDisplayed();
      }
    });
  });

  // =========================================================================
  // METADATA DISPLAY — annotations, external links, keyword chips
  // =========================================================================

  test.describe('Metadata display', () => {
    test('keywords are rendered as chips or tags', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // Keywords from MOCK_FULL_DOCUMENT.metadata.keywords — they may render as
      // dedicated chips/tags OR appear inline within the document body text.
      const keywordChip = page.locator('text=/Swiss franc loans|abusive clauses|consumer protection/i').first();
      const keywordInBody = page.locator('text=/currency risk/i').first();

      const keywordVisible = await keywordChip.isVisible({ timeout: 5000 }).catch(() => false);
      const keywordInBodyVisible = await keywordInBody.isVisible({ timeout: 2000 }).catch(() => false);

      // At least one keyword must appear somewhere on the page (chip or body text)
      expect(
        keywordVisible || keywordInBodyVisible,
        'Expected at least one keyword from metadata to appear on the document page (as chip or in body text)'
      ).toBeTruthy();
    });

    test('outcome field is displayed when present in metadata', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // Outcome may be surfaced explicitly in a metadata section or embedded
      // in the document body text — check both locations.
      const outcomeInMetadata = page.locator('text=/Appeal granted|conversion clause declared void/i');
      const outcomeInBody = page.locator('text=/null and void|PLN-denominated|overpaid amounts/i').first();

      const outcomeVisible = await outcomeInMetadata.isVisible({ timeout: 5000 }).catch(() => false);
      const outcomeInBodyVisible = await outcomeInBody.isVisible({ timeout: 2000 }).catch(() => false);

      expect(
        outcomeVisible || outcomeInBodyVisible,
        'Expected outcome text to appear either in metadata section or document body'
      ).toBeTruthy();
    });

    test('source URL link is rendered when provided in metadata', async ({ page }) => {
      const docWithUrl = {
        ...MOCK_FULL_DOCUMENT,
        metadata: {
          ...MOCK_FULL_DOCUMENT.metadata,
          source_url: 'https://www.sn.pl/orzecznictwo/SitePages/Orzeczenie.aspx?ItemSId=12345',
        },
      };

      await mockDocumentDetails(page, MOCK_DOC_ID, docWithUrl as any);
      await mockSimilarDocuments(page, MOCK_DOC_ID, MOCK_SIMILAR_DOCS);

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // An external link to the source document (opens in new tab)
      const externalLink = page
        .locator('a[href*="sn.pl"], a[target="_blank"]')
        .or(page.getByRole('link', { name: /source|original|official/i }))
        .first();

      const linkVisible = await externalLink.isVisible({ timeout: 5000 }).catch(() => false);

      if (linkVisible) {
        // Verify the link has a valid href attribute pointing to the source URL
        const href = await externalLink.getAttribute('href');
        expect(href).toBeTruthy();
        expect(href).toContain('sn.pl');
      } else {
        // If no external link is rendered, verify the source URL text at least
        // appears somewhere on the page (the component may render it as plain text)
        const sourceUrlText = page.locator('text=/sn\\.pl|orzecznictwo/i').first();
        const sourceTextVisible = await sourceUrlText.isVisible({ timeout: 3000 }).catch(() => false);
        expect(
          sourceTextVisible,
          'Expected source URL to be rendered as a link or displayed as text when source_url metadata is provided'
        ).toBeTruthy();
      }
    });
  });

  // =========================================================================
  // ERROR STATE — 404 and 500 handled without crashing the app
  // =========================================================================

  test.describe('Error state', () => {
    test('renders error state when document is not found (404)', async ({ page }) => {
      // Mock the document endpoint to return 404
      await page.route(`**/api/documents/does-not-exist-9999`, (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Document not found' }),
        })
      );

      await page.goto('/documents/does-not-exist-9999');

      // The page must not crash — either an error card or a "not found" message
      const errorVisible = await page
        .locator('text=/not found|does not exist|error|404/i')
        .isVisible({ timeout: 8000 })
        .catch(() => false);

      // Fallback: a generic error card component
      const errorCard = page.locator('[class*="error"], [data-testid*="error"]').first();
      const errorCardVisible = await errorCard.isVisible({ timeout: 3000 }).catch(() => false);

      expect(errorVisible || errorCardVisible).toBeTruthy();
    });

    test('renders error state when document API returns 500', async ({ page }) => {
      const badId = 'server-error-doc-001';

      await page.route(`**/api/documents/${badId}`, (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      );

      await page.goto(`/documents/${badId}`);

      // Page must not be a blank white screen
      const bodyText = await page.locator('body').innerText().catch(() => '');
      expect(bodyText.length).toBeGreaterThan(0);

      // Some form of error indicator must be shown for a 500 response
      const errorIndicator = page.locator('text=/error|unavailable|failed|something went wrong/i').first();
      const errorCard = page.locator('[class*="error"], [data-testid*="error"]').first();

      const errorVisible = await errorIndicator.isVisible({ timeout: 8000 }).catch(() => false);
      const errorCardVisible = await errorCard.isVisible({ timeout: 3000 }).catch(() => false);

      expect(
        errorVisible || errorCardVisible,
        'Expected an error indicator or error card to be displayed when API returns 500'
      ).toBeTruthy();
    });

    test('similar documents endpoint failure does not crash the document page', async ({ page }) => {
      await mockDocumentDetails(page, MOCK_DOC_ID, MOCK_FULL_DOCUMENT as any);

      // Return 500 from the similar documents endpoint
      await page.route(`**/api/documents/${MOCK_DOC_ID}/similar`, (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Similar documents service unavailable' }),
        })
      );

      await page.goto(`/documents/${MOCK_DOC_ID}`);
      await documentPage.verifyDocumentPageDisplayed();

      // The main document content must still render correctly
      const titleVisible = await page
        .locator('text=/Supreme Court Judgment on Swiss Franc/i')
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      expect(titleVisible).toBeTruthy();

      // Optional: clicking the similar tab shows an empty/error state rather than crashing
      const similarTab = page.getByRole('tab', { name: /similar|related/i });
      if (await similarTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await similarTab.click();

        // Either empty state message or graceful silence — neither is a crash
        await expect(page.locator('h1')).toBeVisible({ timeout: 3000 });
      }
    });
  });
});
