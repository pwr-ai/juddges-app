import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-documents-api");

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    const params = new URLSearchParams();
    const query = searchParams.get("q") ?? "";
    params.set("q", query);

    const limit = searchParams.get("limit");
    if (limit) {
      params.set("limit", limit);
    }

    const offset = searchParams.get("offset");
    if (offset) {
      params.set("offset", offset);
    }

    const filters = searchParams.get("filters");
    if (filters) {
      params.set("filters", filters);
    }

    const semanticRatio = searchParams.get("semantic_ratio");
    if (semanticRatio) {
      params.set("semantic_ratio", semanticRatio);
    }

    // Multi-value facets[]
    searchParams.getAll("facets").forEach((v) => params.append("facets", v));
    const facetQuery = searchParams.get("facet_query");
    if (facetQuery) params.set("facet_query", facetQuery);

    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }

    // Forward the Supabase session so the backend can attribute the analytics
    // row to the logged-in user. Anonymous traffic stays anonymous.
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await fetch(
      `${backendUrl}/api/search/documents?${params.toString()}`,
      {
        method: "GET",
        headers,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      routeLogger.warn("Backend document search failed", {
        status: response.status,
        data,
      });
      return NextResponse.json(
        { error: data?.detail || data?.error || "Failed to fetch search results" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Document search proxy request failed", error);

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
