import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-topic-click-api");

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }

    // Forward the Supabase session so the backend can attribute the click to
    // the logged-in user. Anonymous traffic stays anonymous.
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${backendUrl}/api/search/topic-click`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      routeLogger.warn("Backend topic-click request failed", {
        status: response.status,
        data,
      });
      const errData = data as Record<string, unknown>;
      return NextResponse.json(
        { error: (errData?.detail as string) || (errData?.error as string) || "Failed to record topic click" },
        { status: response.status }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    routeLogger.error("Topic-click proxy request failed", error);

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
