import { defineConfig, devices } from '@playwright/test';

const FRONTEND_BASE_URL = 'http://127.0.0.1:3006';
const STUB_BASE_URL = 'http://127.0.0.1:4311';

export default defineConfig({
  testDir: './tests/route-contract-e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  outputDir: 'test-results/route-contract',
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: FRONTEND_BASE_URL,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-route-contract',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/route-contract-e2e/stub-services.mjs',
      url: `${STUB_BASE_URL}/__route-contract/ready`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm start',
      url: FRONTEND_BASE_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: STUB_BASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'route-contract-anon',
        NEXT_PUBLIC_API_BASE_URL: STUB_BASE_URL,
        API_BASE_URL: STUB_BASE_URL,
        BACKEND_API_KEY: 'route-contract-backend-key',
      },
    },
  ],
});
