import { NextResponse } from "next/server";
import { getBackendUrl } from "../../utils/backend-url";

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "5";
    const backendUrl = getBackendUrl();

    const response = await fetch(
      `${backendUrl}/dashboard/recent-documents?limit=${limit}`,
      {
        headers: {
          "X-API-Key": process.env.BACKEND_API_KEY || "",
        },
        // Disable cache to always get fresh documents
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Recent Documents] Error response: ", errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();

    // Return with no-cache headers to prevent stale data
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error("[Recent Documents] Error fetching recent documents: ", error);
    return NextResponse.json([]);
  }
}
