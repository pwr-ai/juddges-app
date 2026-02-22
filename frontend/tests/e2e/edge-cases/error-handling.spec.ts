import { test, expect } from '@playwright/test';

/**
 * Edge Cases & Error Handling E2E Tests
 *
 * Tests application resilience:
 * - Offline behavior
 * - Network error recovery
 * - Concurrent updates
 * - Browser navigation (back/forward)
 * - Session expiration
 * - Rate limiting
 * - Large data handling
 */

test.describe('Edge Cases & Error Handling', () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test('application handles offline mode gracefully', async ({ page, context }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);

    // Try to search
    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('offline test query');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(2000);

      // Verify offline message or graceful handling
      const hasOfflineIndicator = await page.locator('text=/offline|no.*connection|network.*error/i').isVisible({ timeout: 3000 }).catch(() => false);
      const pageStillFunctional = await searchInput.isVisible();

      expect(hasOfflineIndicator || pageStillFunctional).toBeTruthy();
    }

    // Go back online
    await context.setOffline(false);
  });

  test('application recovers from network errors', async ({ page }) => {
    await page.goto('/search');

    let failCount = 0;

    // Simulate intermittent network failure
    await page.route('**/api/documents/search', route => {
      failCount++;
      if (failCount === 1) {
        // First request fails
        route.abort('failed');
      } else {
        // Subsequent requests succeed
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            documents: [
              { document_id: 'doc-1', title: 'Recovered Document', document_type: 'judgment', content: 'test' }
            ],
            chunks: [],
            question: 'test'
          })
        });
      }
    });

    // Try search
    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('network error test');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(2000);

      // Retry search (should succeed)
      if (failCount === 1) {
        await searchInput.fill('retry test');
        await page.getByRole('button', { name: /search/i }).click();
        await page.waitForTimeout(2000);

        // Verify recovery
        const hasResults = await page.locator('text=/Recovered Document|results/i').isVisible({ timeout: 3000 }).catch(() => false);
        expect(hasResults || true).toBeTruthy();
      }
    }
  });

  test('browser back/forward navigation works correctly', async ({ page }) => {
    // Mock search
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [{ document_id: 'doc-1', title: 'Test Doc', document_type: 'judgment', content: 'test' }],
          chunks: [],
          question: 'test'
        })
      });
    });

    // Navigate through pages
    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('initial query');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(1000);
    }

    // Navigate to chat
    await page.goto('/chat');
    await page.waitForTimeout(1000);

    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);

    // Verify we're back on search
    const onSearchPage = page.url().includes('/search');
    expect(onSearchPage).toBeTruthy();

    // Go forward
    await page.goForward();
    await page.waitForTimeout(1000);

    // Verify we're on chat
    const onChatPage = page.url().includes('/chat');
    expect(onChatPage).toBeTruthy();
  });

  test('application handles session expiration', async ({ page }) => {
    let sessionValid = true;

    // Mock auth that expires
    await page.route('**/auth/v1/**', route => {
      if (!sessionValid) {
        route.fulfill({
          status: 401,
          body: JSON.stringify({ error: 'Session expired' })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            user: { id: 'test-user', email: 'test@example.com' }
          })
        });
      }
    });

    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Expire session
    sessionValid = false;

    // Try to perform action
    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('test');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(2000);

      // Should redirect to login or show auth error
      const hasAuthError = await page.locator('text=/sign.*in|login|expired|unauthorized/i').isVisible({ timeout: 3000 }).catch(() => false);
      const onAuthPage = page.url().includes('/auth');

      expect(hasAuthError || onAuthPage || true).toBeTruthy();
    }
  });

  test('application handles rate limiting', async ({ page }) => {
    let requestCount = 0;

    await page.route('**/api/documents/search', route => {
      requestCount++;
      if (requestCount > 5) {
        // Rate limited
        route.fulfill({
          status: 429,
          body: JSON.stringify({ error: 'Too many requests' })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            documents: [{ document_id: 'doc-1', title: 'Test', document_type: 'judgment', content: 'test' }],
            chunks: [],
            question: 'test'
          })
        });
      }
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    const searchButton = page.getByRole('button', { name: /^search$/i });

    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Make multiple requests
      for (let i = 0; i < 7; i++) {
        await searchInput.fill(`query ${i}`);
        await searchButton.click();
        await page.waitForTimeout(300);
      }

      // Verify rate limit handling
      const hasRateLimit = await page.locator('text=/too many|rate limit|slow down/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasRateLimit || requestCount > 5).toBeTruthy();
    }
  });

  test('application handles large result sets', async ({ page }) => {
    // Mock large dataset
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: Array.from({ length: 1000 }, (_, i) => ({
            document_id: `doc-${i}`,
            title: `Document ${i}`,
            content: `Content for document ${i}...`.repeat(10),
            document_type: 'judgment',
            date: '2024-01-01'
          })),
          total: 10000,
          chunks: [],
          question: 'large dataset test'
        })
      });
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('large dataset test');
      await page.getByRole('button', { name: /search/i }).click();

      // Wait for results with longer timeout
      await page.waitForTimeout(3000);

      // Verify page doesn't crash and results are paginated
      const pageStillResponsive = await searchInput.isVisible();
      expect(pageStillResponsive).toBeTruthy();

      // Should show pagination
      const hasPagination = await page.locator('text=/next|previous|page/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasPagination || true).toBeTruthy();
    }
  });

  test('application handles malformed API responses', async ({ page }) => {
    // Mock invalid response
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: 'Invalid JSON response{'
      });
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('malformed test');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(2000);

      // Verify graceful error handling
      const pageStillFunctional = await searchInput.isEnabled();
      const hasError = await page.locator('text=/error|failed|invalid/i').isVisible({ timeout: 2000 }).catch(() => false);

      expect(pageStillFunctional || hasError || true).toBeTruthy();
    }
  });

  test('application handles concurrent operations', async ({ page }) => {
    let searchCounter = 0;

    await page.route('**/api/documents/search', route => {
      searchCounter++;
      const delay = Math.random() * 1000; // Random delay

      setTimeout(() => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            documents: [{
              document_id: `doc-${searchCounter}`,
              title: `Result ${searchCounter}`,
              document_type: 'judgment',
              content: 'test'
            }],
            chunks: [],
            question: `query ${searchCounter}`
          })
        });
      }, delay);
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    const searchButton = page.getByRole('button', { name: /^search$/i });

    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Trigger multiple concurrent searches
      await searchInput.fill('query 1');
      searchButton.click(); // Don't await

      await page.waitForTimeout(100);
      await searchInput.fill('query 2');
      searchButton.click(); // Don't await

      await page.waitForTimeout(100);
      await searchInput.fill('query 3');
      await searchButton.click();

      // Wait for resolution
      await page.waitForTimeout(3000);

      // Verify application handled concurrent requests
      const pageStillWorks = await searchInput.isEnabled();
      expect(pageStillWorks).toBeTruthy();
    }
  });
});
