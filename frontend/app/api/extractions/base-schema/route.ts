import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('base-schema-extraction-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/extractions/base-schema
 * Extract structured data from a document using the universal base legal schema.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/extractions/base-schema started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to extract data");
    }

    // Parse request body
    const body = await request.json();
    const {
      document_id,
      document_text,
      language,
      court_name,
      jurisdiction_override,
      additional_instructions
    } = body;

    if (!document_id && !document_text) {
      return NextResponse.json(
        { error: "Either document_id or document_text is required" },
        { status: 400 }
      );
    }

    // Forward request to backend
    const response = await fetch(`${API_BASE_URL}/extractions/base-schema`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
      },
      body: JSON.stringify({
        document_id,
        document_text,
        language,
        court_name,
        jurisdiction_override,
        additional_instructions,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      apiLogger.error("Backend base-schema extraction error", {
        requestId,
        status: response.status,
        errorData,
      });

      return NextResponse.json(
        {
          error: errorData.detail || "Failed to extract data",
          code: errorData.code || "EXTRACTION_ERROR"
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    apiLogger.info('POST /api/extractions/base-schema completed', {
      requestId,
      document_id,
      jurisdiction: result.jurisdiction,
    });

    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error("Error in base-schema extraction route", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred during extraction",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
