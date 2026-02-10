import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";
import { getBackendUrl } from "@/app/api/utils/backend-url";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

// Disable caching for this route to ensure fresh data
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteParams {
  params: Promise<{
    id: string;
    documentId: string;
  }>;
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: collectionId, documentId } = await params;

    if (!collectionId || !documentId) {
      return NextResponse.json(
        { error: "Collection ID and Document ID are required" },
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

    // Call backend API to remove document from collection
    const response = await fetch(
      `${API_BASE_URL}/collections/${collectionId}/documents/${documentId}`,
      {
        method: "DELETE",
        headers: {
          "X-API-Key": API_KEY,
          "X-User-ID": userData.user.id,
        } as HeadersInit,
      }
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(
        {
          error:
            errorData.detail ||
            errorData.error ||
            "Failed to remove document from collection",
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
