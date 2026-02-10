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
import { invalidateChatsCache } from '@/lib/cache/chats';

const apiLogger = logger.child('chat-fork-api');

/**
 * POST /api/chats/[id]/fork - Fork a conversation from a specific message
 * Creates a new chat with messages up to (and including) the specified message.
 * Body: { messageId?: string } - If no messageId, copies all messages.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const { id: sourceChatId } = await params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sourceChatId)) {
      throw new ValidationError("Invalid chat ID format");
    }

    apiLogger.info('POST /api/chats/[id]/fork started', {
      requestId,
      sourceChatId
    });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { messageId } = body;

    // Validate messageId UUID format if provided
    if (messageId && !uuidRegex.test(messageId)) {
      throw new ValidationError("Invalid message ID format");
    }

    // Verify source chat belongs to user
    const { data: sourceChat, error: chatError } = await supabase
      .from("chats")
      .select("id, title")
      .eq("id", sourceChatId)
      .eq("user_id", user.id)
      .single();

    if (chatError || !sourceChat) {
      throw new AppError(
        "Source chat not found",
        ErrorCode.CHAT_NOT_FOUND,
        404,
        { chatId: sourceChatId }
      );
    }

    // Fetch messages from source chat
    const { data: sourceMessages, error: messagesError } = await supabase
      .from("messages")
      .select("id, role, content, document_ids, created_at")
      .eq("chat_id", sourceChatId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw new DatabaseError(
        "Failed to fetch source chat messages",
        { originalError: messagesError.message, chatId: sourceChatId }
      );
    }

    if (!sourceMessages || sourceMessages.length === 0) {
      throw new AppError(
        "Source chat has no messages to fork",
        ErrorCode.VALIDATION_ERROR,
        400,
        { chatId: sourceChatId }
      );
    }

    // Determine which messages to copy
    let messagesToCopy = sourceMessages;
    if (messageId) {
      const messageIndex = sourceMessages.findIndex((m: any) => m.id === messageId);
      if (messageIndex === -1) {
        throw new AppError(
          "Message not found in source chat",
          ErrorCode.NOT_FOUND,
          404,
          { messageId, chatId: sourceChatId }
        );
      }
      messagesToCopy = sourceMessages.slice(0, messageIndex + 1);
    }

    // Create the forked chat
    const newChatId = crypto.randomUUID();
    const now = new Date().toISOString();
    const forkTitle = sourceChat.title
      ? `${sourceChat.title} (fork)`
      : "Forked conversation";

    const { data: newChat, error: createError } = await supabase
      .from("chats")
      .insert({
        id: newChatId,
        user_id: user.id,
        title: forkTitle,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (createError) {
      throw new DatabaseError(
        "Failed to create forked chat",
        { originalError: createError.message }
      );
    }

    // Copy messages to new chat with new IDs
    const newMessages = messagesToCopy.map((msg: any) => ({
      id: crypto.randomUUID(),
      chat_id: newChatId,
      user_id: user.id,
      role: msg.role,
      content: msg.content,
      document_ids: msg.document_ids,
      created_at: msg.created_at,
    }));

    const { error: insertError } = await supabase
      .from("messages")
      .insert(newMessages);

    if (insertError) {
      // Clean up the created chat if message insertion fails
      await supabase.from("chats").delete().eq("id", newChatId);
      throw new DatabaseError(
        "Failed to copy messages to forked chat",
        { originalError: insertError.message }
      );
    }

    // Invalidate cache so the new forked chat appears in the list
    invalidateChatsCache(user.id);

    apiLogger.info('POST /api/chats/[id]/fork completed', {
      requestId,
      sourceChatId,
      newChatId,
      userId: user.id,
      messagesCopied: newMessages.length,
      forkedFromMessage: messageId || 'all'
    });

    return NextResponse.json({
      ...newChat,
      messageCount: newMessages.length,
      forkedFrom: sourceChatId,
    }, { status: 201 });

  } catch (error) {
    apiLogger.error("POST /api/chats/[id]/fork failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fork chat",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
