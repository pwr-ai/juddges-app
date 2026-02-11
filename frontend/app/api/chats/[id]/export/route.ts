import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";
import {
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode,
} from "@/lib/errors";

const apiLogger = logger.child("chat-export-api");
const backendUrl = getBackendUrl();
const apiKey = process.env.BACKEND_API_KEY || "";

/**
 * GET /api/chats/[id]/export - Fetch chat data for export (messages + source documents)
 *
 * Returns: { chat, messages, sources }
 * - chat: { id, title, created_at }
 * - messages: Array of { id, role, content, document_ids, created_at }
 * - sources: Record<document_id, { title, document_type, document_number, date_issued, summary }>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const { id: chatId } = await params;
    apiLogger.info("GET /api/chats/[id]/export started", {
      requestId,
      chatId,
    });

    const supabase = await createClient();

    // Authenticate user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Verify chat ownership and fetch chat metadata
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, title, created_at")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single();

    if (chatError || !chat) {
      throw new AppError("Chat not found", ErrorCode.NOT_FOUND, 404, {
        chatId,
      });
    }

    // Fetch all messages
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, role, content, document_ids, created_at")
      .eq("chat_id", chatId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw new DatabaseError("Failed to fetch chat messages", {
        originalError: messagesError.message,
        chatId,
      });
    }

    // Collect all unique document IDs from messages
    const allDocumentIds = new Set<string>();
    for (const msg of messages || []) {
      if (msg.document_ids && Array.isArray(msg.document_ids)) {
        for (const id of msg.document_ids) {
          allDocumentIds.add(String(id).replace(/^\/doc\//, ""));
        }
      }
    }

    // Fetch source document details if there are any
    const sources: Record<
      string,
      {
        title: string | null;
        document_type: string | null;
        document_number: string | null;
        date_issued: string | null;
        summary: string | null;
        court_name: string | null;
      }
    > = {};

    if (allDocumentIds.size > 0) {
      try {
        const docIds = Array.from(allDocumentIds);
        const response = await fetch(`${backendUrl}/documents/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "X-User-ID": user.id,
          },
          body: JSON.stringify({
            document_ids: docIds,
            return_vectors: false,
            return_properties: [
              "document_id",
              "title",
              "document_type",
              "document_number",
              "date_issued",
              "summary",
              "court_name",
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const docs = Array.isArray(data)
            ? data
            : Array.isArray(data?.documents)
              ? data.documents
              : [];

          for (const item of docs) {
            const doc = item?.document || item;
            if (doc?.document_id) {
              const cleanId = String(doc.document_id).replace(/^\/doc\//, "");
              sources[cleanId] = {
                title: doc.title || null,
                document_type: doc.document_type || null,
                document_number: doc.document_number || null,
                date_issued: doc.date_issued || null,
                summary: doc.summary || null,
                court_name: doc.court_name || null,
              };
            }
          }
        } else {
          apiLogger.warn("Failed to fetch source documents for export", {
            requestId,
            status: response.status,
          });
        }
      } catch (error) {
        // Non-fatal: export still works without source details
        apiLogger.warn("Error fetching source documents for export", {
          requestId,
          error,
        });
      }
    }

    apiLogger.info("GET /api/chats/[id]/export completed", {
      requestId,
      chatId,
      messageCount: messages?.length || 0,
      sourceCount: Object.keys(sources).length,
    });

    return NextResponse.json({
      chat,
      messages: messages || [],
      sources,
    });
  } catch (error) {
    apiLogger.error("GET /api/chats/[id]/export failed", error, {
      requestId,
    });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      new AppError(
        "Failed to export chat",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
