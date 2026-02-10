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

const apiLogger = logger.child('version-diff-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/documents/[id]/versions/diff?from=1&to=2 - Get diff between two versions
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

    const url = new URL(request.url);
    const fromVersion = url.searchParams.get('from');
    const toVersion = url.searchParams.get('to');

    if (!fromVersion || !toVersion) {
      throw new ValidationError("Both 'from' and 'to' version parameters are required");
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const response = await fetch(
      `${API_BASE_URL}/documents/${documentId}/versions/${fromVersion}/diff/${toVersion}`,
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
        throw new AppError("Version not found", ErrorCode.NOT_FOUND, 404, { documentId, fromVersion, toVersion });
      }
      throw new AppError("Failed to generate diff", ErrorCode.INTERNAL_ERROR, response.status);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("GET /api/documents/[id]/versions/diff failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to generate diff", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}
