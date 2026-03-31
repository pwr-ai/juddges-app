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
import { GET, POST, PUT, DELETE } from "@/app/api/schemas/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const SCHEMA_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function mockSupabaseAuth(userId: string | null) {
  const chainableResult = (data: unknown, error: unknown = null) => ({
    data,
    error,
  });

  const makeSingleChain = (data: unknown, error: unknown = null) => ({
    single: jest.fn().mockResolvedValue(chainableResult(data, error)),
  });

  const makeEqChain = (data: unknown, error: unknown = null) => ({
    eq: jest.fn().mockReturnValue(makeSingleChain(data, error)),
  });

  const makeSelectChain = (data: unknown, error: unknown = null) => ({
    select: jest.fn().mockReturnValue(makeEqChain(data, error)),
  });

  const insertChain = {
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: {
          id: SCHEMA_ID,
          name: "Test Schema",
          description: "desc",
          category: "legal",
          type: "extraction",
          text: {},
          status: "published",
          is_verified: false,
          user_id: userId,
        },
        error: null,
      }),
    }),
  };

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error("not authed"),
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: jest.fn().mockReturnValue(insertChain),
      update: jest.fn().mockReturnValue(makeSelectChain({ id: SCHEMA_ID, name: "Updated" })),
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };

  (createClient as jest.Mock).mockResolvedValue(supabase);
  return supabase;
}

describe("GET /api/schemas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/schemas")
    );

    expect(response.status).toBe(401);
  });

  it("fetches schemas from backend and enriches with user emails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // Mock user_profiles lookup
    const profilesResult = { data: [{ id: USER_ID, email: "user@test.com" }], error: null };
    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue(profilesResult),
          }),
        };
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
      json: async () => [
        { id: SCHEMA_ID, name: "Test", user_id: USER_ID },
      ],
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/schemas")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].user).toEqual({ email: "user@test.com" });
  });

  it("returns paginated response when pagination params provided", async () => {
    const supabase = mockSupabaseAuth(USER_ID);
    supabase.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: SCHEMA_ID, name: "Test" }],
        pagination: { page: 1, page_size: 10, total: 1 },
      }),
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/schemas?page=1&pageSize=10")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.pagination).toBeDefined();
  });

  it("passes correct pagination params to backend", async () => {
    const supabase = mockSupabaseAuth(USER_ID);
    supabase.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await GET(
      new NextRequest("http://localhost:3000/api/schemas?page=2&pageSize=25")
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("page=2&page_size=25"),
      expect.anything()
    );
  });

  it("returns error when backend fails", async () => {
    mockSupabaseAuth(USER_ID);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/schemas")
    );

    expect(response.status).toBe(503);
  });

  it("returns error when BACKEND_API_KEY is not set", async () => {
    delete process.env.BACKEND_API_KEY;
    mockSupabaseAuth(USER_ID);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/schemas")
    );

    expect(response.status).toBe(500);
  });
});

describe("POST /api/schemas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/schemas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Test",
          category: "legal",
          type: "extraction",
          text: '{"fields": []}',
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("creates a schema and returns 201", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // Schema duplicate check: no existing
    const maybeSingleMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const eqNameMock = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectNameMock = jest.fn().mockReturnValue({ eq: eqNameMock });

    // Insert chain
    const insertSingleMock = jest.fn().mockResolvedValue({
      data: {
        id: SCHEMA_ID,
        name: "New Schema",
        description: "A test schema",
        category: "legal",
        type: "extraction",
        text: { fields: [] },
        status: "published",
        is_verified: false,
        user_id: USER_ID,
      },
      error: null,
    });
    const insertSelectMock = jest.fn().mockReturnValue({ single: insertSingleMock });
    const insertMock = jest.fn().mockReturnValue({ select: insertSelectMock });

    supabase.from = jest.fn().mockReturnValue({
      select: selectNameMock,
      insert: insertMock,
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/schemas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "New Schema",
          description: "A test schema",
          category: "legal",
          type: "extraction",
          text: '{"fields": []}',
        }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe("New Schema");
  });

  it("returns 400 when schema with same name exists", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const maybeSingleMock = jest.fn().mockResolvedValue({
      data: { id: "existing-id", name: "Duplicate" },
      error: null,
    });
    const eqNameMock = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectNameMock = jest.fn().mockReturnValue({ eq: eqNameMock });

    supabase.from = jest.fn().mockReturnValue({
      select: selectNameMock,
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/schemas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Duplicate",
          category: "legal",
          type: "extraction",
          text: '{"fields": []}',
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("PUT /api/schemas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/schemas?id=${SCHEMA_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when id query param is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PUT(
      new NextRequest("http://localhost:3000/api/schemas", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when schema does not exist", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // Schema existence check returns null
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    const eqMock = jest.fn().mockReturnValue({ single: singleMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

    supabase.from = jest.fn().mockReturnValue({
      select: selectMock,
    });

    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/schemas?id=${SCHEMA_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when user does not own the schema", async () => {
    const supabase = mockSupabaseAuth(USER_ID);
    const OTHER_USER = "99999999-8888-4777-8666-555555555555";

    // Schema existence check returns schema owned by another user
    const singleMock = jest.fn().mockResolvedValue({
      data: { id: SCHEMA_ID, user_id: OTHER_USER },
      error: null,
    });
    const eqMock = jest.fn().mockReturnValue({ single: singleMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

    supabase.from = jest.fn().mockReturnValue({
      select: selectMock,
    });

    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/schemas?id=${SCHEMA_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/schemas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/schemas?id=${SCHEMA_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when id query param is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/schemas", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
  });

  it("deletes a schema owned by the user", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // usage check (extraction_jobs) - no active jobs
    const usageCheckResult = { data: [], error: null };
    const limitMock = jest.fn().mockResolvedValue(usageCheckResult);
    const usageEqMock = jest.fn().mockReturnValue({ limit: limitMock });
    const usageSelectMock = jest.fn().mockReturnValue({ eq: usageEqMock });

    // schema fetch
    const schemaSingleMock = jest.fn().mockResolvedValue({
      data: { id: SCHEMA_ID, user_id: USER_ID },
      error: null,
    });
    const schemaEqMock = jest.fn().mockReturnValue({ single: schemaSingleMock });
    const schemaSelectMock = jest.fn().mockReturnValue({ eq: schemaEqMock });

    // delete
    const deleteEqMock = jest.fn().mockResolvedValue({ error: null });
    const deleteMock = jest.fn().mockReturnValue({ eq: deleteEqMock });

    let fromCallCount = 0;
    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "extraction_jobs") {
        return { select: usageSelectMock };
      }
      if (table === "extraction_schemas") {
        fromCallCount++;
        if (fromCallCount <= 1) {
          return { select: schemaSelectMock };
        }
        return { delete: deleteMock };
      }
      return {};
    });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/schemas?id=${SCHEMA_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 400 when schema has active extraction jobs", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // usage check returns active jobs
    const usageCheckResult = {
      data: [{ id: "job-1", job_id: "j1", status: "PENDING" }],
      error: null,
    };
    const limitMock = jest.fn().mockResolvedValue(usageCheckResult);
    const usageEqMock = jest.fn().mockReturnValue({ limit: limitMock });
    const usageSelectMock = jest.fn().mockReturnValue({ eq: usageEqMock });

    supabase.from = jest.fn().mockReturnValue({
      select: usageSelectMock,
    });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/schemas?id=${SCHEMA_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 403 when user does not own the schema", async () => {
    const supabase = mockSupabaseAuth(USER_ID);
    const OTHER_USER = "99999999-8888-4777-8666-555555555555";

    // usage check - no active jobs
    const limitMock = jest.fn().mockResolvedValue({ data: [], error: null });
    const usageEqMock = jest.fn().mockReturnValue({ limit: limitMock });
    const usageSelectMock = jest.fn().mockReturnValue({ eq: usageEqMock });

    // schema fetch - owned by another user
    const schemaSingleMock = jest.fn().mockResolvedValue({
      data: { id: SCHEMA_ID, user_id: OTHER_USER },
      error: null,
    });
    const schemaEqMock = jest.fn().mockReturnValue({ single: schemaSingleMock });
    const schemaSelectMock = jest.fn().mockReturnValue({ eq: schemaEqMock });

    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "extraction_jobs") {
        return { select: usageSelectMock };
      }
      return { select: schemaSelectMock };
    });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/schemas?id=${SCHEMA_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(403);
  });
});
