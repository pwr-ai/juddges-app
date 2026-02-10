/**
 * @jest-environment node
 */

/**
 * Unit tests for /api/documents/[id]/metadata route
 *
 * Tests cover:
 * - Parameter validation (document ID)
 * - Successful metadata retrieval
 * - Backend error handling
 * - Standardized error responses
 * - Request ID logging
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/documents/[id]/metadata/route';
import logger from '@/lib/logger';
import { ErrorCode } from '@/lib/errors';

// Mock the logger
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

// Mock crypto.randomUUID
global.crypto = {
  randomUUID: () => 'test-request-id',
} as Crypto;

// Mock backend URL
jest.mock('@/app/api/utils/backend-url', () => ({
  getBackendUrl: () => 'http://backend.test',
}));

// Mock fetch
global.fetch = jest.fn();

describe('/api/documents/[id]/metadata', () => {
  const mockBackendUrl = 'http://backend.test';
  const validDocumentId = '123e4567-e89b-12d3-a456-426614174000';
  const invalidDocumentId = 'not-a-uuid';
  let mockRequest: NextRequest;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let mockLoggerChild: {
    info: jest.Mock;
    debug: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

    // Setup logger mock before each test
    mockLoggerChild = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    (logger.child as jest.Mock).mockReturnValue(mockLoggerChild);

    // Setup mock request
    mockRequest = new NextRequest('http://localhost:3000/api/documents/test-id/metadata');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET', () => {
    it('should return document metadata successfully', async () => {
      const mockMetadata = {
        document_id: validDocumentId,
        title: 'Test Document',
        author: 'Test Author',
        created_at: '2024-01-01T00:00:00Z',
        pages: 10,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      });

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockMetadata);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBackendUrl}/documents/${validDocumentId}/metadata`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should validate document ID parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/documents/invalid/metadata');
      const params = Promise.resolve({ id: invalidDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(data.message).toContain('UUID');
      expect(data.details.issues).toBeDefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should require document ID parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/documents//metadata');
      const params = Promise.resolve({ id: '' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle 404 document not found error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Document not found' }),
      });

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
      expect(data.error).toBe('Document Not Found');
      expect(data.message).toContain(validDocumentId);
      expect(data.details).toEqual({
        documentId: validDocumentId,
        status: 404,
      });
    });

    it('should handle 500 backend error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ detail: 'Database connection failed' }),
      });

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.error).toBe('Backend Service Error');
      expect(data.message).toContain('Database connection failed');
    });

    it('should handle 503 service unavailable error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ detail: 'Service temporarily unavailable' }),
      });

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.code).toBe(ErrorCode.DATABASE_UNAVAILABLE);
      expect(data.error).toBe('Service Unavailable');
      expect(data.message).toContain('temporarily unavailable');
    });

    it('should handle backend errors without JSON response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('Backend service returned error status 500');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error: Connection refused')
      );

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('unexpected error occurred');
      expect(data.details.error).toContain('Network error');
    });

    it('should handle unexpected errors gracefully', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('unexpected error occurred');
      expect(data.details.error).toBe('Unexpected error');
    });

    it('should return caching headers on successful response', async () => {
      const mockMetadata = {
        document_id: validDocumentId,
        title: 'Cached Document',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      });

      const request = new NextRequest('http://localhost:3000/api/documents/123/metadata');
      const params = Promise.resolve({ id: validDocumentId });

      const response = await GET(request, { params });

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });
  });
});
