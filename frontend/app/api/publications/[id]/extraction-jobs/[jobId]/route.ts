import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id, jobId } = await params;

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

    const response = await fetch(`${API_BASE_URL}/publications/${id}/extraction-jobs/${jobId}`, {
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
        { error: "Failed to unlink extraction job" },
        { status: response.status }
      );
    }

    return NextResponse.json({ message: "Extraction job unlinked successfully" });
  } catch (error) {
    logger.error("Error unlinking extraction job: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
