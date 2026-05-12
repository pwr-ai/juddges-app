import { renderHook, waitFor } from "@testing-library/react";
import { useBaseFieldFacets } from "@/hooks/useBaseFieldFacets";

jest.mock("@/lib/api/search", () => ({
  fetchBaseFieldFacets: jest.fn(),
}));

import { fetchBaseFieldFacets } from "@/lib/api/search";

const fetchMock = fetchBaseFieldFacets as jest.MockedFunction<typeof fetchBaseFieldFacets>;

describe("useBaseFieldFacets", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("fetches facets for active fields on mount", async () => {
    fetchMock.mockResolvedValueOnce({
      appeal_outcome: { dismissed: 12, allowed: 3 },
    });
    const { result } = renderHook(() => useBaseFieldFacets(["appeal_outcome"]));
    await waitFor(() => {
      expect(result.current.facetCounts.appeal_outcome).toEqual({
        dismissed: 12,
        allowed: 3,
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(["appeal_outcome"], undefined);
  });

  it("does not fetch when fields is empty", async () => {
    renderHook(() => useBaseFieldFacets([]));
    // Wait long enough for any debounce to have fired.
    await new Promise((r) => setTimeout(r, 350));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects enabled=false", async () => {
    renderHook(() => useBaseFieldFacets(["appeal_outcome"], { enabled: false }));
    await new Promise((r) => setTimeout(r, 350));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the query string", async () => {
    fetchMock.mockResolvedValueOnce({});
    renderHook(() => useBaseFieldFacets(["appeal_outcome"], { query: "dis" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(["appeal_outcome"], "dis");
    });
  });
});
