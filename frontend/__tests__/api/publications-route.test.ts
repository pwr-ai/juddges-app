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
import { createClient } from '@/lib/supabase/server';

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

  it('propagates an upstream error instead of replacing it with catalog data', async () => {
    const body = JSON.stringify({ detail: 'Catalog unavailable' });
    global.fetch = jest.fn(async () =>
      new Response(body, {
        status: 503,
        headers: { 'content-type': 'application/problem+json' },
      }),
    ) as typeof global.fetch;

    const response = await GET(
      new Request('http://localhost/api/publications'),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.text()).toBe(body);
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
