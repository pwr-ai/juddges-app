/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({ error: jest.fn() })),
  },
}));

global.fetch = jest.fn();

import { GET as getStats } from '@/app/api/admin/stats/route';
import { GET as getActivity } from '@/app/api/admin/activity/route';
import { GET as getUsers } from '@/app/api/admin/users/route';
import { GET as getSearchQueries } from '@/app/api/admin/search-queries/route';
import { GET as getDocumentStats } from '@/app/api/admin/documents/stats/route';
import { GET as getSystemHealth } from '@/app/api/admin/system/health/route';
import { GET as getContentStats } from '@/app/api/admin/content/stats/route';

type Handler = (request: NextRequest) => Promise<Response>;

const routes: Array<{
  name: string;
  frontendPath: string;
  upstreamPath: string;
  handler: Handler;
}> = [
  {
    name: 'stats',
    frontendPath: '/api/admin/stats',
    upstreamPath: '/api/admin/stats',
    handler: getStats,
  },
  {
    name: 'activity',
    frontendPath: '/api/admin/activity?limit=8',
    upstreamPath: '/api/admin/activity?limit=8',
    handler: getActivity,
  },
  {
    name: 'users',
    frontendPath: '/api/admin/users?page=2&per_page=20',
    upstreamPath: '/api/admin/users?page=2&per_page=20',
    handler: getUsers,
  },
  {
    name: 'search queries',
    frontendPath: '/api/admin/search-queries?page=2&limit=50',
    upstreamPath: '/api/admin/search-queries?page=2&limit=50',
    handler: getSearchQueries,
  },
  {
    name: 'document stats',
    frontendPath: '/api/admin/documents/stats',
    upstreamPath: '/api/admin/documents/stats',
    handler: getDocumentStats,
  },
  {
    name: 'system health',
    frontendPath: '/api/admin/system/health',
    upstreamPath: '/api/admin/system/health',
    handler: getSystemHealth,
  },
  {
    name: 'content stats',
    frontendPath: '/api/admin/content/stats',
    upstreamPath: '/api/admin/content/stats',
    handler: getContentStats,
  },
];

function requestFor(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('platform admin BFF routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'server-api-key';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1' } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'verified-jwt' } },
      error: null,
    });
  });

  it.each(routes)('proxies $name through the server with both credentials', async ({
    frontendPath,
    upstreamPath,
    handler,
  }) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await handler(requestFor(frontendPath));

    expect(global.fetch).toHaveBeenCalledWith(
      `http://backend.test${upstreamPath}`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer verified-jwt',
          'X-API-Key': 'server-api-key',
        },
        cache: 'no-store',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it.each(routes)('returns 401 for unauthenticated $name calls', async ({
    frontendPath,
    handler,
  }) => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await handler(requestFor(frontendPath));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: 'Authentication required' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(routes)('preserves an upstream 403 response for $name', async ({
    frontendPath,
    handler,
  }) => {
    const body = JSON.stringify({ detail: 'Admin privileges required' });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(body, {
        status: 403,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    );

    const response = await handler(requestFor(frontendPath));

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.text()).toBe(body);
  });

  it.each(routes)('preserves an upstream 5xx response for $name', async ({
    frontendPath,
    handler,
  }) => {
    const body = JSON.stringify({ detail: 'Admin service failed' });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(body, {
        status: 503,
        headers: {
          'Content-Type': 'application/problem+json',
          'Retry-After': '30',
          'X-Internal-Trace': 'must-not-leak',
        },
      }),
    );

    const response = await handler(requestFor(frontendPath));

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('x-internal-trace')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(body);
  });

  it('returns 401 when the verified user no longer has an access token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await getStats(requestFor('/api/admin/stats'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: 'Session expired' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed without the server API key', async () => {
    delete process.env.BACKEND_API_KEY;

    const response = await getStats(requestFor('/api/admin/stats'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ detail: 'Admin API is not configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when the backend cannot be reached', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connection refused'));

    const response = await getStats(requestFor('/api/admin/stats'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ detail: 'Admin API is unavailable' });
  });
});
