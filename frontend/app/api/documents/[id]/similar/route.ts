import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  ValidationError,
  AppError,
  ErrorCode
} from '@/lib/errors';
import {
  similarDocumentsQuerySchema,
  validateQueryParams
} from '@/lib/validation/schemas';

const apiLogger = logger.child('similar-documents-api');
const API_KEY = process.env.BACKEND_API_KEY as string;

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/similar
 *
 * Fetch similar documents from backend
 *
 * Query parameters:
 * - top_k: Number of similar documents to return (default: 10, max: 100)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/documents/[id]/similar started', { requestId });

    const { id: documentId } = await params;

    if (!documentId) {
      throw new ValidationError('Document ID is required', {
        code: ErrorCode.MISSING_REQUIRED_FIELD
      });
    }

    // Validate query parameters with Zod
    const searchParams = request.nextUrl.searchParams;
    const { top_k } = validateQueryParams(similarDocumentsQuerySchema, {
      top_k: searchParams.get('top_k')
    });

    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/documents/${documentId}/similar?top_k=${top_k}`;

    apiLogger.debug('Fetching similar documents from backend', {
      requestId,
      documentId,
      top_k,
      url
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
    });

    if (!response.ok) {
      let errorDetails = `Backend service returned error status ${response.status}`;

      try {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.detail) {
            errorDetails = typeof errorData.detail === 'string'
              ? errorData.detail
              : JSON.stringify(errorData.detail);
          }
        } catch {
          if (errorText) {
            errorDetails = errorText;
          }
        }
      } catch {
        errorDetails = `${errorDetails}: ${response.statusText}`;
      }

      apiLogger.error('Backend error fetching similar documents', {
        requestId,
        documentId,
        status: response.status,
        details: errorDetails
      });

      // Map status codes to user-friendly messages
      if (response.status === 404) {
        throw new AppError(
          `Document '${documentId}' not found or has no similar documents`,
          ErrorCode.DOCUMENT_NOT_FOUND,
          404,
          { documentId, details: errorDetails }
        );
      }

      throw new AppError(
        `Failed to fetch similar documents: ${errorDetails}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        { documentId, details: errorDetails }
      );
    }

    const data = await response.json();

    apiLogger.info('GET /api/documents/[id]/similar completed', {
      requestId,
      documentId,
      top_k,
      resultCount: Array.isArray(data) ? data.length : data?.documents?.length || 0
    });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=1800',
      },
    });
  } catch (error) {
    apiLogger.error('Error in similar documents route', error, { requestId });

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
        'An unexpected error occurred while fetching similar documents',
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
