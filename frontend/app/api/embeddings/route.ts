import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const routeLogger = logger.child("embeddings-api");
const REQUEST_TIMEOUT_MS = 10_000;
const GET_ENDPOINTS = {
  models: "/embeddings/models",
  "models/active": "/embeddings/models/active",
} as const;
const POST_ACTIONS = {
  "set-active": "/embeddings/models/active",
  test: "/embeddings/test",
} as const;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-language",
  "retry-after",
  "www-authenticate",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
] as const;

type VerifiedCaller = {
  accessToken: string;
  isAdmin: boolean;
};

async function verifyCaller(): Promise<VerifiedCaller | NextResponse> {
  const supabase = await createClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    return NextResponse.json(
      { detail: "Session expired" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Verify the exact token that will be forwarded; getSession() alone only
  // reads local cookie state and is not an authentication boundary.
  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json(
      { detail: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return {
    accessToken,
    isAdmin:
      userData.user.role === "service_role" ||
      userData.user.app_metadata?.is_admin === true,
  };
}

function invalidSelector(name: "endpoint" | "action"): NextResponse {
  return NextResponse.json(
    { detail: `Invalid embeddings ${name}` },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

async function proxyRequest(
  request: NextRequest,
  backendPath: string,
  caller: VerifiedCaller,
): Promise<NextResponse> {
  const apiKey = process.env.BACKEND_API_KEY;
  if (!apiKey) {
    routeLogger.error("BACKEND_API_KEY is not configured");
    return NextResponse.json(
      { detail: "Embeddings API is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const requestHeaders: Record<string, string> = {
      Accept: request.headers.get("accept") ?? "application/json",
      Authorization: `Bearer ${caller.accessToken}`,
      "X-API-Key": apiKey,
    };
    const contentType = request.headers.get("content-type");
    if (contentType) requestHeaders["Content-Type"] = contentType;

    const init: RequestInit = {
      method: request.method,
      headers: requestHeaders,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };
    if (request.method === "POST") init.body = await request.arrayBuffer();

    const backendUrl = getBackendUrl().replace(/\/$/, "");
    const upstream = await fetch(`${backendUrl}${backendPath}`, init);
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    routeLogger.error("Embeddings API proxy request failed", error, {
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { detail: "Embeddings API is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint || !Object.hasOwn(GET_ENDPOINTS, endpoint)) {
    return invalidSelector("endpoint");
  }

  const caller = await verifyCaller();
  if (caller instanceof NextResponse) return caller;

  return proxyRequest(
    request,
    GET_ENDPOINTS[endpoint as keyof typeof GET_ENDPOINTS],
    caller,
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const action = request.nextUrl.searchParams.get("action");
  if (!action || !Object.hasOwn(POST_ACTIONS, action)) {
    return invalidSelector("action");
  }

  const caller = await verifyCaller();
  if (caller instanceof NextResponse) return caller;
  if (action === "set-active" && !caller.isAdmin) {
    return NextResponse.json(
      { detail: "Admin privileges required" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return proxyRequest(
    request,
    POST_ACTIONS[action as keyof typeof POST_ACTIONS],
    caller,
  );
}
