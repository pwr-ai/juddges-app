/** @jest-environment node */

import {
  SchemaDetailNotFoundError,
  SchemaDetailUpstreamError,
  fetchSchemaDetail,
} from "@/lib/server/schema-detail";

const ID = "11111111-1111-4111-8111-111111111111";
const visibleSchema = {
  id: ID,
  name: "Contract schema",
  description: null,
  type: "legal",
  category: "contract",
  text: { type: "object", properties: {} },
  dates: {},
  status: "published",
  is_verified: false,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  user_id: "owner-1",
};

describe("fetchSchemaDetail", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("queries the RLS-scoped row once with the verified bearer token", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify([visibleSchema]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(fetchSchemaDetail(ID, "verified-token")).resolves.toEqual(visibleSchema);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/rest\/v1\/extraction_schemas\?/),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer verified-token" }),
      })
    );
  });

  it.each([[], null])("maps a missing or RLS-hidden row to not found", async (body) => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 })
    );
    await expect(fetchSchemaDetail(ID, "token")).rejects.toBeInstanceOf(
      SchemaDetailNotFoundError
    );
  });

  it.each([
    [401, 401, "upstream_auth"],
    [403, 403, "upstream_auth"],
    [500, 500, "upstream"],
    [503, 503, "upstream"],
  ])("preserves upstream %i as %i", async (upstream, expected, reason) => {
    global.fetch = jest.fn().mockResolvedValue(new Response("failed", { status: upstream }));
    await expect(fetchSchemaDetail(ID, "token")).rejects.toMatchObject({
      statusCode: expected,
      reason,
    });
  });

  it.each([
    ["not-json", 502],
    [JSON.stringify({ unexpected: true }), 502],
    [JSON.stringify([{ ...visibleSchema, id: "22222222-2222-4222-8222-222222222222" }]), 502],
  ])("rejects malformed upstream payloads", async (body, statusCode) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 200 }));
    await expect(fetchSchemaDetail(ID, "token")).rejects.toMatchObject({
      statusCode,
      reason: "malformed",
    });
  });

  it("keeps timeout distinct from transport failure", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    global.fetch = jest.fn().mockRejectedValue(timeout);
    await expect(fetchSchemaDetail(ID, "token")).rejects.toMatchObject({
      statusCode: 504,
      reason: "timeout",
    });

    global.fetch = jest.fn().mockRejectedValue(new TypeError("connection refused"));
    await expect(fetchSchemaDetail(ID, "token")).rejects.toMatchObject({
      statusCode: 503,
      reason: "transport",
    });
  });

  it("rejects a noncanonical ID before any upstream request", async () => {
    global.fetch = jest.fn();
    await expect(fetchSchemaDetail(`${ID}.css`, "token")).rejects.toBeInstanceOf(
      SchemaDetailNotFoundError
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
