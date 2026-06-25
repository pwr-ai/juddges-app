import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "../../utils/backend-url";
import logger from "@/lib/logger";

const routeLogger = logger.child("api/topic-modeling/analyze");

/**
 * Proxy to the backend NMF topic-modeling endpoint.
 *
 * The backend route is computationally expensive and rate limited to 10/hour,
 * so the client caches results aggressively via React Query (see
 * `lib/api/topic-modeling.ts`). This proxy only forwards the request and the
 * backend API key; it does not cache.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    const response = await fetch(`${getBackendUrl()}/topic-modeling/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.BACKEND_API_KEY || "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      routeLogger.error("Backend error", { status: response.status, data });
      return NextResponse.json(
        { error: data.detail || "Failed to analyze topics" },
        { status: response.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    routeLogger.error("Error in topic-modeling proxy", error);
    return NextResponse.json(
      { error: "Failed to connect to backend service" },
      { status: 503 },
    );
  }
}
