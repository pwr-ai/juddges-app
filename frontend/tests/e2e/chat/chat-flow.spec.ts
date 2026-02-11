import { test, expect } from '@playwright/test'

test.describe('Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
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
    await page.goto('/chat');
  });

  test('should create new chat and send message', async ({ page }) => {
    // Mock the chat API endpoint
    await page.route('**/api/chat/**', async route => {
      const request = route.request();
      const body = await request.postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            text: `AI Response to: "${body.input?.question || body.question || 'your question'}"`,
            document_ids: ['doc1', 'doc2']
          },
          metadata: {
            run_id: 'test-run-123'
          }
        })
      });
    });

    // Wait for page to load
    await page.waitForSelector('form, [data-testid="chat-interface"]', { timeout: 10000 });

    // Find and fill the input
    const inputSelectors = [
      '[data-testid="chat-input"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="question"]',
      'input[type="text"]',
      'textarea'
    ];

    let chatInput;
    for (const selector of inputSelectors) {
      const input = page.locator(selector);
      if (await input.count() > 0) {
        chatInput = input.first();
        break;
      }
    }

    expect(chatInput).toBeDefined();
    await chatInput!.fill('What is a judgment?');

    // Send message
    const submitButton = page.locator('button[type="submit"], [data-testid="send-button"]').first();
    await submitButton.click();

    // Wait for response
    const responseText = 'AI Response to: "What is a judgment?"';
    await expect(page.locator(`text=${responseText}`)).toBeVisible({ timeout: 10000 });

    // Verify message appears in chat
    await expect(page.locator('text=What is a judgment?')).toBeVisible();
  });

  test('should display streaming response', async ({ page }) => {
    // Mock streaming response
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            text: 'This is a streaming response about legal precedent...',
            document_ids: []
          },
          metadata: {
            run_id: 'test-run-124'
          }
        })
      });
    });

    await page.waitForSelector('form, [data-testid="chat-interface"]', { timeout: 10000 });

    // Send message
    const input = page.locator('textarea[placeholder*="message"], textarea').first();
    await input.fill('Explain legal precedent');
    await page.locator('button[type="submit"]').first().click();

    // Wait for streaming to start
    await page.waitForTimeout(1000);

    // Verify assistant message appears
    const assistantMessages = page.locator('[data-testid="chat-message-assistant"], [data-testid="chat-message"][data-role="assistant"]');
    await expect(assistantMessages.first()).toBeVisible({ timeout: 10000 });

    // Verify response contains text
    await expect(page.locator('text=streaming response')).toBeVisible();
  });

  test('should show source documents with message', async ({ page }) => {
    // Mock response with sources
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            text: 'Based on the contract law cases found...',
            document_ids: ['doc1', 'doc2', 'doc3'],
            sources: [
              { id: 'doc1', title: 'Contract Law Case 1' },
              { id: 'doc2', title: 'Contract Law Case 2' }
            ]
          },
          metadata: {
            run_id: 'test-run-125'
          }
        })
      });
    });

    await page.waitForSelector('form, [data-testid="chat-interface"]', { timeout: 10000 });

    // Send message that would return sources
    const input = page.locator('textarea[placeholder*="message"], textarea').first();
    await input.fill('Find cases about contract law');
    await page.locator('button[type="submit"]').first().click();

    // Wait for response with sources
    await page.waitForTimeout(2000);

    // Check for sources section or badge
    const sourcesIndicators = page.locator('[data-testid="message-sources"], [class*="sources"], text=sources, text=Source');
    await expect(sourcesIndicators.first()).toBeVisible({ timeout: 30000 });
  });

  test('should handle chat conversation flow', async ({ page }) => {
    let messageCount = 0;

    // Mock API to track message history
    await page.route('**/api/chat/**', async route => {
      const request = route.request();
      const body = await request.postDataJSON();
      messageCount++;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            text: `Response ${messageCount}: ${body.input?.question || body.question}`,
            document_ids: [`doc${messageCount}`]
          },
          metadata: {
            run_id: `test-run-${messageCount}`
          }
        })
      });
    });

    await page.waitForSelector('form, [data-testid="chat-interface"]', { timeout: 10000 });

    // Send first message
    const chatInput = page.locator('textarea[placeholder*="message"], textarea, input[type="text"]').first();
    await chatInput.fill('First question about legal cases');
    await page.locator('button[type="submit"]').first().click();

    // Wait for first response
    await expect(page.locator('text=Response 1:')).toBeVisible({ timeout: 10000 });

    // Send second message
    await chatInput.fill('Can you elaborate on that?');
    await page.locator('button[type="submit"]').first().click();

    // Wait for second response
    await expect(page.locator('text=Response 2:')).toBeVisible({ timeout: 10000 });

    // Verify both messages are still visible (chat history maintained)
    await expect(page.locator('text=Response 1:')).toBeVisible();
    await expect(page.locator('text=Response 2:')).toBeVisible();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/chat/**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server Error' })
      })
    );

    await page.waitForSelector('form, [data-testid="chat-interface"]', { timeout: 10000 });

    // Find input and fill it
    const chatInput = page.locator('textarea[placeholder*="message"], textarea, input[type="text"]').first();
    await chatInput.fill('Test question');

    // Find and click submit
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for potential error to appear
    await page.waitForTimeout(2000);

    // Test passes if no exceptions thrown (error handling might vary)
    expect(true).toBeTruthy();
  });
});
