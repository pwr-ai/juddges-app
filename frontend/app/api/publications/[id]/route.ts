import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Publications are public, no auth required for reading
    const response = await fetch(`${API_BASE_URL}/publications/${id}`, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Publication not found" },
          { status: 404 }
        );
      }
      logger.error(`Backend API returned error status: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to fetch publication from backend" },
        { status: response.status }
      );
    }

    const publication = await response.json();
    return NextResponse.json(publication);
  } catch (error) {
    logger.error("Error in GET publication: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (userData.user.app_metadata?.is_admin !== true) {
      return NextResponse.json(
        { error: "Admin permission required" },
        { status: 403 }
      );
    }

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/publications/${id}`, {
      method: 'PUT',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Publication not found" },
          { status: 404 }
        );
      }
      const errorText = await response.text();
      logger.error(`Backend API returned error status: ${response.status}`, errorText);
      return NextResponse.json(
        { error: "Failed to update publication" },
        { status: response.status }
      );
    }

    const publication = await response.json();
    return NextResponse.json(publication);
  } catch (error) {
    logger.error("Error in PUT publication: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (userData.user.app_metadata?.is_admin !== true) {
      return NextResponse.json(
        { error: "Admin permission required" },
        { status: 403 }
      );
    }

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/publications/${id}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Publication not found" },
          { status: 404 }
        );
      }
      logger.error(`Backend API returned error status: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to delete publication" },
        { status: response.status }
      );
    }

    return NextResponse.json({ message: "Publication deleted successfully" });
  } catch (error) {
    logger.error("Error in DELETE publication: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
