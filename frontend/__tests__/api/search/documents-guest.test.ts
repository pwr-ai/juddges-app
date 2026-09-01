/**
 * @jest-environment node
 */

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
import {
  GUEST_SEARCHES_REMAINING_HEADER,
  GUEST_SEARCH_LIMIT_HEADER,
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_ID_HEADER,
} from '@/lib/guest/session';

const SESSION_ID = 'a1b2c3d4-0000-4000-8000-000000000000';

function callRoute(cookie?: string): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/search/documents?q=vat');
  if (cookie) request.cookies.set(GUEST_SESSION_COOKIE, cookie);
  return GET(request) as unknown as Promise<Response>;
}

function upstream(
  body: unknown,
  { status = 200, headers = {} }: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('GET /api/search/documents — guest allowance relay (issue #510)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  it('forwards an existing guest session so the counter follows the visitor', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(upstream({ documents: [] }));

    await callRoute(SESSION_ID);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>).Cookie).toBe(
      `${GUEST_SESSION_COOKIE}=${SESSION_ID}`,
    );
  });

  it('re-issues the backend session as an HttpOnly cookie on this origin', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      upstream(
        { documents: [] },
        {
          headers: {
            [GUEST_SESSION_ID_HEADER]: SESSION_ID,
            [GUEST_SEARCH_LIMIT_HEADER]: '5',
            [GUEST_SEARCHES_REMAINING_HEADER]: '4',
          },
        },
      ),
    );

    const response = await callRoute();

    expect(response.headers.get(GUEST_SEARCH_LIMIT_HEADER)).toBe('5');
    expect(response.headers.get(GUEST_SEARCHES_REMAINING_HEADER)).toBe('4');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=${SESSION_ID}`);
    expect(setCookie).toContain('HttpOnly');
  });

  it('does not attach a guest cookie for a signed-in visitor', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token' } },
    });
    (global.fetch as jest.Mock).mockResolvedValue(upstream({ documents: [] }));

    await callRoute(SESSION_ID);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-token');
    expect(headers.Cookie).toBeUndefined();
  });

  it('keeps the spent-allowance prompt intact instead of flattening it', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      upstream(
        {
          detail: {
            error: 'Rate limit exceeded',
            message: "You've reached the limit of 5 free searches.",
            limit: 5,
            upgrade_url: '/auth/sign-up',
          },
        },
        { status: 429 },
      ),
    );

    const response = await callRoute(SESSION_ID);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('GUEST_SEARCH_LIMIT_REACHED');
    expect(body.upgrade_url).toBe('/auth/sign-up');
    expect(body.limit).toBe(5);
  });
});
