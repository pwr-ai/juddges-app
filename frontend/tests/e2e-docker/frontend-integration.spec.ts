import { test, expect } from '@playwright/test';

/**
 * Frontend-Backend integration tests.
 * Tests that the frontend loads correctly and communicates with the backend
 * running in docker-compose.dev.yml.
 *
 * Run with:
 *   npx playwright test --config=playwright.docker-dev.config.ts --project=chromium
 *
 * The baseURL is http://localhost:3007 as configured in playwright.docker-dev.config.ts.
 *
 * NOTE: In dev mode, Next.js compiles pages on first request.  The initial
 * compilation can take 30-60s depending on hardware.  Tests use a 60s timeout
 * (set in the config) to accommodate this.
 */

test.describe('Frontend Loading', () => {
  test('homepage loads and renders content', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Accept 200 (page loaded) or 307 (middleware redirect to /auth/login)
    expect(response).not.toBeNull();
    const status = response!.status();
    expect([200, 307]).toContain(status);

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 30000 });
    const bodyText = await body.textContent();
    expect((bodyText ?? '').trim().length).toBeGreaterThan(0);
  });

  test('homepage has no critical JavaScript errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Exclude benign errors (e.g., favicon 404, CSP reports, hydration warnings)
    const realErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('404') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('hydrat') &&
        !e.includes('Minified React error')
    );
    expect(realErrors).toHaveLength(0);
  });
});

test.describe('Auth Pages', () => {
  test('login page loads and shows a login form', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    // Expect an email or username input
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Frontend-to-Backend Connectivity', () => {
  test('backend health endpoint is reachable from the test runner', async ({ request }) => {
    // Directly hit the backend from the test runner to verify docker networking
    const response = await request.fetch('http://localhost:8004/health/healthz');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });
});
