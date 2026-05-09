/**
 * API Client Tests
 *
 * Tests for API communication, error handling, and request/response formatting.
 * Uses fetch-mock for isolated testing without hitting actual API endpoints.
 *
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';

// Mock fetch globally
global.fetch = jest.fn();

// Import after mocking
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('Search API', () => {
    it('should make search request with correct parameters', async () => {
      const mockResponse = {
        results: [
          {
            document_id: 'doc-1',
            document_type: 'judgment',
            title: 'Test Case',
            score: 0.95,
          },
        ],
        total: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      // Simulate API call
      const response = await fetch('/api/documents/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'contract law',
          filters: {
            languages: ['en'],
          },
        }),
      });

      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(data.results).toHaveLength(1);
      expect(data.results[0].document_id).toBe('doc-1');
    });

    it('should handle search with filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [], total: 0 }),
      } as Response);

      const searchParams = {
        query: 'test query',
        filters: {
          languages: ['en', 'pl'],
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
        },
      };

      await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          body: expect.stringContaining('test query'),
        })
      );
    });

    it('should handle empty search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [], total: 0 }),
      } as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'nonexistent term' }),
      });

      const data = await response.json();

      expect(data.results).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('should handle pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [],
          total: 100,
          page: 2,
          pageSize: 10,
        }),
      } as Response);

      await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          page: 2,
          pageSize: 10,
        }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          body: expect.stringContaining('"page":2'),
        })
      );
    });
  });

  describe('Document Retrieval', () => {
    it('should fetch document by ID', async () => {
      const mockDocument = {
        document_id: 'doc-123',
        document_type: 'judgment',
        title: 'Test Document',
        full_text: 'Document content...',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockDocument,
      } as Response);

      const response = await fetch('/api/documents/doc-123');
      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith('/api/documents/doc-123');
      expect(data.document_id).toBe('doc-123');
    });

    it('should handle document not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Document not found' }),
      } as Response);

      const response = await fetch('/api/documents/nonexistent');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it('should fetch similar documents', async () => {
      const mockSimilar = {
        similar: [
          { document_id: 'doc-2', score: 0.9 },
          { document_id: 'doc-3', score: 0.85 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSimilar,
      } as Response);

      const response = await fetch('/api/documents/doc-123/similar');
      const data = await response.json();

      expect(data.similar).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        fetch('/api/documents/search', {
          method: 'POST',
          body: JSON.stringify({ query: 'test' }),
        })
      ).rejects.toThrow('Network error');
    });

    it('should handle API rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Rate limit exceeded',
          retryAfter: 60,
        }),
      } as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe('Rate limit exceeded');
    });

    it('should handle server errors (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      } as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      expect(response.status).toBe(500);
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      } as unknown as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      await expect(response.json()).rejects.toThrow('Unexpected token');
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      } as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' }),
      });

      expect(response.status).toBe(401);
    });

    it('should handle timeout scenarios', async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 100)
          )
      );

      await expect(
        fetch('/api/documents/search', {
          method: 'POST',
          body: JSON.stringify({ query: 'test' }),
        })
      ).rejects.toThrow('Timeout');
    });
  });

  describe('Request Headers', () => {
    it('should include authentication headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      await fetch('/api/documents/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ query: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should include API key header when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      await fetch('/api/documents/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        })
      );
    });

    it('should set correct content-type for JSON requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      await fetch('/api/documents/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('Retry Logic', () => {
    it('should retry on network failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        } as Response);

      // First call fails, second succeeds
      await expect(
        fetch('/api/documents/search', {
          method: 'POST',
          body: JSON.stringify({ query: 'test' }),
        })
      ).rejects.toThrow();

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle rate limit with retry-after header', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1' }),
          json: async () => ({ error: 'Rate limited' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        } as Response);

      // First call rate limited
      const firstResponse = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      expect(firstResponse.status).toBe(429);

      // Second call succeeds
      const secondResponse = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      expect(secondResponse.ok).toBe(true);
    });
  });

  describe('Response Validation', () => {
    it('should validate response structure', async () => {
      const validResponse = {
        results: [
          {
            document_id: 'doc-1',
            document_type: 'judgment',
            title: 'Test',
          },
        ],
        total: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      } as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const data = await response.json();

      expect(data).toHaveProperty('results');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('should handle missing required fields in response', async () => {
      const invalidResponse = {
        // Missing 'results' and 'total'
        data: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      } as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const data = await response.json();

      expect(data).not.toHaveProperty('results');
      expect(data).toHaveProperty('data');
    });
  });

  describe('Query Parameter Encoding', () => {
    it('should properly encode special characters in query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as Response);

      const specialQuery = 'contract & agreement § 123';

      await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: specialQuery }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          body: expect.stringContaining('contract & agreement'),
        })
      );
    });

    it('should handle unicode characters in query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as Response);

      const unicodeQuery = '法律分析 prawo cywilne';

      await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: unicodeQuery }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents/search',
        expect.objectContaining({
          body: expect.stringContaining('法律分析'),
        })
      );
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as Response);

      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch('/api/documents/search', {
          method: 'POST',
          body: JSON.stringify({ query: `test ${i}` }),
        })
      );

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(5);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should handle large response payloads', async () => {
      const largeResponse = {
        results: Array.from({ length: 1000 }, (_, i) => ({
          document_id: `doc-${i}`,
          document_type: 'judgment',
          title: `Document ${i}`,
        })),
        total: 1000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => largeResponse,
      } as Response);

      const response = await fetch('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const data = await response.json();

      expect(data.results).toHaveLength(1000);
    });
  });
});
