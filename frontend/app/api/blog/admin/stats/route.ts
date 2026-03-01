import { NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";

const BACKEND_API_KEY = process.env.BACKEND_API_KEY;

export async function GET(): Promise<NextResponse> {
  if (!BACKEND_API_KEY) {
    return NextResponse.json(
      { error: "Backend API key not configured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const response = await fetch(`${getBackendUrl()}/blog/admin/stats`, {
    headers: {
      "X-API-Key": BACKEND_API_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
