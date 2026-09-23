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
});
