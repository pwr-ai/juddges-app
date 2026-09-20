/**
 * Shared session helper for the PR-gated route-contract harness (Foundation).
 *
 * The harness boots the standalone Next server against stub-services.mjs and
 * logs a user in with a synthetic `sb-127-auth-token` cookie — the only way a
 * PR-gated Playwright spec can be authenticated without a real Supabase project.
 * Body of setSyntheticSession is the one that lived in extraction-path.spec.ts.
 */
import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test';

export const APP_BASE_URL = 'http://127.0.0.1:3006';
export const ADAPTER_BASE_URL = 'http://127.0.0.1:4311';
export const USER_ID = '11111111-1111-4111-8111-111111111111';

export async function setSyntheticSession(context: BrowserContext): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;
  const session = {
    access_token: 'route-contract-valid',
    refresh_token: 'route-contract-valid-refresh',
    expires_in: 3_600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'route-contract@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-08-06T00:00:00.000Z',
    },
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString('base64url');

  await context.clearCookies();
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${encoded}`,
      url: APP_BASE_URL,
      expires: expiresAt,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

/** The stub marks any unrouted request `unexpected: true`; a spec must leave none behind. */
export async function expectNoUnexpectedStubRequests(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${ADAPTER_BASE_URL}/__route-contract/requests`);
  const { requests } = (await response.json()) as { requests: Array<{ unexpected?: boolean; method?: string; url?: string }> };
  expect(requests.filter((r) => r.unexpected)).toEqual([]);
}
