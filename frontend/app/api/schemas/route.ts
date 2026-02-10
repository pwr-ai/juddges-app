import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  ValidationError,
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode,
  SchemaNotFoundError
} from '@/lib/errors';
import {
  createSchemaRequestSchema,
  updateSchemaRequestSchema,
  schemaIdQuerySchema,
  validateRequestBody,
  validateQueryParams
} from '@/lib/validation/schemas';
import { getBackendUrl } from '@/app/api/utils/backend-url';

const apiLogger = logger.child('schemas-api');

/**
 * GET /api/schemas - List all extraction schemas
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/schemas started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Extract pagination parameters from query string
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize') || searchParams.get('page_size');
    
    // Validate and set defaults for pagination
    // Explicitly check for NaN to prevent invalid values from being sent to backend
    const parsedPage = pageParam ? parseInt(pageParam, 10) : null;
    const parsedPageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : null;
    
    const page = (parsedPage !== null && !isNaN(parsedPage)) 
      ? Math.max(1, parsedPage) 
      : 1;
    const pageSize = (parsedPageSize !== null && !isNaN(parsedPageSize))
      ? Math.max(1, Math.min(100, parsedPageSize))
      : 100;
    
    const hasPaginationParams = pageParam !== null || pageSizeParam !== null;

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

    // Forward request to backend - use /schemas/db endpoint for database schemas
    // Include pagination params if provided
    const backendUrlWithParams = `${backendUrl}/schemas/db?page=${page}&page_size=${pageSize}`;
    const response = await fetch(backendUrlWithParams, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      apiLogger.error("Backend request failed", {
        requestId,
        status: response.status,
        error: errorText
      });
      throw new DatabaseError(
        `Backend request failed: ${response.status} ${errorText}`,
        { originalError: errorText }
      );
    }

    const backendResponse = await response.json();

    // Handle both paginated and non-paginated responses
    const schemas = backendResponse.data || backendResponse;

    // Get unique user IDs from schemas
    const userIds = [...new Set(
      (schemas || [])
        .map((s: { user_id?: string }) => s.user_id)
        .filter((id: string | undefined) => id != null)
    )];

    // Fetch user emails from user_profiles table
    let userEmails: Record<string, string> = {};
    if (userIds.length > 0) {
      try {
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, email')
          .in('id', userIds);

        if (!profilesError && profiles && Array.isArray(profiles)) {
          userEmails = profiles.reduce((acc, profile) => {
            if (profile.id && profile.email) {
              acc[profile.id] = profile.email;
            }
            return acc;
          }, {} as Record<string, string>);

          apiLogger.info('Fetched user emails from profiles', {
            requestId,
            userIdsCount: userIds.length,
            profilesFound: profiles.length
          });
        } else {
          apiLogger.warn("Failed to fetch user emails from profiles", { 
            error: profilesError, 
            requestId 
          });
        }
      } catch (error) {
        apiLogger.warn("Failed to fetch user emails", { error, requestId });
        // Continue without user emails if fetch fails
      }
    }

    // Enrich schemas with user email
    const enrichedSchemas = (schemas || []).map((schema: any) => ({
      ...schema,
      user: schema.user_id && userEmails[schema.user_id]
        ? { email: userEmails[schema.user_id] }
        : undefined
    }));

    apiLogger.info('GET /api/schemas completed', {
      requestId,
      count: enrichedSchemas.length,
      hasPagination: !!backendResponse.pagination
    });

    // Return paginated response if backend provided pagination metadata, otherwise return array for backward compatibility
    if (hasPaginationParams && backendResponse.pagination) {
      return NextResponse.json({
        data: enrichedSchemas,
        pagination: backendResponse.pagination
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    // Backward compatibility: return array format when no pagination params
    return NextResponse.json(enrichedSchemas, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });

  } catch (error) {
    apiLogger.error("GET /api/schemas failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch schemas",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/schemas - Create a new extraction schema
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/schemas started', { requestId });

    // Validate request body
    const body = await request.json();
    const validated = validateRequestBody(createSchemaRequestSchema, body);

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Check if a schema with the same name already exists
    const { data: existingSchema, error: checkError } = await supabase
      .from('extraction_schemas')
      .select('id, name')
      .eq('name', validated.name)
      .maybeSingle();

    if (checkError) {
      apiLogger.error("Failed to check for existing schema", checkError, {
        requestId,
        schemaName: validated.name
      });
      throw new DatabaseError(
        `Failed to check for existing schema: ${checkError.message}`,
        { originalError: checkError.message }
      );
    }

    if (existingSchema) {
      apiLogger.warn("Schema with duplicate name attempted", {
        requestId,
        schemaName: validated.name,
        existingSchemaId: existingSchema.id
      });
      throw new ValidationError(
        `A schema with the name "${validated.name}" already exists. Please choose a different name.`,
        { schemaName: validated.name, existingSchemaId: existingSchema.id }
      );
    }

    // Ensure text is stored as object (parse if string)
    const textData = typeof validated.text === 'string'
      ? JSON.parse(validated.text)
      : validated.text;

    // Insert into extraction_schemas table
    const now = new Date().toISOString();
    const { data: schema, error: insertError } = await supabase
      .from('extraction_schemas')
      .insert({
        name: validated.name,
        description: validated.description || null,
        category: validated.category,
        type: validated.type,
        text: textData,
        dates: validated.dates || {},
        status: validated.status || 'published', // Default to published when saving
        is_verified: validated.is_verified || false,
        user_id: userData.user.id,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) {
      apiLogger.error("Failed to create schema", insertError, {
        requestId,
        schemaName: validated.name
      });
      throw new DatabaseError(
        `Failed to create schema: ${insertError.message}`,
        { originalError: insertError.message }
      );
    }

    apiLogger.info('POST /api/schemas completed', {
      requestId,
      schemaId: schema.id,
      schemaName: schema.name
    });

    return NextResponse.json(schema, { status: 201 });

  } catch (error) {
    apiLogger.error("POST /api/schemas failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to create schema",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/schemas?id=<uuid> - Update an existing schema
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('PUT /api/schemas started', { requestId });

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const { id } = validateQueryParams(schemaIdQuerySchema, {
      id: searchParams.get("id")
    });

    // Validate request body
    const body = await request.json();
    const validated = validateRequestBody(updateSchemaRequestSchema, body);

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Update extraction_schemas table
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    // Only include fields that are provided
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.category !== undefined) updateData.category = validated.category;
    if (validated.type !== undefined) updateData.type = validated.type;
    if (validated.text !== undefined) {
      // Ensure text is stored as object (parse if string)
      updateData.text = typeof validated.text === 'string'
        ? JSON.parse(validated.text)
        : validated.text;
    }
    if (validated.dates !== undefined) updateData.dates = validated.dates;
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.is_verified !== undefined) updateData.is_verified = validated.is_verified;

    // First, check if the schema exists
    const { data: existingSchema, error: fetchError } = await supabase
      .from('extraction_schemas')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingSchema) {
      throw new SchemaNotFoundError(id);
    }

    // Check ownership: if schema has a user_id, it must match the current user
    if (existingSchema.user_id && existingSchema.user_id !== userData.user.id) {
      apiLogger.warn("User attempted to update schema they don't own", {
        requestId,
        schemaId: id,
        schemaOwner: existingSchema.user_id,
        currentUser: userData.user.id
      });
      throw new AppError(
        "You don't have permission to update this schema",
        ErrorCode.FORBIDDEN,
        403,
        { schemaId: id }
      );
    }

    // Update the schema - no user_id filter needed since we've already verified ownership
    const { data: schema, error: updateError } = await supabase
      .from('extraction_schemas')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      apiLogger.error("Failed to update schema", updateError, {
        requestId,
        schemaId: id,
        errorCode: (updateError as any).code
      });

      // PGRST116 means the query returned 0 rows - likely RLS policy blocked the update
      if ((updateError as any).code === 'PGRST116') {
        throw new AppError(
          "Unable to update schema. You may not have permission to modify this schema.",
          ErrorCode.FORBIDDEN,
          403,
          { schemaId: id, hint: "The schema may belong to another user or your session may have expired." }
        );
      }

      throw new DatabaseError(
        `Failed to update schema: ${updateError.message}`,
        { originalError: updateError.message, schemaId: id }
      );
    }

    if (!schema) {
      throw new SchemaNotFoundError(id);
    }

    apiLogger.info('PUT /api/schemas completed', {
      requestId,
      schemaId: id
    });

    return NextResponse.json(schema);

  } catch (error) {
    apiLogger.error("PUT /api/schemas failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to update schema",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/schemas?id=<uuid> - Delete a schema
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('DELETE /api/schemas started', { requestId });

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const { id } = validateQueryParams(schemaIdQuerySchema, {
      id: searchParams.get("id")
    });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Check if schema is being used in any active extraction jobs
    const { data: usageCheck, error: usageError } = await supabase
      .from('extraction_jobs')
      .select('id, job_id, status')
      .eq('schema_id', id)
      .limit(5);

    if (usageError) {
      apiLogger.error("Usage check failed", usageError, {
        requestId,
        schemaId: id
      });
      // Continue with deletion even if usage check fails
    } else if (usageCheck && usageCheck.length > 0) {
      const activeJobs = usageCheck.filter(
        (job: { status: string }) =>
          job.status === 'PENDING' || job.status === 'PROCESSING'
      );

      if (activeJobs.length > 0) {
        apiLogger.warn("Cannot delete schema with active jobs", {
          requestId,
          schemaId: id,
          activeJobsCount: activeJobs.length
        });

        throw new ValidationError(
          "Cannot delete schema: it is currently being used in active extraction jobs",
          {
            schemaId: id,
            activeJobs: activeJobs.length,
            totalUsage: usageCheck.length
          }
        );
      }

      // Warn about historical usage but allow deletion
      apiLogger.warn("Deleting schema with historical usage", {
        requestId,
        schemaId: id,
        usageCount: usageCheck.length
      });
    }

    // Check if schema exists and get its user_id
    const { data: schemaToDelete, error: fetchError } = await supabase
      .from('extraction_schemas')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !schemaToDelete) {
      throw new SchemaNotFoundError(id);
    }

    // Check ownership: if schema has a user_id, it must match the current user
    if (schemaToDelete.user_id && schemaToDelete.user_id !== userData.user.id) {
      apiLogger.warn("User attempted to delete schema they don't own", {
        requestId,
        schemaId: id,
        schemaOwner: schemaToDelete.user_id,
        currentUser: userData.user.id
      });
      throw new AppError(
        "You don't have permission to delete this schema",
        ErrorCode.FORBIDDEN,
        403,
        { schemaId: id }
      );
    }

    // Delete from extraction_schemas table - no user_id filter needed since we've verified ownership
    const { error: deleteError } = await supabase
      .from('extraction_schemas')
      .delete()
      .eq('id', id);

    if (deleteError) {
      apiLogger.error("Failed to delete schema", deleteError, {
        requestId,
        schemaId: id
      });
      throw new DatabaseError(
        `Failed to delete schema: ${deleteError.message}`,
        { originalError: deleteError.message, schemaId: id }
      );
    }

    const message = usageCheck && usageCheck.length > 0
      ? `Schema deleted. It was used in ${usageCheck.length} past extraction(s).`
      : "Schema deleted successfully";

    apiLogger.info('DELETE /api/schemas completed', {
      requestId,
      schemaId: id,
      hadUsage: !!usageCheck?.length
    });

    return NextResponse.json({
      success: true,
      message
    });

  } catch (error) {
    apiLogger.error("DELETE /api/schemas failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to delete schema",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
