import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '../../../../utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  ValidationError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('version-revert-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/documents/[id]/versions/revert - Revert document to a previous version
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

    if (!body.version_number || typeof body.version_number !== 'number') {
      throw new ValidationError("version_number is required and must be a number");
    }

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/versions/revert`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError("Version not found", ErrorCode.NOT_FOUND, 404, { documentId });
      }
      throw new AppError("Failed to revert document", ErrorCode.INTERNAL_ERROR, response.status);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("POST /api/documents/[id]/versions/revert failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to revert document", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}
