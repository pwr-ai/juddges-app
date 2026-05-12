import type { BaseFilters } from "@/lib/store/searchStore";

describe("BaseFilters discriminated union", () => {
  it("accepts an enum_multi value", () => {
    const f: BaseFilters = {
      appellant: { kind: "enum_multi", values: ["offender"] },
    };
    expect(f.appellant?.kind).toBe("enum_multi");
  });
  it("accepts a tag_array value", () => {
    const f: BaseFilters = {
      convict_offences: { kind: "tag_array", values: ["theft"] },
    };
    expect(f.convict_offences?.kind).toBe("tag_array");
  });
  it("accepts a boolean_tri value with literal true/false", () => {
    const f: BaseFilters = {
      vic_impact_statement: { kind: "boolean_tri", value: true },
    };
    expect(f.vic_impact_statement?.kind).toBe("boolean_tri");
    const g: BaseFilters = {
      vic_impact_statement: { kind: "boolean_tri", value: false },
    };
    expect(g.vic_impact_statement?.kind).toBe("boolean_tri");
  });
  it("accepts a numeric_range value", () => {
    const f: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 2, max: 5 } },
    };
    if (f.num_victims?.kind !== "numeric_range") throw new Error("wrong kind");
    expect(f.num_victims.range.min).toBe(2);
    expect(f.num_victims.range.max).toBe(5);
  });
  it("accepts a date_range value", () => {
    const f: BaseFilters = {
      date_of_appeal_court_judgment: {
        kind: "date_range",
        range: { min: 1577836800 }, // 2020-01-01 UTC
      },
    };
    expect(f.date_of_appeal_court_judgment?.kind).toBe("date_range");
  });
});
