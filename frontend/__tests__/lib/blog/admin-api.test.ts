/**
 * @jest-environment node
 */
import {
  ADMIN_POSTS_MAX_LIMIT,
  fetchAllAdminPosts,
} from "@/lib/blog/admin-api";

function page(n: number, hasNext: boolean, ids: string[]) {
  return {
    ok: true,
    json: async () => ({
      data: ids.map((id) => ({ id })),
      pagination: {
        total: 3,
        page: n,
        limit: ADMIN_POSTS_MAX_LIMIT,
        total_pages: hasNext ? 2 : 1,
        has_next: hasNext,
        has_prev: n > 1,
      },
    }),
  };
}

describe("fetchAllAdminPosts", () => {
  afterEach(() => jest.restoreAllMocks());

  it("never requests more than the backend cap (le=100) and follows pages", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(page(1, true, ["a", "b"]))
      .mockResolvedValueOnce(page(2, false, ["c"]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const posts = await fetchAllAdminPosts();

    expect(posts.map((p) => p.id)).toEqual(["a", "b", "c"]);
    for (const [url] of fetchMock.mock.calls) {
      const limit = Number(new URL(url, "http://x").searchParams.get("limit"));
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(100);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
