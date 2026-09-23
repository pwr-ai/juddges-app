import { expect, test } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  setSyntheticSession,
  expectNoUnexpectedStubRequests,
} from './synthetic-session';

/**
 * Seed file for `npx playwright init-agents` (#695): `planner_setup_page` /
 * `generator_setup_page` replay this test to reach a common starting state
 * (an authenticated session against the route-contract stub) before
 * exploring or generating a scenario — see `.claude/agents/playwright-test-{planner,generator}.md`
 * and `frontend/specs/README.md` for the agents that consume it.
 *
 * It also runs as an ordinary spec on every PR (it matches
 * `**\/*.spec.ts`), so it carries one real assertion rather than an empty
 * placeholder that would pass without testing anything.
 */
test.describe('route-contract seed', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
    expect(response.status()).toBe(204);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('seed', async ({ page, context }) => {
    await setSyntheticSession(context);

    await page.goto('/collections');

    await expect(page.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible();
  });
});
