import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

const UUID_PATH_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHAT_MESSAGES_HANDLER_PATH = new RegExp(
  `^/api/chats/${UUID_PATH_SEGMENT}/messages$`,
  "i",
);
const CHAT_DETAIL_PAGE_PATH = new RegExp(`^/chat/${UUID_PATH_SEGMENT}$`, "i");
const CHAT_PAGE_LOOKUP_TIMEOUT_MS = 8_000;

function canAnonymousRequestReachHandler(request: NextRequest): boolean {
  return (
    request.method === "GET" &&
    CHAT_MESSAGES_HANDLER_PATH.test(request.nextUrl.pathname)
  );
}

function isExactChatPageRequest(request: NextRequest): boolean {
  return (
    request.method === "GET" &&
    CHAT_DETAIL_PAGE_PATH.test(request.nextUrl.pathname)
  );
}

function chatPageId(request: NextRequest): string | null {
  if (request.method !== "GET") return null;
  const match = request.nextUrl.pathname.match(CHAT_DETAIL_PAGE_PATH);
  return match ? match[0].slice("/chat/".length) : null;
}

function chatPageError(status: 503 | 504): NextResponse {
  return NextResponse.json(
    {
      message:
        status === 504 ? "Chat lookup timed out" : "Chat service unavailable",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
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
  let authLookupFailed = false;
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
      authLookupFailed = true;
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
    authLookupFailed = true;
    logger.error("Unexpected error in auth middleware: ", error);
  }

  if (authLookupFailed && isExactChatPageRequest(request)) {
    return chatPageError(503);
  }

  const requestedChatId = user ? chatPageId(request) : null;
  if (user && requestedChatId) {
    const controller = new AbortController();
    const timeoutReason = new DOMException("Chat lookup timed out", "TimeoutError");
    const timeout = setTimeout(
      () => controller.abort(timeoutReason),
      CHAT_PAGE_LOOKUP_TIMEOUT_MS,
    );
    try {
      const { data: chat, error } = await supabase
        .from("chats")
        .select("id")
        .eq("id", requestedChatId)
        .eq("user_id", user.id)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (error) {
        logger.error("Chat access lookup failed in middleware", error, {
          path: request.nextUrl.pathname,
        });
        return chatPageError(503);
      }
      if (!chat) {
        const notFoundUrl = request.nextUrl.clone();
        notFoundUrl.pathname = "/__chat-not-found";
        return NextResponse.rewrite(notFoundUrl, { status: 404 });
      }
    } catch (error) {
      if (
        controller.signal.aborted &&
        controller.signal.reason === timeoutReason
      ) {
        return chatPageError(504);
      }
      logger.error("Chat access lookup failed in middleware", error, {
        path: request.nextUrl.pathname,
      });
      return chatPageError(503);
    } finally {
      clearTimeout(timeout);
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
    !canAnonymousRequestReachHandler(request) &&
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
