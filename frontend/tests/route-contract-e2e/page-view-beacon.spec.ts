import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
} from './synthetic-session';

/**
 * Usage instrumentation: PageViewTracker queues a `page_viewed` event keyed by
 * the route template, and track() flushes it to the Next.js /api/events proxy.
 */
test.describe('page view beacon', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(response.status()).toBe(204);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('navigating to a page sends a page_viewed beacon to /api/events', async ({ page }) => {
    // Playwright cannot read a Blob beacon body off the request, so record
    // the payload at the sendBeacon call and let the request go out unchanged.
    await page.addInitScript(() => {
      const sent: string[] = [];
      (window as unknown as { __beacons: string[] }).__beacons = sent;
      const original = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        if (data instanceof Blob) void data.text().then((text) => sent.push(text));
        return original(url, data);
      };
    });

    const beacon = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/events',
      // track() flushes on a 5 s timer (or on pagehide).
      { timeout: 15_000 },
    );

    await page.goto('/');
    await beacon;

    const payloads = await page.evaluate(
      () => (window as unknown as { __beacons: string[] }).__beacons,
    );
    const events = payloads.flatMap(
      (text) => JSON.parse(text).events as { event_name: string; properties: { route: string } }[],
    );
    const view = events.find((e) => e.event_name === 'page_viewed');
    expect(view?.properties.route).toBe('/');
  });
});
