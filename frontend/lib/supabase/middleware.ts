import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/app/api/utils/backend-url";

const COLLECTION_DETAIL_PATH = /^\/collections\/([^/]+)$/;
const COLLECTION_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/;
const COLLECTION_PREFLIGHT_TIMEOUT_MS = 10_000;

function collectionNotFoundResponse(
  request: NextRequest,
  sessionResponse: NextResponse
): NextResponse {
  const notFoundUrl = request.nextUrl.clone();
  notFoundUrl.pathname = "/__collection-not-found";
  notFoundUrl.search = "";
  const response = NextResponse.rewrite(notFoundUrl, { status: 404 });
  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
          supabaseResponse = NextResponse.next({
            request,
          });
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
  } catch (error) {
    // Catch any unexpected errors and continue without user
    logger.error("Unexpected error in auth middleware: ", error);
  }

  const collectionMatch = request.nextUrl.pathname.match(COLLECTION_DETAIL_PATH);
  if (user && collectionMatch) {
    const collectionId = collectionMatch[1];
    if (!COLLECTION_ID_PATTERN.test(collectionId)) {
      return collectionNotFoundResponse(request, supabaseResponse);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      try {
        const response = await fetch(
          `${getBackendUrl()}/collections/${collectionId}?limit=1`,
          {
            cache: "no-store",
            headers: {
              "X-API-Key": process.env.BACKEND_API_KEY as string,
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(COLLECTION_PREFLIGHT_TIMEOUT_MS),
          }
        );

        if (response.status === 404) {
          return collectionNotFoundResponse(request, supabaseResponse);
        }
        if (response.ok) {
          const collection = (await response.json()) as { user_id?: string };
          if (collection.user_id !== user.id) {
            return collectionNotFoundResponse(request, supabaseResponse);
          }
        }
      } catch (error) {
        logger.warn("Collection preflight failed; deferring to page loader", {
          collectionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (
    !user &&
    request.nextUrl.pathname !== "/" &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/about") &&
    !request.nextUrl.pathname.startsWith("/ecosystem") &&
    // Metadata image routes must be reachable by social/search crawlers.
    !request.nextUrl.pathname.startsWith("/opengraph-image") &&
    !request.nextUrl.pathname.startsWith("/twitter-image") &&
    !request.nextUrl.pathname.startsWith("/onboarding") &&
    !request.nextUrl.pathname.startsWith("/api/health") &&
    !request.nextUrl.pathname.startsWith("/api/dashboard/stats") &&
    // The retired GraphQL bridge must reach the Next.js router and resolve as
    // 404. Keep this exact so lookalike paths remain protected.
    request.nextUrl.pathname !== "/api/graphql" &&
    !request.nextUrl.pathname.startsWith("/status") &&
    !request.nextUrl.pathname.startsWith("/offline")
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
