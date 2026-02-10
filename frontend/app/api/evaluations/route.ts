import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { getBackendUrl } from "@/app/api/utils/backend-url";

const apiLogger = logger.child("evaluations-api");

/**
 * POST /api/evaluations - Create a new evaluation
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("POST /api/evaluations started", { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get backend URL and API key
    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY;

    if (!apiKey) {
      apiLogger.error("BACKEND_API_KEY not configured", { requestId });
      return NextResponse.json(
        { error: "Backend API key not configured" },
        { status: 500 }
      );
    }

    // Get request body
    const body = await request.json();

    // Forward request to backend
    const response = await fetch(`${backendUrl}/evaluations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-User-ID": userData.user.id,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      apiLogger.error("Backend evaluation creation failed", {
        requestId,
        status: response.status,
        error: data,
      });
      return NextResponse.json(data, { status: response.status });
    }

    apiLogger.info("Evaluation created", { requestId, evaluationId: data.id });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    apiLogger.error("Evaluation creation error", { requestId, error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluations - List evaluations (use query params for filtering)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const { searchParams } = new URL(request.url);
    const schemaId = searchParams.get("schema_id");
    const schemaVersionId = searchParams.get("schema_version_id");
    const documentId = searchParams.get("document_id");

    apiLogger.info("GET /api/evaluations started", {
      requestId,
      schemaId,
      schemaVersionId,
      documentId,
    });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get backend URL and API key
    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Backend API key not configured" },
        { status: 500 }
      );
    }

    // Build URL based on params
    let url: string;
    if (schemaId) {
      url = `${backendUrl}/evaluations/schema/${schemaId}`;
      if (schemaVersionId) {
        url += `?schema_version_id=${schemaVersionId}`;
      }
    } else if (documentId) {
      url = `${backendUrl}/evaluations/document/${documentId}`;
      if (schemaId) {
        url += `?schema_id=${schemaId}`;
      }
    } else {
      return NextResponse.json(
        { error: "schema_id or document_id required" },
        { status: 400 }
      );
    }

    // Forward request to backend
    const response = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "X-User-ID": userData.user.id,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("Evaluation list error", { requestId, error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
