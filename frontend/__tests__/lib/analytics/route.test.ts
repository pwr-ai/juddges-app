import { normalizeRoute } from "@/lib/analytics/route";

describe("normalizeRoute()", () => {
  it.each([
    [null, "/"],
    ["", "/"],
    ["/", "/"],
    ["/search", "/search"],
    ["/search/extractions", "/search/extractions"],
    ["/reasoning-lines", "/reasoning-lines"],
    [
      "/documents/153000000001006_II_K_000123_2020_Uz_2021-01-01_001",
      "/documents/[id]",
    ],
    ["/documents/ewca_civ_2020_123", "/documents/[id]"],
    ["/collections/3f2b8c1e-9a4d-4c1b-8e2f-0a1b2c3d4e5f", "/collections/[id]"],
    ["/compare/42", "/compare/[id]"],
    ["/changelog/v1.5.30", "/changelog/[id]"],
    ["/blog/my-first-post", "/blog/[slug]"],
    ["/blog/admin", "/blog/admin"],
    ["/blog/admin/new", "/blog/admin/new"],
    ["/Documents/ABC", "/[id]/[id]"],
    ["/search/%C5%BC%C3%B3%C5%82w", "/search/[id]"],
    ["/a/b/c/d/e/f", "/a/b/c/d"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeRoute(input)).toBe(expected);
  });

  it("never echoes a long opaque segment", () => {
    const longWord = "a".repeat(41);
    expect(normalizeRoute(`/documents/${longWord}`)).toBe("/documents/[id]");
  });
});
