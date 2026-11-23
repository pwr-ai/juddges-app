import {
  fetchFacet,
  fetchHistogram,
  singleJurisdiction,
} from "@/lib/extractions/base-schema-filter-api";

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe("base-schema-filter-api", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe("fetchFacet", () => {
    it("parses the backend FacetCountsResponse shape ({ counts })", async () => {
      fetchMock.mockReturnValue(
        okJson({
          field: "appeal_outcome",
          counts: [
            { value: "outcome_dismissed_or_refused", count: 3523 },
            { value: "outcome_other", count: 4 },
          ],
          total: 3527,
        }),
      );
      await expect(fetchFacet("appeal_outcome")).resolves.toEqual([
        { value: "outcome_dismissed_or_refused", count: 3523 },
        { value: "outcome_other", count: 4 },
      ]);
    });

    it("returns [] when counts is missing", async () => {
      fetchMock.mockReturnValue(okJson({ field: "x" }));
      await expect(fetchFacet("x")).resolves.toEqual([]);
    });

    it("omits the jurisdiction param by default", async () => {
      fetchMock.mockReturnValue(okJson({ counts: [] }));
      await fetchFacet("appellant");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/extractions/base-schema/facets/appellant",
      );
    });

    it("sends the jurisdiction when given", async () => {
      fetchMock.mockReturnValue(okJson({ counts: [] }));
      await fetchFacet("appellant", "UK");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/extractions/base-schema/facets/appellant?jurisdiction=UK",
      );
    });
  });

  describe("fetchHistogram", () => {
    it("omits the jurisdiction param by default", async () => {
      fetchMock.mockReturnValue(okJson({ field: "f", buckets: [], total: 0 }));
      await fetchHistogram("num_victims", 20);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/extractions/base-schema/histogram/num_victims?buckets=20",
      );
    });

    it("sends the jurisdiction when given", async () => {
      fetchMock.mockReturnValue(okJson({ field: "f", buckets: [], total: 0 }));
      await fetchHistogram("num_victims", 20, "PL");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/extractions/base-schema/histogram/num_victims?buckets=20&jurisdiction=PL",
      );
    });
  });

  describe("singleJurisdiction", () => {
    it("returns the jurisdiction only when exactly one is selected", () => {
      expect(singleJurisdiction(["PL"])).toBe("PL");
      expect(singleJurisdiction(["PL", "UK"])).toBeNull();
      expect(singleJurisdiction([])).toBeNull();
      expect(singleJurisdiction(undefined)).toBeNull();
    });
  });
});
