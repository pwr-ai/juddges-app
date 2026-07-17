import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("events-api");

interface IncomingEvent {
  event_name?: unknown;
}

/**
 * Proxy for product-analytics event batches (see lib/analytics/track.ts).
 *
 * Security gate: `auth_*` events are server-authoritative (DB triggers /
 * the signout route posting straight to the backend with the API key) and
 * are rejected here so a browser can never forge them — the backend is only
 * reachable with X-API-Key, which never leaves the server.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: { events?: IncomingEvent[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!Array.isArray(body?.events) || body.events.length === 0) {
      return NextResponse.json(
        { error: "events must be a non-empty array" },
        { status: 400 }
      );
    }
    const forbidden = body.events.some(
      (e) =>
        typeof e?.event_name !== "string" || e.event_name.startsWith("auth_")
    );
    if (forbidden) {
      return NextResponse.json(
        { error: "forbidden or invalid event_name" },
        { status: 400 }
      );
    }

    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }

    // Forward the Supabase session so the backend stamps user_id from the
    // JWT (identity claims in the body are rejected by the backend).
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // Forward the HttpOnly guest-session cookie for anonymous attribution.
    const guestCookie = request.cookies.get("guest_session_id")?.value;
    if (guestCookie) {
      headers["Cookie"] = `guest_session_id=${guestCookie}`;
    }

    const response = await fetch(`${backendUrl}/api/events`, {
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
      routeLogger.warn("Backend events request failed", {
        status: response.status,
        data,
      });
      const errData = data as Record<string, unknown>;
      return NextResponse.json(
        {
          error:
            (errData?.detail as string) ||
            (errData?.error as string) ||
            "Failed to record events",
        },
        { status: response.status }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    routeLogger.error("Events proxy request failed", error);

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
