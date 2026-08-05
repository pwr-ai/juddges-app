import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getBackendUrl } from "@/app/api/utils/backend-url";
import { OWNED_CHAT_ID_HEADER } from "@/lib/chat-route-contract";
import {
  COLLECTION_SNAPSHOT_HEADER,
  encodeCollectionSnapshot,
  isUnauthenticatedAuthError,
  isValidCollectionId,
} from "@/lib/collections/detail-contract";
import { logger } from "@/lib/logger";
import { isAnonymousAuthError } from "@/lib/supabase/auth-error";
import { isCanonicalUuid } from "@/lib/validation/canonical-uuid";
import type { CollectionWithDocuments } from "@/types/collection";

const COLLECTION_DETAIL_PATH = /^\/collections\/([^/]+)$/;
const DEFAULT_COLLECTION_PREFLIGHT_TIMEOUT_MS = 10_000;
const CHAT_PAGE_LOOKUP_TIMEOUT_MS = 8_000;
const CHAT_MESSAGES_PREFIX = "/api/chats/";
const CHAT_MESSAGES_SUFFIX = "/messages";
const CHAT_PAGE_PREFIX = "/chat/";

function collectionPreflightTimeoutMs(): number {
  const configured = Number(process.env.COLLECTION_DETAIL_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_COLLECTION_PREFLIGHT_TIMEOUT_MS;
}

function isReadRequest(request: NextRequest): boolean {
  return request.method === "GET" || request.method === "HEAD";
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
  const headers = new Headers(request.headers);
  headers.delete(COLLECTION_SNAPSHOT_HEADER);
  headers.delete(OWNED_CHAT_ID_HEADER);
  if (ownedChatId) headers.set(OWNED_CHAT_ID_HEADER, ownedChatId);
  return headers;
}

function nextSessionResponse(request: NextRequest): NextResponse {
  return NextResponse.next({
    request: { headers: sanitizedRequestHeaders(request) },
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

function collectionNotFoundResponse(
  request: NextRequest,
  sessionResponse: NextResponse,
): NextResponse {
  const notFoundUrl = request.nextUrl.clone();
  notFoundUrl.pathname = "/__collection-not-found";
  notFoundUrl.search = "";
  return preserveSupabaseCookies(
    NextResponse.rewrite(notFoundUrl, { status: 404 }),
    sessionResponse,
  );
}

function collectionStatusResponse(
  status: number,
  sessionResponse: NextResponse,
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
  return preserveSupabaseCookies(
    NextResponse.json({ error: message }, { status }),
    sessionResponse,
  );
}

function hydratedCollectionResponse(
  request: NextRequest,
  sessionResponse: NextResponse,
  collection: CollectionWithDocuments,
): NextResponse {
  const requestHeaders = sanitizedRequestHeaders(request);
  requestHeaders.set(
    COLLECTION_SNAPSHOT_HEADER,
    encodeCollectionSnapshot(collection),
  );
  return preserveSupabaseCookies(
    NextResponse.next({ request: { headers: requestHeaders } }),
    sessionResponse,
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

function isPublicRequest(request: NextRequest): boolean {
  return (
    isPublicPath(request.nextUrl.pathname) ||
    canAnonymousRequestReachHandler(request)
  );
}

function loginRedirectResponse(
  request: NextRequest,
  sessionResponse: NextResponse,
): NextResponse {
  const url = request.nextUrl.clone();
  const nextTarget = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/auth/login";
  url.search = "";
  if (nextTarget && nextTarget !== "/") {
    url.searchParams.set("next", nextTarget);
  }
  return preserveSupabaseCookies(NextResponse.redirect(url), sessionResponse);
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
            request.cookies.set(name, value),
          );
          supabaseResponse = nextSessionResponse(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Keep auth.getUser() immediately after client construction.
  let user = null;
  let authLookupError: unknown = null;
  try {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (!error) {
      user = authUser;
    } else if (!isUnauthenticatedAuthError(error)) {
      logger.warn("Auth session lookup failed in middleware", {
        path: request.nextUrl.pathname,
        message: error.message,
        status: error.status,
      });
    }
    authLookupError = error;
  } catch (error) {
    logger.error("Unexpected error in auth middleware: ", error);
    authLookupError = error;
  }

  const chatAuthLookupFailed =
    !user &&
    authLookupError !== null &&
    !isAnonymousAuthError(authLookupError);
  const collectionAuthLookupFailed =
    !user &&
    authLookupError !== null &&
    !isUnauthenticatedAuthError(authLookupError);
  const collectionMatch = request.nextUrl.pathname.match(COLLECTION_DETAIL_PATH);

  if (chatAuthLookupFailed && isExactChatPageRequest(request)) {
    return preserveSupabaseCookies(chatPageError(503), supabaseResponse);
  }
  if (collectionAuthLookupFailed && collectionMatch) {
    return collectionStatusResponse(503, supabaseResponse);
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
        return preserveSupabaseCookies(chatPageError(503), supabaseResponse);
      }
      if (!chat) {
        const notFoundUrl = request.nextUrl.clone();
        notFoundUrl.pathname = "/__chat-not-found";
        return preserveSupabaseCookies(
          NextResponse.rewrite(notFoundUrl, {
            status: 404,
            request: { headers: sanitizedRequestHeaders(request) },
          }),
          supabaseResponse,
        );
      }

      return preserveSupabaseCookies(
        NextResponse.next({
          request: {
            headers: sanitizedRequestHeaders(request, requestedChatId),
          },
        }),
        supabaseResponse,
      );
    } catch (error) {
      if (
        controller.signal.aborted &&
        controller.signal.reason === timeoutReason
      ) {
        return preserveSupabaseCookies(chatPageError(504), supabaseResponse);
      }
      logger.error("Chat access lookup failed in middleware", error, {
        path: request.nextUrl.pathname,
      });
      return preserveSupabaseCookies(chatPageError(503), supabaseResponse);
    } finally {
      clearTimeout(timeout);
    }
  }

  const isPageRead = isReadRequest(request);
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
      return loginRedirectResponse(request, supabaseResponse);
    }
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
        },
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

  if (!user && !isPublicRequest(request)) {
    return loginRedirectResponse(request, supabaseResponse);
  }

  return supabaseResponse;
}
