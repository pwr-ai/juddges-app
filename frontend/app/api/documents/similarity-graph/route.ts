import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  AppError,
  ErrorCode,
} from '@/lib/errors';
import {
  similarityGraphQuerySchema,
  validateQueryParams
} from '@/lib/validation/schemas';

const apiLogger = logger.child('similarity-graph-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/similarity-graph
 *
 * Fetch document similarity graph data from the backend
 *
 * Query parameters:
 * - sample_size: Number of documents to sample (default: 50, max: 500)
 * - similarity_threshold: Minimum similarity score for edges (default: 0.7, range: 0-1)
 * - document_types: Comma-separated list of document types to filter (optional)
 * - include_clusters: Whether to include cluster information (default: false)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/documents/similarity-graph started', { requestId });

    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters with Zod
    const {
      sample_size,
      similarity_threshold,
      document_types,
      include_clusters
    } = validateQueryParams(similarityGraphQuerySchema, {
      sample_size: searchParams.get('sample_size'),
      similarity_threshold: searchParams.get('similarity_threshold'),
      document_types: searchParams.get('document_types'),
      include_clusters: searchParams.get('include_clusters'),
    });

    // Build query parameters for backend
    const queryParams = new URLSearchParams({
      sample_size: sample_size.toString(),
      similarity_threshold: similarity_threshold.toString(),
      include_clusters: include_clusters.toString(),
    });

    if (document_types) {
      queryParams.append('document_types', document_types);
    }

    const url = `${API_BASE_URL}/documents/similarity-graph?${queryParams.toString()}`;

    apiLogger.debug('Fetching similarity graph from backend', {
      requestId,
      sample_size,
      similarity_threshold,
      include_clusters,
      document_types: document_types || 'none'
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      // Try to parse error response from backend
      let errorDetails = `Backend service returned error status ${response.status}`;

      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorDetails = typeof errorData.detail === 'string'
            ? errorData.detail
            : JSON.stringify(errorData.detail);
        }
      } catch {
        // If we can't parse the error, use the status text
        errorDetails = `${errorDetails}: ${response.statusText}`;
      }

      apiLogger.error('Backend API error', {
        requestId,
        status: response.status,
        details: errorDetails
      });

      // Handle authentication errors specifically
      if (response.status === 401) {
        throw new AppError(
          'Authentication failed. Please check your API key configuration.',
          ErrorCode.UNAUTHORIZED,
          401,
          { backendStatus: response.status, details: errorDetails }
        );
      }

      throw new AppError(
        errorDetails,
        ErrorCode.INTERNAL_ERROR,
        response.status,
        { backendStatus: response.status }
      );
    }

    const data = await response.json();

    apiLogger.info('GET /api/documents/similarity-graph completed', {
      requestId,
      nodeCount: data.nodes?.length || 0,
      edgeCount: data.edges?.length || 0
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error('Error in similarity-graph route', error, { requestId });

    // Handle known error types
    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    // Handle unexpected errors
    return NextResponse.json(
      new AppError(
        'An unexpected error occurred while fetching similarity graph. Please try again.',
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
