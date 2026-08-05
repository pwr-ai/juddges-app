import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_LOCALE, isValidLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/config";
import type { LocaleCode } from "@/lib/i18n/types";
import { logger } from "@/lib/logger";
import {
  SCHEMA_SNAPSHOT_HEADER,
  SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
  SCHEMA_SNAPSHOT_USER_HEADER,
  encodeSchemaSnapshot,
  isCanonicalSchemaId,
  signSchemaSnapshot,
} from "@/lib/schemas/detail-transport";
import {
  SchemaDetailNotFoundError,
  SchemaDetailUpstreamError,
  fetchSchemaDetail,
} from "@/lib/server/schema-detail";
import { updateSessionWithAuth } from "@/lib/supabase/middleware";

const SCHEMA_PAGE_PATTERN = /^\/schemas\/([^/]+)$/;
const SCHEMA_API_PATTERN =
  /^\/api\/schemas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function detectLocale(request: NextRequest): LocaleCode {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) return cookieLocale;
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const languages = acceptLanguage
      .split(",")
      .map((language) => {
        const [code, quality = "1"] = language.trim().split(";q=");
        return {
          code: code.split("-")[0].toLowerCase(),
          quality: Number.parseFloat(quality),
        };
      })
      .sort((left, right) => right.quality - left.quality);
    for (const language of languages) {
      if (isValidLocale(language.code)) return language.code;
    }
  }
  return DEFAULT_LOCALE;
}

function finishResponse(
  target: NextResponse,
  sessionResponse: NextResponse,
  locale: LocaleCode,
  localeNeedsWrite: boolean
): NextResponse {
  if (target !== sessionResponse) {
    for (const cookie of sessionResponse.cookies.getAll()) target.cookies.set(cookie);
  }
  if (localeNeedsWrite) {
    target.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
    });
  }
  target.headers.set("x-locale", locale);
  return target;
}

function schemaPageStatus(status: number, method: string): NextResponse {
  const notFound = status === 404;
  const title = notFound ? "Schema not found" : "Schema temporarily unavailable";
  const message = notFound
    ? "The requested schema does not exist or is not accessible."
    : "The schema service could not load this schema. Please try again.";
  const html =
    method === "HEAD"
      ? null
      : `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function schemaApiAuthStatus(status: 401 | 503, method: string): NextResponse {
  const error = status === 401 ? "UNAUTHORIZED" : "DATABASE_UNAVAILABLE";
  return new NextResponse(
    method === "HEAD"
      ? null
      : JSON.stringify({
          error,
          code: error,
          message:
            status === 401
              ? "Authentication required"
              : "Authentication service is temporarily unavailable.",
        }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    }
  );
}

export async function middleware(incomingRequest: NextRequest) {
  const locale = detectLocale(incomingRequest);
  const localeNeedsWrite =
    incomingRequest.cookies.get(LOCALE_COOKIE_NAME)?.value !== locale;
  const session = await updateSessionWithAuth(incomingRequest);
  const { response: sessionResponse, request, userId, accessToken, authFailure } = session;

  if (sessionResponse.status >= 300 && sessionResponse.status < 400) {
    return finishResponse(sessionResponse, sessionResponse, locale, localeNeedsWrite);
  }

  const isRead = request.method === "GET" || request.method === "HEAD";
  if (isRead && SCHEMA_API_PATTERN.test(request.nextUrl.pathname) && !userId) {
    return finishResponse(
      schemaApiAuthStatus(authFailure === "unavailable" ? 503 : 401, request.method),
      sessionResponse,
      locale,
      localeNeedsWrite
    );
  }

  const pageMatch = SCHEMA_PAGE_PATTERN.exec(request.nextUrl.pathname);
  if (pageMatch && !userId && authFailure === "unavailable") {
    return finishResponse(
      schemaPageStatus(503, request.method),
      sessionResponse,
      locale,
      localeNeedsWrite
    );
  }

  if (pageMatch && userId) {
    if (!isRead) {
      return finishResponse(
        NextResponse.json(
          { error: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          { status: 405, headers: { Allow: "GET, HEAD" } }
        ),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }

    let schemaId: string;
    try {
      schemaId = decodeURIComponent(pageMatch[1]);
    } catch {
      return finishResponse(
        schemaPageStatus(404, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }
    if (
      pageMatch[1] !== schemaId ||
      !isCanonicalSchemaId(schemaId) ||
      !accessToken
    ) {
      return finishResponse(
        schemaPageStatus(accessToken ? 404 : 401, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }

    try {
      const schema = await fetchSchemaDetail(schemaId, accessToken, request.signal);
      const encoded = encodeSchemaSnapshot(schema);
      const headers = new Headers(request.headers);
      headers.delete(SCHEMA_SNAPSHOT_HEADER);
      headers.delete(SCHEMA_SNAPSHOT_SIGNATURE_HEADER);
      headers.delete(SCHEMA_SNAPSHOT_USER_HEADER);
      headers.set(SCHEMA_SNAPSHOT_HEADER, encoded);
      headers.set(
        SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
        await signSchemaSnapshot(
          encoded,
          userId,
          request.nextUrl.pathname,
          process.env.BACKEND_API_KEY ?? ""
        )
      );
      headers.set(SCHEMA_SNAPSHOT_USER_HEADER, userId);
      return finishResponse(
        NextResponse.next({ request: { headers } }),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    } catch (error) {
      const status =
        error instanceof SchemaDetailNotFoundError
          ? 404
          : error instanceof SchemaDetailUpstreamError
            ? error.statusCode
            : 500;
      logger.warn("Schema detail preflight failed", {
        schemaId,
        status,
        message: error instanceof Error ? error.message : String(error),
      });
      return finishResponse(
        schemaPageStatus(status, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }
  }

  return finishResponse(sessionResponse, sessionResponse, locale, localeNeedsWrite);
}

export const config = {
  matcher: [
    "/schemas/:path*",
    "/api/schemas/:path*",
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|chunk-error-handler\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|map|txt|xml|ico)$).*)",
  ],
};
