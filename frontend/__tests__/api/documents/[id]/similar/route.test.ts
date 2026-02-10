/**
 * @jest-environment node
 *
 * Integration tests for GET /api/documents/[id]/similar
 *
 * Tests cover:
 * - Successful similar document retrieval
 * - Query parameter validation (top_k)
 * - Error handling (validation, backend errors, not found)
 */

// Mock dependencies BEFORE imports
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
import { GET } from '@/app/api/documents/[id]/similar/route';
import { NextRequest } from 'next/server';
import { ErrorCode } from '@/lib/errors';

describe('GET /api/documents/[id]/similar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Requests', () => {
    it('should return similar documents with default top_k=10', async () => {
      const mockDocuments = [
        { id: 'doc-1', similarity: 0.95, title: 'Similar Doc 1' },
        { id: 'doc-2', similarity: 0.87, title: 'Similar Doc 2' },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: mockDocuments }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.documents).toEqual(mockDocuments);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents/test-doc-id/similar?top_k=10'),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should accept custom top_k parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [] }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar?top_k=25')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('top_k=25'),
        expect.any(Object)
      );
    });

    it('should include cache control headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [] }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=1800');
    });

    it('should handle maximum top_k value (100)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [] }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar?top_k=100')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('top_k=100'),
        expect.any(Object)
      );
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 when document ID is missing', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents//similar')
      );
      const params = Promise.resolve({ id: '' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(data.message).toContain('Document ID is required');
    });

    it('should return 400 when top_k is negative', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar?top_k=-5')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 when top_k exceeds maximum (100)', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar?top_k=150')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(data.details?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'top_k',
            message: expect.stringContaining('cannot exceed 100'),
          }),
        ])
      );
    });

    it('should return 400 when top_k is not an integer', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar?top_k=10.5')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(data.details?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'top_k',
            message: expect.stringContaining('must be an integer'),
          }),
        ])
      );
    });

    it('should return 400 when top_k is zero', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar?top_k=0')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(data.details?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'top_k',
            message: expect.stringContaining('must be positive'),
          }),
        ])
      );
    });
  });

  describe('Backend Error Handling', () => {
    it('should return 404 when document is not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Document not found' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/non-existent-id/similar')
      );
      const params = Promise.resolve({ id: 'non-existent-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
      expect(data.message).toContain('non-existent-id');
      expect(data.message).toContain('not found');
    });

    it('should handle backend 500 error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ detail: 'Database connection failed' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('Failed to fetch similar documents');
    });

    it('should handle backend 503 error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ detail: 'Service temporarily unavailable' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should handle backend error with unparseable JSON', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'Raw error text',
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.message).toContain('Raw error text');
    });
  });

  describe('Network Errors', () => {
    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error: Failed to fetch')
      );

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('unexpected error occurred');
      expect(data.details?.error).toBe('Network error: Failed to fetch');
    });

    it('should handle fetch timeout', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Request timeout')
      );

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe('Response Format', () => {
    it('should return proper error detail structure for validation errors', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents//similar')
      );
      const params = Promise.resolve({ id: '' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('code');
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return proper error detail structure for backend errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Not found' }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('code');
      expect(data).toHaveProperty('details');
      expect(data.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
    });

    it('should pass through backend response structure on success', async () => {
      const mockResponse = {
        documents: [{ id: 'doc-1', similarity: 0.95 }],
        metadata: { total: 1, query_time_ms: 150 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/documents/test-doc-id/similar')
      );
      const params = Promise.resolve({ id: 'test-doc-id' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(data).toEqual(mockResponse);
    });
  });
});
