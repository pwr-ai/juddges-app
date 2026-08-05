/**
 * Representative real-HTTP coverage for the central public route policy.
 * The pure Jest policy matrix is exhaustive; this file proves that anonymous
 * requests reach real pages/handlers or receive exact login redirects.
 */
import { test, expect, type APIResponse } from '@playwright/test';
import { test as authTest } from '../helpers/auth-fixture';

const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3006';

const PUBLIC_HTML_PAGES = [
  '/',
  '/about',
  '/ecosystem',
  '/onboarding',
  '/status',
  '/accessibility',
  '/contact',
  '/cookies',
  '/privacy',
  '/team',
  '/terms',
  '/legal/disclaimer',
  '/legal/terms',
  '/blog',
  '/publications',
  '/use-cases',
  '/use-cases/uk-judgments',
  '/auth/login',
  '/auth/sign-up',
  '/auth/forgot-password',
] as const;

const PUBLIC_ASSET_ROUTES = ['/opengraph-image', '/twitter-image'] as const;

const PUBLIC_API_ROUTES = [
  '/api/health/status',
  '/api/dashboard/stats',
  '/api/contact',
  '/api/blog/categories',
  '/api/blog/posts',
  '/api/publications',
] as const;

const PROTECTED_REQUESTS = [
  {
    method: 'GET',
    url: '/search?q=vat&court=appeal',
    next: '/search?q=vat&court=appeal',
  },
  { method: 'GET', url: '/chat', next: '/chat' },
  { method: 'GET', url: '/collections', next: '/collections' },
  { method: 'GET', url: '/documents', next: '/documents' },
  { method: 'GET', url: '/blog/admin', next: '/blog/admin' },
  { method: 'GET', url: '/blog/admin/new', next: '/blog/admin/new' },
  {
    method: 'GET',
    url: '/publications/admin',
    next: '/publications/admin',
  },
  { method: 'POST', url: '/api/publications', next: '/api/publications' },
  {
    method: 'PUT',
    url: '/api/publications/publication-1',
    next: '/api/publications/publication-1',
  },
  {
    method: 'DELETE',
    url: '/api/publications/publication-1',
    next: '/api/publications/publication-1',
  },
  {
    method: 'POST',
    url: '/api/health/invalidate',
    next: '/api/health/invalidate',
  },
  {
    method: 'POST',
    url: '/api/blog/admin/posts',
    next: '/api/blog/admin/posts',
  },
  { method: 'PUT', url: '/api/contact', next: '/api/contact' },
] as const;

const LOOKALIKE_REQUESTS = [
  '/about-private',
  '/about/team',
  '/authentic',
  '/blogger',
  '/blog-private',
  '/publications-private',
  '/use-cases-private',
  '/api/healthcheck',
  '/api/dashboard/stats-preview',
  '/api/blogger',
  '/api/publications-private',
  '/api/contact-form',
  '/api/graphql/nested',
] as const;

const AUTHENTICATED_PAGES = [
  '/search',
  '/chat',
  '/collections',
  '/documents',
] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface StatusResponse {
  status(): number;
}

function expect2xx(response: StatusResponse, label: string): void {
  expect(
    response.status(),
    `${label} returned ${response.status()}`,
  ).toBeGreaterThanOrEqual(200);
  expect(
    response.status(),
    `${label} returned ${response.status()}`,
  ).toBeLessThan(300);
}

function expectLoginRedirect(
  response: APIResponse,
  expectedNext: string,
): void {
  expect(response.status()).toBe(307);
  const location = response.headers().location;
  expect(location).toBeTruthy();
  if (!location) throw new Error('Login redirect is missing Location');
  const redirect = new URL(location, E2E_BASE_URL);
  expect(redirect.pathname).toBe('/auth/login');
  expect(redirect.searchParams.get('next')).toBe(expectedNext);
}

test.describe.parallel('public pages — anonymous', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const url of PUBLIC_HTML_PAGES) {
    test(`GET ${url} returns a real page`, async ({ page }) => {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(response, `Expected a navigation response for ${url}`).not.toBeNull();
      expect2xx(response!, `Public page ${url}`);
      expect(new URL(page.url()).pathname).toBe(url);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    });
  }
});

test.describe.parallel('public metadata routes — anonymous', () => {
  for (const url of PUBLIC_ASSET_ROUTES) {
    test(`GET ${url} returns a real asset`, async ({ request }) => {
      const response = await request.get(url, { maxRedirects: 0 });
      expect2xx(response, `Public asset ${url}`);
    });
  }
});

test.describe.parallel('public APIs — anonymous', () => {
  for (const url of PUBLIC_API_ROUTES) {
    test(`GET ${url} returns 2xx`, async ({ request }) => {
      const response = await request.get(url, { maxRedirects: 0 });
      expect2xx(response, `Public API GET ${url}`);
      expect(response.headers().location).toBeUndefined();
    });

    test(`HEAD ${url} returns 2xx`, async ({ request }) => {
      const response = await request.fetch(url, {
        method: 'HEAD',
        maxRedirects: 0,
      });
      expect2xx(response, `Public API HEAD ${url}`);
      expect(response.headers().location).toBeUndefined();
    });
  }

  test('POST /api/contact reaches validation without side effects', async ({
    request,
  }) => {
    const response = await request.post('/api/contact', {
      data: { name: 'A', email: 'bad', company: '', message: 'short' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(400);
    expect(response.headers().location).toBeUndefined();
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
  });

  test('POST /api/graphql reaches the retired route 404', async ({ request }) => {
    const response = await request.post('/api/graphql', {
      data: {},
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
    expect(response.headers().location).toBeUndefined();
  });
});

test.describe.parallel('protected requests — anonymous', () => {
  for (const routeCase of PROTECTED_REQUESTS) {
    test(`${routeCase.method} ${routeCase.url} redirects with next`, async ({
      request,
    }) => {
      const response = await request.fetch(routeCase.url, {
        method: routeCase.method,
        maxRedirects: 0,
      });
      expectLoginRedirect(response, routeCase.next);
    });
  }

  for (const url of LOOKALIKE_REQUESTS) {
    test(`GET ${url} remains protected`, async ({ request }) => {
      const response = await request.get(url, { maxRedirects: 0 });
      expectLoginRedirect(response, url);
    });
  }
});

authTest.describe.parallel('protected pages — authenticated', () => {
  authTest.skip(
    !!process.env.CI &&
      (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
    'authenticated route checks require real Supabase credentials',
  );

  for (const url of AUTHENTICATED_PAGES) {
    authTest(`GET ${url} stays authenticated`, async ({ authenticatedPage }) => {
      await authenticatedPage.goto(url, { waitUntil: 'load' });
      const pathPattern = new RegExp('^[^?#]*' + escapeRegex(url));
      await expect(authenticatedPage).toHaveURL(pathPattern);
      await expect(authenticatedPage).not.toHaveURL(/\/auth\/login/);
    });
  }
});
