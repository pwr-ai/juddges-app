import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { OWNED_CHAT_ID_HEADER } from "@/lib/chat-route-contract";
import {
  EXTRACTION_SNAPSHOT_HEADER,
  EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
  EXTRACTION_VERIFIED_USER_HEADER,
} from "@/lib/extractions/detail-contract";
import { logger } from "@/lib/logger";
import { isAnonymousAuthError } from "@/lib/supabase/auth-error";
import { isCanonicalUuid } from "@/lib/validation/canonical-uuid";

const CHAT_PAGE_LOOKUP_TIMEOUT_MS = 8_000;
const CHAT_MESSAGES_PREFIX = "/api/chats/";
const CHAT_MESSAGES_SUFFIX = "/messages";
const CHAT_PAGE_PREFIX = "/chat/";
const EXTRACTION_DETAIL_PATTERN = /^\/extractions\/[^/]+$/;

export interface SessionUpdate {
  response: NextResponse;
  userId: string | null;
  accessToken: string | null;
  request: NextRequest;
}

function isReadRequest(request: NextRequest): boolean {
  return request.method === "GET" || request.method === "HEAD";
}

function needsExtractionAccessToken(request: NextRequest): boolean {
  return (
    isReadRequest(request) &&
    EXTRACTION_DETAIL_PATTERN.test(request.nextUrl.pathname)
  );
}

function chatMessagesId(pathname: string): string | null {
  if (
    !pathname.startsWith(CHAT_MESSAGES_PREFIX) ||
    !pathname.endsWith(CHAT_MESSAGES_SUFFIX)
  ) {
    return null;
  }
  const chatId = pathname.slice(
    CHAT_MESSAGES_PREFIX.length,
    -CHAT_MESSAGES_SUFFIX.length,
  );
  return isCanonicalUuid(chatId) ? chatId : null;
}

function chatPageIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(CHAT_PAGE_PREFIX)) return null;
  const chatId = pathname.slice(CHAT_PAGE_PREFIX.length);
  return isCanonicalUuid(chatId) ? chatId : null;
}

function canAnonymousRequestReachHandler(request: NextRequest): boolean {
  return (
    isReadRequest(request) &&
    chatMessagesId(request.nextUrl.pathname) !== null
  );
}

function isExactChatPageRequest(request: NextRequest): boolean {
  return (
    isReadRequest(request) &&
    chatPageIdFromPath(request.nextUrl.pathname) !== null
  );
}

function chatPageId(request: NextRequest): string | null {
  if (!isReadRequest(request)) return null;
  return chatPageIdFromPath(request.nextUrl.pathname);
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

function sanitizedRequestHeaders(
  request: NextRequest,
  ownedChatId?: string,
): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(OWNED_CHAT_ID_HEADER);
  requestHeaders.delete(EXTRACTION_SNAPSHOT_HEADER);
  requestHeaders.delete(EXTRACTION_SNAPSHOT_SIGNATURE_HEADER);
  requestHeaders.delete(EXTRACTION_VERIFIED_USER_HEADER);
  if (ownedChatId) requestHeaders.set(OWNED_CHAT_ID_HEADER, ownedChatId);
  return requestHeaders;
}

function sanitizedRequest(incomingRequest: NextRequest): NextRequest {
  return new NextRequest(incomingRequest.url, {
    method: incomingRequest.method,
    headers: sanitizedRequestHeaders(incomingRequest),
    body:
      incomingRequest.method === "GET" || incomingRequest.method === "HEAD"
        ? undefined
        : incomingRequest.body,
  });
}

function preserveSupabaseCookies(
  response: NextResponse,
  supabaseResponse: NextResponse,
): NextResponse {
  for (const cookie of supabaseResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

function sessionUpdate(
  response: NextResponse,
  request: NextRequest,
  userId: string | null,
  accessToken: string | null,
): SessionUpdate {
  return { response, request, userId, accessToken };
}

export async function updateSessionWithAuth(
  incomingRequest: NextRequest,
): Promise<SessionUpdate> {
  const request = sanitizedRequest(incomingRequest);
  let supabaseResponse = NextResponse.next({
    request: { headers: sanitizedRequestHeaders(request) },
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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: sanitizedRequestHeaders(request) },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  let user = null;
  let accessToken: string | null = null;
  let authLookupFailed = false;
  try {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (!error) {
      user = authUser;
    } else if (!isAnonymousAuthError(error)) {
      authLookupFailed = true;
      logger.warn("Auth session lookup failed in middleware", {
        path: request.nextUrl.pathname,
        message: error.message,
        status: error.status,
      });
    }
  } catch (error) {
    authLookupFailed = true;
    logger.error("Unexpected error in auth middleware: ", error);
  }

  if (user && needsExtractionAccessToken(request)) {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  }

  if (authLookupFailed && isExactChatPageRequest(request)) {
    return sessionUpdate(
      preserveSupabaseCookies(chatPageError(503), supabaseResponse),
      request,
      null,
      null,
    );
  }

  const requestedChatId = user ? chatPageId(request) : null;
  if (user && requestedChatId) {
    const controller = new AbortController();
    const timeoutReason = new DOMException(
      "Chat lookup timed out",
      "TimeoutError",
    );
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
        return sessionUpdate(
          preserveSupabaseCookies(chatPageError(503), supabaseResponse),
          request,
          user.id,
          accessToken,
        );
      }
      if (!chat) {
        const notFoundUrl = request.nextUrl.clone();
        notFoundUrl.pathname = "/__chat-not-found";
        return sessionUpdate(
          preserveSupabaseCookies(
            NextResponse.rewrite(notFoundUrl, {
              status: 404,
              request: { headers: sanitizedRequestHeaders(request) },
            }),
            supabaseResponse,
          ),
          request,
          user.id,
          accessToken,
        );
      }

      return sessionUpdate(
        preserveSupabaseCookies(
          NextResponse.next({
            request: {
              headers: sanitizedRequestHeaders(request, requestedChatId),
            },
          }),
          supabaseResponse,
        ),
        request,
        user.id,
        accessToken,
      );
    } catch (error) {
      const status =
        controller.signal.aborted &&
        controller.signal.reason === timeoutReason
          ? 504
          : 503;
      if (status === 503) {
        logger.error("Chat access lookup failed in middleware", error, {
          path: request.nextUrl.pathname,
        });
      }
      return sessionUpdate(
        preserveSupabaseCookies(chatPageError(status), supabaseResponse),
        request,
        user.id,
        accessToken,
      );
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
    // Exact extraction-detail reads return JSON 401 from the BFF. Other
    // methods and extraction API shapes retain the normal protected policy.
    !(
      isReadRequest(request) &&
      request.nextUrl.pathname === "/api/extractions" &&
      request.nextUrl.searchParams.has("job_id")
    ) &&
    // The retired GraphQL bridge must reach the Next.js router and resolve as
    // 404. Keep this exact so lookalike paths remain protected.
    request.nextUrl.pathname !== "/api/graphql" &&
    !canAnonymousRequestReachHandler(request) &&
    !request.nextUrl.pathname.startsWith("/status") &&
    !request.nextUrl.pathname.startsWith("/offline")
  ) {
    const url = request.nextUrl.clone();
    const nextTarget = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/auth/login";
    url.search = "";
    if (nextTarget && nextTarget !== "/") {
      url.searchParams.set("next", nextTarget);
    }
    return sessionUpdate(
      preserveSupabaseCookies(NextResponse.redirect(url), supabaseResponse),
      request,
      null,
      null,
    );
  }

  return sessionUpdate(
    supabaseResponse,
    request,
    user?.id ?? null,
    accessToken,
  );
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  return (await updateSessionWithAuth(request)).response;
}
