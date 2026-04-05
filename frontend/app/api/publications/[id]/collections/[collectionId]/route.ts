import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; collectionId: string }> }
) {
  try {
    const { id, collectionId } = await params;

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/publications/${id}/collections/${collectionId}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
    });

    if (!response.ok) {
      logger.error(`Backend API returned error: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to unlink collection" },
        { status: response.status }
      );
    }

    return NextResponse.json({ message: "Collection unlinked successfully" });
  } catch (error) {
    logger.error("Error unlinking collection: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
