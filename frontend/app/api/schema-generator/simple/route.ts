import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

/**
 * Simple schema generation API route.
 *
 * Proxies requests to the backend /schema-generator/simple endpoint
 * for single-shot schema generation from natural language.
 */
export async function POST(request: Request) {
  try {
    const apiUrl = getBackendUrl();
    const body = await request.json();

    // Get user from session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract request fields with defaults
    const {
      message,
      schema_name = "InformationExtraction",
      schema_description = null,
      existing_fields = null,
      extraction_instructions = null,
      session_id = null,
      collection_id = null,
    } = body;

    // Validate required field
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Call the backend simple endpoint
    const backendResponse = await fetch(`${apiUrl}/schema-generator/simple`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.BACKEND_API_KEY || "",
      },
      body: JSON.stringify({
        message: message.trim(),
        schema_name,
        schema_description,
        existing_fields,
        extraction_instructions,
        session_id,
        collection_id,
      }),
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      logger.error("Backend error: ", errorData);
      return NextResponse.json(
        {
          error: errorData.detail || "Failed to generate schema",
          success: false,
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    return NextResponse.json({
      message: result.message,
      schema: result.schema,
      session_id: result.session_id,
      field_count: result.field_count,
      success: result.success,
      generated_prompt: result.generated_prompt,
      new_fields: result.new_fields || [],
      existing_field_count: result.existing_field_count || 0,
      new_field_count: result.new_field_count || 0,
    });

  } catch (error) {
    logger.error("Schema generation error: ", error);
    return NextResponse.json(
      {
        error: "Failed to process schema generation request",
        success: false,
      },
      { status: 500 }
    );
  }
}
