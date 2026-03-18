/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

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

import { GET } from '@/app/api/documents/similarity-graph/route';

describe('GET /api/documents/similarity-graph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  it('forwards validated params to the backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ nodes: [], edges: [] }),
    });

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/documents/similarity-graph?sample_size=50&similarity_threshold=0.7&include_clusters=true'
      )
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8004/documents/similarity-graph?sample_size=50&similarity_threshold=0.7&include_clusters=true',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
        }),
      })
    );
  });

  it('validates query parameters before calling the backend', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/documents/similarity-graph?sample_size=501'
      )
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('VALIDATION_ERROR');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps backend auth and server errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'bad key' }),
    });
    const unauthorized = await GET(
      new NextRequest('http://localhost:3000/api/documents/similarity-graph')
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'backend exploded' }),
    });
    const backendFailure = await GET(
      new NextRequest('http://localhost:3000/api/documents/similarity-graph')
    );

    expect(unauthorized.status).toBe(401);
    expect((await unauthorized.json()).error).toBe('UNAUTHORIZED');
    expect(backendFailure.status).toBe(500);
    expect((await backendFailure.json()).error).toBe('INTERNAL_ERROR');
  });
});
