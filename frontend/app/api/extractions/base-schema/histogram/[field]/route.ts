import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('base-schema-histogram-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/extractions/base-schema/histogram/[field]?buckets=20
 * Get the numeric distribution histogram for a range-filterable field.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ field: string }> }
) {
  const requestId = crypto.randomUUID();
  const { field } = await params;
  const bucketParam = request.nextUrl.searchParams.get("buckets");
  const buckets = bucketParam ? Number(bucketParam) : 20;

  try {
    apiLogger.info('GET /api/extractions/base-schema/histogram started', { requestId, field });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to get the histogram");
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new UnauthorizedError("Please log in to get the histogram");
    }

    const bucketCount = Number.isFinite(buckets)
      ? Math.min(Math.max(Math.trunc(buckets), 1), 100)
      : 20;

    // Forward request to backend
    const response = await fetch(
      `${API_BASE_URL}/extractions/base-schema/histogram/${encodeURIComponent(field)}?bucket_count=${bucketCount}`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': API_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      apiLogger.error("Backend histogram error", {
        requestId,
        field,
        status: response.status,
        errorData,
      });

      return NextResponse.json(
        {
          error: errorData.detail || "Failed to get histogram",
          code: errorData.code || "HISTOGRAM_ERROR"
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    apiLogger.info('GET /api/extractions/base-schema/histogram completed', {
      requestId,
      field,
      bucketCount: result.buckets?.length || 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error("Error in base-schema histogram route", error, { requestId, field });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred while getting the histogram",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
