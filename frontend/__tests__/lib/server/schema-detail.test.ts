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
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([visibleSchema]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ email: "creator@example.test" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    await expect(fetchSchemaDetail(ID, "verified-token")).resolves.toEqual({
      ...visibleSchema,
      user: { email: "creator@example.test" },
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/rest\/v1\/extraction_schemas\?/),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer verified-token" }),
      })
    );
    const schemaUrl = new URL(
      String((global.fetch as jest.Mock).mock.calls[0][0])
    );
    expect(schemaUrl.searchParams.get("select")).toBe(
      "id,name,description,type,category,text,dates,status,is_verified,created_at,updated_at,user_id"
    );
    // Creator enrichment must hit `profiles`; `user_profiles` does not exist (#446),
    // so querying it returns 404 and the email silently never reaches the payload.
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/rest\/v1\/profiles\?/),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer verified-token" }),
      })
    );
    const profileUrl = new URL(
      String((global.fetch as jest.Mock).mock.calls[1][0])
    );
    expect(profileUrl.pathname).toBe("/rest/v1/profiles");
    expect(profileUrl.searchParams.get("select")).toBe("email");
    expect(profileUrl.searchParams.get("id")).toBe(`eq.${visibleSchema.user_id}`);
  });

  it("preserves a large legal schema but drops unselected future columns", async () => {
    const largeText = { legalDefinition: "x".repeat(147_000) };
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            ...visibleSchema,
            text: largeText,
            user_id: null,
            future_secret: "must-not-cross-the-boundary",
          },
        ]),
        { status: 200 }
      )
    );

    const result = await fetchSchemaDetail(ID, "verified-token");

    expect(result.text).toEqual(largeText);
    expect(result).not.toHaveProperty("future_secret");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Response("failed", { status: 500 }),
    new Response(JSON.stringify([]), { status: 200 }),
    new Response(JSON.stringify([{ unexpected: true }]), { status: 200 }),
  ])("keeps a confirmed schema when optional creator enrichment is unavailable", async (profileResponse) => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([visibleSchema]), { status: 200 }))
      .mockResolvedValueOnce(profileResponse);
    await expect(fetchSchemaDetail(ID, "token")).resolves.toEqual(visibleSchema);
    expect(global.fetch).toHaveBeenCalledTimes(2);
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
