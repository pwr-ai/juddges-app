import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '../../../utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  ValidationError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('versions-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/documents/[id]/versions - Get version history for a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const { id: documentId } = await params;

    if (!documentId) {
      throw new ValidationError("Document ID is required", { documentId });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') || '50';
    const offset = url.searchParams.get('offset') || '0';

    const response = await fetch(
      `${API_BASE_URL}/documents/${documentId}/versions?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'X-API-Key': API_KEY,
          'X-User-ID': userData.user.id,
          'Content-Type': 'application/json',
        } as HeadersInit,
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError("Document not found", ErrorCode.DOCUMENT_NOT_FOUND, 404, { documentId });
      }
      throw new AppError("Failed to fetch version history", ErrorCode.INTERNAL_ERROR, response.status);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("GET /api/documents/[id]/versions failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to fetch version history", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents/[id]/versions - Create a manual version snapshot
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const { id: documentId } = await params;

    if (!documentId) {
      throw new ValidationError("Document ID is required", { documentId });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json();

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/versions`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 409) {
        throw new AppError(
          errorData.detail || "Version with identical content already exists",
          ErrorCode.VALIDATION_ERROR,
          409
        );
      }
      throw new AppError("Failed to create version", ErrorCode.INTERNAL_ERROR, response.status);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("POST /api/documents/[id]/versions failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to create version", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}
