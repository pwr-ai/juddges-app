/**
 * Playwright `setup` project: performs a single real UI login against the
 * Supabase-backed app and persists the resulting browser storage state to
 * `.auth/user.json`. Browser projects (chromium / firefox / etc.) declare
 * `dependencies: ['setup']` in `playwright.config.ts`, and tests that need
 * an authenticated session opt in via the `authenticatedPage` fixture from
 * `tests/e2e/helpers/auth-fixture.ts` (which loads this storage state).
 *
 * Why this pattern (instead of a worker fixture or `globalSetup`):
 *   - Setup output (`storageState`) is naturally a file, and Playwright's
 *     `setup` project model gives us a first-class place to produce it.
 *   - One UI login per test run, reused by every browser project.
 *   - No worker-scope serialization headaches.
 */

import { test as setup } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loginViaUI, expectAuthenticated } from './helpers/real-auth';

export const STORAGE_STATE = path.join(__dirname, '..', '..', '.auth', 'user.json');

// CI skip guard: the default CI workflow uses placeholder Supabase credentials
// (NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co). Real-auth setup
// requires a valid Supabase project plus TEST_USER_EMAIL/TEST_USER_PASSWORD.
// Locally these come from .env (auto-loaded in playwright.config.ts).
setup.skip(
  !!process.env.CI && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
  'real-auth setup needs TEST_USER_EMAIL/TEST_USER_PASSWORD and a real NEXT_PUBLIC_SUPABASE_URL — not available in default CI',
);

setup('authenticate', async ({ page, context }) => {
  await fs.mkdir(path.dirname(STORAGE_STATE), { recursive: true });

  await loginViaUI(page);
  await expectAuthenticated(context);

  await context.storageState({ path: STORAGE_STATE });
});
