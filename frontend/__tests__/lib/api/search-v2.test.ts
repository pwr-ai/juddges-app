/**
 * Full-corpus client (#867). The session-expiry bug: an expired session makes
 * the middleware 307 the BFF call to `/auth/login`, `fetch` follows it and
 * gets HTML with status 200. That must reject, never resolve to `{}` (which
 * crashed the results list on `results.length`).
 */
import {
  fullJudgmentHref,
  getJudgmentV2,
  searchV2,
  searchV2ResultHref,
  SearchV2Error,
  SESSION_EXPIRED_MESSAGE,
} from '@/lib/api/search-v2';

function fakeResponse({
  status = 200,
  body,
  contentType = 'application/json',
  redirected = false,
}: {
  status?: number;
  body: unknown;
  contentType?: string;
  redirected?: boolean;
}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token <');
      return body;
    },
  } as unknown as Response;
}

function mockFetch(response: Response): jest.Mock {
  const fn = jest.fn(async () => response);
  global.fetch = fn as unknown as typeof global.fetch;
  return fn;
}

describe('searchV2', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves a JSON results payload', async () => {
    mockFetch(fakeResponse({ body: { results: [], took_ms: 1, engine: 'weaviate-v2' } }));
    await expect(searchV2({ query: 'x' })).resolves.toEqual({
      results: [],
      took_ms: 1,
      engine: 'weaviate-v2',
    });
  });

  it('rejects a followed login redirect as an expired session (401)', async () => {
    mockFetch(
      fakeResponse({ body: '<!doctype html>', contentType: 'text/html', redirected: true })
    );
    const error = await searchV2({ query: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchV2Error);
    expect((error as SearchV2Error).status).toBe(401);
    expect((error as SearchV2Error).message).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('rejects a 200 HTML page even when not flagged as redirected', async () => {
    mockFetch(fakeResponse({ body: '<html>', contentType: 'text/html; charset=utf-8' }));
    await expect(searchV2({ query: 'x' })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a JSON body without a results array', async () => {
    mockFetch(fakeResponse({ body: {} }));
    await expect(searchV2({ query: 'x' })).rejects.toMatchObject({ status: 502 });
  });

  it('surfaces the BFF error message and status', async () => {
    mockFetch(fakeResponse({ status: 503, body: { error: 'search v2 unavailable' } }));
    await expect(searchV2({ query: 'x' })).rejects.toMatchObject({
      status: 503,
      message: 'search v2 unavailable',
    });
  });

  it('keeps a non-JSON gateway error as that error, not a session problem', async () => {
    mockFetch(fakeResponse({ status: 502, body: 'Bad Gateway', contentType: 'text/html' }));
    await expect(searchV2({ query: 'x' })).rejects.toMatchObject({ status: 502 });
  });
});

describe('getJudgmentV2', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('encodes NSA path ids into one path segment', async () => {
    const fetchMock = mockFetch(fakeResponse({ body: { judgment_id: '/doc/AB12' } }));
    await expect(getJudgmentV2('/doc/AB12')).resolves.toEqual({ judgment_id: '/doc/AB12' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/search/v2/judgments/%2Fdoc%2FAB12');
  });

  it('rejects a login redirect', async () => {
    mockFetch(fakeResponse({ body: '<html>', contentType: 'text/html', redirected: true }));
    await expect(getJudgmentV2('j1')).rejects.toMatchObject({ status: 401 });
  });

  it('passes 404 through', async () => {
    mockFetch(fakeResponse({ status: 404, body: { error: 'judgment not found' } }));
    await expect(getJudgmentV2('j1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('result links', () => {
  it('opens the curated judgment page when the ruling is in the app database', () => {
    expect(searchV2ResultHref({ judgment_id: 'j1', supabase_id: 'uuid-1' })).toBe(
      '/documents/uuid-1'
    );
  });

  it('opens the full-corpus page otherwise', () => {
    expect(searchV2ResultHref({ judgment_id: '/doc/AB12', supabase_id: null })).toBe(
      '/judgments/full/%2Fdoc%2FAB12'
    );
    expect(fullJudgmentHref('j_1')).toBe('/judgments/full/j_1');
  });
});
