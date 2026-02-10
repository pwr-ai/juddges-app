import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { UnauthorizedError, AppError } from "@/lib/errors";

const apiLogger = logger.child("experiment-results-api");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8004";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

/**
 * GET /api/experiments/[id]/results - Get experiment results with statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const { id: experimentId } = await params;

  try {
    apiLogger.info("GET experiment results started", { requestId, experimentId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const backendResponse = await fetch(
      `${BACKEND_URL}/api/experiments/${experimentId}/results`,
      {
        headers: {
          "X-API-Key": BACKEND_API_KEY,
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      }
    );

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend experiment results request failed", {
        requestId,
        experimentId,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to fetch experiment results", detail: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    apiLogger.info("GET experiment results completed", {
      requestId,
      experimentId,
      userId: user.id,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("GET experiment results failed", error, { requestId, experimentId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
