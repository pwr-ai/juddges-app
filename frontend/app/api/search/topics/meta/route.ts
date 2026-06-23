import { NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-topics-meta-api");

export async function GET(): Promise<NextResponse> {
  try {
    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }

    const response = await fetch(`${backendUrl}/api/search/topics/meta`, {
      method: "GET",
      headers,
      next: { revalidate: 3600 },
    });

    const data = await response.json();

    if (!response.ok) {
      routeLogger.warn("Backend topics-meta request failed", {
        status: response.status,
        data,
      });
      return NextResponse.json(
        { error: data?.detail || data?.error || "Failed to fetch topics meta" },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Topics-meta proxy request failed", error);

    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to connect to backend service", details },
      { status: 503 },
    );
  }
}
