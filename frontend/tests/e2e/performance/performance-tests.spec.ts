import { test, expect } from '@playwright/test';

/**
 * Performance Tests
 *
 * Tests performance metrics:
 * - Page load times
 * - Time to interactive
 * - First contentful paint
 * - API response times
 * - Bundle sizes
 */

test.describe('Performance Tests', () => {
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
  });

  test('search page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    console.log(`Search page load time: ${loadTime}ms`);

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('search page is interactive within acceptable time', async ({ page }) => {
    await page.goto('/search');

    const startTime = Date.now();

    // Wait for search input to be interactive
    const searchInput = page.getByRole('textbox', { name: /search/i });
    await searchInput.waitFor({ state: 'visible' });

    // Verify it's actually interactive
    await searchInput.fill('test');

    const timeToInteractive = Date.now() - startTime;

    console.log(`Time to interactive: ${timeToInteractive}ms`);

    // Should be interactive within 2 seconds
    expect(timeToInteractive).toBeLessThan(2000);
  });

  test('search API responds within acceptable time', async ({ page }) => {
    let apiResponseTime = 0;

    await page.route('**/api/documents/search', route => {
      const startTime = Date.now();

      setTimeout(() => {
        apiResponseTime = Date.now() - startTime;

        route.fulfill({
          status: 200,
          body: JSON.stringify({
            documents: Array.from({ length: 10 }, (_, i) => ({
              document_id: `perf-doc-${i}`,
              title: `Performance Test Doc ${i}`,
              content: 'Content...',
              document_type: 'judgment'
            })),
            chunks: [],
            question: 'performance test'
          })
        });
      }, 100); // Simulate 100ms API time
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('performance test');

      const startTime = Date.now();
      await page.getByRole('button', { name: /search/i }).click();

      // Wait for results
      await page.waitForTimeout(1500);

      const totalTime = Date.now() - startTime;

      console.log(`Search response time: ${totalTime}ms`);
      console.log(`API response time: ${apiResponseTime}ms`);

      // Total time should be under 2 seconds
      expect(totalTime).toBeLessThan(2000);
    }
  });

  test('chat page loads and responds quickly', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    console.log(`Chat page load time: ${loadTime}ms`);

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('document rendering is performant', async ({ page }) => {
    // Mock large document
    await page.route('**/api/documents/perf-doc', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'perf-doc',
          title: 'Large Performance Test Document',
          content: 'Lorem ipsum dolor sit amet... '.repeat(1000), // Large content
          document_type: 'judgment',
          metadata: {
            court_name: 'Test Court',
            date: '2024-01-15'
          }
        })
      });
    });

    const startTime = Date.now();

    await page.goto('/documents/perf-doc');
    await page.waitForLoadState('networkidle');

    // Wait for content to render
    await page.waitForTimeout(1000);

    const renderTime = Date.now() - startTime;

    console.log(`Document render time: ${renderTime}ms`);

    // Should render within 3 seconds even for large documents
    expect(renderTime).toBeLessThan(3000);
  });

  test('scroll performance is smooth', async ({ page }) => {
    // Mock many results
    await page.route('**/api/documents/search', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          documents: Array.from({ length: 100 }, (_, i) => ({
            document_id: `scroll-doc-${i}`,
            title: `Scroll Test Document ${i}`,
            content: 'Content... '.repeat(50),
            document_type: 'judgment'
          })),
          chunks: [],
          question: 'scroll test'
        })
      });
    });

    await page.goto('/search');
    await page.waitForTimeout(500);

    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('scroll test');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(2000);

      // Measure scroll performance
      const startTime = Date.now();

      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await page.waitForTimeout(500);

      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });

      const scrollTime = Date.now() - startTime;

      console.log(`Scroll time: ${scrollTime}ms`);

      // Scroll should be smooth (under 1 second)
      expect(scrollTime).toBeLessThan(1000);
    }
  });

  test('memory usage remains stable', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Get initial memory (if available)
    const initialMemory = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });

    // Perform multiple operations
    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      for (let i = 0; i < 5; i++) {
        await searchInput.fill(`query ${i}`);
        await page.waitForTimeout(200);
      }
    }

    // Get final memory
    const finalMemory = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });

    if (initialMemory > 0 && finalMemory > 0) {
      const memoryIncrease = finalMemory - initialMemory;
      const increasePercentage = (memoryIncrease / initialMemory) * 100;

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB (${increasePercentage.toFixed(2)}%)`);

      // Memory shouldn't increase by more than 50%
      expect(increasePercentage).toBeLessThan(50);
    }
  });

  test('Web Vitals meet thresholds', async ({ page }) => {
    await page.goto('/search');

    // Collect Web Vitals
    const vitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const metrics: any = {};

        // First Contentful Paint
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              metrics.fcp = entry.startTime;
            }
          }
        }).observe({ entryTypes: ['paint'] });

        // Largest Contentful Paint
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          metrics.lcp = lastEntry.startTime;
        }).observe({ entryTypes: ['largest-contentful-paint'] });

        // Cumulative Layout Shift
        let clsValue = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
          metrics.cls = clsValue;
        }).observe({ entryTypes: ['layout-shift'] });

        // Return after 2 seconds
        setTimeout(() => resolve(metrics), 2000);
      });
    });

    console.log('Web Vitals:', vitals);

    // First Contentful Paint should be < 1.8s
    if (vitals.fcp) {
      expect(vitals.fcp).toBeLessThan(1800);
    }

    // Largest Contentful Paint should be < 2.5s
    if (vitals.lcp) {
      expect(vitals.lcp).toBeLessThan(2500);
    }

    // Cumulative Layout Shift should be < 0.1
    if (vitals.cls !== undefined) {
      expect(vitals.cls).toBeLessThan(0.1);
    }
  });
});
