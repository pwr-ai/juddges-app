/**
 * @jest-environment node
 */

jest.mock('@/app/api/utils/backend-url', () => ({
  getBackendUrl: () => 'http://backend.test',
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { child: () => ({ error: jest.fn(), warn: jest.fn() }) },
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/search/v2/route';
import { createClient } from '@/lib/supabase/server';

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function signedIn(accessToken = 'user-jwt') {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: accessToken } } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function signedOut() {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error('no session') }),
      getSession: async () => ({ data: { session: null } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/search/v2', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/search/v2', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('rejects a signed-out caller without calling the backend', async () => {
    signedOut();
    global.fetch = jest.fn() as typeof global.fetch;

    const response = await POST(request({ query: 'zachowek' }));

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forwards the query with the user JWT and the backend key', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ results: [], took_ms: 3, engine: 'weaviate-v2' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    ) as typeof global.fetch;

    const response = await POST(request({ query: 'zachowek', limit: 5, alpha: 0.3 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [], took_ms: 3, engine: 'weaviate-v2' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/search/v2');
    expect(JSON.parse(init.body)).toEqual({ query: 'zachowek', limit: 5, alpha: 0.3 });
    expect(init.headers['Authorization']).toBe('Bearer user-jwt');
    expect(init.headers['X-API-Key']).toBe('test-api-key');
  });

  it('passes a 503 "not configured" through as an error message', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'search v2 not configured' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
    ) as typeof global.fetch;

    const response = await POST(request({ query: 'zachowek' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'search v2 not configured' });
  });
});
