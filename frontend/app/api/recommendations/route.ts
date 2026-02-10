import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from "@/lib/errors";

const apiLogger = logger.child("recommendations-api");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8004";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

/**
 * GET /api/recommendations - Get smart document recommendations
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("GET /api/recommendations started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Forward query params to backend
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const documentId = searchParams.get("document_id") || "";
    const limit = searchParams.get("limit") || "10";
    const strategy = searchParams.get("strategy") || "auto";

    const params = new URLSearchParams();
    params.set("user_id", user.id);
    params.set("limit", limit);
    params.set("strategy", strategy);
    if (query) params.set("query", query);
    if (documentId) params.set("document_id", documentId);

    const backendResponse = await fetch(
      `${BACKEND_URL}/recommendations?${params.toString()}`,
      {
        headers: {
          "X-API-Key": BACKEND_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend recommendations request failed", {
        requestId,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to fetch recommendations", detail: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    apiLogger.info("GET /api/recommendations completed", {
      requestId,
      userId: user.id,
      count: data.recommendations?.length || 0,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("GET /api/recommendations failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch recommendations",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/recommendations/track - Track a user-document interaction
 * (Handled via the /api/recommendations/track/route.ts)
 */
