/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/lib/supabase/server");

global.fetch = jest.fn();

import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "@/app/api/collections/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const COLLECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/collections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/collections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("fetches collections from backend with auth headers", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: COLLECTION_ID, name: "Test", documents: [] }],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Test");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8004/collections",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
      })
    );
  });

  it("forwards backend error status", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const response = await GET();

    expect(response.status).toBe(503);
  });
});

describe("POST /api/collections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await POST(makePostRequest({ name: "Crime" }));

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await POST(makePostRequest({}));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/name/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates collection via backend with auth headers", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: COLLECTION_ID,
        user_id: USER_ID,
        name: "Crime",
        description: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
      }),
    });

    const response = await POST(
      makePostRequest({ name: "Crime", description: "test" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Crime");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8004/collections",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
        body: JSON.stringify({ name: "Crime", description: "test" }),
      })
    );
  });

  it("surfaces backend FastAPI 'detail' error message on failure", async () => {
    mockSupabaseAuth(USER_ID);

    const detail =
      "Database error: Could not find the table 'public.collections' in the schema cache";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ detail }),
    });

    const response = await POST(makePostRequest({ name: "Crime" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe(detail);
  });

  it("falls back to generic message when backend body is unparseable", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "",
    });

    const response = await POST(makePostRequest({ name: "Crime" }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Failed to create collection");
  });

  it("returns 500 on fetch transport error", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await POST(makePostRequest({ name: "Crime" }));

    expect(response.status).toBe(500);
  });
});
