import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('base-schema-facets-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/extractions/base-schema/facets/[field]
 * Get facet counts for a specific extracted data field.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ field: string }> }
) {
  const requestId = crypto.randomUUID();
  const { field } = await params;

  try {
    apiLogger.info('GET /api/extractions/base-schema/facets started', { requestId, field });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to get facet counts");
    }

    // Forward request to backend
    const response = await fetch(
      `${API_BASE_URL}/extractions/base-schema/facets/${encodeURIComponent(field)}`,
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
      apiLogger.error("Backend facet counts error", {
        requestId,
        field,
        status: response.status,
        errorData,
      });

      return NextResponse.json(
        {
          error: errorData.detail || "Failed to get facet counts",
          code: errorData.code || "FACET_ERROR"
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    apiLogger.info('GET /api/extractions/base-schema/facets completed', {
      requestId,
      field,
      count: result.counts?.length || 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error("Error in base-schema facets route", error, { requestId, field });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred while getting facet counts",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
