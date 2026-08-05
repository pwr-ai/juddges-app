/**
 * @jest-environment node
 */

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

import { POST } from '@/app/api/enhance_query/route';

const buildRequest = (body: unknown): Request =>
  new Request('http://localhost/api/enhance_query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/enhance_query', () => {
  const originalFetch = global.fetch;

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
          input: { query: 'VAT', language: 'pl' },
          config: {},
          kwargs: {},
        }),
      }),
    );
  });

  it('propagates the upstream HTTP status', async () => {
    global.fetch = jest.fn(async () =>
      new Response('bad gateway', { status: 502 }),
    ) as unknown as typeof global.fetch;

    const response = await POST(buildRequest({ query: 'VAT' }) as never);

    expect(response.status).toBe(502);
  });
});
