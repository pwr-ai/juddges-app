import { NextRequest, NextResponse } from "next/server";
import { withClientIp } from "@/app/api/_lib/client-ip";
import { getBackendUrl } from "../../utils/backend-url";

export async function GET(request: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/dashboard/health`, {
      headers: withClientIp({ "X-API-Key": process.env.BACKEND_API_KEY || "" }, request),
      cache: 'no-store',
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
