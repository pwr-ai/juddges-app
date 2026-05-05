/**
 * Pure-function tests for the URL <-> filter-state codec.
 *
 * The hook itself depends on next/navigation and is exercised in the E2E test;
 * here we lock down the behaviour of the encoder/decoder/pruner so that
 * round-trips through the URL never lose or mangle a filter.
 *
 * @jest-environment jsdom
 */

import {
  countActive,
  decodeFilters,
  encodeFilters,
  pruneEmpty,
} from "@/lib/extractions/use-extracted-data-filters";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

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
