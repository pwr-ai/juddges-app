import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  setSyntheticSession,
  expectNoUnexpectedStubRequests,
} from './synthetic-session';

/**
 * #699: the chat composer must sit inside the viewport with the sidebar,
 * FlowStepper and footer all rendered. The old `h-[calc(100vh-4rem)]` ignored
 * the stepper and footer and pushed the composer below the fold.
 */
const KNOWN_CHAT = '10000000-0000-4000-8000-000000000001';
const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];
const ROUTES = [
  { name: '/chat', path: '/chat' },
  { name: '/chat/[id]', path: `/chat/${KNOWN_CHAT}` },
];

test.describe('chat composer stays inside the viewport', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(response.status()).toBe(204);
  });

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.name} at ${viewport.name}`, async ({ page, context }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setSyntheticSession(context);
        await page.goto(route.path);

        const composer = page.getByPlaceholder('Type your message...');
        await expect(composer).toBeVisible();

        const box = await composer.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

        // The page itself must not scroll: the composer is reachable without it.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollHeight - window.innerHeight,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
