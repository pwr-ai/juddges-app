import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from "@/lib/logger";
import {
  isValidCollectionId,
  loadCollectionDetail,
} from "@/lib/server/collection-detail";

const apiLogger = logger.child('collections-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

// Disable caching for this route to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { pathname, searchParams } = request.nextUrl;
    const match = pathname.match(/\/collections\/([^/]+)/);
    const id = match?.[1];

    if (!id || !isValidCollectionId(id)) {
      apiLogger.error("Invalid collection ID: ", id);
      return NextResponse.json(
        { error: "Invalid collection ID" },
        { status: 400 }
      );
    }

    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const result = await loadCollectionDetail(id, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    if (result.kind === "invalid") {
      return NextResponse.json(
        { error: "Invalid collection ID" },
        { status: 400 }
      );
    }
    if (result.kind === "unauthenticated") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }
    if (result.kind === "unavailable") {
      const message =
        result.reason === "timeout"
          ? "Collection service timed out"
          : result.reason === "transport"
            ? "Collection service unavailable"
            : "Failed to fetch collection from backend";
      return NextResponse.json({ error: message }, { status: result.status });
    }

    return NextResponse.json(result.collection);
  } catch (error) {
    apiLogger.error("Error in GET collection: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const match = pathname.match(/\/collections\/([^/]+)/);
    const id = match?.[1];

    if (!id || !isValidCollectionId(id)) {
      apiLogger.error("Missing collection ID in PUT request");
      return NextResponse.json(
        { error: "Collection ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { name, description } = body;

    if (!name) {
      apiLogger.error("Missing name in PUT request for collection: ", id);
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const backendRequestBody = JSON.stringify({ name, description });

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/collections/${id}`, {
      method: 'PUT',
      headers: {
        'X-API-Key': API_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: backendRequestBody,
    });

    if (!response.ok) {
      apiLogger.error(`Backend API returned error status: ${response.status}`);
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to update collection" },
        { status: response.status }
      );
    }

    const collection = await response.json();
    return NextResponse.json(collection);
  } catch (error) {
    apiLogger.error("Error in PUT collection: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const match = pathname.match(/\/collections\/([^/]+)/);
    const id = match?.[1];

    if (!id || !isValidCollectionId(id)) {
      apiLogger.error("Missing collection ID in DELETE request");
      return NextResponse.json(
        { error: "Collection ID is required" },
        { status: 400 }
      );
    }

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/collections/${id}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': API_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      apiLogger.error(`Backend API returned error status: ${response.status}`);
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to delete collection" },
        { status: response.status }
      );
    }

    return NextResponse.json(
      { message: "Collection deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    apiLogger.error("Error in DELETE collection: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
