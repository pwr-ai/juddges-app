/**
 * @jest-environment node
 */

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

import { POST } from '@/app/api/query_rewrite/route';

const buildRequest = (body: unknown): Request =>
  new Request('http://localhost/api/query_rewrite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/query_rewrite', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('forwards body to the backend with X-API-Key', async () => {
    process.env.BACKEND_API_KEY = 'test-key';
    const fetchSpy = jest.fn(async () =>
      new Response(
        JSON.stringify({
          rewritten_query: 'VAT',
          filters: {
            base: {},
            facets: { jurisdiction: 'PL' },
            arrays: { keywords: [], legal_topics: [], cited_legislation: [] },
            languages: [],
          },
          diagnostics: { dropped_terms: [], latency_ms: 50, model: 'gpt-5-mini' },
          degraded: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    const response = await POST(buildRequest({ query: 'podatek VAT' }) as any);
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const init = call[1];
    expect(init.headers).toEqual(
      expect.objectContaining({ 'X-API-Key': 'test-key' }),
    );
  });

  it('returns 422 on validation failure without calling backend', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;
    const response = await POST(buildRequest({ query: '   ' }) as any);
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps backend 5xx to AppError with degraded envelope', async () => {
    const fetchSpy = jest.fn(async () => new Response('boom', { status: 503 }));
    global.fetch = fetchSpy as unknown as typeof global.fetch;
    const response = await POST(buildRequest({ query: 'anything' }) as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.degraded).toBe(true);
    expect(body.rewritten_query).toBe('anything');
  });
});
