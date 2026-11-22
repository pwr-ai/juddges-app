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

import { GET } from '@/app/api/search/v2/judgments/[judgmentId]/route';
import { createClient } from '@/lib/supabase/server';

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function signedIn() {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: 'user-jwt' } } }),
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

function call(segment: string) {
  return GET(new NextRequest(`http://localhost/api/search/v2/judgments/${segment}`), {
    params: Promise.resolve({ judgmentId: segment }),
  });
}

function backendAnswers(status: number, body: unknown) {
  global.fetch = jest.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  ) as typeof global.fetch;
}

describe('GET /api/search/v2/judgments/[judgmentId]', () => {
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

    const response = await call('j1');

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects a malformed id without calling the backend', async () => {
    signedIn();
    global.fetch = jest.fn() as typeof global.fetch;

    const response = await call('a%20b');

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forwards an encoded NSA id with the user JWT and the backend key', async () => {
    signedIn();
    backendAnswers(200, { judgment_id: '/doc/AB12', full_text: 'tekst' });

    const response = await call('%2Fdoc%2FAB12');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ judgment_id: '/doc/AB12', full_text: 'tekst' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/search/v2/judgments/%2Fdoc%2FAB12');
    expect(init.method).toBe('GET');
    expect(init.cache).toBe('no-store');
    expect(init.headers['Authorization']).toBe('Bearer user-jwt');
    expect(init.headers['X-API-Key']).toBe('test-api-key');
  });

  it('passes a backend 404 through as an error', async () => {
    signedIn();
    backendAnswers(404, { detail: 'judgment not found' });

    const response = await call('missing');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'judgment not found' });
  });
});
