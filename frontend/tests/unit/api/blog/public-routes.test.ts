/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

global.fetch = jest.fn();

import { GET as getPosts } from '@/app/api/blog/posts/route';
import { GET as getCategories } from '@/app/api/blog/categories/route';

describe('public blog BFF routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'server-only-key';
  });

  it('forwards supported post filters and pagination with the server API key', async () => {
    const payload = {
      data: [{ id: 'post-1', title: 'Judgment research' }],
      pagination: { page: 2, limit: 6, total: 8, total_pages: 2, has_next: false, has_prev: true },
    };
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await getPosts(
      new NextRequest(
        'http://localhost/api/blog/posts?page=2&limit=6&category=Research&tag=AI&search=case+law&sort=views&order=asc&ignored=secret',
      ),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/blog/posts?page=2&limit=6&category=Research&tag=AI&search=case+law&sort=views&order=asc',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json', 'X-API-Key': 'server-only-key' },
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(payload);
  });

  it('preserves upstream error status, body, and safe headers without leaking internal headers', async () => {
    const body = JSON.stringify({ detail: 'Blog temporarily unavailable' });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(body, {
        status: 429,
        headers: {
          'Content-Type': 'application/problem+json; charset=utf-8',
          'Retry-After': '30',
          'X-RateLimit-Remaining': '0',
          'X-Internal-Trace': 'do-not-forward',
          'Set-Cookie': 'private=value',
        },
      }),
    );

    const response = await getPosts(
      new NextRequest('http://localhost/api/blog/posts?page=1'),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe(body);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json; charset=utf-8',
    );
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(response.headers.get('x-internal-trace')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('fetches public categories through the same server-only boundary', async () => {
    const payload = { data: [{ id: 'category-1', name: 'Research', post_count: 3 }] };
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await getCategories(
      new NextRequest('http://localhost/api/blog/categories'),
    );

    expect(global.fetch).toHaveBeenCalledWith('http://backend.test/blog/categories', expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json', 'X-API-Key': 'server-only-key' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }));
    await expect(response.json()).resolves.toEqual(payload);
  });

  it('fails closed when the backend API key is missing', async () => {
    delete process.env.BACKEND_API_KEY;

    const response = await getPosts(
      new NextRequest('http://localhost/api/blog/posts?page=1'),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: 'Blog service is not configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a stable 502 response when the backend cannot be reached', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));

    const response = await getCategories(
      new NextRequest('http://localhost/api/blog/categories'),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: 'Blog service is unavailable',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('propagates downstream cancellation to the backend request', async () => {
    const controller = new AbortController();
    (global.fetch as jest.Mock).mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        if (!signal) return Promise.reject(new Error('missing upstream signal'));
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    );

    const pending = getPosts(
      new NextRequest('http://localhost/api/blog/posts?page=1', {
        signal: controller.signal,
      }),
    );
    controller.abort(new DOMException('Client disconnected', 'AbortError'));
    const response = await pending;

    expect(response.status).toBe(499);
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('bounds backend requests with an eight-second timeout', async () => {
    jest.useFakeTimers();
    try {
      (global.fetch as jest.Mock).mockImplementation(
        (_input: RequestInfo | URL, init?: RequestInit) => {
          const signal = init?.signal;
          if (!signal) return Promise.reject(new Error('missing upstream signal'));
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
        },
      );

      const pending = getCategories(
        new NextRequest('http://localhost/api/blog/categories'),
      );
      await jest.advanceTimersByTimeAsync(8_000);
      const response = await pending;

      expect(response.status).toBe(504);
      await expect(response.json()).resolves.toEqual({
        detail: 'Blog service timed out',
      });
      expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
