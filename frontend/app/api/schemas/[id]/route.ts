import { NextRequest, NextResponse } from "next/server";

import {
  AppError,
  ErrorCode,
  SchemaNotFoundError,
  UnauthorizedError,
} from "@/lib/errors";
import logger from "@/lib/logger";
import {
  SchemaDetailNotFoundError,
  SchemaDetailUpstreamError,
  fetchSchemaDetail,
} from "@/lib/server/schema-detail";
import {
  isCanonicalSchemaId,
  isUnauthenticatedSchemaAuthError,
} from "@/lib/schemas/detail-transport";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const apiLogger = logger.child("schema-detail-api");
type RouteContext = { params: Promise<{ id: string }> };

function jsonError(error: AppError, head: boolean): NextResponse {
  const body = head ? null : JSON.stringify(error.toErrorDetail());
  return new NextResponse(body, {
    status: error.statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

async function handleRead(
  request: NextRequest,
  { params }: RouteContext,
  head: boolean
): Promise<NextResponse> {
  const { id } = await params;
  try {
    if (!isCanonicalSchemaId(id)) {
      throw new SchemaDetailNotFoundError();
    }

    const supabase = await createClient();
    let userLookup: Awaited<ReturnType<typeof supabase.auth.getUser>>;
    try {
      userLookup = await supabase.auth.getUser();
    } catch {
      throw new AppError(
        "Authentication service is temporarily unavailable.",
        ErrorCode.DATABASE_UNAVAILABLE,
        503
      );
    }
    if (userLookup.error) {
      if (isUnauthenticatedSchemaAuthError(userLookup.error)) {
        throw new UnauthorizedError();
      }
      throw new AppError(
        "Authentication service is temporarily unavailable.",
        ErrorCode.DATABASE_UNAVAILABLE,
        503
      );
    }
    if (!userLookup.data.user) throw new UnauthorizedError();

    let sessionLookup: Awaited<ReturnType<typeof supabase.auth.getSession>>;
    try {
      sessionLookup = await supabase.auth.getSession();
    } catch {
      throw new AppError(
        "Authentication service is temporarily unavailable.",
        ErrorCode.DATABASE_UNAVAILABLE,
        503
      );
    }
    if (sessionLookup.error) {
      if (isUnauthenticatedSchemaAuthError(sessionLookup.error)) {
        throw new UnauthorizedError();
      }
      throw new AppError(
        "Authentication service is temporarily unavailable.",
        ErrorCode.DATABASE_UNAVAILABLE,
        503
      );
    }
    const accessToken = sessionLookup.data.session?.access_token;
    if (!accessToken) throw new UnauthorizedError();

    const schema = await fetchSchemaDetail(id, accessToken, request.signal);
    if (head) {
      return new NextResponse(null, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.json(schema, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    apiLogger.error("Schema detail request failed", error, { schemaId: id });
    if (error instanceof SchemaDetailNotFoundError) {
      return jsonError(new SchemaNotFoundError(id), head);
    }
    if (error instanceof SchemaDetailUpstreamError) {
      const code =
        error.statusCode === 401
          ? ErrorCode.UNAUTHORIZED
          : error.statusCode === 403
            ? ErrorCode.FORBIDDEN
            : error.statusCode === 503
              ? ErrorCode.DATABASE_UNAVAILABLE
              : ErrorCode.INTERNAL_ERROR;
      return jsonError(
        new AppError(error.message, code, error.statusCode),
        head
      );
    }
    if (error instanceof AppError) return jsonError(error, head);
    return jsonError(
      new AppError(
        "Failed to fetch schema.",
        ErrorCode.INTERNAL_ERROR,
        500
      ),
      head
    );
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleRead(request, context, false);
}

export async function HEAD(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleRead(request, context, true);
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { error: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
        "Cache-Control": "private, no-store",
      },
    }
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
