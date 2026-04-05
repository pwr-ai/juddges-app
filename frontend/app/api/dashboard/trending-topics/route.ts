import { NextResponse } from "next/server";
import { getBackendUrl } from "../../utils/backend-url";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "5";
    const category = searchParams.get("category");

    let url = `${getBackendUrl()}/dashboard/trending-topics?limit=${limit}`;
    if (category) {
      url += `&category=${encodeURIComponent(category)}`;
    }

    const response = await fetch(url, {
      headers: {
        "X-API-Key": process.env.BACKEND_API_KEY || "",
      },
      // Enable Next.js caching with 1-hour revalidation
      next: { revalidate: 3600 }, // 1 hour
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Return with Cache-Control headers
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    logger.error("Error fetching trending topics: ", error);
    return NextResponse.json([]);
  }
}
