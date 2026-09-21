/**
 * The statistics view keeps its state (view, sample size, seed, fields) in the
 * same URL codec as the filters (#708). The hook's writeUrl replaces the whole
 * query string, so these MUST live in FilterUrlState or they would be wiped on
 * every filter change.
 *
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";

import { buildFilterHref, buildFilterSearchParams } from "@/lib/extractions/use-extracted-data-filters";

const replace = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useExtractedDataFilters } = require("@/lib/extractions/use-extracted-data-filters");

describe("stats params in the filter URL codec", () => {
  it("omits every stats param at defaults", () => {
    const qs = buildFilterSearchParams({ filters: {} }).toString();
    expect(qs).toBe("");
  });

  it("writes view, n, seed and fields", () => {
    const qs = buildFilterSearchParams({
      filters: { appeal_outcome: ["outcome_dismissed_or_refused"] },
      view: "stats",
      sampleSize: 1000,
      seed: 42,
      fields: ["court_name", "appeal_outcome"],
    });
    expect(qs.get("view")).toBe("stats");
    expect(qs.get("n")).toBe("1000");
    expect(qs.get("seed")).toBe("42");
    expect(qs.get("fields")).toBe("court_name,appeal_outcome");
    expect(qs.get("f")).toBeTruthy();
  });

  it("omits fields when they equal the default set, and n when undefined (all)", () => {
    const qs = buildFilterSearchParams({
      filters: {},
      view: "stats",
      seed: 1,
      fields: ["offender_gender", "convict_offences", "sentences_received", "appeal_outcome", "did_offender_confess", "court_name", "decision_date"],
    });
    expect(qs.has("fields")).toBe(false);
    expect(qs.has("n")).toBe(false);
    expect(qs.get("view")).toBe("stats");
  });

  it("buildFilterHref carries the stats params", () => {
    expect(buildFilterHref("/search/extractions", { filters: {}, view: "stats", seed: 7 })).toBe(
      "/search/extractions?view=stats&seed=7",
    );
  });
});

describe("useExtractedDataFilters stats state", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("reads view, n, seed, fields from the URL", () => {
    search = "view=stats&n=50&seed=9&fields=court_name";
    const { result } = renderHook(() => useExtractedDataFilters());
    expect(result.current.view).toBe("stats");
    expect(result.current.sampleSize).toBe(50);
    expect(result.current.seed).toBe(9);
    expect(result.current.statsFields).toEqual(["court_name"]);
  });

  it("defaults to list / all / default fields, and reshuffle assigns a new seed once in the statistics view", () => {
    search = "";
    const { result } = renderHook(() => useExtractedDataFilters());
    expect(result.current.view).toBe("list");
    expect(result.current.sampleSize).toBeUndefined();
    expect(result.current.statsFields.length).toBe(7);
    const before = result.current.seed;
    act(() => result.current.setView("stats"));
    act(() => result.current.reshuffle());
    expect(result.current.seed).not.toBe(before);
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining("seed="), { scroll: false });
  });

  it("setFilters keeps the view and sampling but resets the page", () => {
    search = "view=stats&n=100&seed=3&page=2";
    const { result } = renderHook(() => useExtractedDataFilters());
    act(() => result.current.setFilters({ appeal_outcome: ["outcome_dismissed_or_refused"] }));
    expect(result.current.view).toBe("stats");
    expect(result.current.sampleSize).toBe(100);
    expect(result.current.page).toBe(1);
  });

  it("emits view/n/seed only while the statistics view is active, and drops them on switching back to list", () => {
    search = "";
    const { result } = renderHook(() => useExtractedDataFilters());

    act(() => result.current.setView("stats"));
    act(() => result.current.setSampling(50));
    let lastUrl = replace.mock.calls.at(-1)?.[0] as string;
    expect(lastUrl).toContain("view=stats");
    expect(lastUrl).toContain("n=50");
    expect(lastUrl).toMatch(/seed=\d+/);

    act(() => result.current.setView("list"));
    lastUrl = replace.mock.calls.at(-1)?.[0] as string;
    expect(lastUrl).not.toContain("view=");
    expect(lastUrl).not.toContain("n=");
    expect(lastUrl).not.toContain("seed=");
    expect(lastUrl).not.toContain("fields=");
  });
});
