import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

async function getAccessToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return null;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

function backendHeaders(accessToken: string): HeadersInit {
  return {
    'X-API-Key': API_KEY,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/mcp/keys`, {
      headers: backendHeaders(accessToken),
    });

    if (!response.ok) {
      logger.error(`Backend API returned error status: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to list MCP keys" },
        { status: response.status }
      );
    }

    const keys = await response.json();
    return NextResponse.json(keys);
  } catch (error) {
    logger.error("Error in GET mcp-keys: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.text();
    const response = await fetch(`${API_BASE_URL}/mcp/keys`, {
      method: 'POST',
      headers: backendHeaders(accessToken),
      body,
    });

    if (!response.ok) {
      logger.error(`Backend API returned error status: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to create MCP key" },
        { status: response.status }
      );
    }

    // The plaintext key is passed straight through to the caller; it is
    // never logged or stored server-side.
    const created = await response.json();
    return NextResponse.json(created, { status: response.status });
  } catch (error) {
    logger.error("Error in POST mcp-keys: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
