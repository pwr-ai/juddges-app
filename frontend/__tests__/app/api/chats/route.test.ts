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

jest.mock("@/lib/cache/chats", () => ({
  getCacheKey: jest.fn((userId: string) => `chats:${userId}`),
  getCachedChats: jest.fn().mockReturnValue(null),
  setCachedChats: jest.fn(),
  invalidateChatsCache: jest.fn(),
  generateETag: jest.fn().mockReturnValue('"etag-value"'),
}));

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedChats } from "@/lib/cache/chats";
import { GET, POST, PATCH, DELETE } from "@/app/api/chats/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const CHAT_ID = "11111111-2222-4333-8444-555555555555";

function mockSupabaseAuth(userId: string | null) {
  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error("not authed"),
      }),
    },
    from: jest.fn(),
  };

  (createClient as jest.Mock).mockResolvedValue(supabase);
  return supabase;
}

describe("GET /api/chats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCachedChats as jest.Mock).mockReturnValue(null);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/chats")
    );

    expect(response.status).toBe(401);
  });

  it("returns cached data when available", async () => {
    mockSupabaseAuth(USER_ID);
    const cachedChats = [{ id: CHAT_ID, title: "Cached" }];
    (getCachedChats as jest.Mock).mockReturnValue(cachedChats);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/chats")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(cachedChats);
  });

  it("returns 304 when ETag matches", async () => {
    mockSupabaseAuth(USER_ID);
    const cachedChats = [{ id: CHAT_ID, title: "Cached" }];
    (getCachedChats as jest.Mock).mockReturnValue(cachedChats);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/chats", {
        headers: { "if-none-match": '"etag-value"' },
      })
    );

    expect(response.status).toBe(304);
  });

  it("fetches chats from Supabase when cache is empty", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // chats query
    const chatsLimitMock = jest.fn().mockResolvedValue({
      data: [{ id: CHAT_ID, title: "Chat 1", created_at: "2026-01-01", updated_at: "2026-01-01" }],
      error: null,
    });
    const chatsOrderMock = jest.fn().mockReturnValue({ limit: chatsLimitMock });
    const chatsEqMock = jest.fn().mockReturnValue({ order: chatsOrderMock });
    const chatsSelectMock = jest.fn().mockReturnValue({ eq: chatsEqMock });

    // messages query
    const messagesOrderMock2 = jest.fn().mockResolvedValue({
      data: [{ chat_id: CHAT_ID, content: "Hello" }],
      error: null,
    });
    const messagesOrderMock1 = jest.fn().mockReturnValue({ order: messagesOrderMock2 });
    const messagesEqMock = jest.fn().mockReturnValue({ order: messagesOrderMock1 });
    const messagesInMock = jest.fn().mockReturnValue({ eq: messagesEqMock });
    const messagesSelectMock = jest.fn().mockReturnValue({ in: messagesInMock });

    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "chats") {
        return { select: chatsSelectMock };
      }
      if (table === "messages") {
        return { select: messagesSelectMock };
      }
      return {};
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/chats")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(CHAT_ID);
    expect(body[0].firstMessage).toBe("Hello");
  });

  it("returns empty array when user has no chats", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const chatsLimitMock = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const chatsOrderMock = jest.fn().mockReturnValue({ limit: chatsLimitMock });
    const chatsEqMock = jest.fn().mockReturnValue({ order: chatsOrderMock });
    const chatsSelectMock = jest.fn().mockReturnValue({ eq: chatsEqMock });

    supabase.from = jest.fn().mockReturnValue({
      select: chatsSelectMock,
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/chats")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it("returns 500 when database query fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const chatsLimitMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    const chatsOrderMock = jest.fn().mockReturnValue({ limit: chatsLimitMock });
    const chatsEqMock = jest.fn().mockReturnValue({ order: chatsOrderMock });
    const chatsSelectMock = jest.fn().mockReturnValue({ eq: chatsEqMock });

    supabase.from = jest.fn().mockReturnValue({
      select: chatsSelectMock,
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/chats")
    );

    expect(response.status).toBe(503);
  });
});

describe("POST /api/chats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(401);
  });

  it("creates a new chat and returns 201", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: { id: CHAT_ID, user_id: USER_ID, title: "My Chat" },
      error: null,
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    supabase.from = jest.fn().mockReturnValue({
      insert: insertMock,
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "My Chat" }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe(CHAT_ID);
  });

  it("creates a chat with first message when provided", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const chatSingleMock = jest.fn().mockResolvedValue({
      data: { id: CHAT_ID, user_id: USER_ID, title: null },
      error: null,
    });
    const chatSelectMock = jest.fn().mockReturnValue({ single: chatSingleMock });
    const chatInsertMock = jest.fn().mockReturnValue({ select: chatSelectMock });

    const messageInsertMock = jest.fn().mockResolvedValue({ error: null });

    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "chats") {
        return { insert: chatInsertMock };
      }
      if (table === "messages") {
        return { insert: messageInsertMock };
      }
      return {};
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstMessage: "Hello there" }),
      })
    );

    expect(response.status).toBe(201);
    expect(messageInsertMock).toHaveBeenCalled();
  });

  it("returns 503 when chat creation fails in database", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "Insert failed" },
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    supabase.from = jest.fn().mockReturnValue({
      insert: insertMock,
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      })
    );

    expect(response.status).toBe(503);
  });
});

describe("PATCH /api/chats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: CHAT_ID, title: "New Title" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when chat ID is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "New Title" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when chat ID has invalid UUID format", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "not-a-uuid", title: "New Title" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when title is empty", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: CHAT_ID, title: "" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when title exceeds 200 characters", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: CHAT_ID, title: "x".repeat(201) }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("renames a chat successfully", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: { id: CHAT_ID, title: "Renamed Chat" },
      error: null,
    });
    const userEqMock = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: singleMock }) });
    const chatEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const updateMock = jest.fn().mockReturnValue({ eq: chatEqMock });

    supabase.from = jest.fn().mockReturnValue({
      update: updateMock,
    });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: CHAT_ID, title: "Renamed Chat" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe("Renamed Chat");
  });
});

describe("DELETE /api/chats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/chats?id=${CHAT_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/chats", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when id is not a valid UUID", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/chats?id=not-valid", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
  });

  it("deletes messages and chat successfully", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const messagesDeleteEq2 = jest.fn().mockResolvedValue({ error: null });
    const messagesDeleteEq1 = jest.fn().mockReturnValue({ eq: messagesDeleteEq2 });
    const messagesDeleteMock = jest.fn().mockReturnValue({ eq: messagesDeleteEq1 });

    const chatDeleteEq2 = jest.fn().mockResolvedValue({ error: null });
    const chatDeleteEq1 = jest.fn().mockReturnValue({ eq: chatDeleteEq2 });
    const chatDeleteMock = jest.fn().mockReturnValue({ eq: chatDeleteEq1 });

    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "messages") {
        return { delete: messagesDeleteMock };
      }
      if (table === "chats") {
        return { delete: chatDeleteMock };
      }
      return {};
    });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/chats?id=${CHAT_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 503 when message deletion fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const messagesDeleteEq2 = jest.fn().mockResolvedValue({
      error: { message: "Delete failed" },
    });
    const messagesDeleteEq1 = jest.fn().mockReturnValue({ eq: messagesDeleteEq2 });
    const messagesDeleteMock = jest.fn().mockReturnValue({ eq: messagesDeleteEq1 });

    supabase.from = jest.fn().mockReturnValue({
      delete: messagesDeleteMock,
    });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/chats?id=${CHAT_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(503);
  });
});
