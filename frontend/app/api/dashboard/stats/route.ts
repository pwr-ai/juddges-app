import { NextRequest, NextResponse } from "next/server";
import { withClientIp } from "@/app/api/_lib/client-ip";
import { getBackendUrl } from "../../utils/backend-url";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const backendUrl = getBackendUrl();

    const response = await fetch(
      `${backendUrl}/dashboard/stats`,
      {
        headers: withClientIp({
          "X-API-Key": process.env.BACKEND_API_KEY || "",
        }, request),
        // Disable cache temporarily to get fresh data
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("[Dashboard Stats] Error response: ", errorText);
      return new Response(errorText, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type":
            response.headers.get("Content-Type") || "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const data = await response.json();

    // Return with Cache-Control headers for CDN/browser caching
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=14400, s-maxage=14400',
      },
    });
  } catch (error) {
    logger.error("[Dashboard Stats] Error fetching dashboard stats: ", error);
    return NextResponse.json(
      { detail: "Dashboard statistics service is unavailable" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
