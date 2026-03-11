import { NextResponse } from "next/server";
import { getBackendUrl } from "../../utils/backend-url";

export async function GET() {
  try {
    const backendUrl = getBackendUrl();

    const response = await fetch(
      `${backendUrl}/dashboard/stats`,
      {
        headers: {
          "X-API-Key": process.env.BACKEND_API_KEY || "",
        },
        // Disable cache temporarily to get fresh data
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Dashboard Stats] Error response: ", errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();

    // Return with Cache-Control headers for CDN/browser caching
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=14400, s-maxage=14400',
      },
    });
  } catch (error) {
    console.error("[Dashboard Stats] Error fetching dashboard stats: ", error);
    // Return default values on error
    const defaultData = {
      total_documents: 0,
      judgments: 0,
      judgments_pl: 0,
      judgments_uk: 0,
      tax_interpretations: 0,
      tax_interpretations_pl: 0,
      tax_interpretations_uk: 0,
      added_this_week: 0,
      last_updated: null,
    };
    return NextResponse.json(defaultData);
  }
}
