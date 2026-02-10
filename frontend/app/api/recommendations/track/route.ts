import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from "@/lib/errors";

const apiLogger = logger.child("recommendations-track-api");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8004";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

/**
 * POST /api/recommendations/track - Track user-document interaction
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("POST /api/recommendations/track started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json();

    const backendResponse = await fetch(
      `${BACKEND_URL}/recommendations/track?user_id=${user.id}`,
      {
        method: "POST",
        headers: {
          "X-API-Key": BACKEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend track request failed", {
        requestId,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to track interaction" },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("POST /api/recommendations/track failed", error, {
      requestId,
    });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      new AppError(
        "Failed to track interaction",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
