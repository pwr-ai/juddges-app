import { NextRequest, NextResponse } from "next/server";

import { withClientIp } from "@/app/api/_lib/client-ip";
import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { rateLimitIdentity } from "@/app/api/utils/rate-limit-identity";

const routeLogger = logger.child("search-autocomplete-api");

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter: q" }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.set("q", query);

    const limit = searchParams.get("limit");
    if (limit) {
      params.set("limit", limit);
    }

    const filters = searchParams.get("filters");
    if (filters) {
      params.set("filters", filters);
    }

    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }
    // Key anonymous visitors on their own address rather than this
    // container's (issue #565); a signed-in identity still takes precedence.
    withClientIp(headers, request);

    // Forward the Supabase session so the backend can attribute the analytics
    // row to the logged-in user. Anonymous traffic stays anonymous.
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const { data: userData } = await supabase.auth.getUser();
    const accessToken = sessionData.session?.access_token;
    if (accessToken && userData.user) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      headers["X-RateLimit-Identity"] = rateLimitIdentity(userData.user.id);
    }

    const response = await fetch(
      `${backendUrl}/api/search/autocomplete?${params.toString()}`,
      {
        method: "GET",
        headers,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      routeLogger.warn("Backend autocomplete request failed", {
        status: response.status,
        data,
      });
      return NextResponse.json(
        { error: data?.detail || data?.error || "Failed to fetch autocomplete results" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Autocomplete proxy request failed", error);

    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to connect to backend service",
        details,
      },
      { status: 503 }
    );
  }
}
