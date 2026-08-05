/**
 * @jest-environment node
 */

import {
  resolveOwnedChatAccess,
  type ChatAccessSupabaseClient,
} from "@/lib/server/chat-access";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const CHAT_ID = "11111111-2222-4333-8444-555555555555";

type ChatQueryResult = {
  data: { id: string } | null;
  error: { code?: string; message: string } | null;
};

function mockSupabase({
  userId = USER_ID,
  authError,
  result = { data: { id: CHAT_ID }, error: null },
  waitForAbort = false,
}: {
  userId?: string | null;
  authError?: { message: string; status?: number };
  result?: ChatQueryResult;
  waitForAbort?: boolean;
} = {}) {
  let querySignal: AbortSignal | undefined;

  const maybeSingle = jest.fn(() => {
    if (!waitForAbort) return Promise.resolve(result);

    return new Promise<ChatQueryResult>((_resolve, reject) => {
      querySignal?.addEventListener(
        "abort",
        () => reject(querySignal?.reason ?? new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  });
  const abortSignal = jest.fn((signal: AbortSignal) => {
    querySignal = signal;
    return { maybeSingle };
  });
  const userEq = jest.fn(() => ({ abortSignal }));
  const chatEq = jest.fn(() => ({ eq: userEq }));
  const select = jest.fn(() => ({ eq: chatEq }));
  const from = jest.fn(() => ({ select }));
  const getUser = jest.fn().mockResolvedValue({
      data: { user: userId ? { id: userId } : null },
      error: authError ?? (userId ? null : { message: "Auth session missing!" }),
  });

  return {
    client: { auth: { getUser }, from } as unknown as ChatAccessSupabaseClient,
    abortSignal,
    chatEq,
    from,
    maybeSingle,
    userEq,
  };
}

describe("resolveOwnedChatAccess", () => {
  it("returns anonymous without querying chats when there is no user", async () => {
    const { client, from } = mockSupabase({ userId: null });

    await expect(resolveOwnedChatAccess(client, CHAT_ID)).resolves.toEqual({
      kind: "anonymous",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps an authentication upstream failure distinct from anonymous", async () => {
    const { client, from } = mockSupabase({
      userId: null,
      authError: { message: "authentication service unavailable", status: 503 },
    });

    await expect(resolveOwnedChatAccess(client, CHAT_ID)).rejects.toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      statusCode: 503,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an invalid chat id before issuing a PostgREST query", async () => {
    const { client, from } = mockSupabase();

    await expect(resolveOwnedChatAccess(client, "not-a-uuid")).resolves.toEqual({
      kind: "invalid_id",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns owner only for a row scoped by both chat and user id", async () => {
    const { client, chatEq, userEq } = mockSupabase();

    await expect(resolveOwnedChatAccess(client, CHAT_ID)).resolves.toEqual({
      kind: "owner",
      userId: USER_ID,
    });
    expect(chatEq).toHaveBeenCalledWith("id", CHAT_ID);
    expect(userEq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it.each(["missing chat", "chat hidden by RLS for another user"])(
    "returns the same not-found result for %s",
    async () => {
      const { client } = mockSupabase({ result: { data: null, error: null } });

      await expect(resolveOwnedChatAccess(client, CHAT_ID)).resolves.toEqual({
        kind: "not_found",
      });
    },
  );

  it("keeps a database failure distinct from not found", async () => {
    const { client } = mockSupabase({
      result: {
        data: null,
        error: { code: "XX000", message: "database unavailable" },
      },
    });

    await expect(resolveOwnedChatAccess(client, CHAT_ID)).rejects.toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("aborts a stalled lookup and reports a timeout instead of not found", async () => {
    const { client, abortSignal } = mockSupabase({ waitForAbort: true });

    await expect(
      resolveOwnedChatAccess(client, CHAT_ID, { timeoutMs: 5 }),
    ).rejects.toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      statusCode: 504,
    });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
});
