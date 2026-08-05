/**
 * @jest-environment node
 */

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

const callRoute = (id = 'doc-1') =>
  GET(
    new NextRequest(`http://localhost:3000/api/documents/${id}/metadata`),
    { params: Promise.resolve({ id }) }
  );

describe('GET /api/documents/[id]/metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'owner-1' } },
      error: null,
    });
  });

  it('returns an exact 401 before contacting upstream for anonymous callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await callRoute();

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('UNAUTHORIZED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs before contacting upstream', async () => {
    const response = await callRoute('bad%2Fid');

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('VALIDATION_ERROR');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns owner-visible metadata with private cache headers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        document_id: 'doc-1',
        document_type: 'judgment',
        language: 'en',
        title: 'Test Document',
      }),
    });

    const response = await callRoute();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(data.title).toBe('Test Document');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/documents/doc-1/metadata',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
          'X-User-ID': 'owner-1',
        }),
      })
    );
  });

  it.each([404, 403])(
    'maps upstream %i to the same non-enumerable document 404',
    async (status) => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status,
        statusText: 'Not Found',
        json: async () => ({ detail: 'hidden' }),
      });

      const response = await callRoute();
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('DOCUMENT_NOT_FOUND');
      expect(data.message).not.toContain('hidden');
    }
  );

  it.each([500, 503])('preserves retryable upstream %i failures', async (status) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status,
      statusText: 'upstream failed',
      json: async () => ({ detail: 'upstream failed' }),
    });

    const response = await callRoute();

    expect(response.status).toBe(status);
    expect((await response.json()).error).not.toBe('DOCUMENT_NOT_FOUND');
  });

  it('maps a timeout to a retryable 503, never a 404', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError')
    );

    const response = await callRoute();

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('DATABASE_UNAVAILABLE');
  });

  it('maps malformed success payloads to a retryable 502', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    });

    const response = await callRoute();

    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe('INTERNAL_ERROR');
  });
});
