import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Use API_BASE_URL for server-side requests (Docker networking)
    const backendUrl = process.env.API_BASE_URL || 'http://backend:8002';
    const apiKey = process.env.BACKEND_API_KEY;

    if (!apiKey) {
      logger.error("BACKEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Backend API key not configured" },
        { status: 500 }
      );
    }

    // Forward the search request to the backend
    const response = await fetch(`${backendUrl}/documents/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        question: body.question,
        max_documents: body.maxDocuments,
        document_types: body.documentTypes,
        languages: body.languages,
        mode: body.mode || 'rabbit',
        page: body.page || 1,
        page_size: body.pageSize || 20,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Backend search error: ", response.status, errorText);
      return NextResponse.json(
        { error: `Backend search failed: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error("Error in search route: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
