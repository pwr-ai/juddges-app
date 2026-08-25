import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-analytics-history-api");

async function authHeaders(): Promise<
  { headers: Record<string, string> } | { unauthorized: NextResponse }
> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.BACKEND_API_KEY || "";
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  // The backend filters by the authenticated user server-side, so the
  // Supabase session MUST be forwarded. Anonymous callers get 401.
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return {
      unauthorized: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
    };
  }
  headers["Authorization"] = `Bearer ${accessToken}`;

  return { headers };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    const days = searchParams.get("days");
    const limit = searchParams.get("limit");
    if (days) params.set("days", days);
    if (limit) params.set("limit", limit);

    const auth = await authHeaders();
    if ("unauthorized" in auth) return auth.unauthorized;

    const backendUrl = getBackendUrl();
    const response = await fetch(
      `${backendUrl}/api/search/analytics/history?${params.toString()}`,
      { method: "GET", headers: auth.headers }
    );

    const data = await response.json();

    if (!response.ok) {
      routeLogger.warn("Backend search history request failed", {
        status: response.status,
        data,
      });
      return NextResponse.json(
        { error: data?.detail || data?.error || "Failed to fetch search history" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Search history proxy request failed", error);

    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to connect to backend service", details },
      { status: 503 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const auth = await authHeaders();
    if ("unauthorized" in auth) return auth.unauthorized;

    const backendUrl = getBackendUrl();
    const response = await fetch(
      `${backendUrl}/api/search/analytics/history`,
      { method: "DELETE", headers: auth.headers }
    );

    const data = await response.json();

    if (!response.ok) {
      routeLogger.warn("Backend clear search history request failed", {
        status: response.status,
        data,
      });
      return NextResponse.json(
        { error: data?.detail || data?.error || "Failed to clear search history" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Clear search history proxy request failed", error);

    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to connect to backend service", details },
      { status: 503 }
    );
  }
}
