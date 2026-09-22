import { buildDocumentHref } from "@/lib/extractions/document-href";
import { encodeFilters } from "@/lib/extractions/use-extracted-data-filters";

describe("buildDocumentHref", () => {
  it("links to /documents/{id} (the /judgments route does not exist)", () => {
    expect(buildDocumentHref("abc", { filters: {} })).toBe("/documents/abc");
  });
  it("carries the filter blob and the base-fields anchor", () => {
    const filters = { jurisdiction: ["PL"] as "PL"[] };
    expect(buildDocumentHref("abc", { filters })).toBe(
      `/documents/abc?f=${encodeFilters(filters)}#base-fields`,
    );
  });
  it("encodes the id", () => {
    expect(buildDocumentHref("a b", { filters: {} })).toBe("/documents/a%20b");
  });
  it("carries textQuery, page and nlQuestion so back-navigation restores the result set", () => {
    const filters = { jurisdiction: ["PL"] as "PL"[] };
    expect(
      buildDocumentHref("abc", {
        filters,
        textQuery: "fraud",
        page: 3,
        nlQuestion: "women convicted of fraud",
      }),
    ).toBe(
      `/documents/abc?f=${encodeFilters(filters)}&q=fraud&page=3&nl=women+convicted+of+fraud#base-fields`,
    );
  });
});
