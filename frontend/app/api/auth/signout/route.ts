import { NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("auth-signout-api");

/**
 * Server-side sign-out. Clears the Supabase auth cookies and emits the
 * server-authoritative `auth_signed_out` event straight to the backend
 * (X-API-Key is server-only, and the /api/events proxy rejects auth_* from
 * browsers, so this route is the only way the event can originate).
 *
 * Always returns 204 — a failed analytics emission must never block signout.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    // Capture identity BEFORE signOut invalidates the session.
    const accessToken = sessionData.session?.access_token;

    await supabase.auth.signOut();

    if (accessToken) {
      const apiKey = process.env.BACKEND_API_KEY || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      };
      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }
      try {
        await fetch(`${getBackendUrl()}/api/events`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            surface: "api",
            events: [{ event_name: "auth_signed_out", properties: {} }],
          }),
        });
      } catch (error) {
        routeLogger.warn("auth_signed_out event emission failed", error);
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    routeLogger.error("Sign-out failed", error);
    // Client still clears its local session; report the failure.
    return NextResponse.json({ error: "Sign-out failed" }, { status: 500 });
  }
}
