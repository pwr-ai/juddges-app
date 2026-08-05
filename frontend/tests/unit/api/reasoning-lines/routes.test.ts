/**
 * @jest-environment node
 */

import { createHash } from 'node:crypto';
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
    child: jest.fn(() => ({ error: jest.fn() })),
  },
}));

global.fetch = jest.fn();

import { GET as listReasoningLines } from '@/app/api/reasoning-lines/route';
import {
  DELETE as deleteReasoningLine,
  GET as getReasoningLine,
  POST as postReasoningLineOperation,
} from '@/app/api/reasoning-lines/[...path]/route';

const authenticatedUser = { id: 'user-1' };

function authenticate(): void {
  mockGetUser.mockResolvedValue({
    data: { user: authenticatedUser },
    error: null,
  });
}

describe('reasoning-lines BFF routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test/';
    process.env.BACKEND_API_KEY = 'server-api-key';
    authenticate();
  });

  it('rejects unauthenticated callers before contacting the backend', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await listReasoningLines(
      new NextRequest('http://localhost/api/reasoning-lines?status=active'),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Not authenticated' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forwards list query, server API key, and verified-user quota identity', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await listReasoningLines(
      new NextRequest('http://localhost/api/reasoning-lines?status=active&limit=25'),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/reasoning-lines/?status=active&limit=25',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'X-API-Key': 'server-api-key',
          'X-RateLimit-Identity': createHash('sha256').update('user-1').digest('hex'),
        }),
        cache: 'no-store',
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('forwards encoded dynamic paths and JSON request bodies', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const request = new NextRequest('http://localhost/api/reasoning-lines/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'VAT deduction' }),
    });

    const response = await postReasoningLineOperation(request, {
      params: Promise.resolve({ path: ['search'] }),
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/reasoning-lines/search');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(Buffer.from(init.body).toString('utf8')).toBe(JSON.stringify({ query: 'VAT deduction' }));
    expect(response.status).toBe(200);

    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    await getReasoningLine(
      new NextRequest('http://localhost/api/reasoning-lines/line%2Fone/related'),
      { params: Promise.resolve({ path: ['line/one', 'related'] }) },
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/reasoning-lines/line%2Fone/related',
      expect.any(Object),
    );
  });

  it('preserves upstream status, body, content type, and safe rate-limit headers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Reasoning line not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/problem+json',
          'Retry-After': '10',
          'X-RateLimit-Remaining': '0',
          'X-Internal-Trace': 'must-not-leak',
        },
      }),
    );

    const response = await deleteReasoningLine(
      new NextRequest('http://localhost/api/reasoning-lines/missing', { method: 'DELETE' }),
      { params: Promise.resolve({ path: ['missing'] }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: 'Reasoning line not found' });
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('retry-after')).toBe('10');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(response.headers.get('x-internal-trace')).toBeNull();
  });

  it('fails closed when the backend API key is missing', async () => {
    delete process.env.BACKEND_API_KEY;

    const response = await listReasoningLines(
      new NextRequest('http://localhost/api/reasoning-lines'),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Backend service is not configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when the backend cannot be reached', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connection refused'));

    const response = await listReasoningLines(
      new NextRequest('http://localhost/api/reasoning-lines'),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Failed to connect to backend service' });
  });
});
