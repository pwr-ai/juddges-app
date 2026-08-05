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
const accessToken = 'user-access-token';

function authenticate(): void {
  mockGetUser.mockResolvedValue({ data: { user: authenticatedUser }, error: null });
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: accessToken } },
    error: null,
  });
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

  it('rejects authenticated users whose session has no bearer token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await searchJudges(
      new NextRequest('http://localhost/api/judge-fingerprint/search?q=smith'),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Not authenticated' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forwards search query, server API key, and user bearer token', async () => {
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
          Authorization: `Bearer ${accessToken}`,
          'X-API-Key': 'server-api-key',
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ judge_name: 'Lady Smith', case_count: 4 }]);
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
