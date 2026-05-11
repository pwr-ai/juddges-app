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
    const filters: BaseFilters = { numVictims: { min: 2 } };
    expect(buildMeilisearchFilter(filters, [])).toBe("(base_num_victims >= 2)");
  });

  it("emits a single <= clause for max-only ranges", () => {
    const filters: BaseFilters = { numVictims: { max: 5 } };
    expect(buildMeilisearchFilter(filters, [])).toBe("(base_num_victims <= 5)");
  });

  it("emits both bounds AND-joined", () => {
    const filters: BaseFilters = { numVictims: { min: 2, max: 5 } };
    expect(buildMeilisearchFilter(filters, [])).toBe(
      "(base_num_victims >= 2 AND base_num_victims <= 5)"
    );
  });

  it("maps every store key to the right column", () => {
    const filters: BaseFilters = {
      numVictims: { min: 1 },
      victimAgeOffence: { max: 18 },
      caseNumber: { min: 1000 },
      coDefAccNum: { max: 3 },
      appealJudgmentDate: { min: 1577836800 }, // 2020-01-01
    };
    const expr = buildMeilisearchFilter(filters, []);
    expect(expr).toContain("base_num_victims >= 1");
    expect(expr).toContain("base_victim_age_offence <= 18");
    expect(expr).toContain("base_case_number >= 1000");
    expect(expr).toContain("base_co_def_acc_num <= 3");
    expect(expr).toContain("base_date_of_appeal_court_judgment_ts >= 1577836800");
  });

  it("AND-joins jurisdiction with numeric clauses", () => {
    const expr = buildMeilisearchFilter({ numVictims: { min: 1 } }, ["pl"]);
    expect(expr).toBe('(jurisdiction = "PL") AND (base_num_victims >= 1)');
  });

  it("skips ranges with only undefined bounds", () => {
    const filters: BaseFilters = { numVictims: {} };
    expect(buildMeilisearchFilter(filters, [])).toBeUndefined();
  });
});
