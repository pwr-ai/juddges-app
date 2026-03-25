import { NextResponse } from "next/server";
import { getBackendUrl } from "../../utils/backend-url";

export async function GET() {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/dashboard/health`, {
      headers: { "X-API-Key": process.env.BACKEND_API_KEY || "" },
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
