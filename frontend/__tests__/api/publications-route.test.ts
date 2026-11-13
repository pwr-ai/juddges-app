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
  logger: {
    error: jest.fn(),
  },
}));

import { GET } from '@/app/api/publications/route';
import { POST } from '@/app/api/publications/route';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { rateLimitIdentity } from '@/app/api/utils/rate-limit-identity';

describe('GET /api/publications', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the real upstream catalog without requiring a user session', async () => {
    const catalog = [{ id: 'publication-1', title: 'Real publication' }];
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof global.fetch;

    const response = await GET(
      new Request(
        'http://localhost/api/publications?project=JuDDGES&year=2026&status=published&type=journal',
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(catalog);
    expect(createClient).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/publications?project=JuDDGES&year=2026&status=published&type=journal',
      {
        headers: {
          'X-API-Key': 'test-api-key',
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      },
    );
  });

  it('keeps upstream database diagnostics server-side', async () => {
    const upstreamError = {
      detail: {
        message: 'relation "publications" does not exist',
        code: '42P01',
        hint: 'Check the private schema migration',
        details: 'query: select * from private.publications',
      },
    };
    const body = JSON.stringify(upstreamError);
    global.fetch = jest.fn(async () =>
      new Response(body, {
        status: 500,
        headers: { 'content-type': 'application/problem+json' },
      }),
    ) as typeof global.fetch;

    const response = await GET(
      new Request('http://localhost/api/publications'),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Publications service is unavailable',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Backend API returned error status: 500',
      body,
    );
  });

  it('preserves an empty upstream catalog as an empty catalog', async () => {
    global.fetch = jest.fn(async () =>
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof global.fetch;

    const response = await GET(
      new Request('http://localhost/api/publications'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('returns bad gateway when the backend cannot be reached', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as typeof global.fetch;

    const response = await GET(
      new Request('http://localhost/api/publications'),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Publications service is unavailable',
    });
  });
});

describe('POST /api/publications authentication and rate-limit identity', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('forwards the hash of the verified user id', async () => {
    const userId = 'verified-admin-user';
    (createClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: userId, app_metadata: { is_admin: true } } },
          error: null,
        }),
        getSession: jest.fn().mockResolvedValue({
          data: { session: { access_token: 'verified-token' } },
          error: null,
        }),
      },
    });
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ id: 'publication-1' }), { status: 201 }),
    ) as typeof global.fetch;

    const response = await POST(
      new Request('http://localhost/api/publications', {
        method: 'POST',
        body: JSON.stringify({ title: 'A publication' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['X-RateLimit-Identity']).toBe(rateLimitIdentity(userId));
    expect(init.headers['X-RateLimit-Identity']).not.toContain('spoofed');
  });

  it('rejects a session token when getUser cannot verify its principal', async () => {
    const getSession = jest.fn().mockResolvedValue({
      data: { session: { access_token: 'caller-supplied-token' } },
    });
    (createClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('token could not be verified'),
        }),
        getSession,
      },
    });
    global.fetch = jest.fn() as typeof global.fetch;

    const response = await POST(
      new Request('http://localhost/api/publications', {
        method: 'POST',
        body: JSON.stringify({ title: 'A publication' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
    expect(getSession).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
