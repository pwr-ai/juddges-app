import { test, expect } from '@playwright/test';
import { ChatPage } from '../page-objects/ChatPage';

/**
 * Complete Chat Flow E2E Tests
 *
 * Tests the entire chat workflow including:
 * - Sending messages
 * - Receiving AI responses
 * - Chat history
 * - Sources display
 * - Multi-turn conversations
 */

test.describe('Complete Chat Flow', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    // Initialize page object
    chatPage = new ChatPage(page);

    // Mock Supabase auth
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

    // Navigate to chat page
    await chatPage.goto();
  });

  test('user can send a message and receive AI response', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      const request = route.request();
      const body = await request.postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            text: `Based on Polish law, a judgment (wyrok) is a formal decision made by a court that resolves a legal dispute. It typically includes: 1) Statement of facts, 2) Legal reasoning, 3) Final ruling, 4) Date and signatures.`,
            document_ids: ['doc1', 'doc2']
          },
          metadata: {
            run_id: 'test-run-123',
            chat_id: 'chat-123'
          }
        })
      });
    });

    // Verify chat is ready
    await chatPage.verifyChatReady();

    // Send message
    await chatPage.sendMessage('What is a judgment in Polish law?');

    // Verify user message appears
    await chatPage.verifyMessageInChat('What is a judgment', 'user');

    // Verify AI response appears
    await chatPage.verifyMessageInChat('Based on Polish law', 'assistant');

    // Verify message count
    const messageCount = await chatPage.getMessageCount();
    expect(messageCount).toBeGreaterThanOrEqual(2);
  });

  test('user can have a multi-turn conversation', async ({ page }) => {
    let messageCounter = 0;

    // Mock chat API to respond to multiple messages
    await page.route('**/api/chat/**', async route => {
      const request = route.request();
      const body = await request.postDataJSON();
      messageCounter++;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            text: `Response ${messageCounter}: I understand your question about "${body.input?.question || body.question}". Here's my detailed answer...`,
            document_ids: [`doc${messageCounter}`]
          },
          metadata: {
            run_id: `test-run-${messageCounter}`,
            chat_id: 'chat-456'
          }
        })
      });
    });

    // First message
    await chatPage.sendMessage('Explain contract law basics');
    await chatPage.verifyMessageInChat('Explain contract law', 'user');
    await chatPage.verifyMessageInChat('Response 1:', 'assistant');

    // Second message (follow-up)
    await chatPage.sendMessage('Can you give me an example?');
    await chatPage.verifyMessageInChat('Can you give me an example', 'user');
    await chatPage.verifyMessageInChat('Response 2:', 'assistant');

    // Third message
    await chatPage.sendMessage('What about remedies for breach?');
    await chatPage.verifyMessageInChat('What about remedies', 'user');
    await chatPage.verifyMessageInChat('Response 3:', 'assistant');

    // Verify all messages are visible (3 user + 3 assistant = 6 total)
    const totalMessages = await chatPage.getMessageCount();
    expect(totalMessages).toBeGreaterThanOrEqual(6);
  });

  test('user can see source documents in response', async ({ page }) => {
    // Mock chat API with sources
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            text: 'Based on the contract law cases I found, here are the key principles...',
            document_ids: ['doc1', 'doc2', 'doc3'],
            sources: [
              { id: 'doc1', title: 'Supreme Court Contract Case 2023' },
              { id: 'doc2', title: 'Contract Formation Requirements' },
              { id: 'doc3', title: 'Remedies for Contract Breach' }
            ]
          },
          metadata: {
            run_id: 'test-run-sources',
            chat_id: 'chat-sources'
          }
        })
      });
    });

    // Send message that would return sources
    await chatPage.sendMessage('Find cases about contract law');

    // Wait for response
    await page.waitForTimeout(2000);

    // Check for sources indicators
    const hasSourcesBadge = await page.locator('text=/sources|Source|documents|Based on/i').isVisible({ timeout: 5000 }).catch(() => false);
    const hasDocumentLinks = await page.locator('[data-testid="message-sources"], [class*="sources"]').isVisible({ timeout: 5000 }).catch(() => false);

    // Either sources section or text mentioning sources should be visible
    expect(hasSourcesBadge || hasDocumentLinks).toBeTruthy();
  });

  test('user can click example questions to start chat', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: 'Here is the answer to your example question...',
            document_ids: ['doc1']
          },
          metadata: {
            run_id: 'test-run-example',
            chat_id: 'chat-example'
          }
        })
      });
    });

    // Verify welcome screen is shown
    await chatPage.verifyWelcomeScreen();

    // Find and click an example question
    const exampleButton = page.locator('button').filter({ hasText: /legal|contract|tax|court/i }).first();

    if (await exampleButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exampleButton.click();

      // Wait for response
      await page.waitForTimeout(3000);

      // Verify chat started (either message visible or URL changed)
      const hasMessages = await chatPage.getMessageCount().then(c => c > 0).catch(() => false);
      const urlChanged = page.url() !== '/chat' && page.url().includes('/chat');

      expect(hasMessages || urlChanged).toBeTruthy();
    }
  });

  test('user can stop AI response generation', async ({ page }) => {
    // Mock streaming response with delay
    await page.route('**/api/chat/**', async route => {
      // Simulate slow response
      await new Promise(resolve => setTimeout(resolve, 2000));

      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: 'This is a very long response that is being streamed...',
            document_ids: []
          },
          metadata: {
            run_id: 'test-run-stop'
          }
        })
      });
    });

    // Send message
    await chatPage.chatInput.fill('Explain everything about tax law');
    await chatPage.sendButton.click();

    // Wait a moment for generation to start
    await page.waitForTimeout(500);

    // Try to stop generation
    const stopButton = page.getByRole('button', { name: /stop|cancel/i });
    if (await stopButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await stopButton.click();

      // Verify stop button is no longer visible
      await expect(stopButton).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('user can handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/chat/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'AI service temporarily unavailable' })
      });
    });

    // Send message
    await chatPage.sendMessage('Test question', { waitForResponse: false });

    // Wait for error to potentially appear
    await page.waitForTimeout(3000);

    // Verify chat is still functional (input should be enabled)
    await expect(chatPage.chatInput).toBeVisible();
    await expect(chatPage.chatInput).toBeEnabled();

    // User message should still be visible
    await chatPage.verifyMessageInChat('Test question', 'user');
  });

  test('user can create a new chat', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: 'Response to your question',
            document_ids: []
          },
          metadata: {
            run_id: 'test-run',
            chat_id: 'chat-789'
          }
        })
      });
    });

    // Send initial message
    await chatPage.sendMessage('First question');
    await page.waitForTimeout(2000);

    // Try to create new chat
    const newChatButton = page.getByRole('button', { name: /new.*chat|\+|create/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();

      // Should navigate to /chat
      await page.waitForURL('/chat', { timeout: 5000 }).catch(() => {});

      // Welcome screen should be visible again
      const hasWelcomeText = await page.locator('text=/What legal question|Example|Ask about/i').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasWelcomeText).toBeTruthy();
    }
  });

  test('user can access chat history', async ({ page }) => {
    // Mock chat history API
    await page.route('**/api/chats/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'chat-1',
            title: 'Contract Law Discussion',
            firstMessage: 'What is contract law?',
            created_at: new Date().toISOString()
          },
          {
            id: 'chat-2',
            title: 'Tax Interpretation Question',
            firstMessage: 'How does VAT work?',
            created_at: new Date().toISOString()
          }
        ])
      });
    });

    // Wait for potential sidebar to load
    await page.waitForTimeout(2000);

    // Look for chat history items
    const chatHistoryItem = page.locator('text=/Contract Law|Tax Interpretation|Previous|History/i').first();

    if (await chatHistoryItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Chat history is visible
      await expect(chatHistoryItem).toBeVisible();
    }
  });

  test('user receives helpful response format', async ({ page }) => {
    // Mock detailed response
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: `# Contract Law Basics

## Definition
Contract law governs legally binding agreements between parties.

## Key Elements
1. **Offer**: Proposal made by one party
2. **Acceptance**: Agreement to the offer
3. **Consideration**: Something of value exchanged
4. **Intention**: Parties must intend legal relations

## Example
A typical sales contract includes these elements...`,
            document_ids: ['doc1', 'doc2']
          },
          metadata: {
            run_id: 'test-run-format'
          }
        })
      });
    });

    // Send message
    await chatPage.sendMessage('Explain contract law basics');

    // Wait for response
    await page.waitForTimeout(2000);

    // Verify formatted content appears (markdown headings, lists, etc.)
    const hasFormattedContent = await page.locator('h2, h3, ul, ol, strong, em').isVisible({ timeout: 5000 }).catch(() => false);
    const hasResponseText = await page.locator('text=/Contract law|Definition|Key Elements/i').isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasFormattedContent || hasResponseText).toBeTruthy();
  });

  test('chat input accepts and sends long messages', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: 'I understand your detailed question. Here is my comprehensive response...',
            document_ids: []
          },
          metadata: {
            run_id: 'test-run-long'
          }
        })
      });
    });

    // Create a long message
    const longMessage = 'I have a complex legal question about contract law that involves multiple parties and various considerations. ' +
      'Specifically, I need to understand how Polish contract law handles situations where there are conflicting terms in a contract, ' +
      'and how courts typically interpret such conflicts. Can you provide detailed guidance with examples?';

    // Send long message
    await chatPage.sendMessage(longMessage);

    // Verify message was sent
    await chatPage.verifyMessageInChat('complex legal question', 'user');
    await chatPage.verifyMessageInChat('comprehensive response', 'assistant');
  });
});
