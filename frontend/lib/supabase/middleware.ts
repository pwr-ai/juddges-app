import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { OWNED_CHAT_ID_HEADER } from "@/lib/chat-route-contract";
import {
  EXTRACTION_SNAPSHOT_HEADER,
  EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
  EXTRACTION_VERIFIED_USER_HEADER,
} from "@/lib/extractions/detail-contract";
import { logger } from "@/lib/logger";
import {
  SCHEMA_SNAPSHOT_HEADER,
  SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
  SCHEMA_SNAPSHOT_USER_HEADER,
  SCHEMA_FAILURE_STATUS_HEADER,
  isCanonicalSchemaId,
  isUnauthenticatedSchemaAuthError,
} from "@/lib/schemas/detail-transport";
import { isAnonymousAuthError } from "@/lib/supabase/auth-error";
import {
  isAnonymousSchemaBffRead,
  isPublicRequest,
} from "@/lib/supabase/public-route-policy";
import { isCanonicalUuid } from "@/lib/validation/canonical-uuid";

const CHAT_PAGE_LOOKUP_TIMEOUT_MS = 8_000;
const CHAT_PAGE_PREFIX = "/chat/";
const EXTRACTION_DETAIL_PATTERN = /^\/extractions\/[^/]+$/;
const SCHEMA_PAGE_PATTERN = /^\/schemas\/([^/]+)$/;

export type SessionAuthFailure = "unauthenticated" | "unavailable" | null;

export interface SessionUpdate {
  response: NextResponse;
  request: NextRequest;
  userId: string | null;
  accessToken: string | null;
  authFailure: SessionAuthFailure;
}

function sanitizedRequestHeaders(
  request: NextRequest,
  ownedChatId?: string
): Headers {
  const headers = new Headers(request.headers);
  headers.delete(OWNED_CHAT_ID_HEADER);
  headers.delete(EXTRACTION_SNAPSHOT_HEADER);
  headers.delete(EXTRACTION_SNAPSHOT_SIGNATURE_HEADER);
  headers.delete(EXTRACTION_VERIFIED_USER_HEADER);
  headers.delete(SCHEMA_SNAPSHOT_HEADER);
  headers.delete(SCHEMA_SNAPSHOT_SIGNATURE_HEADER);
  headers.delete(SCHEMA_SNAPSHOT_USER_HEADER);
  headers.delete(SCHEMA_FAILURE_STATUS_HEADER);
  if (ownedChatId) headers.set(OWNED_CHAT_ID_HEADER, ownedChatId);
  return headers;
}

function sanitizedRequest(incoming: NextRequest): NextRequest {
  return new NextRequest(incoming.url, {
    method: incoming.method,
    headers: sanitizedRequestHeaders(incoming),
    body:
      incoming.method === "GET" || incoming.method === "HEAD"
        ? undefined
        : incoming.body,
  });
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

function chatPageIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(CHAT_PAGE_PREFIX)) return null;
  const chatId = pathname.slice(CHAT_PAGE_PREFIX.length);
  return isCanonicalUuid(chatId) ? chatId : null;
}

function isExactChatPageRequest(request: NextRequest): boolean {
  return isReadRequest(request) && chatPageIdFromPath(request.nextUrl.pathname) !== null;
}

function chatPageId(request: NextRequest): string | null {
  return isReadRequest(request)
    ? chatPageIdFromPath(request.nextUrl.pathname)
    : null;
}

function chatPageError(status: 503 | 504): NextResponse {
  return NextResponse.json(
    {
      message:
        status === 504 ? "Chat lookup timed out" : "Chat service unavailable",
    },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function copyCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
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
  const schemaReadApi = isAnonymousSchemaBffRead({
    pathname: request.nextUrl.pathname,
    method: request.method,
  });
  const needsSchemaSession = schemaReadApi || isSchemaPage(request);
  try {
    const userLookup = await supabase.auth.getUser();
    if (userLookup.error) {
      authFailure = isAnonymousAuthError(userLookup.error)
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
      if (needsSchemaSession) {
        const sessionLookup = await supabase.auth.getSession();
        if (sessionLookup.error) {
          authFailure = isUnauthenticatedSchemaAuthError(sessionLookup.error)
            ? "unauthenticated"
            : "unavailable";
          userId = null;
        } else {
          const session = sessionLookup.data.session;
          if (
            !session?.access_token ||
            session.user.id !== userId
          ) {
            userId = null;
            accessToken = null;
            authFailure = "unauthenticated";
          } else {
            accessToken = session.access_token;
          }
        }
      }
    }
  } catch (error) {
    logger.error("Unexpected error in auth middleware: ", error);
    authFailure = "unavailable";
    if (needsSchemaSession) userId = null;
  }

  if (
    userId &&
    !needsSchemaSession &&
    needsExtractionAccessToken(request)
  ) {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  }

  const schemaFailureNeedsExactStatus =
    authFailure === "unavailable" &&
    (schemaReadApi || isSchemaPage(request));

  if (authFailure === "unavailable" && isExactChatPageRequest(request)) {
    return {
      response: copyCookies(supabaseResponse, chatPageError(503)),
      request,
      userId,
      accessToken,
      authFailure,
    };
  }

  const requestedChatId = userId ? chatPageId(request) : null;
  if (userId && requestedChatId) {
    const controller = new AbortController();
    const timeoutReason = new DOMException("Chat lookup timed out", "TimeoutError");
    const timeout = setTimeout(
      () => controller.abort(timeoutReason),
      CHAT_PAGE_LOOKUP_TIMEOUT_MS
    );
    try {
      const { data: chat, error } = await supabase
        .from("chats")
        .select("id")
        .eq("id", requestedChatId)
        .eq("user_id", userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (error) {
        logger.error("Chat access lookup failed in middleware", error, {
          path: request.nextUrl.pathname,
        });
        return {
          response: copyCookies(supabaseResponse, chatPageError(503)),
          request,
          userId,
          accessToken,
          authFailure,
        };
      }
      if (!chat) {
        const notFoundUrl = request.nextUrl.clone();
        notFoundUrl.pathname = "/__chat-not-found";
        return {
          response: copyCookies(
            supabaseResponse,
            NextResponse.rewrite(notFoundUrl, {
              status: 404,
              request: { headers: sanitizedRequestHeaders(request) },
            })
          ),
          request,
          userId,
          accessToken,
          authFailure,
        };
      }

      return {
        response: copyCookies(
          supabaseResponse,
          NextResponse.next({
            request: {
              headers: sanitizedRequestHeaders(request, requestedChatId),
            },
          })
        ),
        request,
        userId,
        accessToken,
        authFailure,
      };
    } catch (error) {
      const timedOut =
        controller.signal.aborted && controller.signal.reason === timeoutReason;
      if (!timedOut) {
        logger.error("Chat access lookup failed in middleware", error, {
          path: request.nextUrl.pathname,
        });
      }
      return {
        response: copyCookies(
          supabaseResponse,
          chatPageError(timedOut ? 504 : 503)
        ),
        request,
        userId,
        accessToken,
        authFailure,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  if (
    !userId &&
    !isPublicRequest({
      pathname: request.nextUrl.pathname,
      method: request.method,
      searchParams: request.nextUrl.searchParams,
    }) &&
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
