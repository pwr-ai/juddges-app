import { createRequire } from 'node:module';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';

/**
 * Page-level semantics (axe-core, WCAG 2.1 AA subset): the three rules that
 * kept failing on page markup rather than on the shell — an unnamed select,
 * interactive cards wrapping interactive children, and skipped heading levels.
 *
 * axe-core is injected from node_modules (it arrives transitively); this spec
 * deliberately does not depend on it in package.json.
 */

const nodeRequire = createRequire(__filename);
const AXE_PATH = nodeRequire.resolve('axe-core/axe.min.js');

const RULES = ['select-name', 'nested-interactive', 'heading-order'];

interface AxeViolation {
  id: string;
  help: string;
  nodes: Array<{ target: unknown[]; html: string }>;
}

async function axeViolations(page: Page, rules: string[] = RULES): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (rules) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = (window as any).axe;
    const results = await axe.run(document, { runOnly: { type: 'rule', values: rules } });
    return results.violations.map(
      (v: { id: string; help: string; nodes: Array<{ target: unknown[]; html: string }> }) => ({
        id: v.id,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 160) })),
      }),
    );
  }, rules);
}

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

const SIGNED_IN_ROUTES: Array<{ path: string; ready: (page: Page) => Promise<void> }> = [
  {
    path: '/collections',
    ready: async (page) => {
      await expect(page.getByRole('link', { name: 'Route contract extraction collection' })).toBeVisible();
      await expect(page.getByRole('combobox', { name: /sort by/i })).toBeVisible();
    },
  },
  {
    path: '/schemas',
    ready: async (page) => {
      await expect(page.getByRole('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
    },
  },
  {
    path: '/search/extractions?view=stats&n=100&seed=7&fields=appeal_outcome',
    ready: async (page) => {
      await expect(page.locator('section[aria-label="Appeal outcome"]')).toBeVisible();
    },
  },
  {
    path: '/settings',
    ready: async (page) => {
      await expect(page.getByRole('region', { name: 'MCP access' })).toBeVisible();
    },
  },
  {
    path: '/help',
    ready: async (page) => {
      await expect(page.getByRole('link', { name: 'Contact Support' }).first()).toBeVisible();
    },
  },
];

test.describe('page-level a11y semantics (axe)', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  for (const route of SIGNED_IN_ROUTES) {
    test(`signed in: ${route.path} has no ${RULES.join(' / ')} violations`, async ({ page, context }) => {
      await setSyntheticSession(context);
      await page.goto(route.path);
      await route.ready(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  for (const path of ['/blog', '/team']) {
    test(`guest: ${path} has no ${RULES.join(' / ')} violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      if (path === '/blog') {
        await expect(page.getByRole('heading', { name: 'Route contract blog post' })).toBeVisible();
      }
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test('guest: /status keeps its h1 when the status API fails', async ({ page }) => {
    // The stub has no system-status fixture, so the page lands in its error
    // state, the branch that used to render only an h2.
    await page.goto('/status');
    await expect(page.getByRole('heading', { level: 1, name: 'System Status' })).toBeVisible();
    expect(await axeViolations(page, ['page-has-heading-one', 'heading-order'])).toEqual([]);
  });

  test('collections: Tab reaches each card title link once and Enter opens the collection', async ({
    page,
    context,
  }) => {
    await setSyntheticSession(context);
    await page.goto('/collections');
    const link = page.getByRole('link', { name: 'Route contract extraction collection' });
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/collections\/[^/]+$/);
  });
});
