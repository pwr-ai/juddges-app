import { expect, test, type Page } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';

/**
 * Shell-level a11y contract: axe-core (WCAG 2.1 AA) finds no landmark or
 * colour-contrast violations on the app shell (sidebar, navbar, flow stepper,
 * footer) at desktop and phone widths, for a guest (`/`) and a signed-in
 * user (`/collections`). Gold text must use `--pwr-gold-text`, not `--gold`.
 */

const RULES = ['region', 'landmark-one-main', 'landmark-no-duplicate-main', 'color-contrast'];
const VIEWPORTS = [
  { name: '1280', width: 1280, height: 900 },
  { name: '375', width: 375, height: 800 },
] as const;

interface AxeViolation {
  id: string;
  nodes: { target: unknown[] }[];
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
  if (!(await page.evaluate(() => 'axe' in window))) {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  }
  return page.evaluate(async (rules) => {
    const axe = (window as unknown as {
      axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: AxeViolation[] }> };
    }).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'rule', values: rules },
    });
    return result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target })),
    }));
  }, RULES);
}

/**
 * axe computes contrast from live opacity, so a frame in the middle of the
 * landing page's entrance fades reports false positives. Retry until the page
 * settles instead of sleeping a fixed time; a real violation persists and
 * still fails once the timeout runs out.
 */
async function expectNoViolations(page: Page): Promise<void> {
  await expect(async () => {
    expect(await runAxe(page)).toEqual([]);
  }).toPass({ timeout: 10_000 });
}

test.describe('shell landmarks and contrast', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(response.status()).toBe(204);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  for (const viewport of VIEWPORTS) {
    test(`guest / has no landmark or contrast violations at ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await expect(page.getByRole('main')).toBeVisible();

      await expectNoViolations(page);
    });

    test(`signed-in /collections has no landmark or contrast violations at ${viewport.name}px`, async ({
      page,
      context,
    }) => {
      await setSyntheticSession(context);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/collections');
      await expect(page.getByRole('main')).toBeVisible();

      await expectNoViolations(page);
    });
  }

  test('footer links wrap into view at 375px and gated links are hidden for guests', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
    await expect(footer.locator('a[href="/help"]')).toHaveCount(0);
    await expect(footer.locator('a[href="/dataset-comparison"]')).toHaveCount(0);

    for (const link of await footer.getByRole('link').all()) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }
  });

  test('guest navbar offers only public pages', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Public pages' });
    await expect(nav.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    await expect(nav.getByRole('link', { name: 'Publications' })).toHaveAttribute('href', '/publications');
    // /changelog is auth-gated: a guest following it would hit the login wall.
    await expect(nav.locator('a[href="/changelog"]')).toHaveCount(0);
  });

  test('the open mobile sidebar is still a dialog holding the main navigation', async ({
    page,
    context,
  }) => {
    // role="navigation" is passed to the Sidebar root; on mobile that root is a
    // Sheet, and the role must not override the drawer's dialog semantics.
    await setSyntheticSession(context);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/collections');
    const trigger = page.getByRole('button', { name: 'Open navigation menu' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: /collections/i }).first()).toBeVisible();
  });
});
