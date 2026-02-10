import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '../../utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  ValidationError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('documents-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/documents/[id] - Fetch a specific document by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/documents/[id] started', { requestId });

    const { id: documentId } = await params;

    if (!documentId) {
      throw new ValidationError("Document ID is required", { documentId });
    }

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Call backend API to get document
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      if (response.status === 404) {
        apiLogger.warn('Document not found', {
          requestId,
          documentId,
          userId: userData.user.id
        });
        throw new AppError(
          "Document not found",
          ErrorCode.DOCUMENT_NOT_FOUND,
          404,
          { documentId }
        );
      }

      apiLogger.error('Backend request failed', new Error(`HTTP ${response.status}`), {
        requestId,
        documentId,
        userId: userData.user.id,
        status: response.status
      });

      throw new AppError(
        "Failed to fetch document from backend",
        ErrorCode.INTERNAL_ERROR,
        response.status
      );
    }

    const data = await response.json();

    apiLogger.info('GET /api/documents/[id] completed', {
      requestId,
      documentId,
      userId: userData.user.id
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("GET /api/documents/[id] failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch document",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
