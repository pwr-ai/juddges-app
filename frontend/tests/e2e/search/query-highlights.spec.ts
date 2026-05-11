import { test, expect } from '@playwright/test';
import { SearchPage } from '../page-objects/SearchPage';

test.describe('Search query highlights', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    searchPage = new SearchPage(page);

    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: { user: { id: 'test-user-id', email: 'test@example.com' } },
            error: null,
          }),
          getSession: () => Promise.resolve({
            data: { session: { user: { id: 'test-user-id', email: 'test@example.com' } } },
            error: null,
          }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
      };
      // @ts-expect-error test shim
      window.__SUPABASE_TEST_CLIENT__ = mockSupabaseClient;
    });
  });

  test('result cards highlight query matches in title or summary', async ({ page }) => {
    await searchPage.goto();
    await searchPage.search('law');
    await searchPage.waitForSearchResults();

    const firstCard = page.locator('[data-testid="search-result-card"]').first();
    await expect(firstCard.locator('mark').first()).toBeVisible();
  });

  test('detail page carries ?q and highlights title', async ({ page }) => {
    await searchPage.goto();
    await searchPage.search('law');
    await searchPage.waitForSearchResults();

    const firstResult = page.locator('[data-testid="search-result-card"] a').first();
    const href = await firstResult.getAttribute('href');
    expect(href).toContain('q=law');

    await firstResult.click();
    await page.waitForURL(/\/documents\//);

    await expect(page.locator('h1 mark, h1 ~ * mark').first()).toBeVisible();
  });
});
