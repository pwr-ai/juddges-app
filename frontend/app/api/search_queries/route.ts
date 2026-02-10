import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode
} from '@/lib/errors';
import {
  createSearchQuerySchema,
  updateSearchQuerySchema,
  searchQueryIdQuerySchema,
  validateRequestBody,
  validateQueryParams
} from '@/lib/validation/schemas';

const apiLogger = logger.child('search-queries-api');

/**
 * GET /api/search_queries - Fetch all search queries for the current user
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/search_queries started', { requestId });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { data, error } = await supabase
      .from("search_queries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      apiLogger.error("Failed to fetch search queries", error, {
        requestId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to fetch search queries",
        { originalError: error.message }
      );
    }

    apiLogger.info('GET /api/search_queries completed', {
      requestId,
      userId: user.id,
      count: data?.length || 0
    });

    return NextResponse.json(data || []);
  } catch (error) {
    apiLogger.error("GET /api/search_queries failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch search queries",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/search_queries - Create a new search query
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/search_queries started', { requestId });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Validate request body
    const body = await request.json();
    const validated = validateRequestBody(createSearchQuerySchema, body);

    const now = new Date().toISOString();
    const queryWithTimestamps = {
      ...validated,
      user_id: user.id, // Ensure user_id matches authenticated user
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("search_queries")
      .insert([queryWithTimestamps])
      .select()
      .single();

    if (error) {
      apiLogger.error("Failed to create search query", error, {
        requestId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to create search query",
        { originalError: error.message }
      );
    }

    apiLogger.info('POST /api/search_queries completed', {
      requestId,
      userId: user.id,
      queryId: data.id
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("POST /api/search_queries failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to create search query",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/search_queries?id=<id> - Update an existing search query
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('PUT /api/search_queries started', { requestId });

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const { id } = validateQueryParams(searchQueryIdQuerySchema, {
      id: searchParams.get("id")
    });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Validate request body
    const body = await request.json();
    const validated = validateRequestBody(updateSearchQuerySchema, body);

    const updatedBody = {
      ...validated,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("search_queries")
      .update(updatedBody)
      .eq("id", id)
      .eq("user_id", user.id) // Ensure user owns this query
      .select()
      .single();

    if (error) {
      apiLogger.error("Failed to update search query", error, {
        requestId,
        queryId: id,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to update search query",
        { originalError: error.message, queryId: id }
      );
    }

    if (!data) {
      throw new AppError(
        "Search query not found",
        ErrorCode.NOT_FOUND,
        404,
        { queryId: id }
      );
    }

    apiLogger.info('PUT /api/search_queries completed', {
      requestId,
      queryId: id,
      userId: user.id
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("PUT /api/search_queries failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to update search query",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/search_queries?id=<id> - Delete a search query
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('DELETE /api/search_queries started', { requestId });

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const { id } = validateQueryParams(searchQueryIdQuerySchema, {
      id: searchParams.get("id")
    });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { error } = await supabase
      .from("search_queries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id); // Ensure user owns this query

    if (error) {
      apiLogger.error("Failed to delete search query", error, {
        requestId,
        queryId: id,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to delete search query",
        { originalError: error.message, queryId: id }
      );
    }

    apiLogger.info('DELETE /api/search_queries completed', {
      requestId,
      queryId: id,
      userId: user.id
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    apiLogger.error("DELETE /api/search_queries failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to delete search query",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
