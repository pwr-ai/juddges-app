import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('citation-network-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/citation-network
 *
 * Fetch citation network data from the backend
 *
 * Query parameters:
 * - sample_size: Number of documents to sample (optional)
 * - min_shared_refs: Minimum number of shared references for edges (optional)
 * - document_types: Comma-separated list of document types to filter (optional)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/documents/citation-network started', { requestId });

    const searchParams = request.nextUrl.searchParams;

    // Build query parameters for backend
    const queryParams = new URLSearchParams();

    const sampleSize = searchParams.get('sample_size');
    if (sampleSize) {
      queryParams.set('sample_size', sampleSize);
    }

    const minSharedRefs = searchParams.get('min_shared_refs');
    if (minSharedRefs) {
      queryParams.set('min_shared_refs', minSharedRefs);
    }

    const documentTypes = searchParams.get('document_types');
    if (documentTypes) {
      queryParams.set('document_types', documentTypes);
    }

    const url = `${API_BASE_URL}/documents/citation-network${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    apiLogger.debug('Fetching citation network from backend', {
      requestId,
      sample_size: sampleSize,
      min_shared_refs: minSharedRefs,
      document_types: documentTypes || 'none'
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

    apiLogger.info('GET /api/documents/citation-network completed', {
      requestId,
      nodeCount: data.nodes?.length || 0,
      edgeCount: data.edges?.length || 0
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error('Error in citation-network route', error, { requestId });

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
        'An unexpected error occurred while fetching citation network. Please try again.',
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
