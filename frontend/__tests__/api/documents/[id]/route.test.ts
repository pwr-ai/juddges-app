/**
 * Unit tests for GET /api/documents/[id] endpoint
 *
 * Tests the document retrieval API route with standardized error handling,
 * logging, and validation patterns.
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/documents/[id]/route';
import { createClient } from '@/lib/supabase/server';
import { ErrorCode } from '@/lib/errors';

// Mock modules
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/logger', () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock global fetch
global.fetch = jest.fn();

describe('GET /api/documents/[id]', () => {
  const mockDocumentId = '550e8400-e29b-41d4-a716-446655440000';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockDocument = {
    id: mockDocumentId,
    name: 'Test Document',
    content: 'Test content',
    created_at: '2024-01-01T00:00:00Z',
  };

  let mockSupabaseClient: any;
  let mockRequest: NextRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase client
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn(),
      },
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabaseClient);

    // Create a mock request
    mockRequest = new NextRequest('http://localhost:3000/api/documents/123');

    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
  });

  describe('Successful document fetch', () => {
    it('should return document data when request is valid', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Mock successful backend response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockDocument),
      });

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(mockDocument);

      // Verify backend was called with correct headers
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/documents/${mockDocumentId}`),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
            'X-User-ID': mockUserId,
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('400 Bad Request - Missing document ID', () => {
    it('should return 400 when document ID is missing', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Execute request with empty ID
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: '' }),
      });

      // Verify error response
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Document ID is required',
      });

      // Verify backend was not called
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('401 Unauthorized - Authentication errors', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock authentication failure
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify error response
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required',
      });

      // Verify backend was not called
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return 401 when getUser returns an error', async () => {
      // Mock authentication error
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify error response
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required',
      });
    });
  });

  describe('404 Not Found - Document does not exist', () => {
    it('should return 404 when document is not found', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Mock backend 404 response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({ error: 'Not found' }),
      });

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify error response
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.DOCUMENT_NOT_FOUND,
        message: 'Document not found',
        details: { documentId: mockDocumentId },
      });
    });
  });

  describe('500 Internal Server Error - Backend failures', () => {
    it('should return 500 when backend returns server error', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Mock backend 500 response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'Internal server error' }),
      });

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify error response
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to fetch document from backend',
      });
    });

    it('should return 500 when backend request throws exception', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Mock fetch throwing an error
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify error response
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to fetch document',
      });
    });

    it('should return 503 when backend returns service unavailable', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Mock backend 503 response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        json: jest.fn().mockResolvedValue({ error: 'Service unavailable' }),
      });

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify error response
      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to fetch document from backend',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle malformed document ID gracefully', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Mock backend 404 for malformed ID
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({ error: 'Not found' }),
      });

      // Execute request with malformed ID
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: 'not-a-uuid' }),
      });

      // Should still attempt to fetch and return 404
      expect(response.status).toBe(404);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle backend returning invalid JSON', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      // Mock backend with invalid JSON
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      // Execute request
      const response = await GET(mockRequest, {
        params: Promise.resolve({ id: mockDocumentId }),
      });

      // Verify error response
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to fetch document',
      });
    });
  });
});
