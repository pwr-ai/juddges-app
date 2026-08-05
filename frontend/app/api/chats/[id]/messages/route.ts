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
import {
  resolveOwnedChatAccess,
  runChatQueryWithTimeout,
} from "@/lib/server/chat-access";

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

    const access = await resolveOwnedChatAccess(supabase, chatId);
    if (access.kind === "anonymous") {
      throw new UnauthorizedError("Authentication required");
    }
    if (access.kind === "invalid_id") {
      throw new ValidationError("Invalid chat ID format");
    }
    if (access.kind === "not_found") {
      apiLogger.warn("Chat not found or unauthorized", {
        requestId,
        chatId,
        userId: "authenticated",
      });
      throw new AppError(
        "Chat not found",
        ErrorCode.CHAT_NOT_FOUND,
        404,
      );
    }

    // Fetch messages for the chat
    const { data: messages, error: messagesError } = await runChatQueryWithTimeout(
      (signal) =>
        supabase
          .from("messages")
          .select("id, role, content, document_ids, created_at")
          .eq("chat_id", chatId)
          .eq("user_id", access.userId)
          .order("created_at", { ascending: true })
          .abortSignal(signal),
    );

    if (messagesError) {
      apiLogger.error("Failed to fetch messages", messagesError, {
        requestId,
        chatId,
        userId: access.userId
      });
      throw new DatabaseError(
        "Failed to fetch chat messages",
        { originalError: messagesError.message, chatId }
      );
    }

    apiLogger.info('GET /api/chats/[id]/messages completed', {
      requestId,
      chatId,
      userId: access.userId,
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
