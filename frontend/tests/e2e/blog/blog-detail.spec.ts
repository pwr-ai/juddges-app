import { test, expect } from '../helpers/auth-fixture';

test.describe('blog detail 404 contract', () => {
  test('a missing published slug returns an actual HTTP 404', async ({
    authenticatedPage,
  }) => {
    const slug = `definitely-missing-${Date.now()}`;
    const response = await authenticatedPage.goto(`/blog/${slug}`, {
      waitUntil: 'domcontentloaded',
    });

    expect(response, 'navigation should return a document response').not.toBeNull();
    expect(response?.status()).toBe(404);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/blog/${slug}$`));
  });
});
