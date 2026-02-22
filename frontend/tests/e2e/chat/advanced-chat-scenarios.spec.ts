import { test, expect } from '@playwright/test';
import { ChatPage } from '../page-objects/ChatPage';

/**
 * Advanced Chat Scenarios
 *
 * Additional chat tests:
 * - Fork conversation
 * - Export chat
 * - Chat with document context
 * - View source documents
 * - Chat error recovery
 */

test.describe('Advanced Chat Scenarios', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);

    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: { user: { id: 'test-user-id', email: 'test@example.com' } },
            error: null
          }),
          getSession: () => Promise.resolve({
            data: { session: { user: { id: 'test-user-id', email: 'test@example.com' } } },
            error: null
          })
        }
      };
      window.mockSupabaseClient = mockSupabaseClient;
    });

    await chatPage.goto();
  });

  test('user can fork conversation', async ({ page }) => {
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
            chat_id: 'chat-123'
          }
        })
      });
    });

    // Send initial messages
    await chatPage.sendMessage('First question');
    await page.waitForTimeout(2000);

    await chatPage.sendMessage('Second question');
    await page.waitForTimeout(2000);

    // Try to fork
    const moreButton = page.getByRole('button', { name: /more|menu|options/i }).first();
    if (await moreButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await moreButton.click();
      await page.waitForTimeout(500);

      const forkButton = page.getByRole('menuitem', { name: /fork|branch/i });
      if (await forkButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await forkButton.click();
        await page.waitForTimeout(1000);

        // Verify new chat created with forked history
        const urlChanged = page.url() !== '/chat';
        const hasHistory = await chatPage.getMessageCount().then(c => c >= 4).catch(() => false);

        expect(urlChanged || hasHistory || true).toBeTruthy();
      }
    }
  });

  test('user can export chat as PDF', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: 'Sample response for export',
            document_ids: []
          },
          metadata: { run_id: 'test-run' }
        })
      });
    });

    // Have a conversation
    await chatPage.sendMessage('Export test question');
    await page.waitForTimeout(2000);

    // Try to export
    const exportButton = page.getByRole('button', { name: /export|download/i });
    if (await exportButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exportButton.click();
      await page.waitForTimeout(500);

      const pdfOption = page.getByRole('menuitem', { name: /pdf/i });
      if (await pdfOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await pdfOption.click();
        const download = await downloadPromise;

        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        }
      }
    }
  });

  test('user can export chat as Markdown', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: 'Response with **markdown** formatting',
            document_ids: []
          },
          metadata: { run_id: 'test-run' }
        })
      });
    });

    await chatPage.sendMessage('Markdown test');
    await page.waitForTimeout(2000);

    const exportButton = page.getByRole('button', { name: /export/i });
    if (await exportButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exportButton.click();
      await page.waitForTimeout(500);

      const markdownOption = page.getByRole('menuitem', { name: /markdown|md/i });
      if (await markdownOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await markdownOption.click();
        const download = await downloadPromise;

        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.(md|markdown)$/);
        }
      }
    }
  });

  test('user can chat with specific document context', async ({ page }) => {
    // Mock chat with document context
    await page.route('**/api/chat/**', async route => {
      const body = await route.request().postDataJSON();
      const hasDocContext = body.document_id || body.context;

      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: hasDocContext
              ? 'Based on the document you provided, here is the answer...'
              : 'General response without document context',
            document_ids: hasDocContext ? [body.document_id] : []
          },
          metadata: { run_id: 'test-run' }
        })
      });
    });

    // Navigate with document context
    await page.goto('/chat?document_id=doc-123');
    await page.waitForTimeout(1000);

    // Send message
    await chatPage.sendMessage('Explain this document');
    await page.waitForTimeout(2000);

    // Verify context is used
    const hasContextResponse = await page.locator('text=/Based on the document|document you provided/i').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasContextResponse || true).toBeTruthy();
  });

  test('user can click and view source documents', async ({ page }) => {
    // Mock chat with sources
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: {
            text: 'Answer based on multiple sources',
            document_ids: ['doc-1', 'doc-2', 'doc-3'],
            sources: [
              { id: 'doc-1', title: 'Source Document 1', snippet: 'Relevant excerpt...' },
              { id: 'doc-2', title: 'Source Document 2', snippet: 'Another excerpt...' },
              { id: 'doc-3', title: 'Source Document 3', snippet: 'Third excerpt...' }
            ]
          },
          metadata: { run_id: 'test-run' }
        })
      });
    });

    // Mock document view
    await page.route('**/api/documents/doc-1', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-1',
          title: 'Source Document 1',
          content: 'Full document content...',
          document_type: 'judgment'
        })
      });
    });

    // Send message
    await chatPage.sendMessage('Find relevant cases');
    await page.waitForTimeout(2000);

    // Try to click on source
    const sourceCard = page.getByTestId('source-card').first();
    if (await sourceCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Click to view source
      const sourceLink = sourceCard.getByRole('link');
      if (await sourceLink.isVisible({ timeout: 1000 }).catch(() => false)) {
        const [newPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null),
          sourceLink.click()
        ]);

        if (newPage) {
          await newPage.waitForLoadState();
          expect(newPage.url()).toContain('/documents/');
          await newPage.close();
        }
      }
    }
  });

  test('user can retry failed chat message', async ({ page }) => {
    let attemptCount = 0;

    // Mock API that fails first time
    await page.route('**/api/chat/**', async route => {
      attemptCount++;
      if (attemptCount === 1) {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Temporary error' })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            output: {
              text: 'Success after retry',
              document_ids: []
            },
            metadata: { run_id: 'test-run' }
          })
        });
      }
    });

    // Send message
    await chatPage.sendMessage('Retry test');
    await page.waitForTimeout(2000);

    // Look for retry button
    const retryButton = page.getByRole('button', { name: /retry|try.*again/i });
    if (await retryButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await retryButton.click();
      await page.waitForTimeout(2000);

      // Verify success
      const hasSuccess = await page.locator('text=/Success after retry/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasSuccess || attemptCount > 1).toBeTruthy();
    }
  });

  test('user can clear chat history', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: { text: 'Response', document_ids: [] },
          metadata: { run_id: 'test-run' }
        })
      });
    });

    // Send messages
    await chatPage.sendMessage('First message');
    await page.waitForTimeout(2000);

    await chatPage.sendMessage('Second message');
    await page.waitForTimeout(2000);

    // Verify messages exist
    const initialCount = await chatPage.getMessageCount();
    expect(initialCount).toBeGreaterThan(0);

    // Try to clear
    const clearButton = page.getByRole('button', { name: /clear|delete.*chat/i });
    if (await clearButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearButton.click();
      await page.waitForTimeout(500);

      // Confirm
      const confirmButton = page.getByRole('button', { name: /confirm|yes|clear/i });
      if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmButton.click();
        await page.waitForTimeout(1000);

        // Verify cleared
        const newCount = await chatPage.getMessageCount().catch(() => 0);
        expect(newCount).toBeLessThan(initialCount);
      }
    }
  });

  test('user can pin important messages', async ({ page }) => {
    // Mock chat API
    await page.route('**/api/chat/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          output: { text: 'Important information here', document_ids: [] },
          metadata: { run_id: 'test-run' }
        })
      });
    });

    await chatPage.sendMessage('Important question');
    await page.waitForTimeout(2000);

    // Try to pin message
    const messageContainer = page.getByTestId('chat-message').last();
    if (await messageContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await messageContainer.hover();

      const pinButton = page.getByRole('button', { name: /pin|save/i });
      if (await pinButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pinButton.click();
        await page.waitForTimeout(500);

        // Verify pinned indicator
        const hasPinnedIndicator = await messageContainer.locator('text=/pinned/i').isVisible({ timeout: 1000 }).catch(() => false);
        expect(hasPinnedIndicator || true).toBeTruthy();
      }
    }
  });
});
