/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

const mockGetUser = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
}));

global.fetch = jest.fn();

import { GET as searchJudges } from '@/app/api/judge-fingerprint/search/route';
import { GET as compareJudges } from '@/app/api/judge-fingerprint/compare/route';
import { GET as getJudgeProfile } from '@/app/api/judge-fingerprint/profile/[judgeName]/route';

const authenticatedUser = { id: 'user-1' };

function authenticate(): void {
  mockGetUser.mockResolvedValue({ data: { user: authenticatedUser }, error: null });
}

describe('judge fingerprint BFF routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'server-api-key';
    authenticate();
  });

  it('rejects unauthenticated callers before contacting the backend', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=smith'),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Not authenticated' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forwards search query, server API key, and a verified-user rate-limit key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify([{ judge_name: 'Lady Smith', case_count: 4 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=Lady+Smith&limit=7'),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/judge-fingerprint/search?q=Lady+Smith&limit=7',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-Key': 'server-api-key',
          'X-RateLimit-Identity': createHash('sha256').update('user-1').digest('hex'),
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ judge_name: 'Lady Smith', case_count: 4 }]);
  });

  it('uses separate rate-limit identities for separate verified users', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=smith'),
    );
    const firstHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers;

    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null });
    await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=smith'),
    );
    const secondHeaders = (global.fetch as jest.Mock).mock.calls[1][1].headers;

    expect(firstHeaders['X-RateLimit-Identity']).not.toBe(secondHeaders['X-RateLimit-Identity']);
    expect(firstHeaders).not.toHaveProperty('Authorization');
    expect(secondHeaders).not.toHaveProperty('Authorization');
  });

  it('encodes a profile path and preserves an upstream error status and body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Judge not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await getJudgeProfile(
      new NextRequest('http://localhost/api/judge-fingerprint/profile/Lady%20Smith'),
      { params: Promise.resolve({ judgeName: 'Lady Smith KC' }) },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/judge-fingerprint/profile/Lady%20Smith%20KC',
      expect.any(Object),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: 'Judge not found' });
  });

  it('preserves compare query parameters and validation failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'At least 2 judges are required' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await compareJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/compare?judges=Lady+Smith'),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/judge-fingerprint/compare?judges=Lady+Smith',
      expect.any(Object),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ detail: 'At least 2 judges are required' });
  });

  it('preserves 429 status, body, and safe rate-limit headers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Rate limit exceeded: 60 per 1 hour' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '42',
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1785945600',
          'X-Internal-Trace': 'must-not-leak',
        },
      }),
    );

    const response = await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=smith'),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Rate limit exceeded: 60 per 1 hour' });
    expect(response.headers.get('retry-after')).toBe('42');
    expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(response.headers.get('x-ratelimit-reset')).toBe('1785945600');
    expect(response.headers.get('x-internal-trace')).toBeNull();
  });

  it('returns 503 when the backend cannot be reached', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connection refused'));

    const response = await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=smith'),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Failed to connect to backend service' });
  });

  it('fails closed when the server API key is not configured', async () => {
    delete process.env.BACKEND_API_KEY;

    const response = await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=smith'),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Backend service is not configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
