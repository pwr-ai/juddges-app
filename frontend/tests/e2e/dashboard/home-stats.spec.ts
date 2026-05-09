/**
 * Authenticated home dashboard stats smoke.
 *
 * Verifies that after a real Supabase login, the "/" dashboard surfaces the
 * precomputed counts from /api/dashboard/stats (which proxies to FastAPI's
 * GET /dashboard/stats, which reads from public.dashboard_precomputed_stats).
 *
 * Strategy:
 *   1. Intercept the API response and sanity-check the JSON shape + value
 *      bounds (so a regressed/empty payload fails fast, not just a missing
 *      DOM element).
 *   2. Assert the three figures in the "Database overview" card render the
 *      same numbers, accounting for the abbreviation done by Stat.tsx
 *      (12 307 → "12K", etc.) and its 1.8 s count-up animation.
 */

import { test, expect } from '../helpers/auth-fixture';

/**
 * Mirrors the format used by frontend/components/editorial/Stat.tsx so we
 * compare against what the user actually sees.
 */
function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.floor(n / 1_000).toLocaleString()}K`;
  return n.toLocaleString();
}

interface DashboardStatsPayload {
  total_judgments: number;
  jurisdictions?: { PL?: number; UK?: number };
  computed_at?: string | null;
}

test.describe('authenticated home dashboard stats', () => {
  test('renders precomputed totals matching /api/dashboard/stats', async ({
    authenticatedPage,
  }) => {
    const statsResponsePromise = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes('/api/dashboard/stats') &&
        resp.request().method() === 'GET',
      { timeout: 30_000 },
    );

    await authenticatedPage.goto('/');

    const statsResponse = await statsResponsePromise;
    expect(
      statsResponse.ok(),
      `expected /api/dashboard/stats 200, got ${statsResponse.status()}`,
    ).toBeTruthy();

    const stats = (await statsResponse.json()) as DashboardStatsPayload;

    expect(stats.total_judgments, 'total_judgments must be a positive count').toBeGreaterThan(0);
    expect(stats.jurisdictions?.PL ?? 0, 'PL jurisdiction count must be > 0').toBeGreaterThan(0);
    expect(stats.jurisdictions?.UK ?? 0, 'UK jurisdiction count must be > 0').toBeGreaterThan(0);
    expect(stats.computed_at, 'computed_at must be set on the precomputed payload').toBeTruthy();

    // PL + UK should not exceed total_judgments. Allow equality (currently true)
    // and a small tolerance in case future rows fall outside both buckets.
    const plPlusUk = (stats.jurisdictions?.PL ?? 0) + (stats.jurisdictions?.UK ?? 0);
    expect(plPlusUk).toBeLessThanOrEqual(stats.total_judgments);

    const overviewCard = authenticatedPage
      .locator('section, article, div')
      .filter({ has: authenticatedPage.locator('text=/database overview/i') })
      .first();
    await expect(overviewCard, '"Database overview" card should render').toBeVisible();

    // Stat.tsx animates from 0 → value over ~1.8s when scrolled into view.
    // Poll for the final formatted display rather than guessing the timing.
    const expectedJudgments = formatStat(stats.total_judgments);
    const expectedIndexed = formatStat(plPlusUk);
    const jurisdictionCount = [stats.jurisdictions?.PL, stats.jurisdictions?.UK].filter(
      (n) => (n ?? 0) > 0,
    ).length;
    const expectedJurisdictions = formatStat(jurisdictionCount);

    await expect(
      overviewCard.locator('text=/Judgments/i').first(),
      'Judgments label should be visible',
    ).toBeVisible();
    await expect(
      overviewCard.locator('text=/Jurisdictions/i').first(),
      'Jurisdictions label should be visible',
    ).toBeVisible();
    await expect(
      overviewCard.locator('text=/Indexed/i').first(),
      'Indexed label should be visible',
    ).toBeVisible();

    await expect(
      overviewCard.locator(`text=${expectedJudgments}`).first(),
      `Judgments figure should reach ${expectedJudgments} after count-up`,
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      overviewCard.locator(`text=${expectedJurisdictions}`).first(),
      `Jurisdictions figure should be ${expectedJurisdictions}`,
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      overviewCard.locator(`text=${expectedIndexed}`).first(),
      `Indexed figure should reach ${expectedIndexed} after count-up`,
    ).toBeVisible({ timeout: 5_000 });
  });
});
