import { en } from "@/lib/i18n/translations/en";
import { pl } from "@/lib/i18n/translations/pl";

const KEYS = [
  "cohortTitle",
  "cohortHeadline",
  "cohortGroupBy",
  "cohortFilterActive",
  "cohortClearFilter",
  "cohortNoRanked",
  "cohortEmpty",
  "resolvedCase",
] as const;

describe("precedents translations", () => {
  it("defines every cohort key in both locales", () => {
    for (const key of KEYS) {
      expect(typeof en.precedents[key]).toBe("string");
      expect(typeof pl.precedents[key]).toBe("string");
      expect(en.precedents[key].length).toBeGreaterThan(0);
      expect(pl.precedents[key].length).toBeGreaterThan(0);
    }
  });

  it("keeps the placeholders the headline and filter copy interpolate", () => {
    for (const locale of [en, pl]) {
      expect(locale.precedents.cohortHeadline).toContain("{{count}}");
      expect(locale.precedents.cohortHeadline).toContain("{{total}}");
      expect(locale.precedents.cohortHeadline).toContain("{{value}}");
      expect(locale.precedents.cohortFilterActive).toContain("{{value}}");
      expect(locale.precedents.cohortFilterActive).toContain("{{count}}");
      expect(locale.precedents.cohortFilterActive).toContain("{{total}}");
      expect(locale.precedents.resolvedCase).toContain("{{caseNumber}}");
    }
  });

  // AC-3 (reworded: unknown buckets no longer count as "a value")
  it("words cohortEmpty as 'no known value' in both locales", () => {
    expect(en.precedents.cohortEmpty).toBe(
      "No similar cases carry a known value for this field.",
    );
    expect(pl.precedents.cohortEmpty).not.toBe(
      "Żadna z podobnych spraw nie ma wartości dla tego pola.",
    );
    expect(pl.precedents.cohortEmpty.length).toBeGreaterThan(0);
  });
});
