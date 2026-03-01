import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";

const BACKEND_API_KEY = process.env.BACKEND_API_KEY;

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return auth.response;
  }

  const search = request.nextUrl.searchParams.toString();
  const backendUrl = `${getBackendUrl()}/blog/admin/posts${search ? `?${search}` : ""}`;

  const response = await fetch(backendUrl, {
    method: "GET",
    headers: {
      "X-API-Key": BACKEND_API_KEY!,
      Authorization: `Bearer ${auth.accessToken}`,
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return auth.response;
  }

  const body = await request.json();
  const response = await fetch(`${getBackendUrl()}/blog/admin/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": BACKEND_API_KEY!,
      Authorization: `Bearer ${auth.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
