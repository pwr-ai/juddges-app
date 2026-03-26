/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase/server');
jest.mock('@/lib/logger', () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

global.fetch = jest.fn();

import { GET } from '@/app/api/documents/sample/route';
import { createClient } from '@/lib/supabase/server';

describe('GET /api/documents/sample', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  const mockAuth = (user: unknown, error: unknown = null) => {
    (createClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user },
          error,
        }),
      },
    });
  };

  it('requires authentication before proxying to the backend', async () => {
    mockAuth(null);

    const response = await GET(new NextRequest('http://localhost:3000/api/documents/sample'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('UNAUTHORIZED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uses the current default query parameters', async () => {
    mockAuth({ id: 'user-1' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'doc-1' }],
    });

    const response = await GET(new NextRequest('http://localhost:3000/api/documents/sample'));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/documents/sample?sample_size=20&only_with_coordinates=true',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
        }),
      })
    );
  });

  it('validates sample_size before calling the backend', async () => {
    mockAuth({ id: 'user-1' });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/sample?sample_size=200')
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('VALIDATION_ERROR');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps backend server errors to a service-unavailable response', async () => {
    mockAuth({ id: 'user-1' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ detail: 'backend failed' }),
    });

    const response = await GET(new NextRequest('http://localhost:3000/api/documents/sample'));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('INTERNAL_ERROR');
    expect(data.message).toContain('backend failed');
  });
});
