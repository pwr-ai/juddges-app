/**
 * @jest-environment node
 */

/**
 * The search BFFs must key anonymous visitors on their own address (#565).
 *
 * Every proxied request reaches the backend from this container, so without
 * `X-RateLimit-Client-IP` all signed-out visitors shared one rate-limit bucket
 * and one script could 429 search for everyone. The address is read from
 * `X-Forwarded-For` only when `TRUSTED_PROXY` is set — the same paired
 * contract as the backend: the leftmost entry is the client only while the
 * gateway overwrites the header.
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

import { GET as documentsGET } from '@/app/api/search/documents/route';
import { GET as suggestGET } from '@/app/api/search/suggest/route';
import { GET as autocompleteGET } from '@/app/api/search/autocomplete/route';
import { getTrustedClientIp } from '@/app/api/_lib/client-ip';

const ROUTES = [
  ['documents', documentsGET, '/api/search/documents?q=vat'],
  ['suggest', suggestGET, '/api/search/suggest?q=vat'],
  ['autocomplete', autocompleteGET, '/api/search/autocomplete?q=vat'],
] as const;

function makeRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

function sentHeaders(call = 0): Record<string, string> {
  const [, init] = (global.fetch as jest.Mock).mock.calls[call];
  return init.headers as Record<string, string>;
}

const originalTrustedProxy = process.env.TRUSTED_PROXY;

afterAll(() => {
  if (originalTrustedProxy === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = originalTrustedProxy;
});

describe('search BFFs — anonymous client IP forwarding (#565)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
    process.env.TRUSTED_PROXY = 'true';
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockImplementation(
      async () =>
        new Response(JSON.stringify({ hits: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  });

  it.each(ROUTES)('%s forwards the leftmost X-Forwarded-For entry', async (_, GET, path) => {
    await GET(makeRequest(path, { 'x-forwarded-for': '203.0.113.5, 172.26.0.1' }));

    expect(sentHeaders()['X-RateLimit-Client-IP']).toBe('203.0.113.5');
    // The backend honours the header only alongside the service key.
    expect(sentHeaders()['X-API-Key']).toBe('test-api-key');
  });

  it.each(ROUTES)('%s forwards nothing when TRUSTED_PROXY is unset', async (_, GET, path) => {
    delete process.env.TRUSTED_PROXY;

    await GET(makeRequest(path, { 'x-forwarded-for': '203.0.113.5' }));

    expect(sentHeaders()['X-RateLimit-Client-IP']).toBeUndefined();
  });

  it('gives two visitors different keys', async () => {
    await documentsGET(
      makeRequest('/api/search/documents?q=a', { 'x-forwarded-for': '203.0.113.5' }),
    );
    await documentsGET(
      makeRequest('/api/search/documents?q=a', { 'x-forwarded-for': '198.51.100.7' }),
    );

    expect(sentHeaders(0)['X-RateLimit-Client-IP']).toBe('203.0.113.5');
    expect(sentHeaders(1)['X-RateLimit-Client-IP']).toBe('198.51.100.7');
  });
});

describe('getTrustedClientIp', () => {
  beforeEach(() => {
    process.env.TRUSTED_PROXY = 'true';
  });

  it('ignores X-Real-IP, which the gateway passes through unmodified', () => {
    expect(getTrustedClientIp(makeRequest('/', { 'x-real-ip': '203.0.113.5' }))).toBeNull();
  });

  it.each(['not-an-ip', ' , 10.0.0.1', 'user:abc'])('rejects malformed value %p', (value) => {
    expect(getTrustedClientIp(makeRequest('/', { 'x-forwarded-for': value }))).toBeNull();
  });

  it('accepts IPv6', () => {
    expect(getTrustedClientIp(makeRequest('/', { 'x-forwarded-for': '2001:db8::1' }))).toBe(
      '2001:db8::1',
    );
  });
});
