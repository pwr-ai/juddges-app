/**
 * @jest-environment node
 */

/**
 * The search BFF must give signed-in users their own rate-limit bucket (#565).
 *
 * `get_client_ip` (backend/app/rate_limiter.py:40) keys per user only when the
 * BFF supplies `X-RateLimit-Identity` alongside a matching `X-API-Key`. This
 * route did not send it, so every proxied search — signed in or not — shared a
 * single bucket keyed on the frontend container's socket address, making the
 * 60/minute limit added in #570 an app-wide ceiling rather than a per-visitor
 * one.
 *
 * Anonymous traffic deliberately keeps sharing a bucket: there is no
 * unspoofable per-visitor identity for it (the guest cookie is chosen by the
 * caller), so a shared bucket is the honest bound on anonymous compute.
 */

import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

const mockGetSession = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getSession: mockGetSession },
  })),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
}));

global.fetch = jest.fn();

import { GET } from '@/app/api/search/documents/route';

const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function callRoute(): Promise<Response> {
  return GET(
    new NextRequest('http://localhost:3000/api/search/documents?q=vat'),
  ) as unknown as Promise<Response>;
}

function sentHeaders(): Record<string, string> {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return init.headers as Record<string, string>;
}

describe('GET /api/search/documents — per-user rate-limit identity (#565)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ hits: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('sends a hashed identity for a signed-in user', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc', user: { id: USER_ID } } },
    });

    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).toBe(
      createHash('sha256').update(USER_ID).digest('hex'),
    );
  });

  it('sends an identity the backend pattern accepts', async () => {
    // backend/app/rate_limiter.py:17 — ^[a-f0-9]{64}$. A value failing this is
    // silently ignored and the request falls back to the shared socket bucket.
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc', user: { id: USER_ID } } },
    });

    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not leak the raw user id', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc', user: { id: USER_ID } } },
    });

    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).not.toContain(USER_ID);
  });

  it('gives two users different buckets', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 't1', user: { id: USER_ID } } },
    });
    await callRoute();
    const first = sentHeaders()['X-RateLimit-Identity'];

    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ hits: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    mockGetSession.mockResolvedValue({
      data: {
        session: { access_token: 't2', user: { id: 'b0b0b0b0-0000-4000-8000-000000000001' } },
      },
    });
    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).not.toBe(first);
  });

  it('sends no identity for an anonymous visitor', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).toBeUndefined();
  });
});
