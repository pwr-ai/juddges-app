import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { withClientIp } from "@/app/api/_lib/client-ip";
import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-v2-api");

/**
 * Forward a request to a `/search/v2` backend path for a signed-in user.
 *
 * The backend requires the user's Supabase JWT on top of the shared API key,
 * so a guest is turned away here (401) without a backend call. Backend errors
 * come back as `{ error }` with the backend's status.
 */
export async function proxySearchV2(
  request: NextRequest,
  path: string,
  init: { method: "GET" | "POST"; body?: string }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (userError || !userData?.user || !accessToken) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const response = await fetch(`${getBackendUrl()}${path}`, {
      method: init.method,
      headers: withClientIp({
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        "X-API-Key": process.env.BACKEND_API_KEY || "",
        Authorization: `Bearer ${accessToken}`,
        "X-RateLimit-Identity": createHash("sha256")
          .update(userData.user.id)
          .digest("hex"),
      }, request),
      body: init.body,
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      const error =
        typeof detail === "string" ? detail : "Search v2 request failed";
      routeLogger.warn("Backend search v2 failed", { path, status: response.status, error });
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
