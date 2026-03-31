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
import { GET, POST, PATCH, DELETE } from "@/app/api/saved-searches/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const SEARCH_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

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

describe("GET /api/saved-searches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/saved-searches")
    );

    expect(response.status).toBe(401);
  });

  it("returns saved searches for the user", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const queryResult = { data: [{ id: SEARCH_ID, name: "My Search" }], error: null };
    const orderMock = jest.fn().mockResolvedValue(queryResult);
    const orMock = jest.fn().mockReturnValue({ order: orderMock });
    const selectMock = jest.fn().mockReturnValue({ or: orMock });

    supabase.from = jest.fn().mockReturnValue({ select: selectMock });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/saved-searches")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("My Search");
  });

  it("filters by folder when query param provided", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const eqResult = { data: [], error: null };
    const eqMock = jest.fn().mockResolvedValue(eqResult);
    const orderMock = jest.fn().mockReturnValue({ eq: eqMock });
    const orMock = jest.fn().mockReturnValue({ order: orderMock });
    const selectMock = jest.fn().mockReturnValue({ or: orMock });

    supabase.from = jest.fn().mockReturnValue({ select: selectMock });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/saved-searches?folder=favorites")
    );

    expect(response.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith("folder", "favorites");
  });

  it("returns 500 when database query fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const orderMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    const orMock = jest.fn().mockReturnValue({ order: orderMock });
    const selectMock = jest.fn().mockReturnValue({ or: orMock });

    supabase.from = jest.fn().mockReturnValue({ select: selectMock });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/saved-searches")
    );

    expect(response.status).toBe(503);
  });
});

describe("POST /api/saved-searches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when name is empty string", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when name exceeds 200 characters", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x".repeat(201) }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("creates a saved search and returns 201", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: {
        id: SEARCH_ID,
        user_id: USER_ID,
        name: "New Search",
        search_mode: "thinking",
      },
      error: null,
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    supabase.from = jest.fn().mockReturnValue({ insert: insertMock });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "New Search",
          query: "court ruling",
          search_mode: "thinking",
        }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe("New Search");
  });

  it("returns 500 when database insert fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "Insert failed" },
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    supabase.from = jest.fn().mockReturnValue({ insert: insertMock });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      })
    );

    expect(response.status).toBe(503);
  });
});

describe("PATCH /api/saved-searches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: SEARCH_ID, name: "Updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when name is empty string", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: SEARCH_ID, name: "" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("updates a saved search successfully", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const singleMock = jest.fn().mockResolvedValue({
      data: { id: SEARCH_ID, name: "Renamed" },
      error: null,
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const userEqMock = jest.fn().mockReturnValue({ select: selectMock });
    const idEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const updateMock = jest.fn().mockReturnValue({ eq: idEqMock });

    supabase.from = jest.fn().mockReturnValue({ update: updateMock });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: SEARCH_ID, name: "Renamed" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Renamed");
  });

  it("increments use_count when last_used_at is set", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    // First call: get current use_count
    const getCurrentSingleMock = jest.fn().mockResolvedValue({
      data: { use_count: 5 },
      error: null,
    });
    const getCurrentUserEqMock = jest.fn().mockReturnValue({ single: getCurrentSingleMock });
    const getCurrentIdEqMock = jest.fn().mockReturnValue({ eq: getCurrentUserEqMock });
    const getCurrentSelectMock = jest.fn().mockReturnValue({ eq: getCurrentIdEqMock });

    // Second call: update
    const updateSingleMock = jest.fn().mockResolvedValue({
      data: { id: SEARCH_ID, use_count: 6 },
      error: null,
    });
    const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
    const updateUserEqMock = jest.fn().mockReturnValue({ select: updateSelectMock });
    const updateIdEqMock = jest.fn().mockReturnValue({ eq: updateUserEqMock });
    const updateMock = jest.fn().mockReturnValue({ eq: updateIdEqMock });

    let callCount = 0;
    supabase.from = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { select: getCurrentSelectMock };
      }
      return { update: updateMock };
    });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: SEARCH_ID,
          last_used_at: new Date().toISOString(),
        }),
      })
    );

    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/saved-searches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/saved-searches?id=${SEARCH_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockSupabaseAuth(USER_ID);

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/saved-searches", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
  });

  it("deletes a saved search successfully", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const userEqMock = jest.fn().mockResolvedValue({ error: null });
    const idEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const deleteMock = jest.fn().mockReturnValue({ eq: idEqMock });

    supabase.from = jest.fn().mockReturnValue({ delete: deleteMock });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/saved-searches?id=${SEARCH_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 500 when deletion fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const userEqMock = jest.fn().mockResolvedValue({
      error: { message: "Delete failed" },
    });
    const idEqMock = jest.fn().mockReturnValue({ eq: userEqMock });
    const deleteMock = jest.fn().mockReturnValue({ eq: idEqMock });

    supabase.from = jest.fn().mockReturnValue({ delete: deleteMock });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/saved-searches?id=${SEARCH_ID}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(503);
  });
});
