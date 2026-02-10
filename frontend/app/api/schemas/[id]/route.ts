import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode,
  SchemaNotFoundError
} from '@/lib/errors';
import { getBackendUrl } from '@/app/api/utils/backend-url';

const apiLogger = logger.child('schemas-api');

/**
 * GET /api/schemas/[id] - Get a single schema by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const { id } = await params;

  try {
    apiLogger.info('GET /api/schemas/[id] started', { requestId, schemaId: id });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Get backend URL and API key
    const backendUrl = getBackendUrl();
    const apiKey = process.env.BACKEND_API_KEY;

    if (!apiKey) {
      apiLogger.error("BACKEND_API_KEY not configured", { requestId });
      throw new AppError(
        "Backend API key not configured",
        ErrorCode.INTERNAL_ERROR
      );
    }

    // Fetch schema from Supabase directly
    const { data: schema, error: fetchError } = await supabase
      .from('extraction_schemas')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !schema) {
      throw new SchemaNotFoundError(id);
    }

    // Get user email if user_id exists
    let userEmail: string | undefined;
    if (schema.user_id) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('id', schema.user_id)
          .single();

        if (!profileError && profile?.email) {
          userEmail = profile.email;
        } else {
          apiLogger.warn("Failed to fetch user email from profile", { 
            error: profileError, 
            requestId, 
            schemaId: id,
            userId: schema.user_id 
          });
        }
      } catch (error) {
        apiLogger.warn("Failed to fetch user email", { error, requestId, schemaId: id });
      }
    }

    // Enrich schema with user email
    const enrichedSchema = {
      ...schema,
      user: schema.user_id && userEmail
        ? { email: userEmail }
        : undefined
    };

    apiLogger.info('GET /api/schemas/[id] completed', {
      requestId,
      schemaId: id
    });

    return NextResponse.json(enrichedSchema, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });

  } catch (error) {
    apiLogger.error("GET /api/schemas/[id] failed", error, { requestId, schemaId: id });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch schema",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}


