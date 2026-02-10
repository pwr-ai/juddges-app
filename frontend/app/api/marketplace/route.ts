import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { UnauthorizedError } from "@/lib/errors";

const apiLogger = logger.child("marketplace-api");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8004";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

/**
 * GET /api/marketplace - Browse marketplace listings or get stats
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("GET /api/marketplace started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint") || "browse";

    let backendPath = "/marketplace";

    if (endpoint === "stats") {
      backendPath = "/marketplace/stats";
    } else if (endpoint === "my-listings") {
      backendPath = "/marketplace/my-listings";
      searchParams.set("user_id", user.id);
    }

    // Forward all query params
    const params = new URLSearchParams(searchParams);
    params.delete("endpoint");
    if (endpoint !== "my-listings") {
      params.delete("user_id");
    }

    const backendResponse = await fetch(
      `${BACKEND_URL}${backendPath}?${params.toString()}`,
      {
        headers: {
          "X-API-Key": BACKEND_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend marketplace request failed", {
        requestId,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to fetch marketplace data" },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    apiLogger.error("Marketplace API error", { requestId, error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/marketplace - Publish listing, download, submit review, etc.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("POST /api/marketplace started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "publish";
    const listingId = searchParams.get("listing_id");

    let backendPath = "/marketplace";
    let method = "POST";

    if (action === "publish") {
      backendPath = `/marketplace?user_id=${user.id}`;
    } else if (action === "download" && listingId) {
      backendPath = `/marketplace/${listingId}/download?user_id=${user.id}`;
    } else if (action === "review" && listingId) {
      backendPath = `/marketplace/${listingId}/reviews?user_id=${user.id}`;
    } else if (action === "update" && listingId) {
      backendPath = `/marketplace/${listingId}?user_id=${user.id}`;
      method = "PATCH";
    } else if (action === "new-version" && listingId) {
      backendPath = `/marketplace/${listingId}/versions?user_id=${user.id}`;
    }

    const body = await request.json();

    const backendResponse = await fetch(`${BACKEND_URL}${backendPath}`, {
      method,
      headers: {
        "X-API-Key": BACKEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend marketplace POST failed", {
        requestId,
        action,
        status: backendResponse.status,
        error: errorText,
      });

      let errorMessage = "Operation failed";
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.detail || errorMessage;
      } catch {
        // use default
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    apiLogger.error("Marketplace POST API error", { requestId, error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
