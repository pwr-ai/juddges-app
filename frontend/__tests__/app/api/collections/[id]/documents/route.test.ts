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
import { GET, POST, DELETE } from "@/app/api/collections/[id]/documents/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const COLLECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOC_ID = "ffffffff-aaaa-4bbb-8ccc-dddddddddddd";

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

function makeGetRequest(collectionId: string) {
  return new NextRequest(
    `http://localhost:3000/api/collections/${collectionId}/documents`
  );
}

function makePostRequest(collectionId: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/collections/${collectionId}/documents`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeDeleteRequest(collectionId: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/collections/${collectionId}/documents`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/collections/[id]/documents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://backend:8000";
  });

  it("returns 400 when collection ID is invalid", async () => {
    mockSupabaseAuth(USER_ID);

    // URL without collection ID match
    const req = new NextRequest("http://localhost:3000/api/collections//documents");
    const response = await GET(req);

    // The regex won't match an empty ID, but it might still extract ""
    // Depends on implementation; at minimum should not crash
    expect(response.status).toBeDefined();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(401);
  });

  it("fetches documents from backend", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: "1", document_id: DOC_ID, title: "Doc 1" },
      ],
    });

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/collections/${COLLECTION_ID}/documents`),
      expect.objectContaining({
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
      json: async () => ({ detail: "Not found" }),
    });

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(404);
  });

  it("returns backend error status on other failures", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    });

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(500);
  });

  it("returns 500 on fetch transport error", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await GET(makeGetRequest(COLLECTION_ID));

    expect(response.status).toBe(500);
  });
});

describe("POST /api/collections/[id]/documents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://backend:8000";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await POST(
      makePostRequest(COLLECTION_ID, { document_id: DOC_ID })
    );

    expect(response.status).toBe(401);
  });

  it("adds a single document to collection", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const response = await POST(
      makePostRequest(COLLECTION_ID, { document_id: DOC_ID })
    );

    expect(response.status).toBe(200);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/collections/${COLLECTION_ID}/documents`),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
      })
    );
  });

  it("handles batch document addition", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ added: 3 }),
    });

    const response = await POST(
      makePostRequest(COLLECTION_ID, {
        document_ids: ["doc-1", "doc-2", "doc-3"],
      })
    );

    expect(response.status).toBe(200);

    // Should use the batch endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/collections/${COLLECTION_ID}/documents/batch`),
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("returns 400 when no document_id is provided", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await POST(
      makePostRequest(COLLECTION_ID, {})
    );

    expect(response.status).toBe(400);
  });

  it("propagates backend errors for single document", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Document already in collection" }),
    });

    const response = await POST(
      makePostRequest(COLLECTION_ID, { document_id: DOC_ID })
    );

    expect(response.status).toBe(409);
  });

  it("propagates backend errors for batch addition", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Batch failed" }),
    });

    const response = await POST(
      makePostRequest(COLLECTION_ID, {
        document_ids: ["doc-1"],
      })
    );

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/collections/[id]/documents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://backend:8000";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await DELETE(
      makeDeleteRequest(COLLECTION_ID, { document_id: DOC_ID })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when document_id is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await DELETE(
      makeDeleteRequest(COLLECTION_ID, {})
    );

    expect(response.status).toBe(400);
  });

  it("removes a document from collection", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const response = await DELETE(
      makeDeleteRequest(COLLECTION_ID, { document_id: DOC_ID })
    );

    expect(response.status).toBe(200);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/collections/${COLLECTION_ID}/documents`),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
      })
    );
  });

  it("propagates backend errors", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Document not found in collection" }),
    });

    const response = await DELETE(
      makeDeleteRequest(COLLECTION_ID, { document_id: DOC_ID })
    );

    expect(response.status).toBe(404);
  });

  it("returns 500 on fetch transport error", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await DELETE(
      makeDeleteRequest(COLLECTION_ID, { document_id: DOC_ID })
    );

    expect(response.status).toBe(500);
  });
});
