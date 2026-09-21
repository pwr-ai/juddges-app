import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test';

export const APP_BASE_URL = 'http://127.0.0.1:3006';
export const ADAPTER_BASE_URL = 'http://127.0.0.1:4311';
export const USER_ID = '11111111-1111-4111-8111-111111111111';

export interface AdapterRequest {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  unexpected?: boolean;
}

export interface ServedExtractionState {
  status: string;
  completed_documents: number;
  total_documents: number;
}

export async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(
    `${ADAPTER_BASE_URL}/__route-contract/reset`,
  );
  expect(response.status()).toBe(204);
}

export async function adapterRequests(
  request: APIRequestContext,
): Promise<AdapterRequest[]> {
  const response = await request.get(
    `${ADAPTER_BASE_URL}/__route-contract/requests`,
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { requests: AdapterRequest[] };
  return payload.requests;
}

/**
 * What the stub answered for a sequenced `GET /extractions/{id}` on each poll,
 * in order. Snapshot reads (`include_results=false`, made by the middleware)
 * are not recorded — they observe the current step without consuming one.
 */
export async function extractionSequence(
  request: APIRequestContext,
  jobId?: string,
): Promise<ServedExtractionState[]> {
  const url = new URL(`${ADAPTER_BASE_URL}/__route-contract/extraction-sequence`);
  if (jobId) url.searchParams.set('job_id', jobId);
  const response = await request.get(url.toString());
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as {
    served: ServedExtractionState[];
  };
  return payload.served;
}

/**
 * Same synthetic session the route-status contract uses: the stub answers
 * `GET /auth/v1/user` for the `route-contract-valid` token, so the middleware,
 * the BFF routes and the browser Supabase client all see one signed-in user
 * without a real Supabase project.
 */
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
