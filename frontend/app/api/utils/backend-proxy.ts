import { NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const apiLogger = logger.child("backend-proxy");

export interface ProxyToBackendOptions {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  passthroughHeaders?: readonly string[];
  timeoutMs?: number;
}

/**
 * Authenticated BFF → FastAPI forwarder (Foundation for /collections/from-filter,
 * /extractions/{id}/summary, /compare/*, /collections/pairs/*).
 *
 * Upstream status and body pass through unchanged — including FastAPI's
 * `{"detail": {...}}` error envelope — so clients unwrap errors in ONE place
 * (see lib/api/collections.ts::CollectionFromFilterError). Existing routes are
 * not migrated; new routes must use this instead of copying the auth block.
 */
export async function proxyToBackend(opts: ProxyToBackendOptions): Promise<NextResponse> {
  const { path, method = "GET", body, passthroughHeaders, timeoutMs = 30_000 } = opts;
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const headers: Record<string, string> = {
      "X-API-Key": process.env.BACKEND_API_KEY as string,
      Authorization: `Bearer ${accessToken}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${getBackendUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 204) return new NextResponse(null, { status: 204 });

    if (passthroughHeaders && response.ok) {
      const picked = new Headers();
      for (const name of passthroughHeaders) {
        const value = response.headers.get(name);
        if (value) picked.set(name, value);
      }
      return new NextResponse(response.body, { status: response.status, headers: picked });
    }

    const text = await response.text();
    if (!response.ok) apiLogger.error(`backend ${method} ${path} → ${response.status}`, { body: text.slice(0, 500) });
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    apiLogger.error(`proxyToBackend ${method} ${path} failed`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
