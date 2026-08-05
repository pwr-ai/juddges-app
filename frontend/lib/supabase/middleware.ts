import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  SCHEMA_SNAPSHOT_HEADER,
  SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
  SCHEMA_SNAPSHOT_USER_HEADER,
  SCHEMA_FAILURE_STATUS_HEADER,
  isCanonicalSchemaId,
  isUnauthenticatedSchemaAuthError,
} from "@/lib/schemas/detail-transport";

const SCHEMA_API_PATTERN = /^\/api\/schemas\/[^/]+$/;
const SCHEMA_PAGE_PATTERN = /^\/schemas\/([^/]+)$/;

export type SessionAuthFailure = "unauthenticated" | "unavailable" | null;

export interface SessionUpdate {
  response: NextResponse;
  request: NextRequest;
  userId: string | null;
  accessToken: string | null;
  authFailure: SessionAuthFailure;
}

function sanitizedRequest(incoming: NextRequest): NextRequest {
  const headers = new Headers(incoming.headers);
  headers.delete(SCHEMA_SNAPSHOT_HEADER);
  headers.delete(SCHEMA_SNAPSHOT_SIGNATURE_HEADER);
  headers.delete(SCHEMA_SNAPSHOT_USER_HEADER);
  headers.delete(SCHEMA_FAILURE_STATUS_HEADER);
  return new NextRequest(incoming.url, {
    method: incoming.method,
    headers,
    body:
      incoming.method === "GET" || incoming.method === "HEAD"
        ? undefined
        : incoming.body,
  });
}

function copyCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

function isSchemaReadApi(request: NextRequest): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    SCHEMA_API_PATTERN.test(request.nextUrl.pathname)
  );
}

function isSchemaPage(request: NextRequest): boolean {
  const match = SCHEMA_PAGE_PATTERN.exec(request.nextUrl.pathname);
  if (!match) return false;
  try {
    return isCanonicalSchemaId(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/ecosystem") ||
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/dashboard/stats") ||
    pathname === "/api/graphql" ||
    pathname.startsWith("/status") ||
    pathname.startsWith("/offline")
  );
}

function loginRedirect(
  request: NextRequest,
  sessionResponse: NextResponse
): NextResponse {
  const url = request.nextUrl.clone();
  const nextTarget = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/auth/login";
  url.search = "";
  if (nextTarget && nextTarget !== "/") url.searchParams.set("next", nextTarget);
  return copyCookies(sessionResponse, NextResponse.redirect(url));
}

export async function updateSessionWithAuth(
  incomingRequest: NextRequest
): Promise<SessionUpdate> {
  const request = sanitizedRequest(incomingRequest);
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let userId: string | null = null;
  let accessToken: string | null = null;
  let authFailure: SessionAuthFailure = null;
  try {
    const userLookup = await supabase.auth.getUser();
    if (userLookup.error) {
      authFailure = isUnauthenticatedSchemaAuthError(userLookup.error)
        ? "unauthenticated"
        : "unavailable";
      if (authFailure === "unavailable") {
        logger.warn("Auth session lookup failed in middleware", {
          path: request.nextUrl.pathname,
          message: userLookup.error.message,
          status: userLookup.error.status,
        });
      }
    } else if (!userLookup.data.user) {
      authFailure = "unauthenticated";
    } else {
      userId = userLookup.data.user.id;
      const sessionLookup = await supabase.auth.getSession();
      if (sessionLookup.error) {
        authFailure = isUnauthenticatedSchemaAuthError(sessionLookup.error)
          ? "unauthenticated"
          : "unavailable";
        userId = null;
      } else {
        accessToken = sessionLookup.data.session?.access_token ?? null;
        if (!accessToken) {
          userId = null;
          authFailure = "unauthenticated";
        }
      }
    }
  } catch (error) {
    logger.error("Unexpected error in auth middleware: ", error);
    authFailure = "unavailable";
  }

  const schemaFailureNeedsExactStatus =
    authFailure === "unavailable" &&
    (isSchemaReadApi(request) || isSchemaPage(request));
  if (
    !userId &&
    !isPublicPath(request.nextUrl.pathname) &&
    !isSchemaReadApi(request) &&
    !schemaFailureNeedsExactStatus
  ) {
    return {
      response: loginRedirect(request, supabaseResponse),
      request,
      userId: null,
      accessToken: null,
      authFailure,
    };
  }

  return {
    response: supabaseResponse,
    request,
    userId,
    accessToken,
    authFailure,
  };
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  return (await updateSessionWithAuth(request)).response;
}
