import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  type AdapterRequest,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';

/**
 * `/settings` MCP access section. The plaintext key is shown exactly once,
 * at creation — the list endpoint only ever returns a prefix — so this spec
 * asserts both halves: the reveal dialog carries the full key, and the list
 * afterwards shows only the prefix.
 */

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

test.describe('MCP keys settings contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
    await setSyntheticSession(context);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('lists existing keys by prefix only', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'MCP access' });
    await expect(section.getByText('jdg_mcp_Ab3xK9pQ…')).toBeVisible();
    await expect(section.getByText(/jdg_mcp_[A-Za-z0-9_-]{20,}/)).toHaveCount(0);
  });

  test('reveals a newly created key once', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'MCP access' });
    await section.getByRole('button', { name: 'Generate key' }).click();

    const dialog = page.getByRole('dialog', { name: 'Your new MCP key' });
    await expect(dialog.getByText(/jdg_mcp_[A-Za-z0-9_-]{20,}/)).toBeVisible();
    await expect(dialog.getByText('shown only once', { exact: false })).toBeVisible();

    await dialog.getByRole('button', { name: 'Done' }).click();
    // The dialog renders in a portal outside the section, so the leak guard
    // must be page-scoped to be able to see it.
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/jdg_mcp_[A-Za-z0-9_-]{20,}/)).toHaveCount(0);
    // The list refreshed after create and shows the new key by prefix only.
    await expect(section.getByText('jdg_mcp_Zq4mW7nR…')).toBeVisible();
  });

  test('does not revoke when the confirmation is cancelled', async ({ page, request }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'MCP access' });
    await section.getByRole('button', { name: 'Revoke laptop' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Confirm revoke' })).toBeHidden();

    const response = await request.get(`${ADAPTER_BASE_URL}/__route-contract/requests`);
    expect(response.status()).toBe(200);
    const { requests } = (await response.json()) as { requests: AdapterRequest[] };
    expect(requests.filter((r) => r.method === 'DELETE' && r.path.startsWith('/mcp/keys'))).toEqual([]);
    await expect(section.getByRole('button', { name: 'Revoke laptop' })).toBeVisible();
    await expect(section.getByText('Revoked')).toHaveCount(0);
  });

  test('revokes a key', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'MCP access' });
    await section.getByRole('button', { name: 'Revoke laptop' }).click();
    await page.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(section.getByText('Revoked')).toBeVisible();
  });
});
