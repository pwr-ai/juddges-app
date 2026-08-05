import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/app/api/utils/backend-url";
import {
  COLLECTION_SNAPSHOT_HEADER,
  encodeCollectionSnapshot,
  isMissingAuthSessionError,
  isValidCollectionId,
} from "@/lib/collections/detail-contract";
import type { CollectionWithDocuments } from "@/types/collection";

const COLLECTION_DETAIL_PATH = /^\/collections\/([^/]+)$/;
const DEFAULT_COLLECTION_PREFLIGHT_TIMEOUT_MS = 10_000;

function collectionPreflightTimeoutMs(): number {
  const configured = Number(process.env.COLLECTION_DETAIL_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_COLLECTION_PREFLIGHT_TIMEOUT_MS;
}

function copySessionCookies(
  source: NextResponse,
  target: NextResponse
): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

function sanitizedRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete(COLLECTION_SNAPSHOT_HEADER);
  return headers;
}

function nextSessionResponse(request: NextRequest): NextResponse {
  return NextResponse.next({
    request: { headers: sanitizedRequestHeaders(request) },
  });
}

function collectionNotFoundResponse(
  request: NextRequest,
  sessionResponse: NextResponse
): NextResponse {
  const notFoundUrl = request.nextUrl.clone();
  notFoundUrl.pathname = "/__collection-not-found";
  notFoundUrl.search = "";
  const response = NextResponse.rewrite(notFoundUrl, { status: 404 });
  return copySessionCookies(sessionResponse, response);
}

function collectionStatusResponse(
  status: number,
  sessionResponse: NextResponse
): NextResponse {
  const message =
    status === 504
      ? "Collection service timed out"
      : status === 503
        ? "Collection service unavailable"
        : status === 502
          ? "Collection service connection failed"
          : status === 401 || status === 403
            ? "Collection service authentication failed"
            : "Collection service failed";
  return copySessionCookies(
    sessionResponse,
    NextResponse.json({ error: message }, { status })
  );
}

function hydratedCollectionResponse(
  request: NextRequest,
  sessionResponse: NextResponse,
  collection: CollectionWithDocuments
): NextResponse {
  const requestHeaders = sanitizedRequestHeaders(request);
  requestHeaders.set(
    COLLECTION_SNAPSHOT_HEADER,
    encodeCollectionSnapshot(collection)
  );
  return copySessionCookies(
    sessionResponse,
    NextResponse.next({ request: { headers: requestHeaders } })
  );
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

export async function updateSession(request: NextRequest) {
  let supabaseResponse = nextSessionResponse(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = nextSessionResponse(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  let user = null;
  let authLookupError: unknown = null;
  try {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (!error) {
      user = authUser;
    } else if (
      error.message !== "Auth session missing!" &&
      !error.message.includes("refresh_token_not_found")
    ) {
      // Surface unexpected auth failures (expired tokens that won't refresh,
      // project-ref mismatches, network errors). Benign anonymous-user errors
      // are still ignored to avoid console spam.
      logger.warn("Auth session lookup failed in middleware", {
        path: request.nextUrl.pathname,
        message: error.message,
        status: error.status,
      });
    }
    authLookupError = error;
  } catch (error) {
    // Catch any unexpected errors and continue without user
    logger.error("Unexpected error in auth middleware: ", error);
    authLookupError = error;
  }

  if (
    !user &&
    authLookupError &&
    !isMissingAuthSessionError(authLookupError) &&
    !isPublicPath(request.nextUrl.pathname)
  ) {
    return collectionStatusResponse(503, supabaseResponse);
  }

  const collectionMatch = request.nextUrl.pathname.match(COLLECTION_DETAIL_PATH);
  const isPageRead = request.method === "GET" || request.method === "HEAD";
  if (user && collectionMatch && !isPageRead) {
    const response = collectionStatusResponse(405, supabaseResponse);
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }
  if (user && collectionMatch && isPageRead) {
    const collectionId = collectionMatch[1];
    if (!isValidCollectionId(collectionId)) {
      return collectionNotFoundResponse(request, supabaseResponse);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return collectionStatusResponse(503, supabaseResponse);
    }
    if (accessToken) {
      try {
        const response = await fetch(
          `${getBackendUrl()}/collections/${collectionId}?limit=20`,
          {
            cache: "no-store",
            headers: {
              "X-API-Key": process.env.BACKEND_API_KEY as string,
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(collectionPreflightTimeoutMs()),
          }
        );

        if (response.status === 404) {
          return collectionNotFoundResponse(request, supabaseResponse);
        }
        if (!response.ok) {
          return collectionStatusResponse(response.status, supabaseResponse);
        }
        const collection = (await response.json()) as CollectionWithDocuments;
        if (collection.user_id !== user.id) {
          return collectionNotFoundResponse(request, supabaseResponse);
        }
        return hydratedCollectionResponse(request, supabaseResponse, collection);
      } catch (error) {
        logger.warn("Collection preflight failed", {
          collectionId,
          message: error instanceof Error ? error.message : String(error),
        });
        const status =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
            ? 504
            : 502;
        return collectionStatusResponse(status, supabaseResponse);
      }
    }
  }

  if (
    !user &&
    !isPublicPath(request.nextUrl.pathname)
  ) {
    // Preserve the originally-requested path (and query) so the login form
    // can return the user there after a successful sign-in instead of
    // dumping them on `/`.
    const url = request.nextUrl.clone();
    const nextTarget = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/auth/login";
    url.search = "";
    if (nextTarget && nextTarget !== "/") {
      url.searchParams.set("next", nextTarget);
    }
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
