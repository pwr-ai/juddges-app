import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('chat-messages-api');

/**
 * GET /api/chats/[id]/messages - Fetch all messages for a specific chat
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const { id: chatId } = await params;
    apiLogger.info('GET /api/chats/[id]/messages started', {
      requestId,
      chatId
    });

    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Verify the chat belongs to the current user
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single();

    if (chatError || !chat) {
      apiLogger.warn("Chat not found or unauthorized", {
        requestId,
        chatId,
        userId: user.id,
        error: chatError?.message
      });
      throw new AppError(
        "Chat not found",
        ErrorCode.NOT_FOUND,
        404,
        { chatId }
      );
    }

    // Fetch messages for the chat
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, role, content, document_ids, created_at")
      .eq("chat_id", chatId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      apiLogger.error("Failed to fetch messages", messagesError, {
        requestId,
        chatId,
        userId: user.id
      });
      throw new DatabaseError(
        "Failed to fetch chat messages",
        { originalError: messagesError.message, chatId }
      );
    }

    apiLogger.info('GET /api/chats/[id]/messages completed', {
      requestId,
      chatId,
      userId: user.id,
      messageCount: messages?.length || 0
    });

    return NextResponse.json(messages || []);

  } catch (error) {
    apiLogger.error("GET /api/chats/[id]/messages failed", error, {
      requestId
    });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch chat messages",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
