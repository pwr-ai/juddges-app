import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { withClientIp } from "@/app/api/_lib/client-ip";
import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-v2-api");

/**
 * BFF for the v2 (Weaviate, test) search engine (issue #867).
 *
 * Signed-in users only: the backend requires the user's Supabase JWT on top of
 * the shared API key, so a guest is turned away here without a backend call.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (userError || !userData?.user || !accessToken) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.text();
    const response = await fetch(`${getBackendUrl()}/search/v2`, {
      method: "POST",
      headers: withClientIp({
        "Content-Type": "application/json",
        "X-API-Key": process.env.BACKEND_API_KEY || "",
        Authorization: `Bearer ${accessToken}`,
        "X-RateLimit-Identity": createHash("sha256")
          .update(userData.user.id)
          .digest("hex"),
      }, request),
      body,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      const error =
        typeof detail === "string" ? detail : "Search v2 request failed";
      routeLogger.warn("Backend search v2 failed", { status: response.status, error });
      return NextResponse.json({ error }, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    routeLogger.error("Search v2 proxy request failed", error);
    return NextResponse.json(
      { error: "Failed to connect to backend service" },
      { status: 503 }
    );
  }
}
