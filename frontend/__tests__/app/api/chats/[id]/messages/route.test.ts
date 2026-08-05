/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("@/lib/supabase/server");

import { NextRequest } from "next/server";
import { GET } from "@/app/api/chats/[id]/messages/route";
import { createClient } from "@/lib/supabase/server";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const CHAT_ID = "11111111-2222-4333-8444-555555555555";

type QueryResult<T> = {
  data: T;
  error: { code?: string; message: string } | null;
};

function abortableResult<T>(
  signal: AbortSignal,
  result: QueryResult<T>,
  waitForAbort: boolean,
): Promise<QueryResult<T>> {
  if (!waitForAbort) return Promise.resolve(result);
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}

function mockSupabase({
  userId = USER_ID,
  authError,
  chatResult = { data: { id: CHAT_ID }, error: null },
  messagesResult = {
    data: [
      {
        id: "message-1",
        role: "user",
        content: "Question",
        document_ids: [],
        created_at: "2026-08-05T10:00:00Z",
      },
    ],
    error: null,
  },
  chatTimeout = false,
  messagesTimeout = false,
}: {
  userId?: string | null;
  authError?: { message: string; status?: number };
  chatResult?: QueryResult<{ id: string } | null>;
  messagesResult?: QueryResult<Array<Record<string, unknown>> | null>;
  chatTimeout?: boolean;
  messagesTimeout?: boolean;
} = {}) {
  let chatSignal: AbortSignal | undefined;
  const chatMaybeSingle = jest.fn(() => {
    if (!chatSignal) throw new Error("Chat query did not receive an abort signal");
    return abortableResult(chatSignal, chatResult, chatTimeout);
  });
  const chatAbortSignal = jest.fn((signal: AbortSignal) => {
    chatSignal = signal;
    return { maybeSingle: chatMaybeSingle };
  });
  const chatSingle = jest.fn(() => {
    if (chatTimeout) return Promise.reject(new DOMException("Timed out", "TimeoutError"));
    return Promise.resolve(chatResult);
  });
  const chatUserEq = jest.fn(() => ({
    abortSignal: chatAbortSignal,
    single: chatSingle,
  }));
  const chatIdEq = jest.fn(() => ({ eq: chatUserEq }));

  const messagesAbortSignal = jest.fn((signal: AbortSignal) =>
    abortableResult(signal, messagesResult, messagesTimeout),
  );
  // The current route awaits `.order()` directly. The fixed route attaches an
  // abort signal first. Supporting both makes the RED failure behavioral.
  const messagesBuilder = {
    abortSignal: messagesAbortSignal,
    then: <TResult1 = QueryResult<Array<Record<string, unknown>> | null>, TResult2 = never>(
      onfulfilled?: ((value: QueryResult<Array<Record<string, unknown>> | null>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => {
      const legacyResult = messagesTimeout
        ? Promise.reject(new DOMException("Timed out", "TimeoutError"))
        : Promise.resolve(messagesResult);
      return legacyResult.then(onfulfilled, onrejected);
    },
  };
  const messagesOrder = jest.fn(() => messagesBuilder);
  const messagesUserEq = jest.fn(() => ({ order: messagesOrder }));
  const messagesChatEq = jest.fn(() => ({ eq: messagesUserEq }));

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: authError ?? (userId ? null : { message: "Auth session missing!" }),
      }),
    },
    from: jest.fn((table: string) => ({
      select: jest.fn(() =>
        table === "chats" ? { eq: chatIdEq } : { eq: messagesChatEq },
      ),
    })),
  };
  (createClient as jest.Mock).mockResolvedValue(supabase);

  return { chatAbortSignal, from: supabase.from, messagesAbortSignal };
}

async function requestMessages(chatId = CHAT_ID): Promise<Response> {
  return GET(
    new NextRequest(`http://localhost:3000/api/chats/${chatId}/messages`),
    { params: Promise.resolve({ id: chatId }) },
  );
}

describe("GET /api/chats/[id]/messages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("returns 401 for an anonymous request", async () => {
    mockSupabase({ userId: null });

    await expect(requestMessages()).resolves.toMatchObject({ status: 401 });
  });

  it("returns 503 when authentication verification fails upstream", async () => {
    mockSupabase({
      userId: null,
      authError: { message: "authentication service unavailable", status: 503 },
    });

    await expect(requestMessages()).resolves.toMatchObject({ status: 503 });
  });

  it("returns 400 for an invalid id without issuing a PostgREST query", async () => {
    const { from } = mockSupabase();

    const response = await requestMessages("not-a-uuid");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid chat ID format",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns messages for the owner", async () => {
    const { chatAbortSignal, messagesAbortSignal } = mockSupabase();

    const response = await requestMessages();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ id: "message-1", content: "Question" }),
    ]);
    expect(chatAbortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(messagesAbortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it.each(["missing", "owned by another user and hidden by RLS"])(
    "returns the same 404 contract when the chat is %s",
    async () => {
      mockSupabase({ chatResult: { data: null, error: null } });

      const response = await requestMessages();

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        code: "CHAT_NOT_FOUND",
        message: "Chat not found",
      });
    },
  );

  it("returns 503 rather than 404 when access verification hits a database error", async () => {
    mockSupabase({
      chatResult: {
        data: null,
        error: { code: "XX000", message: "database unavailable" },
      },
    });

    await expect(requestMessages()).resolves.toMatchObject({ status: 503 });
  });

  it("returns 503 when loading messages hits a database error", async () => {
    mockSupabase({
      messagesResult: {
        data: null,
        error: { code: "XX000", message: "database unavailable" },
      },
    });

    await expect(requestMessages()).resolves.toMatchObject({ status: 503 });
  });

  it("returns 504 when access verification times out", async () => {
    jest.useFakeTimers();
    mockSupabase({ chatTimeout: true });

    const responsePromise = requestMessages();
    await jest.runAllTimersAsync();

    await expect(responsePromise).resolves.toMatchObject({ status: 504 });
  });

  it("returns 504 when loading messages times out", async () => {
    jest.useFakeTimers();
    mockSupabase({ messagesTimeout: true });

    const responsePromise = requestMessages();
    await jest.runAllTimersAsync();

    await expect(responsePromise).resolves.toMatchObject({ status: 504 });
  });
});
