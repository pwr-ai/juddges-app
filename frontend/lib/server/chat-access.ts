import { AppError, DatabaseError, ErrorCode } from "@/lib/errors";
import type { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const DEFAULT_CHAT_LOOKUP_TIMEOUT_MS = 8_000;
const chatIdSchema = z.string().uuid();

export type ChatAccessSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type OwnedChatAccess =
  | { kind: "anonymous" }
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "owner"; userId: string };

type ResolveChatAccessOptions = {
  timeoutMs?: number;
};

function chatLookupTimeout(): AppError {
  return new AppError(
    "Chat lookup timed out",
    ErrorCode.DATABASE_UNAVAILABLE,
    504,
  );
}

export function isValidChatId(chatId: string): boolean {
  return chatIdSchema.safeParse(chatId).success;
}

function isAnonymousAuthError(error: { message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.message === "Auth session missing!" ||
    error.message?.includes("refresh_token_not_found") === true
  );
}

export async function runChatQueryWithTimeout<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = DEFAULT_CHAT_LOOKUP_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutReason = new DOMException("Chat lookup timed out", "TimeoutError");
  const timeout = setTimeout(() => controller.abort(timeoutReason), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === timeoutReason) {
      throw chatLookupTimeout();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveOwnedChatAccess(
  supabase: ChatAccessSupabaseClient,
  chatId: string,
  { timeoutMs = DEFAULT_CHAT_LOOKUP_TIMEOUT_MS }: ResolveChatAccessOptions = {},
): Promise<OwnedChatAccess> {
  let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    authResult = await supabase.auth.getUser();
  } catch {
    throw new DatabaseError("Failed to verify authentication");
  }

  const {
    data: { user },
    error: authError,
  } = authResult;

  if (authError && !isAnonymousAuthError(authError)) {
    throw new DatabaseError("Failed to verify authentication", {
      authStatus: authError.status,
    });
  }

  if (!user) return { kind: "anonymous" };
  if (!isValidChatId(chatId)) return { kind: "invalid_id" };

  try {
    const { data: chat, error } = await runChatQueryWithTimeout(
      (signal) =>
        supabase
          .from("chats")
          .select("id")
          .eq("id", chatId)
          .eq("user_id", user.id)
          .abortSignal(signal)
          .maybeSingle(),
      timeoutMs,
    );

    if (error?.code === "PGRST116") return { kind: "not_found" };
    if (error) {
      throw new DatabaseError("Failed to verify chat access", {
        originalError: error.message,
      });
    }
    if (!chat) return { kind: "not_found" };

    return { kind: "owner", userId: user.id };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new DatabaseError("Failed to verify chat access");
  }
}
