/**
 * Unit tests for the Meilisearch filter-string builder used by useSearchResults.
 * Exercised in isolation to keep the search-results hook integration tests focused
 * on data-flow rather than filter-syntax edge cases.
 */

import { buildMeilisearchFilter } from "@/hooks/useSearchResults";
import type { BaseFilters } from "@/lib/store/searchStore";

describe("buildMeilisearchFilter", () => {
  it("returns undefined when nothing is set", () => {
    expect(buildMeilisearchFilter({}, [])).toBeUndefined();
  });

  it("emits a jurisdiction OR clause for languages", () => {
    expect(buildMeilisearchFilter({}, ["pl"])).toBe('(jurisdiction = "PL")');
    expect(buildMeilisearchFilter({}, ["en", "pl"])).toMatch(
      /jurisdiction = "UK"|jurisdiction = "PL"/
    );
    // `uk` collapses to `UK` (same English content).
    expect(buildMeilisearchFilter({}, ["uk"])).toBe('(jurisdiction = "UK")');
  });

  it("emits a single >= clause for min-only ranges", () => {
    const filters: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 2 } }
    };
    expect(buildMeilisearchFilter(filters, [])).toBe("(base_num_victims >= 2)");
  });

  it("emits a single <= clause for max-only ranges", () => {
    const filters: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { max: 5 } }
    };
    expect(buildMeilisearchFilter(filters, [])).toBe("(base_num_victims <= 5)");
  });

  it("emits both bounds AND-joined", () => {
    const filters: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 2, max: 5 } }
    };
    expect(buildMeilisearchFilter(filters, [])).toBe(
      "(base_num_victims >= 2 AND base_num_victims <= 5)"
    );
  });

  it("maps every store key to the right column", () => {
    const filters: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 1 } },
      victim_age_offence: { kind: "numeric_range", range: { max: 18 } },
      case_number: { kind: "numeric_range", range: { min: 1000 } },
      co_def_acc_num: { kind: "numeric_range", range: { max: 3 } },
      date_of_appeal_court_judgment: { kind: "date_range", range: { min: 1577836800 } }, // 2020-01-01
    };
    const expr = buildMeilisearchFilter(filters, []);
    expect(expr).toContain("base_num_victims >= 1");
    expect(expr).toContain("base_victim_age_offence <= 18");
    expect(expr).toContain("base_case_number >= 1000");
    expect(expr).toContain("base_co_def_acc_num <= 3");
    expect(expr).toContain("base_date_of_appeal_court_judgment_ts >= 1577836800");
  });

  it("AND-joins jurisdiction with numeric clauses", () => {
    const expr = buildMeilisearchFilter(
      { num_victims: { kind: "numeric_range", range: { min: 1 } } },
      ["pl"]
    );
    expect(expr).toBe('(jurisdiction = "PL") AND (base_num_victims >= 1)');
  });

  it("skips ranges with only undefined bounds", () => {
    const filters: BaseFilters = {
      num_victims: { kind: "numeric_range", range: {} }
    };
    expect(buildMeilisearchFilter(filters, [])).toBeUndefined();
  });

  it("emits IN clause for enum_multi", () => {
    const f: BaseFilters = {
      appellant: { kind: "enum_multi", values: ["offender", "attorney_general"] },
    };
    expect(buildMeilisearchFilter(f, [])).toBe(
      '(base_appellant IN ["offender", "attorney_general"])'
    );
  });

  it("emits IN clause for tag_array", () => {
    const f: BaseFilters = {
      convict_offences: { kind: "tag_array", values: ["theft", "fraud"] },
    };
    expect(buildMeilisearchFilter(f, [])).toBe(
      '(base_convict_offences IN ["theft", "fraud"])'
    );
  });

  it("emits true/false for boolean_tri", () => {
    expect(
      buildMeilisearchFilter(
        { vic_impact_statement: { kind: "boolean_tri", value: true } }, [],
      ),
    ).toBe("(base_vic_impact_statement = true)");
    expect(
      buildMeilisearchFilter(
        { vic_impact_statement: { kind: "boolean_tri", value: false } }, [],
      ),
    ).toBe("(base_vic_impact_statement = false)");
  });

  it("emits no clause for empty enum_multi/tag_array values", () => {
    expect(
      buildMeilisearchFilter(
        { appellant: { kind: "enum_multi", values: [] } }, [],
      ),
    ).toBeUndefined();
  });

  it("emits >= AND <= for date_range using the _ts twin field", () => {
    const min = 1577836800; // 2020-01-01 UTC
    const max = 1609459199; // 2020-12-31 UTC
    const f: BaseFilters = {
      date_of_appeal_court_judgment: {
        kind: "date_range",
        range: { min, max },
      },
    };
    expect(buildMeilisearchFilter(f, [])).toBe(
      `(base_date_of_appeal_court_judgment_ts >= ${min} AND base_date_of_appeal_court_judgment_ts <= ${max})`
    );
  });

  it("combines jurisdiction + enum + range with AND", () => {
    const f: BaseFilters = {
      appellant: { kind: "enum_multi", values: ["offender"] },
      num_victims: { kind: "numeric_range", range: { min: 1 } },
    };
    const out = buildMeilisearchFilter(f, ["pl"])!;
    expect(out).toContain('(jurisdiction = "PL")');
    expect(out).toContain('(base_appellant IN ["offender"])');
    expect(out).toContain("(base_num_victims >= 1)");
    // Three clauses joined by AND.
    expect(out.split(" AND ").length).toBe(3);
  });
});
