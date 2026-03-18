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

import { GET } from '@/app/api/documents/[id]/metadata/route';

describe('GET /api/documents/[id]/metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  it('returns document metadata with cache headers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ document_id: 'doc-1', title: 'Test Document' }),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/metadata'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(data.title).toBe('Test Document');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/documents/doc-1/metadata',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
        }),
      })
    );
  });

  it('maps backend 404s to document-not-found responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Document not found' }),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/metadata'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe('DOCUMENT_NOT_FOUND');
    expect(data.details).toEqual({ documentId: 'doc-1', status: 404 });
  });

  it('returns a generic 500 for network errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network'));

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/metadata'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('INTERNAL_ERROR');
  });
});
