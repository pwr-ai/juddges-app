import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

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

    const response = await fetch(`${API_BASE_URL}/publications/${id}/extraction-jobs`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
        'Content-Type': 'application/json',
      } as HeadersInit,
      body: JSON.stringify({
        job_id: body.jobId,
        description: body.description,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Backend API returned error: ${response.status}`, errorText);
      return NextResponse.json(
        { error: "Failed to link extraction job" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Error linking extraction job: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
