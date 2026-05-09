/**
 * Real-auth Playwright fixture.
 *
 * Strategy: relies on the `setup` project (`tests/e2e/auth.setup.ts`) to
 * perform a single UI login per test run and persist the browser storage
 * state to `.auth/user.json`. This fixture builds an isolated `BrowserContext`
 * pre-populated with that storage state and yields its `Page`. Each test gets
 * a fresh context (so cookies/session aren't shared across tests) but they
 * all start logged in as the same `TEST_USER_*` identity.
 *
 * Why not a per-worker fixture that does its own UI login?
 *   - One UI login per test run instead of one per worker.
 *   - Setup output is a plain file, so it composes with future projects
 *     (e.g. `firefox` reusing the same storage state).
 *   - Avoids serializing tests to dodge concurrent login races.
 *
 * Usage:
 *   import { test, expect } from '../helpers/auth-fixture';
 *
 *   test('home renders user menu', async ({ authenticatedPage }) => {
 *     await authenticatedPage.goto('/');
 *     await expect(authenticatedPage.getByRole('button', { name: /user menu/i })).toBeVisible();
 *   });
 */

import { test as base, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const STORAGE_STATE = path.join(__dirname, '..', '..', '..', '.auth', 'user.json');

interface AuthFixtures {
  authenticatedPage: Page;
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    if (!fs.existsSync(STORAGE_STATE)) {
      throw new Error(
        `auth-fixture: storage state not found at ${STORAGE_STATE}. ` +
          'The `setup` Playwright project should have produced it. Run with the ' +
          'default config so the `setup` project executes before browser projects, ' +
          'or run `npx playwright test --project=setup` once.',
      );
    }

    const context = await browser.newContext({ storageState: STORAGE_STATE });
    const page = await context.newPage();

    try {
      await use(page);
    } finally {
      await context.close();
    }
  },
});

export { expect };
