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

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET, PUT, DELETE } from "@/app/api/collections/[id]/route";

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

function makeGetRequest(collectionId: string, params?: Record<string, string>) {
  const url = new URL(`http://localhost:3000/api/collections/${collectionId}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url.toString());
}

function makePutRequest(collectionId: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/collections/${collectionId}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeDeleteRequest(collectionId: string) {
  return new NextRequest(
    `http://localhost:3000/api/collections/${collectionId}`,
    { method: "DELETE" }
  );
}

describe("GET /api/collections/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://backend:8000";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(401);
  });

  it("fetches collection from backend", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: COLLECTION_ID,
        name: "Test Collection",
        document_count: 10,
      }),
    });

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Test Collection");

    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:8004/collections/${COLLECTION_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
      })
    );
  });

  it("forwards pagination params to backend", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: COLLECTION_ID }),
    });

    await GET(makeGetRequest(COLLECTION_ID, { limit: "20", offset: "10" }));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("limit=20"),
      expect.anything()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("offset=10"),
      expect.anything()
    );
  });

  it("returns 404 when collection is not found", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(404);
  });

  it("returns backend error status on other failures", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
    });

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(503);
  });

  it("returns 500 on fetch transport error", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(500);
  });
});

describe("PUT /api/collections/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://backend:8000";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await PUT(
      makePutRequest(COLLECTION_ID, { name: "Updated" })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PUT(
      makePutRequest(COLLECTION_ID, {})
    );

    expect(response.status).toBe(400);
  });

  it("updates collection name via backend", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: COLLECTION_ID,
        name: "Renamed Collection",
      }),
    });

    const response = await PUT(
      makePutRequest(COLLECTION_ID, { name: "Renamed Collection" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Renamed Collection");

    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:8004/collections/${COLLECTION_ID}`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
        body: JSON.stringify({ name: "Renamed Collection" }),
      })
    );
  });

  it("forwards description to backend when provided", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: COLLECTION_ID,
        name: "Renamed",
        description: "New description",
      }),
    });

    const response = await PUT(
      makePutRequest(COLLECTION_ID, {
        name: "Renamed",
        description: "New description",
      })
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:8004/collections/${COLLECTION_ID}`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Renamed", description: "New description" }),
      })
    );
  });

  it("forwards explicit null description to clear the field", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: COLLECTION_ID, name: "Renamed", description: null }),
    });

    await PUT(
      makePutRequest(COLLECTION_ID, { name: "Renamed", description: null })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ name: "Renamed", description: null }),
      })
    );
  });

  it("returns 404 when collection is not found", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const response = await PUT(
      makePutRequest(COLLECTION_ID, { name: "Updated" })
    );

    expect(response.status).toBe(404);
  });

  it("returns backend error status on other failures", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const response = await PUT(
      makePutRequest(COLLECTION_ID, { name: "Updated" })
    );

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/collections/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://backend:8000";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await DELETE(makeDeleteRequest(COLLECTION_ID));

    expect(response.status).toBe(401);
  });

  it("deletes collection via backend", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const response = await DELETE(makeDeleteRequest(COLLECTION_ID));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toBe("Collection deleted successfully");

    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:8004/collections/${COLLECTION_ID}`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
      })
    );
  });

  it("returns 404 when collection is not found", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const response = await DELETE(makeDeleteRequest(COLLECTION_ID));

    expect(response.status).toBe(404);
  });

  it("returns backend error status on other failures", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
    });

    const response = await DELETE(makeDeleteRequest(COLLECTION_ID));

    expect(response.status).toBe(503);
  });

  it("returns 500 on fetch transport error", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await DELETE(makeDeleteRequest(COLLECTION_ID));

    expect(response.status).toBe(500);
  });
});
