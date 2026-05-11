import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("feedback-search-api");

/**
 * POST /api/feedback/search — proxy to backend feedback router.
 *
 * Backend endpoint is intentionally open (anonymous submissions allowed).
 * If the caller has a Supabase session we forward the access token so the
 * backend can attribute the feedback row to the authenticated user.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${getBackendUrl()}/api/feedback/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      routeLogger.warn("Backend search feedback failed", {
        status: response.status,
        data,
      });
      return NextResponse.json(
        data ?? { error: "Failed to submit feedback" },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    routeLogger.error("Search feedback proxy request failed", error);
    return NextResponse.json(
      { error: "Failed to connect to feedback service" },
      { status: 503 },
    );
  }
}
