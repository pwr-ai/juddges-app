/**
 * @jest-environment node
 */

/**
 * Unit tests for /api/documents/[id]/html route
 *
 * Tests the standardized error handling, logging, and validation patterns
 * for fetching document HTML content from the backend.
 */

import { NextRequest, NextResponse } from 'next/server';

// Create mock logger functions at the top level
const mockInfo = jest.fn();
const mockDebug = jest.fn();
const mockError = jest.fn();
const mockWarn = jest.fn();

// Create the logger child instance
const mockLoggerChild = {
  info: mockInfo,
  debug: mockDebug,
  error: mockError,
  warn: mockWarn,
};

// Mock the logger module
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => mockLoggerChild),
  },
}));

// Mock backend URL
jest.mock('@/app/api/utils/backend-url', () => ({
  getBackendUrl: () => 'http://localhost:8004',
}));

// Import the route AFTER all mocks are set up
import { GET } from '@/app/api/documents/[id]/html/route';

// Mock crypto.randomUUID
global.crypto = {
  randomUUID: () => 'test-request-id',
} as Crypto;

// Mock fetch
global.fetch = jest.fn();

describe('/api/documents/[id]/html', () => {
  let mockRequest: NextRequest;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

    // Setup mock request
    mockRequest = new NextRequest('http://localhost:3000/api/documents/test-id/html');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful HTML fetching', () => {
    it('should successfully fetch and return HTML content', async () => {
      const mockHtml = '<html><body><h1>Test Document</h1></body></html>';
      const mockParams = Promise.resolve({ id: 'test-doc-id' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(mockHtml),
      });

      const response = await GET(mockRequest, { params: mockParams });

      // Verify response
      expect(response).toBeInstanceOf(NextResponse);
      expect(response.status).toBe(200);

      const responseText = await response.text();
      expect(responseText).toBe(mockHtml);

      // Verify headers
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');

      // Verify logging
      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'GET /api/documents/[id]/html started',
        { requestId: 'test-request-id' }
      );
      expect(mockLoggerChild.debug).toHaveBeenCalledWith(
        'Fetching document HTML from backend',
        {
          requestId: 'test-request-id',
          documentId: 'test-doc-id',
          url: 'http://localhost:8004/documents/test-doc-id/html'
        }
      );
      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'GET /api/documents/[id]/html completed',
        {
          requestId: 'test-request-id',
          documentId: 'test-doc-id',
          htmlLength: mockHtml.length
        }
      );

      // Verify fetch was called correctly
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8004/documents/test-doc-id/html',
        {
          method: 'GET',
          headers: {
            'Accept': 'text/html',
          },
        }
      );
    });

    it('should handle empty HTML response', async () => {
      const mockParams = Promise.resolve({ id: 'empty-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(''),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(200);
      const responseText = await response.text();
      expect(responseText).toBe('');

      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'GET /api/documents/[id]/html completed',
        {
          requestId: 'test-request-id',
          documentId: 'empty-doc',
          htmlLength: 0
        }
      );
    });

    it('should handle large HTML content', async () => {
      const largeHtml = '<html><body>' + 'x'.repeat(1000000) + '</body></html>';
      const mockParams = Promise.resolve({ id: 'large-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(largeHtml),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(200);
      const responseText = await response.text();
      expect(responseText).toBe(largeHtml);
      expect(responseText.length).toBe(largeHtml.length);
    });
  });

  describe('Validation errors', () => {
    it('should return 400 when document ID is missing', async () => {
      const mockParams = Promise.resolve({ id: '' });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(400);
      const responseText = await response.text();
      expect(responseText).toBe('Document ID is required');

      // Verify error logging - errors are logged
      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('should return 400 when document ID is undefined', async () => {
      const mockParams = Promise.resolve({ id: undefined as unknown as string });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(400);
      const responseText = await response.text();
      expect(responseText).toBe('Document ID is required');
    });
  });

  describe('Backend error handling', () => {
    it('should handle 404 document not found error', async () => {
      const mockParams = Promise.resolve({ id: 'non-existent-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: jest.fn().mockResolvedValueOnce('Document not found in database'),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(404);
      const responseText = await response.text();
      expect(responseText).toContain('non-existent-doc');
      expect(responseText).toContain('not found');

      // Verify error logging
      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('should handle 500 backend server error', async () => {
      const mockParams = Promise.resolve({ id: 'error-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValueOnce('Database connection failed'),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(500);
      const responseText = await response.text();
      expect(responseText).toContain('Failed to fetch document HTML');

      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('should handle 503 service unavailable error', async () => {
      const mockParams = Promise.resolve({ id: 'unavailable-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: jest.fn().mockResolvedValueOnce('Service temporarily unavailable'),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(503);
      const responseText = await response.text();
      expect(responseText).toContain('Failed to fetch document HTML');

      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      const mockParams = Promise.resolve({ id: 'network-error-doc' });

      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network request failed')
      );

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(500);
      const responseText = await response.text();
      expect(responseText).toBe(
        'An unexpected error occurred while fetching the document HTML'
      );

      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      const mockParams = Promise.resolve({ id: 'timeout-doc' });

      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Request timeout')
      );

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(500);
      expect(mockLoggerChild.error).toHaveBeenCalled();
    });
  });

  describe('Logging and monitoring', () => {
    it('should log all requests with request IDs', async () => {
      const mockParams = Promise.resolve({ id: 'log-test-doc' });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<html></html>'),
      });

      await GET(mockRequest, { params: mockParams });

      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'GET /api/documents/[id]/html started',
        { requestId: 'test-request-id' }
      );
    });

    it('should log debug information when fetching from backend', async () => {
      const mockParams = Promise.resolve({ id: 'debug-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce('<html></html>'),
      });

      await GET(mockRequest, { params: mockParams });

      expect(mockLoggerChild.debug).toHaveBeenCalledWith(
        'Fetching document HTML from backend',
        {
          requestId: 'test-request-id',
          documentId: 'debug-doc',
          url: 'http://localhost:8004/documents/debug-doc/html'
        }
      );
    });

    it('should include HTML length in completion log', async () => {
      const mockHtml = '<html><body>Test content</body></html>';
      const mockParams = Promise.resolve({ id: 'length-test-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(mockHtml),
      });

      await GET(mockRequest, { params: mockParams });

      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'GET /api/documents/[id]/html completed',
        {
          requestId: 'test-request-id',
          documentId: 'length-test-doc',
          htmlLength: mockHtml.length
        }
      );
    });
  });

  describe('Request ID tracking', () => {
    it('should generate request ID for each request', async () => {
      const mockParams = Promise.resolve({ id: 'test-doc' });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<html></html>'),
      });

      await GET(mockRequest, { params: mockParams });

      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ requestId: expect.any(String) })
      );
    });

    it('should use the same request ID across all logs in a single request', async () => {
      const mockParams = Promise.resolve({ id: 'tracking-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce('<html></html>'),
      });

      await GET(mockRequest, { params: mockParams });

      // All log calls should have the same requestId
      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'GET /api/documents/[id]/html started',
        { requestId: 'test-request-id' }
      );
      expect(mockLoggerChild.debug).toHaveBeenCalledWith(
        'Fetching document HTML from backend',
        expect.objectContaining({ requestId: 'test-request-id' })
      );
      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'GET /api/documents/[id]/html completed',
        expect.objectContaining({ requestId: 'test-request-id' })
      );
    });
  });

  describe('Response headers', () => {
    it('should set correct Content-Type header', async () => {
      const mockParams = Promise.resolve({ id: 'content-type-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce('<html></html>'),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });

    it('should set Cache-Control header for caching', async () => {
      const mockParams = Promise.resolve({ id: 'cache-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce('<html></html>'),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });
  });

  describe('Error response format', () => {
    it('should return plain text error messages', async () => {
      const mockParams = Promise.resolve({ id: '' });

      const response = await GET(mockRequest, { params: mockParams });

      const responseText = await response.text();
      expect(typeof responseText).toBe('string');
      expect(responseText).not.toContain('{'); // Should not be JSON
    });

    it('should include meaningful error messages for users', async () => {
      const mockParams = Promise.resolve({ id: 'missing-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: jest.fn().mockResolvedValueOnce('Not found'),
      });

      const response = await GET(mockRequest, { params: mockParams });
      const responseText = await response.text();

      expect(responseText).toContain('missing-doc');
      expect(responseText).toContain('not found');
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in document ID', async () => {
      const specialId = 'doc-with-special-chars-@#$%';
      const mockParams = Promise.resolve({ id: specialId });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce('<html></html>'),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:8004/documents/${specialId}/html`,
        expect.any(Object)
      );
    });

    it('should handle very long document IDs', async () => {
      const longId = 'a'.repeat(1000);
      const mockParams = Promise.resolve({ id: longId });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce('<html></html>'),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(200);
    });

    it('should handle HTML with special characters and encoding', async () => {
      const specialHtml = '<html><body>Special chars: é, ñ, 中文, 🎉</body></html>';
      const mockParams = Promise.resolve({ id: 'special-chars-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(specialHtml),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(200);
      const responseText = await response.text();
      expect(responseText).toBe(specialHtml);
    });

    it('should handle malformed HTML gracefully', async () => {
      const malformedHtml = '<html><body><div>Unclosed div<span>Unclosed span</body>';
      const mockParams = Promise.resolve({ id: 'malformed-doc' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(malformedHtml),
      });

      const response = await GET(mockRequest, { params: mockParams });

      expect(response.status).toBe(200);
      const responseText = await response.text();
      expect(responseText).toBe(malformedHtml);
    });
  });
});
