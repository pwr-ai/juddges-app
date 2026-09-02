/**
 * @jest-environment node
 */

/**
 * The chat BFF must give signed-in users their own rate-limit bucket (#573).
 *
 * `get_client_ip` (backend/app/rate_limiter.py) keys per user only when the
 * BFF supplies `X-RateLimit-Identity` alongside a matching `X-API-Key`. This
 * route resolved `userId` for auth already but never forwarded it as a
 * rate-limit identity, so every signed-in user's chat traffic shared a
 * single bucket keyed on the frontend container's socket address — making
 * the backend's LLM budget (20/hour, see app/llm_rate_limit.py) an app-wide
 * ceiling shared by every pilot user instead of a per-user one.
 */

import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser },
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

process.env.BACKEND_API_KEY = 'test-api-key';

global.fetch = jest.fn();

import { POST } from '@/app/api/chat/route';

const USER_ID_1 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const USER_ID_2 = 'b0b0b0b0-0000-4000-8000-000000000001';

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'What is VAT?' }),
  });
}

function callRoute(): Promise<Response> {
  return POST(buildRequest()) as unknown as Promise<Response>;
}

function sentHeaders(): Record<string, string> {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return init.headers as Record<string, string>;
}

function mockOkUpstream(): void {
  (global.fetch as jest.Mock).mockResolvedValue(
    new Response(JSON.stringify({ output: { answer: 'ok' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('POST /api/chat — per-user rate-limit identity (#573)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOkUpstream();
  });

  it('sends a hashed identity derived from the authenticated user id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID_1 } }, error: null });

    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).toBe(
      createHash('sha256').update(USER_ID_1).digest('hex'),
    );
  });

  it('sends an identity the backend pattern accepts', async () => {
    // backend/app/rate_limiter.py — ^[a-f0-9]{64}$. A value failing this is
    // silently ignored and the request falls back to the shared socket bucket.
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID_1 } }, error: null });

    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not leak the raw user id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID_1 } }, error: null });

    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).not.toContain(USER_ID_1);
  });

  it('gives two different users two different identities', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID_1 } }, error: null });
    await callRoute();
    const first = sentHeaders()['X-RateLimit-Identity'];

    jest.clearAllMocks();
    mockOkUpstream();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID_2 } }, error: null });
    await callRoute();

    expect(sentHeaders()['X-RateLimit-Identity']).not.toBe(first);
    expect(sentHeaders()['X-RateLimit-Identity']).toBe(
      createHash('sha256').update(USER_ID_2).digest('hex'),
    );
  });
});
