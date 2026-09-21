import { buildDocumentHref } from "@/lib/extractions/document-href";
import { encodeFilters } from "@/lib/extractions/use-extracted-data-filters";

describe("buildDocumentHref", () => {
  it("links to /documents/{id} (the /judgments route does not exist)", () => {
    expect(buildDocumentHref("abc", {})).toBe("/documents/abc");
  });
  it("carries the filter blob and the base-fields anchor", () => {
    const filters = { jurisdiction: ["PL"] as "PL"[] };
    expect(buildDocumentHref("abc", filters)).toBe(
      `/documents/abc?f=${encodeFilters(filters)}#base-fields`,
    );
  });
  it("encodes the id", () => {
    expect(buildDocumentHref("a b", {})).toBe("/documents/a%20b");
  });
});
