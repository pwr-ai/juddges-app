import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get('project');
    const year = searchParams.get('year');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    // Build query string
    const params = new URLSearchParams();
    if (project) params.append('project', project);
    if (year) params.append('year', year);
    if (status) params.append('status', status);
    if (type) params.append('type', type);

    const queryString = params.toString();
    const url = `${API_BASE_URL}/publications${queryString ? `?${queryString}` : ''}`;

    // Publications are public, no auth required for reading
    const response = await fetch(url, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      logger.error(`Backend API returned error status: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to fetch publications from backend" },
        { status: response.status }
      );
    }

    const publications = await response.json();
    return NextResponse.json(publications);
  } catch (error) {
    logger.error("Error in GET publications: ", error);
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

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/publications`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Backend API returned error status: ${response.status}`, errorText);
      return NextResponse.json(
        { error: "Failed to create publication" },
        { status: response.status }
      );
    }

    const publication = await response.json();
    return NextResponse.json(publication);
  } catch (error) {
    logger.error("Error in POST publication: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
