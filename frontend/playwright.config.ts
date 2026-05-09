import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

/**
 * Load TEST_USER_* / E2E_* vars from a local .env file so Playwright doesn't
 * require the developer to manually `source` the env. Prefer
 * `frontend/.env.local` (the symlink Next.js itself reads) and fall back to
 * the repo-root `.env`. On CI we skip this entirely — env is injected by the
 * workflow.
 */
// On CI the workflow injects whatever env it wants directly; auto-loading a
// stray .env on CI runners would silently override that. Restrict dotenv
// loading to local development.
if (!process.env.CI) {
  const envCandidates = [
    path.resolve(__dirname, '.env.local'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const candidate of envCandidates) {
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      console.log(`[playwright.config] loaded env from ${candidate}`);
      break;
    }
  }
}

// Fail-fast locally if creds are still missing after the load attempt.
// On CI, env is injected differently and TEST_USER_* may legitimately be
// absent for test subsets that don't need real auth.
if (!process.env.CI && !process.env.TEST_USER_EMAIL) {
  throw new Error(
    'playwright.config.ts: TEST_USER_EMAIL not found in env. ' +
      'Set TEST_USER_EMAIL/TEST_USER_PASSWORD in repo-root .env or frontend/.env.local.',
  );
}

/**
 * @see https://playwright.dev/docs/test-configuration
 *
 * Server lifecycle behavior:
 * - When `E2E_BASE_URL` is set, Playwright will NOT spawn its own frontend
 *   webServer. This lets us run the suite against an already-running dev
 *   container (e.g. http://localhost:3007).
 * - When `E2E_BACKEND_BASE_URL` is set, the backend webServer entry is
 *   omitted (a backend is assumed to already be running, or unused for the
 *   selected tests).
 * - On CI (`process.env.CI`), the workflow itself manages server lifecycle
 *   (see `.github/workflows/ci.yml`). We therefore omit the webServer block
 *   on CI as well to avoid double-starting Next.
 */

const FRONTEND_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3006';
const BACKEND_BASE_URL = process.env.E2E_BACKEND_BASE_URL || 'http://localhost:8004';

const skipFrontendWebServer = !!process.env.CI || !!process.env.E2E_BASE_URL;
const skipBackendWebServer = !!process.env.CI || !!process.env.E2E_BACKEND_BASE_URL;

const webServers: NonNullable<Parameters<typeof defineConfig>[0]['webServer']> = [];

if (!skipFrontendWebServer) {
  webServers.push({
    command: 'npm run dev',
    url: FRONTEND_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  });
}

if (!skipBackendWebServer) {
  webServers.push({
    command: 'cd ../backend && poetry run uvicorn app.server:app --port 8004',
    url: BACKEND_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  });
}

export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Timeout for tests - increased for streaming tests */
  timeout: 60000, // 60 seconds for individual tests
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: FRONTEND_BASE_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    /*
     * Real-auth setup project. Performs a single UI login and stores the
     * resulting Supabase auth cookies to `.auth/user.json`. Browser projects
     * that need a logged-in session opt in via `dependencies: ['setup']` and
     * load that storage state through the `authenticatedPage` fixture.
     */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
      dependencies: ['setup'],
    },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },

    /* API Testing project */
    {
      name: 'API Tests',
      testMatch: '**/api/*.spec.ts',
      use: {
        baseURL: process.env.API_BASE_URL || BACKEND_BASE_URL,
        extraHTTPHeaders: {
          'X-API-Key': process.env.BACKEND_API_KEY || '1234567890'
        }
      }
    }
  ],

  /* Run your local dev server before starting the tests */
  webServer: webServers.length > 0 ? webServers : undefined,
});
