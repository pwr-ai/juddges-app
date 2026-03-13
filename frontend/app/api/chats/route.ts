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
import { z } from 'zod';
import { validateQueryParams } from '@/lib/validation/schemas';
import {
  getCacheKey,
  getCachedChats,
  setCachedChats,
  invalidateChatsCache,
  generateETag,
} from '@/lib/cache/chats';

const apiLogger = logger.child('chats-api');

const chatIdQuerySchema = z.object({
  id: z.string().uuid('Invalid chat ID format')
});

/**
 * GET /api/chats - Fetch all chats for the current user
 * Optimized with single query (no N+1 problem) and caching
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/chats started', { requestId });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const cacheKey = getCacheKey(user.id);

    // Check if client wants to bypass cache (e.g., after deletion)
    const bypassCache = request.headers.get('Cache-Control') === 'no-cache' ||
      request.headers.get('Pragma') === 'no-cache';

    // Check cache first (unless bypassing)
    if (!bypassCache) {
      const cachedData = getCachedChats<unknown[]>(cacheKey);
      if (cachedData) {
        const etag = generateETag(cachedData);
        const ifNoneMatch = request.headers.get("if-none-match");

        // Return 304 Not Modified if ETag matches
        if (ifNoneMatch === etag) {
          return new NextResponse(null, { status: 304 });
        }

        apiLogger.info('GET /api/chats completed (cache hit)', {
          requestId,
          userId: user.id,
          chatCount: cachedData.length
        });

        return NextResponse.json(cachedData, {
          headers: {
            'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
            'ETag': etag,
          },
        });
      }
    } else {
      // If bypassing cache, remove any existing cache entry
      invalidateChatsCache(user.id);
      apiLogger.info('GET /api/chats bypassing cache', { requestId, userId: user.id });
    }

    // Get query parameters for pagination
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100); // Max 100

    // OPTIMIZED: Fetch chats first
    const { data: chats, error: chatsError } = await supabase
      .from("chats")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (chatsError) {
      apiLogger.error("Failed to fetch chats", chatsError, {
        requestId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to fetch chats",
        { originalError: chatsError.message }
      );
    }

    if (!chats || chats.length === 0) {
      // No chats, return empty array
      const emptyResult: any[] = [];
      setCachedChats(cacheKey, emptyResult);
      const etag = generateETag(emptyResult);

      return NextResponse.json(emptyResult, {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
          'ETag': etag,
        },
      });
    }

    // OPTIMIZED: Fetch first user message for all chats in a single query
    // Using a single query with IN clause instead of N separate queries
    const chatIds = chats.map((chat: { id: string }) => chat.id);

    // Use RPC or a single query to get first messages
    // For now, we'll use a more efficient approach: fetch all first messages in one query
    // by using DISTINCT ON or a window function approach
    const { data: firstMessages, error: messagesError } = await supabase
      .from("messages")
      .select("chat_id, content")
      .in("chat_id", chatIds)
      .eq("role", "user")
      .order("chat_id", { ascending: true })
      .order("created_at", { ascending: true });

    if (messagesError) {
      apiLogger.warn("Failed to fetch first messages (non-critical)", {
        requestId,
        userId: user.id,
        error: messagesError
      });
      // Non-critical error - continue without first messages
    }

    // Create a map of chat_id -> first message content
    // Since messages are ordered by chat_id and created_at ASC, first message per chat_id is the first one we encounter
    const firstMessageMap = new Map<string, string>();
    if (firstMessages) {
      firstMessages.forEach((msg: any) => {
        if (!firstMessageMap.has(msg.chat_id)) {
          firstMessageMap.set(msg.chat_id, msg.content);
        }
      });
    }

    // Combine chats with their first messages
    const chatsWithPreviews = chats.map((chat: any) => ({
      ...chat,
      firstMessage: firstMessageMap.get(chat.id) || null
    }));

    // Store in cache (cleanup is handled by setCachedChats)
    setCachedChats(cacheKey, chatsWithPreviews);

    const etag = generateETag(chatsWithPreviews);

    apiLogger.info('GET /api/chats completed', {
      requestId,
      userId: user.id,
      chatCount: chatsWithPreviews.length
    });

    return NextResponse.json(chatsWithPreviews, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        'ETag': etag,
      },
    });

  } catch (error) {
    apiLogger.error("GET /api/chats failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch chats",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/chats - Create a new chat
 * Used for restoring deleted chats or creating chats with initial data
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/chats started', { requestId });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { title, firstMessage } = body;

    // Create new chat
    const newChatId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .insert({
        id: newChatId,
        user_id: user.id,
        title: title || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (chatError) {
      apiLogger.error("Failed to create chat", chatError, {
        requestId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to create chat",
        { originalError: chatError.message }
      );
    }

    // If firstMessage is provided, create it as the first user message
    if (firstMessage && chat) {
      const { error: messageError } = await supabase
        .from("messages")
        .insert({
          id: crypto.randomUUID(),
          chat_id: chat.id,
          user_id: user.id,
          role: "user",
          content: firstMessage,
          created_at: now,
        });

      if (messageError) {
        apiLogger.warn("Failed to create first message (non-critical)", {
          requestId,
          chatId: chat.id,
          error: messageError
        });
        // Don't fail the whole request if message creation fails
      }
    }

    // Invalidate cache for this user
    invalidateChatsCache(user.id);

    apiLogger.info('POST /api/chats completed', {
      requestId,
      chatId: chat.id,
      userId: user.id,
      hasFirstMessage: !!firstMessage
    });

    return NextResponse.json(chat, { status: 201 });

  } catch (error) {
    apiLogger.error("POST /api/chats failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to create chat",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/chats - Rename a chat
 * Body: { id: string, title: string }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('PATCH /api/chats started', { requestId });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const { id: chatId, title } = body;

    if (!chatId || typeof chatId !== 'string') {
      throw new ValidationError("Chat ID is required");
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(chatId)) {
      throw new ValidationError("Invalid chat ID format");
    }

    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new ValidationError("Title must be a non-empty string");
    }

    if (title.length > 200) {
      throw new ValidationError("Title must be 200 characters or fewer");
    }

    // Update the chat title
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .update({
        title: title.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (chatError) {
      apiLogger.error("Failed to rename chat", chatError, {
        requestId,
        chatId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to rename chat",
        { originalError: chatError.message, chatId }
      );
    }

    if (!chat) {
      throw new AppError(
        "Chat not found",
        ErrorCode.CHAT_NOT_FOUND,
        404,
        { chatId }
      );
    }

    // Invalidate cache for this user
    invalidateChatsCache(user.id);

    apiLogger.info('PATCH /api/chats completed', {
      requestId,
      chatId,
      userId: user.id,
      newTitle: title.trim()
    });

    return NextResponse.json(chat);

  } catch (error) {
    apiLogger.error("PATCH /api/chats failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to rename chat",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chats?id=<chat_id> - Delete a specific chat and its messages
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('DELETE /api/chats started', { requestId });

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const { id: chatId } = validateQueryParams(chatIdQuerySchema, {
      id: searchParams.get("id")
    });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Delete all messages associated with this chat
    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("chat_id", chatId)
      .eq("user_id", user.id);

    if (messagesError) {
      apiLogger.error("Failed to delete messages", messagesError, {
        requestId,
        chatId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to delete chat messages",
        { originalError: messagesError.message, chatId }
      );
    }

    // Delete the chat itself
    const { error: chatError } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId)
      .eq("user_id", user.id);

    if (chatError) {
      apiLogger.error("Failed to delete chat", chatError, {
        requestId,
        chatId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to delete chat",
        { originalError: chatError.message, chatId }
      );
    }

    // Invalidate cache for this user
    invalidateChatsCache(user.id);

    apiLogger.info('DELETE /api/chats completed', {
      requestId,
      chatId,
      userId: user.id
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    apiLogger.error("DELETE /api/chats failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to delete chat",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
