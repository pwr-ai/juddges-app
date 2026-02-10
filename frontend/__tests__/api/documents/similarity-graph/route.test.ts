/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { ErrorCode } from '@/lib/errors';

// Create mock logger functions at the top level
const mockInfo = jest.fn();
const mockDebug = jest.fn();
const mockError = jest.fn();
const mockWarn = jest.fn();

// Mock the logger module
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      info: mockInfo,
      debug: mockDebug,
      error: mockError,
      warn: mockWarn,
    })),
  },
}));

// Mock backend URL
jest.mock('@/app/api/utils/backend-url', () => ({
  getBackendUrl: () => 'http://test-backend.local',
}));

// Import the route AFTER all mocks are set up
import { GET } from '@/app/api/documents/similarity-graph/route';

// Mock crypto.randomUUID
global.crypto = {
  randomUUID: () => 'test-request-id-123',
} as Crypto;

// Mock fetch
global.fetch = jest.fn();

describe('GET /api/documents/similarity-graph', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
  });

  // Helper function to create mock request
  const createMockRequest = (queryParams?: Record<string, string>): NextRequest => {
    const url = new URL('http://localhost:3000/api/documents/similarity-graph');
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return new NextRequest(url);
  };

  // Helper function to create mock backend response
  const mockBackendResponse = (data: unknown, status = 200) => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  };

  describe('Successful responses', () => {
    it('should return similarity graph with default parameters', async () => {
      const mockGraphData = {
        nodes: [
          { id: '1', label: 'Document 1' },
          { id: '2', label: 'Document 2' },
        ],
        edges: [
          { source: '1', target: '2', weight: 0.85 },
        ],
      };

      mockBackendResponse(mockGraphData);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockGraphData);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-backend.local/documents/similarity-graph?sample_size=50&similarity_threshold=0.7&include_clusters=false',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should accept custom sample_size parameter', async () => {
      const mockGraphData = { nodes: [], edges: [] };
      mockBackendResponse(mockGraphData);

      const request = createMockRequest({ sample_size: '100' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sample_size=100'),
        expect.anything()
      );
    });

    it('should accept custom similarity_threshold parameter', async () => {
      const mockGraphData = { nodes: [], edges: [] };
      mockBackendResponse(mockGraphData);

      const request = createMockRequest({ similarity_threshold: '0.9' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('similarity_threshold=0.9'),
        expect.anything()
      );
    });

    it('should accept document_types filter', async () => {
      const mockGraphData = { nodes: [], edges: [] };
      mockBackendResponse(mockGraphData);

      const request = createMockRequest({
        document_types: 'type1,type2',
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('document_types=type1%2Ctype2'),
        expect.anything()
      );
    });

    it('should accept include_clusters parameter', async () => {
      const mockGraphData = {
        nodes: [],
        edges: [],
        clusters: [{ id: 1, members: ['1', '2'] }],
      };
      mockBackendResponse(mockGraphData);

      const request = createMockRequest({ include_clusters: 'true' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('include_clusters=true'),
        expect.anything()
      );
    });

    it('should accept all parameters together', async () => {
      const mockGraphData = { nodes: [], edges: [] };
      mockBackendResponse(mockGraphData);

      const request = createMockRequest({
        sample_size: '200',
        similarity_threshold: '0.8',
        document_types: 'legal,contract',
        include_clusters: 'true',
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
      const fetchUrl = (mockFetch.mock.calls[0][0] as string);
      expect(fetchUrl).toContain('sample_size=200');
      expect(fetchUrl).toContain('similarity_threshold=0.8');
      expect(fetchUrl).toContain('document_types=legal%2Ccontract');
      expect(fetchUrl).toContain('include_clusters=true');
    });
  });

  describe('Parameter validation', () => {
    it('should reject sample_size exceeding maximum (500)', async () => {
      const request = createMockRequest({ sample_size: '501' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(data.message).toContain('validation failed');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject negative sample_size', async () => {
      const request = createMockRequest({ sample_size: '-10' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject zero sample_size', async () => {
      const request = createMockRequest({ sample_size: '0' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject non-integer sample_size', async () => {
      const request = createMockRequest({ sample_size: '10.5' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject similarity_threshold below 0', async () => {
      const request = createMockRequest({ similarity_threshold: '-0.1' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject similarity_threshold above 1', async () => {
      const request = createMockRequest({ similarity_threshold: '1.1' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should accept similarity_threshold at boundary values (0 and 1)', async () => {
      const mockGraphData = { nodes: [], edges: [] };

      // Test with 0
      mockBackendResponse(mockGraphData);
      const request1 = createMockRequest({ similarity_threshold: '0' });
      const response1 = await GET(request1);
      expect(response1.status).toBe(200);

      // Test with 1
      mockBackendResponse(mockGraphData);
      const request2 = createMockRequest({ similarity_threshold: '1' });
      const response2 = await GET(request2);
      expect(response2.status).toBe(200);
    });

    it('should coerce various string values to boolean for include_clusters', async () => {
      const mockGraphData = { nodes: [], edges: [] };

      // Zod's boolean coercion is permissive and will convert various strings
      // This test verifies the coercion works rather than rejecting
      mockBackendResponse(mockGraphData);
      const request = createMockRequest({ include_clusters: 'yes' });
      const response = await GET(request);

      // Zod will coerce "yes" to boolean
      expect(response.status).toBe(200);
    });

    it('should coerce string boolean values for include_clusters', async () => {
      const mockGraphData = { nodes: [], edges: [] };

      // Test "true"
      mockBackendResponse(mockGraphData);
      const request1 = createMockRequest({ include_clusters: 'true' });
      const response1 = await GET(request1);
      expect(response1.status).toBe(200);

      // Test "false"
      mockBackendResponse(mockGraphData);
      const request2 = createMockRequest({ include_clusters: 'false' });
      const response2 = await GET(request2);
      expect(response2.status).toBe(200);

      // Test "1" (truthy)
      mockBackendResponse(mockGraphData);
      const request3 = createMockRequest({ include_clusters: '1' });
      const response3 = await GET(request3);
      expect(response3.status).toBe(200);
    });

    it('should reject unexpected query parameters (strict mode)', async () => {
      // Note: The validateQueryParams helper filters out null values before validation
      // So extra params in the URL that aren't in the schema object will be caught by strict mode
      const mockGraphData = { nodes: [], edges: [] };
      mockBackendResponse(mockGraphData);

      // Create request with extra parameter
      const url = new URL('http://localhost:3000/api/documents/similarity-graph');
      url.searchParams.set('sample_size', '50');
      url.searchParams.set('invalid_param', 'test');
      const request = new NextRequest(url);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Backend error handling', () => {
    it('should handle 404 errors from backend', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Resource not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('Resource not found');
    });

    it('should handle 500 errors from backend', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should handle backend errors with non-JSON responses', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('500');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(data.message).toContain('unexpected error');
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe('Logging', () => {
    it('should log request start with requestId', async () => {
      const mockGraphData = { nodes: [], edges: [] };
      mockBackendResponse(mockGraphData);

      const request = createMockRequest();
      await GET(request);

      expect(mockInfo).toHaveBeenCalledWith(
        'GET /api/documents/similarity-graph started',
        { requestId: 'test-request-id-123' }
      );
    });

    it('should log successful completion with graph statistics', async () => {
      const mockGraphData = {
        nodes: [{ id: '1' }, { id: '2' }, { id: '3' }],
        edges: [{ source: '1', target: '2' }, { source: '2', target: '3' }],
      };
      mockBackendResponse(mockGraphData);

      const request = createMockRequest();
      await GET(request);

      expect(mockInfo).toHaveBeenCalledWith(
        'GET /api/documents/similarity-graph completed',
        {
          requestId: 'test-request-id-123',
          nodeCount: 3,
          edgeCount: 2,
        }
      );
    });

    it('should log backend errors with details', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Backend error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = createMockRequest();
      await GET(request);

      expect(mockError).toHaveBeenCalledWith(
        'Backend API error',
        expect.objectContaining({
          requestId: 'test-request-id-123',
          status: 500,
          details: 'Backend error',
        })
      );
    });

    it('should log validation errors', async () => {
      const request = createMockRequest({ sample_size: '-1' });
      await GET(request);

      expect(mockError).toHaveBeenCalledWith(
        'Error in similarity-graph route',
        expect.any(Object),
        { requestId: 'test-request-id-123' }
      );
    });
  });

  describe('Response format', () => {
    it('should return graph data in expected format', async () => {
      const mockGraphData = {
        nodes: [
          { id: '1', label: 'Doc 1', group: 'A' },
          { id: '2', label: 'Doc 2', group: 'B' },
        ],
        edges: [
          { source: '1', target: '2', weight: 0.75, label: 'similar' },
        ],
        metadata: {
          total_documents: 100,
          sampled_documents: 50,
        },
      };

      mockBackendResponse(mockGraphData);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('nodes');
      expect(data).toHaveProperty('edges');
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
      expect(data.metadata).toBeDefined();
    });

    it('should handle empty graph results', async () => {
      const mockGraphData = {
        nodes: [],
        edges: [],
      };

      mockBackendResponse(mockGraphData);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.nodes).toEqual([]);
      expect(data.edges).toEqual([]);
    });

    it('should preserve cluster information when requested', async () => {
      const mockGraphData = {
        nodes: [],
        edges: [],
        clusters: [
          { id: 1, label: 'Cluster A', members: ['1', '2'] },
          { id: 2, label: 'Cluster B', members: ['3', '4'] },
        ],
      };

      mockBackendResponse(mockGraphData);

      const request = createMockRequest({ include_clusters: 'true' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.clusters).toBeDefined();
      expect(data.clusters).toHaveLength(2);
    });
  });

  describe('Error response format', () => {
    it('should return standardized error format', async () => {
      const request = createMockRequest({ sample_size: '600' });
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('code');
      expect(data.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should include validation details in error response', async () => {
      const request = createMockRequest({
        sample_size: '600',
        similarity_threshold: '2.0'
      });
      const response = await GET(request);
      const data = await response.json();

      expect(data.details).toBeDefined();
      expect(data.details.issues).toBeDefined();
      expect(Array.isArray(data.details.issues)).toBe(true);
    });
  });
});
