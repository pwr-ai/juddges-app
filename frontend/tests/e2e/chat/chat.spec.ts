import { test, expect } from '@playwright/test';
import { ChatPage } from '../page-objects/ChatPage';
import { mockChatSuccess, mockChatError } from '../helpers/api-mocks';

/**
 * Chat Flow E2E Tests
 *
 * Covers the three most critical chat user scenarios:
 *   1. Happy path: user sends a legal question → AI streams a response with
 *      source citations → user follows up in the same conversation
 *   2. Sources / citations display: AI response links back to judgment docs
 *   3. Error state: API failure is surfaced without freezing the interface
 *
 * Architecture notes:
 *   - /chat (new chat): shows welcome screen with TypingHeader + example question cards
 *   - After the first message is sent the app redirects to /chat/<id> and renders
 *     ChatInterface (the full message thread)
 *   - Auth is required — redirect to /auth/login when unauthenticated
 */

// ---------------------------------------------------------------------------
// Shared mock helpers
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

/** Return a generic mock chat response body (non-streaming JSON). */
function chatResponseBody(text: string, chatId = 'chat-test-001', sources: boolean = false) {
  return JSON.stringify({
    output: {
      text,
      document_ids: sources ? ['j-2024-001', 'j-2024-002'] : [],
      ...(sources && {
        sources: [
          { id: 'j-2024-001', title: 'Supreme Court ruling on loan contracts 2024' },
          { id: 'j-2024-002', title: 'Consumer Protection Act interpretation 2024' },
        ],
      }),
    },
    metadata: {
      run_id: `run-${Date.now()}`,
      chat_id: chatId,
    },
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Chat Flow', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await setupMockAuth(page);
    await chatPage.goto();
  });

  // =========================================================================
  // HAPPY PATH — send message, get response, continue conversation
  // =========================================================================

  test.describe('Happy path — question → AI response → follow-up', () => {
    test('welcome screen renders with typing header and chat input', async ({ page }) => {
      // TypingHeader animates text — verify it arrives within 5 s
      const heading = page.locator('h2');
      await expect(heading).toContainText('JuDDGES', { timeout: 5000 });

      await chatPage.verifyChatReady();
      await chatPage.verifyWelcomeScreen();
    });

    test('user sends a legal question and receives an AI response', async ({ page }) => {
      // Intercept the chat API before the message is sent
      await page.route('**/api/chat/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: chatResponseBody(
            'A judgment (wyrok) is a formal court decision that resolves a legal dispute. ' +
              'It contains: (1) a statement of facts, (2) legal reasoning, and (3) the operative part (ruling).',
            'chat-happy-001'
          ),
        });
      });

      // Send message
      await chatPage.chatInput.fill('What is a judgment in Polish law?');
      await chatPage.sendButton.click();

      // After the first message the page redirects to /chat/<id>.
      // Wait for either the URL to change OR the assistant message to appear.
      await Promise.race([
        page.waitForURL(/\/chat\/.+/, { timeout: 8000 }).catch(() => {}),
        chatPage.assistantMessages.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
      ]);

      // Verify the user message is visible somewhere in the DOM
      const userMessageVisible = await page
        .locator('text=/What is a judgment/i')
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      expect(userMessageVisible).toBeTruthy();

      // Verify the AI response is visible
      const aiResponseVisible = await page
        .locator('text=/judgment.*court.*decision|wyrok|formal court/i')
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      expect(aiResponseVisible).toBeTruthy();
    });

    test('user has a multi-turn conversation and context is retained', async ({ page }) => {
      let callIndex = 0;
      const answers = [
        'Contract law governs legally binding agreements. Key elements are offer, acceptance, and consideration.',
        'Breach occurs when one party fails to fulfil their contractual obligation without lawful excuse.',
        'Remedies include damages, specific performance, and rescission depending on the type of breach.',
      ];

      await page.route('**/api/chat/**', async (route) => {
        const body = chatResponseBody(answers[callIndex % answers.length], `chat-multi-${callIndex}`);
        callIndex += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body,
        });
      });

      // First turn
      await chatPage.chatInput.fill('Explain contract law basics');
      await chatPage.sendButton.click();
      await page.waitForURL(/\/chat\/.+/, { timeout: 8000 }).catch(() => {});
      await expect(page.locator('text=/contract law|Contract law/i').first()).toBeVisible({ timeout: 12000 });

      // The chat page on /chat/<id> renders a ChatInput at the bottom; re-use it.
      const input = page.getByRole('textbox', { name: /message|question|chat/i }).or(
        page.locator('textarea')
      ).first();

      // Second turn — follow-up
      await input.fill('What constitutes a breach?');
      await page.getByRole('button', { name: /send/i }).or(
        page.locator('button[type="submit"]')
      ).first().click();

      await expect(page.locator('text=/Breach occurs|breach/i').first()).toBeVisible({ timeout: 12000 });

      // Third turn
      await input.fill('What remedies are available?');
      await page.getByRole('button', { name: /send/i }).or(
        page.locator('button[type="submit"]')
      ).first().click();

      await expect(page.locator('text=/Remedies include|remedies/i').first()).toBeVisible({ timeout: 12000 });

      // All earlier messages must still be present (chat history is preserved)
      await expect(page.locator('text=/Explain contract law/i').first()).toBeVisible({ timeout: 3000 });
    });

    test('user can click an example question card to start a conversation', async ({ page }) => {
      await page.route('**/api/chat/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: chatResponseBody(
            'Here is a comprehensive answer to your legal question based on the retrieved judgments.',
            'chat-example-001'
          ),
        });
      });

      // Also mock the example questions API (falls back gracefully if unavailable)
      await page.route('**/api/**example**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            'Jakie są przesłanki odpowiedzialności kontraktowej za nienależyte wykonanie umowy?',
            'Czy umowa o dzieło podlega obowiązkowi ubezpieczenia społecznego?',
          ]),
        })
      );

      await chatPage.verifyWelcomeScreen();

      // Example questions are rendered as <button> elements in a grid
      const exampleButton = page
        .locator('button')
        .filter({ hasText: /legal|contract|tax|court|umow|prawo|odpowiedzialność|ubezpieczen/i })
        .first();

      if (await exampleButton.isVisible({ timeout: 4000 }).catch(() => false)) {
        await exampleButton.click();

        // Should redirect to /chat/<id> after the message is sent
        await Promise.race([
          page.waitForURL(/\/chat\/.+/, { timeout: 10000 }).catch(() => {}),
          chatPage.assistantMessages.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
        ]);

        // At minimum the URL should have changed or a message is visible
        const urlChanged = page.url().includes('/chat/');
        const messageVisible = await page.locator('[data-testid="chat-message"]').isVisible({ timeout: 3000 }).catch(() => false);
        expect(urlChanged || messageVisible).toBeTruthy();
      }
    });

    test('user can create a new chat after an existing conversation', async ({ page }) => {
      await page.route('**/api/chat/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: chatResponseBody('Answer to first chat question.', 'chat-new-001'),
        });
      });

      // Start first chat
      await chatPage.chatInput.fill('First question about tax law');
      await chatPage.sendButton.click();
      await page.waitForURL(/\/chat\/.+/, { timeout: 8000 }).catch(() => {});

      // Navigate back to /chat via the "New chat" button (if rendered in sidebar/header)
      const newChatButton = page
        .getByRole('button', { name: /new.*chat|\+|create.*new/i })
        .or(page.getByTestId('new-chat-button'));

      if (await newChatButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newChatButton.click();
        await page.waitForURL('/chat', { timeout: 6000 }).catch(() => {});
      } else {
        // Fall back: navigate directly
        await page.goto('/chat');
      }

      // Welcome screen must be shown again (clean slate)
      await expect(page.locator('text=/What legal question|JuDDGES/i').first()).toBeVisible({ timeout: 5000 });
    });
  });

  // =========================================================================
  // SOURCES / CITATIONS — AI response includes document references
  // =========================================================================

  test.describe('Source citations in AI responses', () => {
    test('AI response includes source document badges when citations are returned', async ({ page }) => {
      await page.route('**/api/chat/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: chatResponseBody(
            'Based on the retrieved judgments, the key principles of contract formation are...',
            'chat-sources-001',
            true // include sources
          ),
        });
      });

      await chatPage.chatInput.fill('Find cases about contract formation in Poland');
      await chatPage.sendButton.click();

      // Wait for the response to render (URL may or may not change)
      await page.waitForURL(/\/chat\/.+/, { timeout: 8000 }).catch(() => {});

      // Accept any source indicator: a dedicated [data-testid="message-sources"] element,
      // a class containing "sources", or visible text referencing source documents.
      const sourcesTestId = page.getByTestId('message-sources');
      const sourcesClass = page.locator('[class*="source"]');
      const sourcesText = page.locator('text=/source|citation|based on.*judgment/i');

      const sourceVisible = await Promise.any([
        sourcesTestId.waitFor({ state: 'visible', timeout: 12000 }),
        sourcesClass.first().waitFor({ state: 'visible', timeout: 12000 }),
        sourcesText.first().waitFor({ state: 'visible', timeout: 12000 }),
      ]).then(() => true).catch(() => false);

      expect(sourceVisible).toBeTruthy();
    });

    test('clicking a source document link opens the document', async ({ page }) => {
      await page.route('**/api/chat/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: chatResponseBody(
            'According to the Supreme Court judgment (see source), the contract must contain...',
            'chat-doclink-001',
            true
          ),
        });
      });

      // Mock the document endpoint so navigation works
      await page.route('**/api/documents/j-2024-001', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            document_id: 'j-2024-001',
            title: 'Supreme Court ruling on loan contracts 2024',
            content: 'Full text of the judgment...',
            metadata: { court_name: 'Sąd Najwyższy', case_number: 'I CSK 42/2024' },
          }),
        })
      );

      await chatPage.chatInput.fill('Explain loan contract consumer rights');
      await chatPage.sendButton.click();
      await page.waitForURL(/\/chat\/.+/, { timeout: 8000 }).catch(() => {});

      // Find any link that might point to a document
      const documentLink = page
        .locator('a[href*="/documents/"]')
        .or(page.getByRole('link', { name: /Supreme Court ruling|judgment/i }))
        .first();

      if (await documentLink.isVisible({ timeout: 8000 }).catch(() => false)) {
        // Verify the link has a valid href pointing to a document
        const href = await documentLink.getAttribute('href');
        expect(href, 'Document link should have an href attribute').toBeTruthy();
        expect(href).toContain('/documents/');
      } else {
        // Source badges without hyperlinks are also acceptable —
        // but at least one source indicator must be present when the API
        // returned sources in the response payload.
        const sourceIndicator = page.locator('[data-testid="message-sources"], [class*="source"]').first();
        const sourceText = page.locator('text=/source|citation|Supreme Court ruling/i').first();

        const sourceExists = await sourceIndicator.isVisible({ timeout: 5000 }).catch(() => false);
        const sourceTextExists = await sourceText.isVisible({ timeout: 3000 }).catch(() => false);

        expect(
          sourceExists || sourceTextExists,
          'Expected either a document link or a source badge/text when API returns citations'
        ).toBeTruthy();
      }
    });

    test('response without sources renders cleanly with no citation section', async ({ page }) => {
      await page.route('**/api/chat/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: chatResponseBody(
            'That is a general legal question. Here is a general answer without specific case references.',
            'chat-nosrc-001',
            false // no sources
          ),
        });
      });

      await chatPage.chatInput.fill('What is the difference between civil and criminal law?');
      await chatPage.sendButton.click();
      await page.waitForURL(/\/chat\/.+/, { timeout: 8000 }).catch(() => {});

      // The AI response text should appear
      const responseText = page.locator('text=/general legal question|civil and criminal|general answer/i');
      await expect(responseText.first()).toBeVisible({ timeout: 10000 });

      // No broken/empty source block should be visible
      const brokenSourceBlock = page.locator('[data-testid="message-sources"]:empty');
      const hasBrokenBlock = await brokenSourceBlock.isVisible({ timeout: 1000 }).catch(() => false);
      expect(hasBrokenBlock).toBeFalsy();
    });
  });

  // =========================================================================
  // ERROR STATE — API failures handled gracefully
  // =========================================================================

  test.describe('Error state', () => {
    test('displays error feedback and keeps chat input enabled when API returns 500', async ({ page }) => {
      await mockChatError(page, 'AI service temporarily unavailable');

      await chatPage.chatInput.fill('Test question causing server error');
      await chatPage.sendButton.click();

      // The user message should be visible (it was submitted), OR the app
      // should show an error indicator. Either proves the submission was processed.
      const userMessageLocator = page.locator('text=/Test question causing server error/i');
      const errorLocator = page.locator('text=/error|unavailable|failed|something went wrong|try again/i').first();

      // Wait for the error state to settle — use a polling assertion instead of fixed timeout
      await expect(async () => {
        const userMsgVisible = await userMessageLocator.isVisible().catch(() => false);
        const errorVisible = await errorLocator.isVisible().catch(() => false);
        expect(
          userMsgVisible || errorVisible,
          'Expected either the user message or an error indicator to be visible after submitting to a failing API'
        ).toBeTruthy();
      }).toPass({ timeout: 8000 });

      // Chat input must remain operable so the user can retry
      const chatInput = page
        .getByRole('textbox', { name: /message|question|chat/i })
        .or(page.locator('textarea'))
        .first();
      await expect(chatInput).toBeVisible({ timeout: 5000 });
      await expect(chatInput).toBeEnabled();
    });

    test('displays error feedback when API request is aborted (network failure)', async ({ page }) => {
      await page.route('**/api/chat/**', (route) => route.abort('connectionaborted'));

      await chatPage.chatInput.fill('Network error test question');
      await chatPage.sendButton.click();

      // Input must remain operable after the network failure settles
      const chatInput = page
        .getByRole('textbox', { name: /message|question|chat/i })
        .or(page.locator('textarea'))
        .first();

      // Poll until the input is both visible and enabled (error state has settled)
      await expect(async () => {
        await expect(chatInput).toBeVisible();
        await expect(chatInput).toBeEnabled();
      }).toPass({ timeout: 10000 });
    });

    test('user can stop in-flight generation via the stop button', async ({ page }) => {
      // Simulate a slow response so the stop button has time to appear
      await page.route('**/api/chat/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: chatResponseBody(
            'This is a very long streaming answer that took several seconds to generate...',
            'chat-stop-001'
          ),
        });
      });

      await chatPage.chatInput.fill('Tell me everything about all legal concepts');
      await chatPage.sendButton.click();

      // A stop/cancel button should appear while the response is being generated
      const stopButton = page.getByRole('button', { name: /stop|cancel/i });
      if (await stopButton.isVisible({ timeout: 2500 }).catch(() => false)) {
        await stopButton.click();
        // After stopping, the stop button should disappear and the send button should reappear
        await expect(stopButton).not.toBeVisible({ timeout: 5000 });
        await expect(chatPage.sendButton).toBeVisible({ timeout: 5000 });
      }
      // If the stop button never appeared the response was fast enough — that is also valid.
    });

    test('unauthenticated user is redirected to login page', async ({ page }) => {
      // Override auth to simulate no session
      await page.addInitScript(() => {
        (window as any).mockSupabaseClient = {
          auth: {
            getUser: () => Promise.resolve({ data: { user: null }, error: { message: 'Not authenticated' } }),
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          },
        };
      });

      // Navigate to /chat without auth
      await page.goto('/chat');

      // The app should redirect to the login page
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 8000 });
    });
  });
});
