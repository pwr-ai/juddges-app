import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  DatabaseError,
  ValidationError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('saved-searches-api');

/**
 * GET /api/saved-searches - Fetch all saved searches for the current user
 * Supports optional folder filtering via ?folder=<name>
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder");

    let query = supabase
      .from("saved_searches")
      .select("*")
      .or(`user_id.eq.${user.id},is_shared.eq.true`)
      .order("updated_at", { ascending: false });

    if (folder) {
      query = query.eq("folder", folder);
    }

    const { data: searches, error: searchError } = await query;

    if (searchError) {
      apiLogger.error("Failed to fetch saved searches", searchError, { requestId });
      throw new DatabaseError("Failed to fetch saved searches", { originalError: searchError.message });
    }

    return NextResponse.json(searches || []);

  } catch (error) {
    apiLogger.error("GET /api/saved-searches failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to fetch saved searches", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/saved-searches - Create a new saved search
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json().catch(() => ({}));
    const { name, description, folder, query: searchQuery, search_config, document_types, languages, search_mode, is_shared } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError("Name is required");
    }

    if (name.length > 200) {
      throw new ValidationError("Name must be 200 characters or fewer");
    }

    const { data: savedSearch, error: insertError } = await supabase
      .from("saved_searches")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description || null,
        folder: folder || null,
        query: searchQuery || '',
        search_config: search_config || {},
        document_types: document_types || [],
        languages: languages || [],
        search_mode: search_mode || 'thinking',
        is_shared: is_shared || false,
      })
      .select()
      .single();

    if (insertError) {
      apiLogger.error("Failed to create saved search", insertError, { requestId });
      throw new DatabaseError("Failed to create saved search", { originalError: insertError.message });
    }

    apiLogger.info('POST /api/saved-searches completed', { requestId, searchId: savedSearch.id });

    return NextResponse.json(savedSearch, { status: 201 });

  } catch (error) {
    apiLogger.error("POST /api/saved-searches failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to create saved search", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/saved-searches - Update a saved search
 * Body: { id: string, ...updates }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json().catch(() => ({}));
    const { id, ...updates } = body;

    if (!id || typeof id !== 'string') {
      throw new ValidationError("Saved search ID is required");
    }

    if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length === 0)) {
      throw new ValidationError("Name must be a non-empty string");
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.folder !== undefined) updateData.folder = updates.folder;
    if (updates.query !== undefined) updateData.query = updates.query;
    if (updates.search_config !== undefined) updateData.search_config = updates.search_config;
    if (updates.document_types !== undefined) updateData.document_types = updates.document_types;
    if (updates.languages !== undefined) updateData.languages = updates.languages;
    if (updates.search_mode !== undefined) updateData.search_mode = updates.search_mode;
    if (updates.is_shared !== undefined) updateData.is_shared = updates.is_shared;

    // Handle usage tracking: when last_used_at is set, increment use_count
    if (updates.last_used_at !== undefined) {
      updateData.last_used_at = updates.last_used_at;
      // Fetch current use_count and increment
      const { data: current } = await supabase
        .from("saved_searches")
        .select("use_count")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      updateData.use_count = (current?.use_count || 0) + 1;
    }

    const { data: savedSearch, error: updateError } = await supabase
      .from("saved_searches")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      apiLogger.error("Failed to update saved search", updateError, { requestId });
      throw new DatabaseError("Failed to update saved search", { originalError: updateError.message });
    }

    return NextResponse.json(savedSearch);

  } catch (error) {
    apiLogger.error("PATCH /api/saved-searches failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to update saved search", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/saved-searches?id=<search_id> - Delete a saved search
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      throw new ValidationError("Saved search ID is required");
    }

    const { error: deleteError } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      apiLogger.error("Failed to delete saved search", deleteError, { requestId });
      throw new DatabaseError("Failed to delete saved search", { originalError: deleteError.message });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    apiLogger.error("DELETE /api/saved-searches failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to delete saved search", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}
