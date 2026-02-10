import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";
import { getBackendUrl } from '@/app/api/utils/backend-url';

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

    if (!id) {
      console.error("Invalid collection ID:", id);
      return NextResponse.json(
        { error: "Invalid collection ID" },
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

    // Build backend URL with pagination params
    const backendParams = new URLSearchParams();
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    if (limit) backendParams.set('limit', limit);
    if (offset) backendParams.set('offset', offset);

    const backendQueryString = backendParams.toString();
    const backendUrl = `${API_BASE_URL}/collections/${id}${backendQueryString ? `?${backendQueryString}` : ''}`;

    // Call backend API
    const response = await fetch(backendUrl, {
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      console.error(`Backend API returned error status: ${response.status}`);
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch collection from backend" },
        { status: response.status }
      );
    }

    const collection = await response.json();
    return NextResponse.json(collection);
  } catch (error) {
    console.error("Error in GET collection:", error);
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
    
    if (!id) {
      console.error("Missing collection ID in PUT request");
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

    const { name } = body;

    if (!name) {
      console.error("Missing name in PUT request for collection:", id);
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const backendRequestBody = JSON.stringify({ name });

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/collections/${id}`, {
      method: 'PUT',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: backendRequestBody,
    });

    if (!response.ok) {
      console.error(`Backend API returned error status: ${response.status}`);
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
    console.error("Error in PUT collection:", error);
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
    
    if (!id) {
      console.error("Missing collection ID in DELETE request");
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

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/collections/${id}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      console.error(`Backend API returned error status: ${response.status}`);
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
    console.error("Error in DELETE collection:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}