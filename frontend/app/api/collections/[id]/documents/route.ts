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
    const { pathname } = request.nextUrl;
    const match = pathname.match(/\/collections\/([^/]+)\/documents/);
    const id = match?.[1];

    if (!id) {
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

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/collections/${id}/documents`, {
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch documents from backend" },
        { status: response.status }
      );
    }

    const documents = await response.json();
    return NextResponse.json(documents);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const match = pathname.match(/\/collections\/([^/]+)\/documents/);
    const collectionId = match?.[1];

    if (!collectionId) {
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

    // Get document_id or document_ids from request body
    const body = await request.json();
    const { document_id, document_ids, collection_id } = body;

    // Handle batch addition
    if (document_ids && Array.isArray(document_ids)) {
      const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/documents/batch`, {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'X-User-ID': userData.user.id,
          'Content-Type': 'application/json',
        } as HeadersInit,
        body: JSON.stringify({ document_ids }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        return NextResponse.json(
          { error: errorData.detail || errorData.error || "Failed to add documents to collection" },
          { status: response.status }
        );
      }

      const result = await response.json();
      return NextResponse.json(result);
    }

    // Handle single document addition
    if (!document_id) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    // Call backend API to add document to collection
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/documents`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: JSON.stringify({ document_id, collection_id }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(
        { error: errorData.detail || errorData.error || "Failed to add document to collection" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const match = pathname.match(/\/collections\/([^/]+)\/documents/);
    const collectionId = match?.[1];

    if (!collectionId) {
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

    // Handle DELETE with document_id in request body
    // Note: DELETE with document_id in URL path is handled by [documentId]/route.ts
    const body = await request.json();
    const documentId = body.document_id;

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/documents`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: JSON.stringify({ document_id: documentId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(
        { error: errorData.detail || errorData.error || "Failed to remove document" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
