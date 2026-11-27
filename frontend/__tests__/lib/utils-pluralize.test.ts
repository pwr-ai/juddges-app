import { readFileSync } from "fs";
import { join } from "path";

import { pluralizeEn } from "@/lib/utils";

describe("pluralizeEn", () => {
  // AC-4
  it("returns the singular for exactly 1", () => {
    expect(pluralizeEn(1, "judgment")).toBe("judgment");
  });

  // AC-4
  it("appends s for 0 and for counts above 1", () => {
    expect(pluralizeEn(0, "judgment")).toBe("judgments");
    expect(pluralizeEn(2, "judgment")).toBe("judgments");
  });

  // AC-4
  it("uses the explicit plural when given (irregular plurals)", () => {
    expect(pluralizeEn(2, "court", "courts")).toBe("courts");
    expect(pluralizeEn(2, "category", "categories")).toBe("categories");
    expect(pluralizeEn(1, "category", "categories")).toBe("category");
  });

  // AC-4: the inline ternary must be gone from the three named call sites
  it.each([
    "app/search/extractions/page.tsx",
    "components/search/SaveAsCollectionDialog.tsx",
    "app/topics/page.tsx",
  ])("%s no longer inlines the === 1 ? \"\" : \"s\" logic", (rel) => {
    const src = readFileSync(join(__dirname, "..", "..", rel), "utf8");
    expect(src).not.toMatch(/===\s*1\s*\?\s*""\s*:\s*"s"/);
    expect(src).toContain("pluralizeEn");
  });
});
