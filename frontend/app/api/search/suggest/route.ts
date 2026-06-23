import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-suggest-api");

/**
 * Proxy for the corpus-derived suggestion endpoint (issue #153).
 *
 * Forwards to `GET /api/search/suggest` on the backend, which returns
 * phrase-level suggestions mined from the PL + EN judgment corpus. Degrades to
 * an empty list rather than surfacing an error so the search box can fall back
 * to its existing behaviour.
 */
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

    const language = searchParams.get("language");
    if (language) {
      params.set("language", language);
    }

    const category = searchParams.get("category");
    if (category) {
      params.set("category", category);
    }

    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }

    const response = await fetch(
      `${backendUrl}/api/search/suggest?${params.toString()}`,
      {
        method: "GET",
        headers,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      routeLogger.warn("Backend suggest request failed", {
        status: response.status,
        data,
      });
      // Fall back to an empty list so the UI degrades gracefully.
      return NextResponse.json({ suggestion_hits: [], query }, { status: 200 });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Suggest proxy request failed", error);
    // Never surface a hard error to the search box — return an empty list.
    return NextResponse.json({ suggestion_hits: [] }, { status: 200 });
  }
}
