/**
 * @jest-environment node
 */

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  })),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({ error: jest.fn() })),
  },
  logger: { error: jest.fn() },
}));

global.fetch = jest.fn();

import * as argumentationRoute from '@/app/api/argumentation/route';
import * as clusteringRoute from '@/app/api/clustering/semantic-clusters/route';
import * as qaRoute from '@/app/api/qa/route';
import * as topicModelingRoute from '@/app/api/topic-modeling/analyze/route';

type RouteModule = {
  POST(request: NextRequest): Promise<Response>;
  GET(request: NextRequest): Response | Promise<Response>;
};

type RouteCase = {
  name: string;
  url: string;
  upstreamPath: string;
  route: RouteModule;
  requestBody: Record<string, unknown>;
  upstreamBody: Record<string, unknown>;
};

const routes: RouteCase[] = [
  {
    name: 'QA',
    url: 'http://localhost/api/qa',
    upstreamPath: '/qa/invoke',
    route: qaRoute,
    requestBody: { question: 'What did the court decide?', max_documents: 0 },
    upstreamBody: {
      input: {
        question: 'What did the court decide?',
        max_documents: 0,
        score_threshold: 0,
        chat_history: [],
      },
      config: {},
      kwargs: {},
    },
  },
  {
    name: 'argumentation',
    url: 'http://localhost/api/argumentation',
    upstreamPath: '/argumentation/analyze',
    route: argumentationRoute,
    requestBody: { document_ids: ['doc-1'] },
    upstreamBody: { document_ids: ['doc-1'] },
  },
  {
    name: 'semantic clustering',
    url: 'http://localhost/api/clustering/semantic-clusters',
    upstreamPath: '/clustering/semantic-clusters',
    route: clusteringRoute,
    requestBody: { sample_size: 100 },
    upstreamBody: { sample_size: 100 },
  },
  {
    name: 'topic modeling',
    url: 'http://localhost/api/topic-modeling/analyze',
    upstreamPath: '/topic-modeling/analyze',
    route: topicModelingRoute,
    requestBody: { num_topics: 8 },
    upstreamBody: { num_topics: 8 },
  },
];

const semanticStatuses = [400, 404, 409, 422, 429] as const;

function request(route: RouteCase, body: string = JSON.stringify(route.requestBody)): NextRequest {
  return new NextRequest(route.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function authenticate(): void {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'verified-user' } },
    error: null,
  });
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'verified-access-token' } },
    error: null,
  });
}

describe('authenticated AI BFF contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test/';
    process.env.BACKEND_API_KEY = 'server-api-key';
    authenticate();
  });

  it.each(routes)('$name rejects an unverified caller before reading the upstream', async ({ route, url }) => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await route.POST(
      new NextRequest(url, { method: 'POST', body: '{not-json' }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Not authenticated' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(routes)('$name rejects a verified user without a bearer session', async (routeCase) => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await routeCase.route.POST(request(routeCase));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Not authenticated' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(routes)('$name fails closed when the backend API key is missing', async (routeCase) => {
    delete process.env.BACKEND_API_KEY;

    const response = await routeCase.route.POST(request(routeCase));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Backend service is not configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(routes)('$name rejects malformed or empty client JSON with 400', async (routeCase) => {
    const malformed = await routeCase.route.POST(request(routeCase, '{not-json'));
    const empty = await routeCase.route.POST(request(routeCase, ''));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'Invalid JSON body' });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'Invalid JSON body' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(routes)('$name forwards only the server key, verified bearer, and JSON body', async (routeCase) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await routeCase.route.POST(request(routeCase));

    expect(global.fetch).toHaveBeenCalledWith(
      `http://backend.test${routeCase.upstreamPath}`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer verified-access-token',
          'Content-Type': 'application/json',
          'X-API-Key': 'server-api-key',
          'X-RateLimit-Identity': createHash('sha256')
            .update('verified-user')
            .digest('hex'),
        },
        body: JSON.stringify(routeCase.upstreamBody),
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each(routes.flatMap((routeCase) => semanticStatuses.map((status) => [routeCase, status] as const)))(
    '$0.name preserves semantic upstream status $1 and safe headers',
    async (routeCase, status) => {
      const detail = { detail: `semantic ${status}`, fields: ['document_ids'] };
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(detail), {
          status,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '30',
            'X-RateLimit-Remaining': '0',
            'X-Internal-Trace': 'secret-trace',
            'Set-Cookie': 'secret=true',
          },
        }),
      );

      const response = await routeCase.route.POST(request(routeCase));

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ...detail, error: `semantic ${status}` });
      expect(response.headers.get('retry-after')).toBe('30');
      expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(response.headers.get('x-internal-trace')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
    },
  );

  it.each(routes)('$name sanitizes upstream 5xx bodies without changing the status', async (routeCase) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: 'database password=secret internal host=db.internal',
          trace: 'private stack trace',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '5' } },
      ),
    );

    const response = await routeCase.route.POST(request(routeCase));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Backend service is unavailable' });
    expect(response.headers.get('retry-after')).toBe('5');
  });

  it.each(routes)('$name handles text, empty, and malformed upstream error bodies safely', async (routeCase) => {
    for (const body of ['private proxy failure', '', '{bad-json']) {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        new Response(body, { status: 422, headers: { 'Content-Type': 'application/json' } }),
      );

      const response = await routeCase.route.POST(request(routeCase));

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: 'Backend rejected the request' });
    }
  });

  it.each(routes)('$name maps a malformed successful upstream response to a sanitized 502', async (routeCase) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response('not JSON', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );

    const response = await routeCase.route.POST(request(routeCase));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Backend returned an invalid response' });
  });

  it.each(routes)('$name maps network failures to a sanitized 503', async (routeCase) => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connect ECONNREFUSED db.internal'));

    const response = await routeCase.route.POST(request(routeCase));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Backend service is unavailable' });
  });

  it.each(routes)('$name passes an abort signal and maps timeouts to 504', async (routeCase) => {
    (global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(new DOMException('upstream timed out', 'TimeoutError'));
    });

    const response = await routeCase.route.POST(request(routeCase));

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'Backend service timed out' });
  });

  it.each(routes)('$name propagates downstream cancellation without contacting a live upstream', async (routeCase) => {
    const controller = new AbortController();
    controller.abort(new DOMException('client disconnected', 'AbortError'));
    (global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal?.aborted).toBe(true);
      return Promise.reject(init.signal?.reason);
    });
    const cancelledRequest = new NextRequest(routeCase.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routeCase.requestBody),
      signal: controller.signal,
    });

    const response = await routeCase.route.POST(cancelledRequest);

    expect(response.status).toBe(499);
    expect(await response.json()).toEqual({ error: 'Request was cancelled' });
  });

  it.each(routes)('$name returns an explicit 405 contract for unsupported methods', async (routeCase) => {
    const response = await routeCase.route.GET(
      new NextRequest(routeCase.url, { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'Method not allowed' });
    expect(response.headers.get('allow')).toBe('POST');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'QA',
      () => import('@/app/api/qa/[...path]/route').catch(() => null),
      'http://localhost/api/qa/internal',
    ],
    [
      'argumentation',
      () => import('@/app/api/argumentation/[...path]/route').catch(() => null),
      'http://localhost/api/argumentation/internal',
    ],
    [
      'semantic clustering',
      () => import('@/app/api/clustering/semantic-clusters/[...path]/route').catch(() => null),
      'http://localhost/api/clustering/semantic-clusters/internal',
    ],
    [
      'topic modeling',
      () => import('@/app/api/topic-modeling/analyze/[...path]/route').catch(() => null),
      'http://localhost/api/topic-modeling/analyze/internal',
    ],
  ] as const)('%s returns 404 for an unknown child path', async (_name, loadRoute, url) => {
    const childRoute = await loadRoute();
    expect(childRoute).not.toBeNull();

    const response = await childRoute!.POST(
      new NextRequest(url, { method: 'POST' }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'API route not found' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

});
