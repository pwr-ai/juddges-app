import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  AppError,
  ErrorCode,
} from '@/lib/errors';

export const dynamic = 'force-dynamic';

const apiLogger = logger.child('document-metadata-api');
const API_KEY = process.env.BACKEND_API_KEY as string;

/* GET /api/documents/[id]/metadata
 *
 * Fetch document metadata from backend
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/documents/[id]/metadata started', { requestId });

    const resolvedParams = await params;
    const documentId  = resolvedParams.id;

    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/documents/${documentId}/metadata`;

    apiLogger.debug('Fetching document metadata from backend', {
      requestId,
      documentId,
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
        const errorData = await response.json();
        if (errorData.detail) {
          errorDetails = typeof errorData.detail === 'string'
            ? errorData.detail
            : JSON.stringify(errorData.detail);
        }
      } catch {
        errorDetails = `${errorDetails}: ${response.statusText}`;
      }

      apiLogger.error('Backend error fetching document metadata', {
        requestId,
        status: response.status,
        details: errorDetails,
        documentId
      });

      // Map specific status codes to user-friendly messages
      const statusMessages: Record<number, { error: string; message: string; code: ErrorCode }> = {
        404: {
          error: 'Document Not Found',
          message: `Document '${documentId}' was not found or metadata is not available.`,
          code: ErrorCode.DOCUMENT_NOT_FOUND
        },
        500: {
          error: 'Backend Service Error',
          message: errorDetails || 'The backend service encountered an error while fetching document metadata.',
          code: ErrorCode.INTERNAL_ERROR
        },
        503: {
          error: 'Service Unavailable',
          message: 'The document service is temporarily unavailable. Please try again later.',
          code: ErrorCode.DATABASE_UNAVAILABLE
        }
      };

      const errorResponse = statusMessages[response.status] || {
        error: 'Metadata Fetch Failed',
        message: errorDetails,
        code: ErrorCode.INTERNAL_ERROR
      };

      return NextResponse.json(
        {
          ...errorResponse,
          details: { documentId, status: response.status }
        },
        { status: response.status === 404 ? 404 : response.status === 503 ? 503 : 500 }
      );
    }

    const data = await response.json();

    apiLogger.info('GET /api/documents/[id]/metadata completed', {
      requestId,
      documentId
    });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    apiLogger.error('Error in document metadata route', error, { requestId });

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
        'An unexpected error occurred while fetching document metadata. Please try again.',
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
