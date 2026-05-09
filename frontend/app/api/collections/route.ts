import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function GET() {
  try {
    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/collections`, {
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      logger.error(`Backend API returned error status: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to fetch collections from backend" },
        { status: response.status }
      );
    }

    const collections = await response.json();
    return NextResponse.json(collections);
  } catch (error) {
    logger.error("Error in GET collections: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
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

    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const backendRequestBody = JSON.stringify({ name, description });

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/collections`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: backendRequestBody,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Backend API returned error status: ${response.status}`, errorBody);
      let message = "Failed to create collection";
      try {
        const parsed = JSON.parse(errorBody);
        const detail = parsed?.detail ?? parsed?.error ?? parsed?.message;
        if (typeof detail === "string" && detail.length > 0) {
          message = detail;
        }
      } catch {
        if (errorBody) message = errorBody;
      }
      return NextResponse.json(
        { error: message },
        { status: response.status }
      );
    }

    const collection = await response.json();
    return NextResponse.json(collection);
  } catch (error) {
    logger.error("Error in POST collection: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
