/**
 * @jest-environment node
 */

import { createHash } from 'crypto';

jest.mock('@/app/api/utils/backend-url', () => ({
  getBackendUrl: () => 'http://backend.test',
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

const mockGetSession = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getSession: mockGetSession },
  })),
}));

import { POST } from '@/app/api/enhance_query/route';

const buildRequest = (body: unknown): Request =>
  new Request('http://localhost/api/enhance_query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

function sentHeaders(fetchSpy: jest.Mock): Record<string, string> {
  const [, init] = fetchSpy.mock.calls[0];
  return init.headers as Record<string, string>;
}

describe('POST /api/enhance_query', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('invokes the registered LangServe enhancement route', async () => {
    const fetchSpy = jest.fn(async () =>
      new Response(JSON.stringify({ output: 'enhanced VAT query', metadata: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    const response = await POST(buildRequest({ query: 'VAT' }) as never);

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://backend.test/enhance_query/invoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          input: { query: 'VAT' },
        }),
      }),
    );
  });

  it('propagates the upstream error status, body, and content type', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ detail: 'bad gateway' }), {
        status: 502,
        headers: { 'content-type': 'application/problem+json' },
      }),
    ) as unknown as typeof global.fetch;

    const response = await POST(buildRequest({ query: 'VAT' }) as never);

    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.text()).toBe(JSON.stringify({ detail: 'bad gateway' }));
  });

  describe('per-user rate-limit identity (#573)', () => {
    const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

    const okFetch = () =>
      jest.fn(async () =>
        new Response(JSON.stringify({ output: 'enhanced VAT query', metadata: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    it('sends a hashed identity for a signed-in user', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'token-abc', user: { id: USER_ID } } },
      });
      const fetchSpy = okFetch();
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      await POST(buildRequest({ query: 'VAT' }) as never);

      expect(sentHeaders(fetchSpy)['X-RateLimit-Identity']).toBe(
        createHash('sha256').update(USER_ID).digest('hex'),
      );
    });

    it('sends no identity for an anonymous visitor', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      const fetchSpy = okFetch();
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      await POST(buildRequest({ query: 'VAT' }) as never);

      expect(sentHeaders(fetchSpy)['X-RateLimit-Identity']).toBeUndefined();
    });
  });
});
