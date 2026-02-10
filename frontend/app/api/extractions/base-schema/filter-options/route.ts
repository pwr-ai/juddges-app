import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('base-schema-filter-options-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/extractions/base-schema/filter-options
 * Get all available filter field configurations from the base schema.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/extractions/base-schema/filter-options started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to get filter options");
    }

    // Forward request to backend
    const response = await fetch(
      `${API_BASE_URL}/extractions/base-schema/filter-options`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': API_KEY,
          'X-User-ID': userData.user.id,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      apiLogger.error("Backend filter options error", {
        requestId,
        status: response.status,
        errorData,
      });

      return NextResponse.json(
        {
          error: errorData.detail || "Failed to get filter options",
          code: errorData.code || "FILTER_OPTIONS_ERROR"
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    apiLogger.info('GET /api/extractions/base-schema/filter-options completed', {
      requestId,
      fieldCount: result.fields?.length || 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error("Error in base-schema filter-options route", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred while getting filter options",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
