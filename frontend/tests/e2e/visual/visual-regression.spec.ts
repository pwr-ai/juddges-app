import { test, expect } from '@playwright/test';

/**
 * Visual Regression Tests
 *
 * Tests visual consistency across:
 * - Different pages
 * - Different states
 * - Responsive breakpoints
 * - Dark/light themes
 */

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: { user: { id: 'test-user', email: 'test@example.com' } },
            error: null
          }),
          getSession: () => Promise.resolve({
            data: { session: { user: { id: 'test-user', email: 'test@example.com' } } },
            error: null
          })
        }
      };
      window.mockSupabaseClient = mockSupabaseClient;
    });

    // Mock search results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [
            {
              document_id: 'visual-doc-1',
              title: 'Visual Test Document',
              content: 'Content for visual testing...',
              document_type: 'judgment',
              language: 'pl',
              date: '2024-01-15'
            }
          ],
          chunks: [],
          question: 'visual test'
        })
      });
    });
  });

  test('search page initial state', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take screenshot
    await expect(page).toHaveScreenshot('search-initial.png', {
      fullPage: true,
      maxDiffPixels: 100
    });
  });

  test('search page with results', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('visual test query');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(1500);

      await expect(page).toHaveScreenshot('search-results.png', {
        fullPage: true,
        maxDiffPixels: 100
      });
    }
  });

  test('chat page initial state', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('chat-initial.png', {
      fullPage: true,
      maxDiffPixels: 100
    });
  });

  test('document detail page', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/visual-doc', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'visual-doc',
          title: 'Visual Regression Test Document',
          content: 'Full document content for visual testing...',
          document_type: 'judgment',
          metadata: {
            court_name: 'Supreme Court',
            date: '2024-01-15'
          }
        })
      });
    });

    await page.goto('/documents/visual-doc');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await expect(page).toHaveScreenshot('document-detail.png', {
      fullPage: true,
      maxDiffPixels: 100
    });
  });

  test('responsive - mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/search');
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('search-mobile.png', {
      fullPage: true,
      maxDiffPixels: 150
    });
  });

  test('responsive - tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/search');
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('search-tablet.png', {
      fullPage: true,
      maxDiffPixels: 150
    });
  });

  test('dark theme', async ({ page }) => {
    // Enable dark mode
    await page.goto('/search');
    await page.waitForTimeout(500);

    // Try to toggle dark mode
    const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });
    if (await themeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(1000);

      await expect(page).toHaveScreenshot('search-dark-theme.png', {
        fullPage: true,
        maxDiffPixels: 100
      });
    }
  });

  test('loading states', async ({ page }) => {
    // Mock slow API
    await page.route('**/api/documents/search', route => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            documents: [],
            chunks: [],
            question: 'test'
          })
        });
      }, 5000);
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('loading test');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(500);

      // Capture loading state
      await expect(page).toHaveScreenshot('search-loading.png', {
        maxDiffPixels: 100
      });
    }
  });

  test('error states', async ({ page }) => {
    // Mock error response
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: 'Internal server error'
        })
      });
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('error test');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(2000);

      await expect(page).toHaveScreenshot('search-error.png', {
        maxDiffPixels: 100
      });
    }
  });

  test('empty states', async ({ page }) => {
    // Mock empty results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: [],
          chunks: [],
          question: 'no results'
        })
      });
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('nonexistent query xyz');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(1500);

      await expect(page).toHaveScreenshot('search-empty.png', {
        fullPage: true,
        maxDiffPixels: 100
      });
    }
  });
});
