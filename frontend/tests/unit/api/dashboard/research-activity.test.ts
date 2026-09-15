import { getCollections } from "@/lib/api/collections";
import {
  fetchDashboardResearchActivity,
} from "@/lib/api/dashboard";
import { getUserSearchHistory } from "@/lib/api/search-history";

jest.mock("@/lib/api/collections", () => ({
  getCollections: jest.fn(),
}));

jest.mock("@/lib/api/search-history", () => ({
  getUserSearchHistory: jest.fn(),
}));

const collection = (
  id: string,
  documentCount: number,
  updatedAt = "2026-09-15T08:00:00Z",
) => ({
  id,
  user_id: "user-1",
  name: `Collection ${id}`,
  created_at: "2026-09-14T08:00:00Z",
  updated_at: updatedAt,
  documents: [],
  document_count: documentCount,
});

const search = (query: string) => ({
  query,
  hit_count: 10,
  created_at: "2026-09-15T10:00:00Z",
});

describe("fetchDashboardResearchActivity", () => {
  it("combines totals and limits continuation lists to three items", async () => {
    jest.mocked(getCollections).mockResolvedValue([
      collection("1", 1, "2026-09-12T08:00:00Z"),
      collection("2", 2, "2026-09-15T08:00:00Z"),
      collection("3", 3, "2026-09-14T08:00:00Z"),
      collection("4", 4, "2026-09-13T08:00:00Z"),
    ]);
    jest.mocked(getUserSearchHistory).mockResolvedValue([
      search("one"),
      search("two"),
      search("three"),
      search("four"),
    ]);

    await expect(fetchDashboardResearchActivity()).resolves.toMatchObject({
      collectionCount: 4,
      documentCount: 10,
      recentCollections: [{ id: "2" }, { id: "3" }, { id: "4" }],
      recentSearches: [{ query: "one" }, { query: "two" }, { query: "three" }],
      collectionsUnavailable: false,
      searchesUnavailable: false,
    });
    expect(getUserSearchHistory).toHaveBeenCalledWith(30, 3);
  });

  it("preserves collections when search history is unavailable", async () => {
    jest.mocked(getCollections).mockResolvedValue([collection("1", 5)]);
    jest.mocked(getUserSearchHistory).mockRejectedValue(new Error("history down"));

    await expect(fetchDashboardResearchActivity()).resolves.toMatchObject({
      recentCollections: [{ id: "1", documentCount: 5 }],
      recentSearches: [],
      collectionsUnavailable: false,
      searchesUnavailable: true,
    });
  });

  it("fails only when neither continuation source is available", async () => {
    jest.mocked(getCollections).mockRejectedValue(new Error("collections down"));
    jest.mocked(getUserSearchHistory).mockRejectedValue(new Error("history down"));

    await expect(fetchDashboardResearchActivity()).rejects.toThrow(
      "Failed to fetch dashboard research activity",
    );
  });
});
