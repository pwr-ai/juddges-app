import { NextResponse, type NextRequest } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import {
  EXTRACTION_SNAPSHOT_HEADER,
  EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
  EXTRACTION_VERIFIED_USER_HEADER,
  encodeExtractionSnapshot,
  isValidExtractionJobId,
  normalizeExtractionJobPayload,
  signExtractionSnapshot,
  toExtractionJobSnapshot,
} from "@/lib/extractions/detail-contract";
import { DEFAULT_LOCALE, isValidLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/config";
import type { LocaleCode } from "@/lib/i18n/types";
import { logger } from "@/lib/logger";
import {
  SCHEMA_SNAPSHOT_HEADER,
  SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
  SCHEMA_SNAPSHOT_USER_HEADER,
  SCHEMA_FAILURE_STATUS_HEADER,
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

const EXTRACTION_DETAIL_PATTERN = /^\/extractions\/([^/]+)$/;
const SCHEMA_PAGE_PATTERN = /^\/schemas\/([^/]+)$/;

function extractionStatusResponse(
  status: number,
  method: string
): NextResponse {
  const notFound = status === 404;
  const title = notFound
    ? "Extraction job not found"
    : status === 422
      ? "Invalid extraction job response"
      : "Extraction job temporarily unavailable";
  const message = notFound
    ? "The requested extraction job does not exist or is not accessible."
    : status === 422
      ? "The extraction service could not process this job status request."
      : `The extraction service failed with status ${status}. Please try again.`;
  const body =
    method === "HEAD"
      ? null
      : `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>` +
        `<body><main><p>Extraction service ${status}</p><h1>${title}</h1>` +
        `<p>${message}</p>${notFound ? "" : '<a href="">Try again</a>'}</main></body></html>`;
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function extractionTimeoutMs(): number {
  const configured = Number(process.env.EXTRACTION_DETAIL_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000;
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

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

function schemaPageRewrite(request: NextRequest): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = "/__schema-not-found";
  target.search = "";
  return NextResponse.rewrite(target, {
    status: 404,
    request: { headers: request.headers },
  });
}

function schemaPageFailure(request: NextRequest, status: number): NextResponse {
  const headers = new Headers(request.headers);
  headers.delete(SCHEMA_SNAPSHOT_HEADER);
  headers.delete(SCHEMA_SNAPSHOT_SIGNATURE_HEADER);
  headers.delete(SCHEMA_SNAPSHOT_USER_HEADER);
  headers.delete(SCHEMA_FAILURE_STATUS_HEADER);
  headers.set(SCHEMA_FAILURE_STATUS_HEADER, String(status));
  return NextResponse.next({ status, request: { headers } });
}

export async function middleware(incomingRequest: NextRequest) {
  const locale = detectLocale(incomingRequest);
  const localeNeedsWrite =
    incomingRequest.cookies.get(LOCALE_COOKIE_NAME)?.value !== locale;
  const session = await updateSessionWithAuth(incomingRequest);
  const { response: sessionResponse, request, userId, accessToken, authFailure } =
    session;

  if (sessionResponse.status >= 300 && sessionResponse.status < 400) {
    return finishResponse(sessionResponse, sessionResponse, locale, localeNeedsWrite);
  }

  const isRead = request.method === "GET" || request.method === "HEAD";
  const isExtractionBffRead =
    isRead &&
    request.nextUrl.pathname === "/api/extractions" &&
    request.nextUrl.searchParams.has("job_id");
  if (!userId && isExtractionBffRead) {
    return finishResponse(
      NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
      sessionResponse,
      locale,
      localeNeedsWrite
    );
  }

  const extractionMatch = EXTRACTION_DETAIL_PATTERN.exec(request.nextUrl.pathname);
  if (userId && extractionMatch) {
    if (!isRead) {
      const response = NextResponse.json(
        { error: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
        { status: 405, headers: { Allow: "GET, HEAD" } }
      );
      return finishResponse(response, sessionResponse, locale, localeNeedsWrite);
    }

    let jobId: string;
    try {
      jobId = decodeURIComponent(extractionMatch[1]);
    } catch {
      return finishResponse(
        extractionStatusResponse(404, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }
    if (!isValidExtractionJobId(jobId)) {
      return finishResponse(
        extractionStatusResponse(404, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }
    if (!accessToken) {
      const login = request.nextUrl.clone();
      login.pathname = "/auth/login";
      login.search = "";
      login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
      return finishResponse(
        NextResponse.redirect(login),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }

    try {
      const upstream = await fetch(
        `${getBackendUrl()}/extractions/${encodeURIComponent(jobId)}?include_results=false`,
        {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "X-API-Key": process.env.BACKEND_API_KEY ?? "",
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(extractionTimeoutMs()),
        }
      );
      if (upstream.status === 404 || upstream.status === 403) {
        return finishResponse(
          extractionStatusResponse(404, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite
        );
      }
      if (!upstream.ok) {
        return finishResponse(
          extractionStatusResponse(upstream.status, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite
        );
      }

      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch {
        return finishResponse(
          extractionStatusResponse(502, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite
        );
      }
      const job = normalizeExtractionJobPayload(payload, jobId);
      if (!job) {
        return finishResponse(
          extractionStatusResponse(502, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite
        );
      }

      const encoded = encodeExtractionSnapshot(toExtractionJobSnapshot(job));
      if (!encoded) {
        return finishResponse(
          extractionStatusResponse(502, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite
        );
      }
      const headers = new Headers(request.headers);
      headers.delete(EXTRACTION_SNAPSHOT_HEADER);
      headers.delete(EXTRACTION_SNAPSHOT_SIGNATURE_HEADER);
      headers.delete(EXTRACTION_VERIFIED_USER_HEADER);
      headers.set(EXTRACTION_SNAPSHOT_HEADER, encoded);
      headers.set(
        EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
        await signExtractionSnapshot(
          encoded,
          userId,
          `/extractions/${jobId}`,
          process.env.BACKEND_API_KEY ?? ""
        )
      );
      headers.set(EXTRACTION_VERIFIED_USER_HEADER, userId);
      return finishResponse(
        NextResponse.next({ request: { headers } }),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    } catch (error) {
      return finishResponse(
        extractionStatusResponse(isTimeout(error) ? 504 : 503, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }
  }

  const pageMatch = SCHEMA_PAGE_PATTERN.exec(request.nextUrl.pathname);
  if (pageMatch && !userId && authFailure === "unavailable") {
    return finishResponse(
      schemaPageFailure(request, 503),
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
        schemaPageRewrite(request),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }
    if (pageMatch[1] !== schemaId || !isCanonicalSchemaId(schemaId)) {
      return finishResponse(
        schemaPageRewrite(request),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }
    if (!accessToken) {
      return finishResponse(
        schemaPageFailure(request, 401),
        sessionResponse,
        locale,
        localeNeedsWrite
      );
    }

    try {
      const schema = await fetchSchemaDetail(
        schemaId,
        accessToken,
        request.signal,
        { enrichCreator: false }
      );
      const encoded = encodeSchemaSnapshot(schema);
      const headers = new Headers(request.headers);
      headers.delete(SCHEMA_SNAPSHOT_HEADER);
      headers.delete(SCHEMA_SNAPSHOT_SIGNATURE_HEADER);
      headers.delete(SCHEMA_SNAPSHOT_USER_HEADER);
      headers.delete(SCHEMA_FAILURE_STATUS_HEADER);
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
        status === 404
          ? schemaPageRewrite(request)
          : schemaPageFailure(request, status),
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
    "/extractions/:path*",
    "/schemas/:path*",
    "/api/schemas/:path*",
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|chunk-error-handler\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|map|txt|xml|ico)$).*)",
  ],
};
