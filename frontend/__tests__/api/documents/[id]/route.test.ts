/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase/server');
jest.mock('@/lib/logger', () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

global.fetch = jest.fn();

import { GET } from '@/app/api/documents/[id]/route';
import { createClient } from '@/lib/supabase/server';

describe('GET /api/documents/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  const mockUser = (user: unknown, error: unknown = null) => {
    (createClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user },
          error,
        }),
      },
    });
  };

  it('returns the backend document for authenticated users', async () => {
    mockUser({ id: 'user-1' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'doc-1', title: 'Document' }),
    });

    const response = await GET(new NextRequest('http://localhost:3000/api/documents/doc-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.title).toBe('Document');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/documents/doc-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
          'X-User-ID': 'user-1',
        }),
      })
    );
  });

  it('rejects missing document IDs and unauthenticated users', async () => {
    mockUser({ id: 'user-1' });
    const missingId = await GET(new NextRequest('http://localhost:3000/api/documents/'), {
      params: Promise.resolve({ id: '' }),
    });
    mockUser(null);
    const unauthorized = await GET(new NextRequest('http://localhost:3000/api/documents/doc-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    });

    expect(missingId.status).toBe(400);
    expect((await missingId.json()).error).toBe('VALIDATION_ERROR');
    expect(unauthorized.status).toBe(401);
    expect((await unauthorized.json()).error).toBe('UNAUTHORIZED');
  });

  it('maps backend 404s and network failures', async () => {
    mockUser({ id: 'user-1' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const notFound = await GET(new NextRequest('http://localhost:3000/api/documents/doc-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    });

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const networkError = await GET(new NextRequest('http://localhost:3000/api/documents/doc-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    });

    expect(notFound.status).toBe(404);
    expect((await notFound.json()).error).toBe('DOCUMENT_NOT_FOUND');
    expect(networkError.status).toBe(500);
    expect((await networkError.json()).error).toBe('INTERNAL_ERROR');
  });
});
