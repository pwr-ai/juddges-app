import { CollectionFromFilterError, createCollectionFromFilter } from "@/lib/api/collections";

jest.mock("@/lib/analytics/track", () => ({ track: jest.fn() }));

const ok = { collections: [{ jurisdiction: null, collection: { id: "c9" }, added_count: 42 }], total_matched: 42, pair_id: null };

describe("createCollectionFromFilter", () => {
  beforeEach(() => { global.fetch = jest.fn(); });

  it("posts to the BFF route and returns the list-shaped response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(ok), { status: 201 }));
    const result = await createCollectionFromFilter({ name: "n", filters: { jurisdiction: ["PL"] }, text_query: "fraud" });
    expect(result.collections[0].collection.id).toBe("c9");
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/collections/from-filter");
    expect(JSON.parse(init.body)).toEqual({ name: "n", filters: { jurisdiction: ["PL"] }, text_query: "fraud" });
  });

  it("unwraps FastAPI `detail` into a typed error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(
      JSON.stringify({ detail: { message: "too big", code: "FILTER_TOO_LARGE", total: 7000, cap: 5000, jurisdiction: "PL" } }),
      { status: 413 },
    ));
    await expect(createCollectionFromFilter({ name: "n", filters: {} })).rejects.toMatchObject({
      name: "CollectionFromFilterError", message: "too big", code: "FILTER_TOO_LARGE", status: 413, total: 7000, cap: 5000, jurisdiction: "PL",
    });
  });

  it("also understands the BFF's own flat 401 body", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }));
    await expect(createCollectionFromFilter({ name: "n", filters: {} })).rejects.toBeInstanceOf(CollectionFromFilterError);
  });
});
