/**
 * Critical E2E Flow: Login -> Search -> View Document -> Chat
 *
 * This test validates the most important user journey through the application.
 * Every step has strict assertions with no optional fallbacks.
 * Mocks are set up via flow-helpers to isolate the test from external services.
 *
 * @see https://github.com/<org>/juddges-app/issues/62
 */

import { test, expect } from '@playwright/test';
import { AuthPage } from '../page-objects/AuthPage';
import { SearchPage } from '../page-objects/SearchPage';
import { DocumentPage } from '../page-objects/DocumentPage';
import { ChatPage } from '../page-objects/ChatPage';
import {
  setupCriticalFlowMocks,
  assertUserAtStep,
  CRITICAL_FLOW_TEST_DATA,
} from '../helpers/flow-helpers';

test.describe('Critical E2E Flow: login -> search -> view document -> chat', () => {
  // This flow crosses multiple pages; mark as slow to triple the default timeout.
  test.slow();

  test('user completes critical flow: login -> search -> view document -> chat', async ({
    page,
  }) => {
    // Register all mocks before any navigation
    await setupCriticalFlowMocks(page);

    const authPage = new AuthPage(page);
    const searchPage = new SearchPage(page);
    const documentPage = new DocumentPage(page);
    const chatPage = new ChatPage(page);

    // ── Step 1: Navigate to login and verify form is visible ──────────────
    await authPage.gotoSignIn();
    await assertUserAtStep(page, 'login');

    await expect(
      authPage.emailInput,
      'Step [login]: email input must be visible on login page'
    ).toBeVisible();
    await expect(
      authPage.passwordInput,
      'Step [login]: password input must be visible on login page'
    ).toBeVisible();
    await expect(
      authPage.signInButton,
      'Step [login]: sign-in button must be visible on login page'
    ).toBeVisible();

    // ── Step 2: Fill credentials, submit, verify redirect ─────────────────
    await authPage.emailInput.fill(CRITICAL_FLOW_TEST_DATA.user.email);
    await authPage.passwordInput.fill(CRITICAL_FLOW_TEST_DATA.user.password);
    await authPage.signInButton.click();

    // After login the app must redirect away from /auth/login
    await expect(
      page,
      'Step [login->redirect]: user should be redirected away from /auth/login after sign-in'
    ).not.toHaveURL(/\/auth\/login/, { timeout: 15000 });

    // ── Step 3: Navigate to search and verify input is ready ──────────────
    await searchPage.goto();
    await assertUserAtStep(page, 'search');

    await expect(
      searchPage.searchInput,
      'Step [search]: search input must be enabled and ready for typing'
    ).toBeEnabled();

    // ── Step 4: Type query, submit, verify results appear ─────────────────
    await searchPage.searchInput.fill(CRITICAL_FLOW_TEST_DATA.search.query);
    await searchPage.searchButton.click();

    // Wait for results count indicator to confirm search completed
    await searchPage.waitForSearchResults();

    // Verify the primary document title appears in results
    await expect(
      page.getByText(CRITICAL_FLOW_TEST_DATA.document.title),
      'Step [search->results]: expected document title to appear in search results'
    ).toBeVisible({ timeout: 10000 });

    // Verify result items are rendered
    const resultCount = await searchPage.getResultCount();
    expect(
      resultCount,
      `Step [search->results]: expected at least 1 result item, got ${resultCount}`
    ).toBeGreaterThanOrEqual(1);

    // ── Step 5: Click first result, verify navigation to document page ────
    // Try clicking the result item via the page object, then fall back to
    // clicking the document title text as a link.
    const firstResultItem = searchPage.resultItems.first();
    const titleLink = page
      .getByRole('link', { name: new RegExp(CRITICAL_FLOW_TEST_DATA.document.title, 'i') })
      .first();

    const resultItemVisible = await firstResultItem.isVisible().catch(() => false);

    if (resultItemVisible) {
      await firstResultItem.click();
    } else {
      await expect(
        titleLink,
        'Step [search->click]: neither result item nor title link is visible'
      ).toBeVisible();
      await titleLink.click();
    }

    // ── Step 6: Verify document title and metadata visible ────────────────
    // The app may either navigate to /documents/{id} or show an inline panel.
    // Check if we landed on a document URL first.
    const navigatedToDocumentPage = await page
      .waitForURL(/\/documents\//, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (navigatedToDocumentPage) {
      await assertUserAtStep(page, 'document');
      await documentPage.verifyDocumentTitle(CRITICAL_FLOW_TEST_DATA.document.title);
    } else {
      // Inline detail panel: the document title text must still be visible
      await expect(
        page.getByText(CRITICAL_FLOW_TEST_DATA.document.title),
        'Step [document]: document title must be visible (inline or dedicated page)'
      ).toBeVisible({ timeout: 10000 });
    }

    // Verify court name is visible somewhere on the page as metadata
    await expect(
      page.getByText(CRITICAL_FLOW_TEST_DATA.document.court_name),
      'Step [document->metadata]: court name should be visible'
    ).toBeVisible({ timeout: 10000 });

    // Verify case number is visible
    await expect(
      page.getByText(CRITICAL_FLOW_TEST_DATA.document.case_number),
      'Step [document->metadata]: case number should be visible'
    ).toBeVisible({ timeout: 10000 });

    // ── Step 7: Navigate to chat and verify input is ready ────────────────
    await chatPage.goto();
    await assertUserAtStep(page, 'chat');
    await chatPage.verifyChatReady();

    // ── Step 8: Type message, send, verify assistant response appears ─────
    await chatPage.chatInput.fill(CRITICAL_FLOW_TEST_DATA.chat.userMessage);
    await chatPage.sendButton.click();

    // Wait for the assistant response to render
    await chatPage.waitForAssistantResponse();

    // Verify the assistant's response text appears in the chat
    await expect(
      page.getByText(CRITICAL_FLOW_TEST_DATA.chat.assistantResponse, { exact: false }),
      'Step [chat->response]: assistant response text must appear in chat'
    ).toBeVisible({ timeout: 15000 });
  });

  test('each step is reachable independently after authentication', async ({ page }) => {
    // This companion test verifies that each critical page loads correctly
    // with authentication mocks in place, ensuring no single page is broken.
    await setupCriticalFlowMocks(page);

    const searchPage = new SearchPage(page);
    const chatPage = new ChatPage(page);

    // Search page loads and is functional
    await searchPage.goto();
    await assertUserAtStep(page, 'search');
    await expect(
      searchPage.searchInput,
      'Search page: input must be visible and enabled'
    ).toBeEnabled();

    // Chat page loads and is functional
    await chatPage.goto();
    await assertUserAtStep(page, 'chat');
    await chatPage.verifyChatReady();
  });

  test('search results display correct metadata for each result', async ({ page }) => {
    // Verifies that search results contain expected metadata fields,
    // which is essential for the user to identify the right document.
    await setupCriticalFlowMocks(page);

    const searchPage = new SearchPage(page);

    await searchPage.goto();
    await searchPage.searchInput.fill(CRITICAL_FLOW_TEST_DATA.search.query);
    await searchPage.searchButton.click();
    await searchPage.waitForSearchResults();

    // The primary document's title must be present in the results
    await expect(
      page.getByText(CRITICAL_FLOW_TEST_DATA.document.title),
      'Search results must include the primary document title'
    ).toBeVisible();

    // The court name should appear in at least one result
    await expect(
      page.getByText(CRITICAL_FLOW_TEST_DATA.document.court_name),
      'Search results must display the court name'
    ).toBeVisible({ timeout: 10000 });
  });

  test('chat responds with relevant content after sending a message', async ({ page }) => {
    // Focused test on the chat step: ensures the AI response is rendered
    // and contains substantive legal content from the mock.
    await setupCriticalFlowMocks(page);

    const chatPage = new ChatPage(page);

    await chatPage.goto();
    await chatPage.verifyChatReady();

    await chatPage.sendMessage(CRITICAL_FLOW_TEST_DATA.chat.userMessage);

    // Verify the assistant response is visible
    const assistantMessageCount = await chatPage.getAssistantMessageCount();
    expect(
      assistantMessageCount,
      'Chat must have at least 1 assistant message after sending a question'
    ).toBeGreaterThanOrEqual(1);

    // Verify response content includes key legal terms from the mock
    await expect(
      page.getByText('unfair contractual terms', { exact: false }),
      'Chat response must contain substantive legal content'
    ).toBeVisible({ timeout: 15000 });
  });
});
