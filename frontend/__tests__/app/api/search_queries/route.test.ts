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
import { createClient } from "@/lib/supabase/server";
import { GET, POST, PUT, DELETE } from "@/app/api/search_queries/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const QUERY_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

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

describe("GET /api/search_queries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search_queries")
    );

    expect(response.status).toBe(401);
  });

  it("returns search queries for authenticated user", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const orderMock = jest.fn().mockResolvedValue({
      data: [{ id: QUERY_ID, query: "test query", user_id: USER_ID }],
      error: null,
    });
    const eqMock = jest.fn().mockReturnValue({ order: orderMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

    supabase.from = jest.fn().mockReturnValue({ select: selectMock });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search_queries")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(QUERY_ID);
  });

  it("returns empty array when user has no queries", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const orderMock = jest.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = jest.fn().mockReturnValue({ order: orderMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

    supabase.from = jest.fn().mockReturnValue({ select: selectMock });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search_queries")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it("returns 503 when database query fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const orderMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    const eqMock = jest.fn().mockReturnValue({ order: orderMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

    supabase.from = jest.fn().mockReturnValue({ select: selectMock });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search_queries")
    );

    expect(response.status).toBe(503);
  });
});

describe("POST /api/search_queries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/search_queries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "test" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("creates a search query and returns data", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: { id: QUERY_ID, query: "test query", user_id: USER_ID },
      error: null,
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    supabase.from = jest.fn().mockReturnValue({ insert: insertMock });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/search_queries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: USER_ID, query: "test query" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(QUERY_ID);
  });

  it("returns 400 when request body validation fails", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/search_queries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}), // missing required fields
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 503 when database insert fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "Insert failed" },
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    supabase.from = jest.fn().mockReturnValue({ insert: insertMock });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/search_queries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: USER_ID, query: "valid query" }),
      })
    );

    expect(response.status).toBe(503);
  });
});

describe("PUT /api/search_queries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/search_queries?id=${QUERY_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when id query param is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PUT(
      new NextRequest("http://localhost:3000/api/search_queries", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "updated" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("updates a search query successfully", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: { id: QUERY_ID, query: "updated query" },
      error: null,
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const userEqMock = jest.fn().mockReturnValue({ select: selectMock });
    const idEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const updateMock = jest.fn().mockReturnValue({ eq: idEqMock });

    supabase.from = jest.fn().mockReturnValue({ update: updateMock });

    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/search_queries?id=${QUERY_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "updated query" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.query).toBe("updated query");
  });

  it("returns 404 when query not found", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const userEqMock = jest.fn().mockReturnValue({ select: selectMock });
    const idEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const updateMock = jest.fn().mockReturnValue({ eq: idEqMock });

    supabase.from = jest.fn().mockReturnValue({ update: updateMock });

    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/search_queries?id=${QUERY_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "updated" }),
      })
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/search_queries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/search_queries?id=${QUERY_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/search_queries", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
  });

  it("deletes a search query successfully", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const userEqMock = jest.fn().mockResolvedValue({ error: null });
    const idEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const deleteMock = jest.fn().mockReturnValue({ eq: idEqMock });

    supabase.from = jest.fn().mockReturnValue({ delete: deleteMock });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/search_queries?id=${QUERY_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 503 when deletion fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const userEqMock = jest.fn().mockResolvedValue({
      error: { message: "Delete failed" },
    });
    const idEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const deleteMock = jest.fn().mockReturnValue({ eq: idEqMock });

    supabase.from = jest.fn().mockReturnValue({ delete: deleteMock });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/search_queries?id=${QUERY_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(503);
  });
});
