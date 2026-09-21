/**
 * Pure-function tests for the URL <-> filter-state codec, plus a thin
 * hook-level slice for the `?nl=` (nlQuestion) wiring — the rest of the hook
 * (next/navigation-heavy) is exercised in the E2E test; here we lock down the
 * behaviour of the encoder/decoder/pruner so that round-trips through the URL
 * never lose or mangle a filter.
 *
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";

import {
  buildFilterHref,
  buildFilterSearchParams,
  countActive,
  decodeFilters,
  encodeFilters,
  pruneEmpty,
  useExtractedDataFilters,
} from "@/lib/extractions/use-extracted-data-filters";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/search/extractions",
  useSearchParams: () => mockSearchParams,
}));

describe("encodeFilters / decodeFilters", () => {
  it("round-trips an empty filter to empty string and back", () => {
    expect(encodeFilters({})).toBe("");
    expect(decodeFilters("")).toEqual({});
    expect(decodeFilters(null)).toEqual({});
    expect(decodeFilters(undefined)).toEqual({});
  });

  it("round-trips enum + numeric range + boolean composite", () => {
    const filters: BaseSchemaFilters = {
      offender_gender: ["gender_female"],
      co_def_acc_num: { min: 2 },
      did_offender_confess: true,
      appeal_court_judges_names: "Holroyde",
    };
    const blob = encodeFilters(filters);
    expect(blob).not.toBe("");
    expect(decodeFilters(blob)).toEqual(filters);
  });

  it("prunes empty arrays and empty strings before encoding", () => {
    const blob = encodeFilters({
      offender_gender: [],
      case_name: "   ",
      did_offender_confess: false,
    });
    expect(decodeFilters(blob)).toEqual({ did_offender_confess: false });
  });

  it("returns {} on malformed blob instead of throwing", () => {
    expect(decodeFilters("not-base64$$$")).toEqual({});
    expect(decodeFilters("Zm9v")).toEqual({}); // 'foo' decoded — not JSON object
  });

  it("uses URL-safe base64 (no '+' or '/')", () => {
    const filters: BaseSchemaFilters = {
      keywords: ["robbery", "knife", "domestic violence", "manslaughter"],
    };
    const blob = encodeFilters(filters);
    expect(blob).not.toMatch(/[+/=]/);
  });
});

describe("pruneEmpty", () => {
  it("drops empty arrays and whitespace strings", () => {
    expect(
      pruneEmpty({
        offender_gender: [],
        case_name: " ",
        keywords: ["a"],
        co_def_acc_num: { min: 1 },
      }),
    ).toEqual({
      keywords: ["a"],
      co_def_acc_num: { min: 1 },
    });
  });

  it("preserves boolean false (it is not 'empty')", () => {
    expect(pruneEmpty({ did_offender_confess: false })).toEqual({
      did_offender_confess: false,
    });
  });

  it("preserves zero numeric values", () => {
    expect(pruneEmpty({ num_victims: 0 })).toEqual({ num_victims: 0 });
  });

  it("drops empty range objects", () => {
    expect(pruneEmpty({ co_def_acc_num: {} })).toEqual({});
  });
});

describe("countActive", () => {
  it("counts only non-empty fields", () => {
    expect(
      countActive({
        offender_gender: ["gender_female"],
        keywords: [],
        case_name: "",
        did_offender_confess: true,
      }),
    ).toBe(2);
  });
});

describe("core fields round-trip through the opaque blob unchanged", () => {
  it("keeps jurisdiction and decision_date", () => {
    const filters = { jurisdiction: ["PL", "UK"] as ("PL" | "UK")[], decision_date: { from: "2015-01-01", to: "2024-12-31" } };
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });
});

describe("buildFilterSearchParams / buildFilterHref (one codec for every filter-bearing page)", () => {
  it("writes f, q, page and nl only when set", () => {
    const params = buildFilterSearchParams({
      filters: { jurisdiction: ["PL"] },
      textQuery: "fraud",
      page: 2,
      nlQuestion: "kobiety skazane za oszustwo, PL, 2015–2024",
    });
    expect(params.get("f")).toBe(encodeFilters({ jurisdiction: ["PL"] }));
    expect(params.get("q")).toBe("fraud");
    expect(params.get("page")).toBe("2");
    expect(params.get("nl")).toBe("kobiety skazane za oszustwo, PL, 2015–2024");
  });

  it("omits empty values and page 1", () => {
    expect(buildFilterSearchParams({ filters: {}, textQuery: "  ", page: 1, nlQuestion: "" }).toString()).toBe("");
  });

  it("builds hrefs for /search/extractions, /compare and /documents alike", () => {
    const filters = { appellant: ["offender" as const] };
    expect(buildFilterHref("/compare", { filters, textQuery: "fraud" }, "https://juddges.com"))
      .toBe(`https://juddges.com/compare?f=${encodeFilters(filters)}&q=fraud`);
    expect(buildFilterHref("/compare", { filters: {} }, "https://juddges.com")).toBe("https://juddges.com/compare");
    expect(buildFilterHref("/documents/a%20b", { filters })).toBe(`/documents/a%20b?f=${encodeFilters(filters)}`);
  });
});

describe("useExtractedDataFilters — nlQuestion in the URL (?nl=)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  it("reads ?nl= into nlQuestion on mount", () => {
    mockSearchParams = new URLSearchParams("nl=kobiety+skazane");
    const { result } = renderHook(() => useExtractedDataFilters());
    expect(result.current.nlQuestion).toBe("kobiety skazane");
  });

  it("defaults nlQuestion to undefined when ?nl= is absent", () => {
    const { result } = renderHook(() => useExtractedDataFilters());
    expect(result.current.nlQuestion).toBeUndefined();
  });

  it("setNlQuestion updates state and round-trips it into the URL", () => {
    const { result } = renderHook(() => useExtractedDataFilters());

    act(() => {
      result.current.setNlQuestion("fraud cases 2020");
    });

    expect(result.current.nlQuestion).toBe("fraud cases 2020");
    const lastUrl = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastUrl).toBe("?nl=fraud+cases+2020");
  });

  it("clearAll drops nlQuestion from state and from the URL", () => {
    mockSearchParams = new URLSearchParams("nl=fraud");
    const { result } = renderHook(() => useExtractedDataFilters());
    expect(result.current.nlQuestion).toBe("fraud");

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.nlQuestion).toBeUndefined();
    const lastUrl = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastUrl).not.toContain("nl=");
  });

  it("writeUrl output is unchanged for states without nlQuestion", () => {
    const { result } = renderHook(() => useExtractedDataFilters());

    act(() => {
      result.current.setTextQuery("fraud");
    });

    const lastUrl = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastUrl).toBe("?q=fraud");
  });
});
