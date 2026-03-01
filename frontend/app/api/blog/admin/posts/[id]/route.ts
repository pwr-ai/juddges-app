import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";

const BACKEND_API_KEY = process.env.BACKEND_API_KEY;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAuthContext(): Promise<
  | { ok: true; accessToken: string }
  | { ok: false; response: NextResponse }
> {
  if (!BACKEND_API_KEY) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Backend API key not configured" },
        { status: 500 }
      ),
    };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Session expired" }, { status: 401 }),
    };
  }

  return { ok: true, accessToken };
}

async function forwardRequest(
  id: string,
  method: "GET" | "PUT" | "DELETE",
  accessToken: string,
  body?: unknown
): Promise<NextResponse> {
  const response = await fetch(`${getBackendUrl()}/blog/admin/posts/${id}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": BACKEND_API_KEY!,
      Authorization: `Bearer ${accessToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  return forwardRequest(id, "GET", auth.accessToken);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  const body = await request.json();
  return forwardRequest(id, "PUT", auth.accessToken, body);
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  return forwardRequest(id, "DELETE", auth.accessToken);
}
