import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('base-schema-nl-filter-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/extractions/base-schema/nl-filter
 * Translate a natural-language question into base-schema filters.
 *
 * Returns the same `{ filters, text_query }` shape that
 * /api/extractions/base-schema/filter accepts as its body. The caller pre-fills
 * the form for review and does NOT auto-run the search.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/extractions/base-schema/nl-filter started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to translate questions");
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new UnauthorizedError("Please log in to translate questions");
    }

    // Parse request body
    const body = await request.json();
    const { query } = body;

    // Forward request to backend
    const response = await fetch(`${API_BASE_URL}/extractions/base-schema/nl-filter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      apiLogger.error("Backend nl-filter error", {
        requestId,
        status: response.status,
        errorData,
      });

      return NextResponse.json(
        {
          error: errorData.detail?.message || errorData.detail || "Failed to translate question",
          code: errorData.detail?.code || "NL_FILTER_ERROR",
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    apiLogger.info('POST /api/extractions/base-schema/nl-filter completed', {
      requestId,
      filter_keys: Object.keys(result.filters ?? {}).length,
      has_text_query: Boolean(result.text_query),
    });

    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error("Error in base-schema nl-filter route", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred while translating the question",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
