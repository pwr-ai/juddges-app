import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from "@/lib/errors";

const apiLogger = logger.child("base-schema-definition-api");
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/extractions/base-schema/definition
 * Get localized base schema definitions (English + Polish).
 */
export async function GET(): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("GET /api/extractions/base-schema/definition started", { requestId });

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to view base schema definition");
    }

    const response = await fetch(
      `${API_BASE_URL}/extractions/base-schema/definition`,
      {
        method: "GET",
        headers: {
          "X-API-Key": API_KEY,
          "X-User-ID": userData.user.id,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      apiLogger.error("Backend base schema definition error", {
        requestId,
        status: response.status,
        errorData,
      });

      return NextResponse.json(
        {
          error: errorData.detail || "Failed to get base schema definition",
          code: errorData.code || "BASE_SCHEMA_DEFINITION_ERROR",
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    apiLogger.info("GET /api/extractions/base-schema/definition completed", {
      requestId,
      locales: result.available_locales || [],
    });

    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error("Error in base-schema definition route", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred while getting base schema definition",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
