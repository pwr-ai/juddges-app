/**
 * @jest-environment node
 */

// Mock logger before any imports that use it
jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock Supabase server client
jest.mock("@/lib/supabase/server");

// Mock cache module used indirectly
jest.mock("@/lib/cache/chats", () => ({
  getCacheKey: jest.fn(),
  getCachedChats: jest.fn(),
  setCachedChats: jest.fn(),
  invalidateChatsCache: jest.fn(),
  generateETag: jest.fn(),
}));

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET, POST, DELETE } from "@/app/api/extractions/route";

// ----- helpers -----

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const JOB_ID = "22222222-3333-4444-8555-666666666666";
const COLLECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SCHEMA_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC_ID_1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeee001";

function mockSupabaseAuth(userId: string | null) {
  const fromMock = jest.fn().mockReturnValue({
    insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: {}, error: null }) }) }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: [{ status: "PENDING" }], error: null }),
      }),
    }),
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { collection_id: COLLECTION_ID, schema_id: SCHEMA_ID }, error: null }),
      }),
    }),
  });

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error("not authed"),
      }),
    },
    from: fromMock,
  };

  (createClient as jest.Mock).mockResolvedValue(supabase);
  return supabase;
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/extractions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(jobId: string) {
  return new NextRequest(`http://localhost:3000/api/extractions?job_id=${jobId}`);
}

function makeDeleteRequest(jobId: string) {
  return new NextRequest(`http://localhost:3000/api/extractions?job_id=${jobId}`, {
    method: "DELETE",
  });
}

// ----- tests -----

describe("POST /api/extractions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await POST(
      makePostRequest({
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        document_ids: [DOC_ID_1],
        extraction_context: "Extract info",
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when required fields are missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await POST(
      makePostRequest({ collection_id: COLLECTION_ID })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("calls backend and returns job_id on success", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: JOB_ID,
        status: "PENDING",
        message: "Job created",
      }),
    });

    const response = await POST(
      makePostRequest({
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        document_ids: [DOC_ID_1],
        extraction_context: "Extract legal data",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job_id).toBe(JOB_ID);
    expect(body.status).toBe("PENDING");

    // Verify the backend was called with correct payload
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8004/extractions/db",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("fetches documents from backend when document_ids not provided", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // First call: fetch documents from collection
    // Second call: start extraction
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ document_id: DOC_ID_1 }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job_id: JOB_ID,
          status: "PENDING",
          message: "Job created",
        }),
      });

    const response = await POST(
      makePostRequest({
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        extraction_context: "Extract data",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job_id).toBe(JOB_ID);

    // Verify documents were fetched from the collection endpoint
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      `/collections/${COLLECTION_ID}/documents`
    );
  });

  it("returns error when backend returns non-ok status", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ detail: "Invalid schema" }),
    });

    const response = await POST(
      makePostRequest({
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        document_ids: [DOC_ID_1],
        extraction_context: "Extract data",
      })
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 500 when backend returns no job_id", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "PENDING" }), // no job_id
    });

    const response = await POST(
      makePostRequest({
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        document_ids: [DOC_ID_1],
        extraction_context: "Extract data",
      })
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("returns error when collection has no documents", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [], // empty documents
    });

    const response = await POST(
      makePostRequest({
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        extraction_context: "Extract data",
      })
    );

    // Empty collection throws ValidationError inside try/catch that wraps it as DatabaseError (503)
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("includes additional_instructions when provided", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: JOB_ID,
        status: "PENDING",
      }),
    });

    await POST(
      makePostRequest({
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        document_ids: [DOC_ID_1],
        extraction_context: "Extract data",
        additional_instructions: "Focus on dates",
      })
    );

    const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(callBody.additional_instructions).toBe("Focus on dates");
  });
});

describe("GET /api/extractions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET(makeGetRequest(JOB_ID));

    expect(response.status).toBe(401);
  });

  it("returns 400 when job_id is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/extractions")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when job_id is not a valid UUID", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/extractions?job_id=not-a-uuid")
    );

    expect(response.status).toBe(400);
  });

  it("fetches job status from backend and returns results", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // Build proper chained mock for update
    const updateSelectMock = jest.fn().mockResolvedValue({
      data: [{ status: "SUCCESS" }],
      error: null,
    });
    const updateEqMock = jest.fn().mockReturnValue({ select: updateSelectMock });
    const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

    // Build chained mock for select (job record)
    const selectSingleMock = jest.fn().mockResolvedValue({
      data: { collection_id: COLLECTION_ID, schema_id: SCHEMA_ID },
      error: null,
    });
    const selectEqMock = jest.fn().mockReturnValue({ single: selectSingleMock });
    const selectMock = jest.fn().mockReturnValue({ eq: selectEqMock });

    // Build chained mock for collection name lookup
    const collectionSingleMock = jest.fn().mockResolvedValue({
      data: { name: "My Collection" },
      error: null,
    });
    const collectionEqMock = jest.fn().mockReturnValue({ single: collectionSingleMock });
    const collectionSelectMock = jest.fn().mockReturnValue({ eq: collectionEqMock });

    // Build chained mock for schema name lookup
    const schemaSingleMock = jest.fn().mockResolvedValue({
      data: { name: "My Schema" },
      error: null,
    });
    const schemaEqMock = jest.fn().mockReturnValue({ single: schemaSingleMock });
    const schemaSelectMock = jest.fn().mockReturnValue({ eq: schemaEqMock });

    let fromCallCount = 0;
    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "extraction_jobs") {
        fromCallCount++;
        // First call: update; Second call: select job record
        if (fromCallCount === 1) {
          return { update: updateMock };
        }
        return { select: selectMock };
      }
      if (table === "collections") {
        return { select: collectionSelectMock };
      }
      if (table === "extraction_schemas") {
        return { select: schemaSelectMock };
      }
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: JOB_ID,
        status: "SUCCESS",
        results: [{ status: "completed", document_id: DOC_ID_1 }],
        progress: { completed: 1, total: 1 },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:01:00Z",
      }),
    });

    const response = await GET(makeGetRequest(JOB_ID));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job_id).toBe(JOB_ID);
    expect(body.status).toBe("SUCCESS");
    expect(body.results).toHaveLength(1);
  });

  it("returns error when backend returns non-ok status", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: "Job not found" }),
    });

    const response = await GET(makeGetRequest(JOB_ID));

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/extractions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await DELETE(makeDeleteRequest(JOB_ID));

    expect(response.status).toBe(401);
  });

  it("returns 400 when job_id is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/extractions", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
  });

  it("cancels a job via backend and returns success", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        task_id: JOB_ID,
        status: "CANCELLED",
        message: "Job cancelled",
      }),
    });

    const response = await DELETE(makeDeleteRequest(JOB_ID));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("CANCELLED");

    // Verify backend was called with DELETE method
    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:8004/extractions/${JOB_ID}`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "X-User-ID": USER_ID,
        }),
      })
    );
  });

  it("returns error when backend DELETE fails", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: "Job not found" }),
    });

    const response = await DELETE(makeDeleteRequest(JOB_ID));

    expect(response.status).toBe(404);
  });

  it("returns 504 on fetch timeout", async () => {
    mockSupabaseAuth(USER_ID);

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    const response = await DELETE(makeDeleteRequest(JOB_ID));

    expect(response.status).toBe(504);
  });
});
