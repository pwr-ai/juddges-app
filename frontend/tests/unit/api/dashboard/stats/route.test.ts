/**
 * @jest-environment node
 */

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

const fetchMock = jest.fn();
global.fetch = fetchMock;

import { GET } from '@/app/api/dashboard/stats/route';

describe('GET /api/dashboard/stats', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  it('propagates an upstream error without caching it', async () => {
    const body = JSON.stringify({ detail: 'Statistics are temporarily unavailable' });
    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/problem+json; charset=utf-8' },
      }),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toBe(
      'application/problem+json; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe(body);
  });

  it('returns a non-cacheable bad gateway response when the backend cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const response = await GET();

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      detail: 'Dashboard statistics service is unavailable',
    });
  });

  it('keeps successful statistics cacheable for four hours', async () => {
    const stats = { total_judgments: 42 };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(stats), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=14400, s-maxage=14400',
    );
    await expect(response.json()).resolves.toEqual(stats);
    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/dashboard/stats', {
      headers: { 'X-API-Key': 'test-api-key' },
      cache: 'no-store',
    });
  });
});
