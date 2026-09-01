import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import {
  GUEST_SEARCHES_REMAINING_HEADER,
  GUEST_SEARCH_LIMIT_HEADER,
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_ID_HEADER,
  GUEST_SESSION_MAX_AGE_SECONDS,
} from "@/lib/guest/session";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";

const routeLogger = logger.child("search-documents-api");

/**
 * Carry the guest allowance across the BFF boundary (issue #510).
 *
 * The backend sets its cookie for its own host, which the browser would drop,
 * so the session id arrives as a header and is re-issued here — still HttpOnly,
 * so page scripts cannot forge or clear it the way the old localStorage counter
 * allowed. The remaining-count headers are passed through for the sign-up nudge.
 */
function withGuestAllowance(
  outgoing: NextResponse,
  upstream: globalThis.Response
): NextResponse {
  const sessionId = upstream.headers.get(GUEST_SESSION_ID_HEADER);
  if (!sessionId) return outgoing;

  outgoing.cookies.set(GUEST_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
  });

  for (const header of [
    GUEST_SEARCH_LIMIT_HEADER,
    GUEST_SEARCHES_REMAINING_HEADER,
  ]) {
    const value = upstream.headers.get(header);
    if (value) outgoing.headers.set(header, value);
  }

  return outgoing;
}

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

    // Give each signed-in user their own rate-limit bucket (issue #565).
    //
    // `get_client_ip` (backend/app/rate_limiter.py) keys per user only when this
    // header arrives with a matching X-API-Key; otherwise it falls back to the
    // socket address, which for BFF-proxied traffic is this container — one
    // bucket shared by every visitor. Hashed so the backend's rate-limit keys
    // never carry a raw user id. Anonymous traffic sends nothing and keeps
    // sharing the container bucket: the guest cookie is chosen by the caller,
    // so it cannot serve as an identity.
    const userId = sessionData.session?.user?.id;
    if (accessToken && userId) {
      headers["X-RateLimit-Identity"] = createHash("sha256")
        .update(userId)
        .digest("hex");
    }

    // Issue #510 — a signed-out visitor's free-search allowance lives on the
    // backend, keyed by this cookie. Forward it so the counter follows the
    // visitor rather than restarting on every request.
    const guestSession = request.cookies.get(GUEST_SESSION_COOKIE)?.value;
    if (!accessToken && guestSession) {
      headers["Cookie"] = `${GUEST_SESSION_COOKIE}=${encodeURIComponent(guestSession)}`;
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
      // The spent-allowance 429 carries a structured upgrade prompt; keep it
      // intact instead of flattening the object into an error string.
      if (response.status === 429 && data?.detail && typeof data.detail === "object") {
        return withGuestAllowance(
          NextResponse.json(
            // Spread first: the upstream detail carries its own human-readable
            // `error`, and the machine-readable code has to win.
            { ...data.detail, error: "GUEST_SEARCH_LIMIT_REACHED" },
            { status: 429 }
          ),
          response
        );
      }
      return NextResponse.json(
        { error: data?.detail || data?.error || "Failed to fetch search results" },
        { status: response.status }
      );
    }

    return withGuestAllowance(
      NextResponse.json(data, { status: response.status }),
      response
    );
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
