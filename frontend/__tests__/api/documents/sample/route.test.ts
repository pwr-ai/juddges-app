/**
 * @jest-environment node
 *
 * Test suite for /api/documents/sample route
 *
 * This file tests the document sample endpoint with standardized patterns:
 * - Authentication validation
 * - Query parameter validation with Zod
 * - Error handling
 * - Backend API integration
 */

// Mock dependencies BEFORE imports
jest.mock('@/lib/supabase/server');
jest.mock('@/app/api/utils/backend-url');
jest.mock('@/lib/logger', () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock global fetch
global.fetch = jest.fn();

// Import after mocks
import { GET } from '@/app/api/documents/sample/route';
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';

describe('GET /api/documents/sample', () => {
  const mockBackendUrl = 'http://localhost:8004';
  const mockApiKey = 'test-api-key';

  beforeAll(() => {
    process.env.API_BASE_URL = mockBackendUrl;
    process.env.BACKEND_API_KEY = mockApiKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated user
      (createClient as jest.Mock).mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: null,
            error: new Error('Not authenticated'),
          }),
        },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when user data is missing', async () => {
      // Mock missing user data
      (createClient as jest.Mock).mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Query Parameter Validation', () => {
    beforeEach(() => {
      // Mock authenticated user
      (createClient as jest.Mock).mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
      });
    });

    it('should use default values when no query params are provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'doc-1' }],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sample_size=20'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('only_with_coordinates=true'),
        expect.any(Object)
      );
    });

    it('should accept valid sample_size parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'doc-1' }],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?sample_size=50')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sample_size=50'),
        expect.any(Object)
      );
    });

    it('should accept valid only_with_coordinates parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'doc-1' }],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?only_with_coordinates=false')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(fetchCall).toContain('only_with_coordinates=false');
    });

    it('should reject sample_size exceeding maximum', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?sample_size=200')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should reject negative sample_size', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?sample_size=-10')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should reject non-integer sample_size', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?sample_size=10.5')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should coerce string sample_size to number', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'doc-1' }],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?sample_size=30')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sample_size=30'),
        expect.any(Object)
      );
    });

    it('should coerce string only_with_coordinates to boolean', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'doc-1' }],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?only_with_coordinates=true')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('only_with_coordinates=true'),
        expect.any(Object)
      );
    });
  });

  describe('Backend API Integration', () => {
    beforeEach(() => {
      // Mock authenticated user
      (createClient as jest.Mock).mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
      });
    });

    it('should successfully fetch sample documents from backend', async () => {
      const mockDocuments = [
        { id: 'doc-1', title: 'Document 1' },
        { id: 'doc-2', title: 'Document 2' },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockDocuments,
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?sample_size=2')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockDocuments);

      // Verify the fetch call
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toContain('/documents/sample?sample_size=2&only_with_coordinates=true');
      expect(fetchCall[1]).toMatchObject({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': mockApiKey,
        }),
      });
    });

    it('should include API key in backend request', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': mockApiKey,
          }),
        })
      );
    });

    it('should pass both query parameters to backend', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample?sample_size=15&only_with_coordinates=false')
      );

      await GET(request);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(fetchCall).toContain('sample_size=15');
      expect(fetchCall).toContain('only_with_coordinates=false');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Mock authenticated user
      (createClient as jest.Mock).mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
      });
    });

    it('should handle backend 404 error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Resource not found' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');
      expect(data.message).toContain('Resource not found');
    });

    it('should handle backend 500 error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ detail: 'Internal server error' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');
    });

    it('should handle backend error without JSON response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('INTERNAL_ERROR');
      expect(data.message).toContain('unexpected error');
    });

    it('should provide user-friendly error messages', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ detail: 'Database connection failed' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('code');
      expect(data.message).toBeTruthy();
    });
  });

  describe('Response Format', () => {
    beforeEach(() => {
      // Mock authenticated user
      (createClient as jest.Mock).mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
      });
    });

    it('should return JSON response on success', async () => {
      const mockDocuments = [{ id: 'doc-1' }];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockDocuments,
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data).toEqual(mockDocuments);
      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should return standardized error format', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Bad request' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('code');
    });

    it('should handle empty result array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/sample')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });
  });
});
