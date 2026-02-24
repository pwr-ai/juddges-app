import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from "@/lib/errors";

const apiLogger = logger.child("research-assistant-api");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8004";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

/**
 * GET /api/research-assistant - Get quick suggestions or list contexts
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("GET /api/research-assistant started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Get access token for backend JWT auth
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new UnauthorizedError("Session expired");
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint") || "suggestions";

    // Build backend URL based on endpoint (user_id extracted from JWT on backend)
    const params = new URLSearchParams();

    if (endpoint === "contexts") {
      const limit = searchParams.get("limit") || "10";
      const status = searchParams.get("status") || "active";
      params.set("limit", limit);
      params.set("status", status);

      const backendResponse = await fetch(
        `${BACKEND_URL}/research-assistant/contexts?${params.toString()}`,
        {
          headers: {
            "X-API-Key": BACKEND_API_KEY,
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        apiLogger.error("Backend contexts request failed", {
          requestId,
          status: backendResponse.status,
          error: errorText,
        });
        return NextResponse.json(
          { error: "Failed to fetch research contexts", detail: errorText },
          { status: backendResponse.status }
        );
      }

      const data = await backendResponse.json();
      return NextResponse.json(data);
    }

    // Default: suggestions endpoint
    const query = searchParams.get("query") || "";
    const documentId = searchParams.get("document_id") || "";
    const limit = searchParams.get("limit") || "5";

    if (query) params.set("query", query);
    if (documentId) params.set("document_id", documentId);
    params.set("limit", limit);

    const backendResponse = await fetch(
      `${BACKEND_URL}/research-assistant/suggestions?${params.toString()}`,
      {
        headers: {
          "X-API-Key": BACKEND_API_KEY,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend suggestions request failed", {
        requestId,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to fetch suggestions", detail: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    apiLogger.info("GET /api/research-assistant completed", {
      requestId,
      userId: user.id,
      endpoint,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("GET /api/research-assistant failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch research assistant data",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/research-assistant - Analyze research context or save context
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("POST /api/research-assistant started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Get access token for backend JWT auth
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new UnauthorizedError("Session expired");
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "analyze";
    const body = await request.json();

    // user_id is now extracted from JWT on the backend
    let backendUrl: string;

    if (action === "save") {
      backendUrl = `${BACKEND_URL}/research-assistant/contexts`;
    } else {
      backendUrl = `${BACKEND_URL}/research-assistant/analyze`;
    }

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "X-API-Key": BACKEND_API_KEY,
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend research-assistant POST failed", {
        requestId,
        status: backendResponse.status,
        error: errorText,
        action,
      });
      return NextResponse.json(
        { error: "Research assistant request failed", detail: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    apiLogger.info("POST /api/research-assistant completed", {
      requestId,
      userId: user.id,
      action,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("POST /api/research-assistant failed", error, {
      requestId,
    });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      new AppError(
        "Research assistant request failed",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
