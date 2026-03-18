/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/logger', () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

global.fetch = jest.fn();

import { GET } from '@/app/api/documents/[id]/similar/route';

describe('GET /api/documents/[id]/similar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  it('proxies the request with default top_k and cache headers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [{ id: 'doc-2' }] }),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/similar'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=1800');
    expect(data.documents).toEqual([{ id: 'doc-2' }]);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/documents/doc-1/similar?top_k=10',
      expect.any(Object)
    );
  });

  it('validates the route params and query params', async () => {
    const missingIdResponse = await GET(
      new NextRequest('http://localhost:3000/api/documents//similar'),
      { params: Promise.resolve({ id: '' }) }
    );
    const invalidTopKResponse = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/similar?top_k=0'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );

    expect(missingIdResponse.status).toBe(400);
    expect((await missingIdResponse.json()).error).toBe('VALIDATION_ERROR');
    expect(invalidTopKResponse.status).toBe(400);
    expect((await invalidTopKResponse.json()).error).toBe('VALIDATION_ERROR');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps backend 404s to document-not-found responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: 'Document not found' }),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/missing/similar'),
      { params: Promise.resolve({ id: 'missing' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('DOCUMENT_NOT_FOUND');
  });

  it('maps backend 500s to 503 for the frontend', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ detail: 'Database connection failed' }),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/similar'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('INTERNAL_ERROR');
    expect(data.message).toContain('Failed to fetch similar documents');
  });
});
