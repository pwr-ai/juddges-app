import { encodeBaseFilters, decodeBaseFilters }
  from "@/lib/extractions/url-serializer";
import type { BaseFilters } from "@/lib/store/searchStore";

describe("url-serializer", () => {
  it("round-trips enum_multi", () => {
    const f: BaseFilters = {
      appellant: { kind: "enum_multi", values: ["offender", "attorney_general"] },
    };
    const params = encodeBaseFilters(f);
    expect(decodeBaseFilters(params)).toEqual(f);
  });
  it("round-trips tag_array", () => {
    const f: BaseFilters = {
      convict_offences: { kind: "tag_array", values: ["theft", "fraud"] },
    };
    expect(decodeBaseFilters(encodeBaseFilters(f))).toEqual(f);
  });
  it("round-trips boolean_tri true and false", () => {
    const t: BaseFilters = { vic_impact_statement: { kind: "boolean_tri", value: true } };
    const ff: BaseFilters = { vic_impact_statement: { kind: "boolean_tri", value: false } };
    expect(decodeBaseFilters(encodeBaseFilters(t))).toEqual(t);
    expect(decodeBaseFilters(encodeBaseFilters(ff))).toEqual(ff);
  });
  it("round-trips numeric_range min only", () => {
    const f: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 2 } },
    };
    expect(decodeBaseFilters(encodeBaseFilters(f))).toEqual(f);
  });
  it("round-trips numeric_range min+max", () => {
    const f: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 2, max: 5 } },
    };
    expect(decodeBaseFilters(encodeBaseFilters(f))).toEqual(f);
  });
  it("round-trips date_range as epoch seconds", () => {
    const f: BaseFilters = {
      date_of_appeal_court_judgment: { kind: "date_range", range: { min: 1577836800 } },
    };
    expect(decodeBaseFilters(encodeBaseFilters(f))).toEqual(f);
  });
  it("ignores unknown fields when decoding", () => {
    const params = new URLSearchParams("not_a_field=x&f.totally_unknown=y");
    expect(decodeBaseFilters(params)).toEqual({});
  });
  it("encodes nothing for empty filters", () => {
    expect(encodeBaseFilters({}).toString()).toBe("");
  });
});
