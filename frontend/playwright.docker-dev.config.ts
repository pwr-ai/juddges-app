import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for E2E tests against docker-compose.dev.yml.
 * Assumes services are already running:
 *   - Frontend: http://localhost:3007
 *   - Backend: http://localhost:8004
 */
export default defineConfig({
  testDir: './tests/e2e-docker',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3007',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: '**/frontend-integration.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'API Integration',
      testMatch: '**/api-integration.spec.ts',
      use: {
        baseURL: 'http://localhost:8004',
        extraHTTPHeaders: {
          'X-API-Key': process.env.BACKEND_API_KEY || '1234567890',
        },
      },
    },
  ],
  // No webServer - expects docker-compose.dev.yml to be running
});
