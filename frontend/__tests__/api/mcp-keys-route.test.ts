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
  logger: { error: jest.fn() },
}));

import { GET, POST } from '@/app/api/mcp-keys/route';
import { DELETE } from '@/app/api/mcp-keys/[id]/route';
import { createClient } from '@/lib/supabase/server';

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const KEY_ID = '0b6f3c2e-8f4a-4d1e-9a7b-2c5d8e1f3a4b';

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

describe('/api/mcp-keys', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('GET rejects a signed-out caller without calling the backend', async () => {
    signedOut();
    global.fetch = jest.fn() as typeof global.fetch;

    const response = await GET();

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET forwards both the user JWT and the backend key', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof global.fetch;

    const response = await GET();

    expect(response.status).toBe(200);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/mcp/keys');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer user-jwt');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-api-key');
  });

  it('POST passes the created key straight through', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ id: KEY_ID, key: 'jdg_mcp_secret', prefix: 'jdg_mcp_Ab3xK9pQ' }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof global.fetch;

    const response = await POST(
      new Request('http://localhost/api/mcp-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'laptop' }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ key: 'jdg_mcp_secret' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/mcp/keys');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer user-jwt');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-api-key');
    expect(JSON.parse(init.body)).toEqual({ name: 'laptop' });
  });

  it('POST rejects a signed-out caller without calling the backend', async () => {
    signedOut();
    global.fetch = jest.fn() as typeof global.fetch;

    const response = await POST(
      new Request('http://localhost/api/mcp-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'laptop' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POST surfaces the backend status on failure', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () => new Response('{"detail":"nope"}', { status: 500 }),
    ) as typeof global.fetch;

    const response = await POST(
      new Request('http://localhost/api/mcp-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'laptop' }),
      }),
    );

    expect(response.status).toBe(500);
  });

  it('DELETE rejects a signed-out caller without calling the backend', async () => {
    signedOut();
    global.fetch = jest.fn() as typeof global.fetch;

    const response = await DELETE(
      new Request(`http://localhost/api/mcp-keys/${KEY_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: KEY_ID }) },
    );

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('DELETE revokes the key with the user JWT and the backend key', async () => {
    signedIn();
    global.fetch = jest.fn(async () => new Response(null, { status: 204 })) as typeof global.fetch;

    const response = await DELETE(
      new Request(`http://localhost/api/mcp-keys/${KEY_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: KEY_ID }) },
    );

    expect(response.status).toBe(204);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`http://backend.test/mcp/keys/${KEY_ID}`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer user-jwt');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-api-key');
  });

  it('DELETE preserves a backend 404 rather than flattening it to 500', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () => new Response('{"detail":"not found"}', { status: 404 }),
    ) as typeof global.fetch;

    const response = await DELETE(
      new Request(`http://localhost/api/mcp-keys/${KEY_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: KEY_ID }) },
    );

    expect(response.status).toBe(404);
  });
});
