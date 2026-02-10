import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { getBackendUrl } from "@/app/api/utils/backend-url";

const apiLogger = logger.child("playground-api");

/**
 * POST /api/playground/extract - Run playground extraction
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("POST /api/playground/extract started", { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get backend URL and API key
    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY;

    if (!apiKey) {
      apiLogger.error("BACKEND_API_KEY not configured", { requestId });
      return NextResponse.json(
        { error: "Backend API key not configured" },
        { status: 500 }
      );
    }

    // Get request body
    const body = await request.json();

    // Forward request to backend
    const response = await fetch(`${backendUrl}/playground/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-User-ID": userData.user.id,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      apiLogger.error("Backend extraction failed", {
        requestId,
        status: response.status,
        error: data,
      });
      return NextResponse.json(data, { status: response.status });
    }

    apiLogger.info("Playground extraction completed", {
      requestId,
      status: data.status,
      timing: data.timing?.total_ms,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("Playground extraction error", { requestId, error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
