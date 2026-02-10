import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('base-schema-filter-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/extractions/base-schema/filter
 * Filter documents by extracted data fields.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/extractions/base-schema/filter started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to filter documents");
    }

    // Parse request body
    const body = await request.json();
    const { filters, text_query, limit = 50, offset = 0 } = body;

    // Forward request to backend
    const response = await fetch(`${API_BASE_URL}/extractions/base-schema/filter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
      },
      body: JSON.stringify({
        filters: filters || {},
        text_query,
        limit,
        offset,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      apiLogger.error("Backend filter error", {
        requestId,
        status: response.status,
        errorData,
      });

      return NextResponse.json(
        {
          error: errorData.detail || "Failed to filter documents",
          code: errorData.code || "FILTER_ERROR"
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    apiLogger.info('POST /api/extractions/base-schema/filter completed', {
      requestId,
      total_count: result.total_count,
      returned_count: result.documents?.length || 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error("Error in base-schema filter route", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred while filtering documents",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
