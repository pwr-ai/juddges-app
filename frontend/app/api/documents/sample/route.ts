import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBackendUrl } from "../../utils/backend-url";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode
} from '@/lib/errors';
import {
  documentSampleQuerySchema,
  validateQueryParams
} from '@/lib/validation/schemas';

const apiLogger = logger.child('documents-sample-api');

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const API_BASE_URL = getBackendUrl();
  const API_KEY = process.env.BACKEND_API_KEY as string;

  try {
    apiLogger.info('GET /api/documents/sample started', { requestId });

    // Get authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Parse and validate query params with Zod
    const { searchParams } = new URL(request.url);
    const { sample_size, only_with_coordinates } = validateQueryParams(
      documentSampleQuerySchema,
      {
        sample_size: searchParams.get('sample_size') ?? undefined,
        only_with_coordinates: searchParams.get('only_with_coordinates') ?? undefined
      }
    );

    // Call backend API
    const response = await fetch(
      `${API_BASE_URL}/documents/sample?sample_size=${sample_size}&only_with_coordinates=${only_with_coordinates}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
      }
    );

    if (!response.ok) {
      // Try to parse error response from backend
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

      apiLogger.error("Backend API error", {
        requestId,
        status: response.status,
        details: errorDetails
      });

      throw new AppError(
        errorDetails,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status
      );
    }

    const data = await response.json();

    apiLogger.info('GET /api/documents/sample completed', {
      requestId,
      sample_size,
      only_with_coordinates,
      document_count: Array.isArray(data) ? data.length : 0
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("Error in documents sample route", error, { requestId });

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
        "An unexpected error occurred while fetching sample documents. Please try again.",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
