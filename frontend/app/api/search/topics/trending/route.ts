import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-topics-trending-api");

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    const days = searchParams.get("days");
    const limit = searchParams.get("limit");
    if (days) params.set("days", days);
    if (limit) params.set("limit", limit);

    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }

    const response = await fetch(
      `${backendUrl}/api/search/topics/trending?${params.toString()}`,
      { method: "GET", headers, next: { revalidate: 300 } },
    );

    const data = await response.json();

    if (!response.ok) {
      routeLogger.warn("Backend topics-trending request failed", {
        status: response.status,
        data,
      });
      return NextResponse.json(
        {
          error: data?.detail || data?.error || "Failed to fetch trending topics",
        },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Topics-trending proxy request failed", error);

    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to connect to backend service", details },
      { status: 503 },
    );
  }
}
