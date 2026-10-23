/**
 * @jest-environment node
 */
import {
  highlightQueryInText,
  sanitizeHighlightHtml,
  sanitizeHighlightHtmlWithoutDom,
} from "@/lib/highlight";

// Regression for the production SSR crash `TypeError: b.f.sanitize is not a
// function`: QueryHighlight is a "use client" component but still renders on
// the server, where `dompurify` has no DOM and exposes no `sanitize`.
describe("sanitizeHighlightHtml without a DOM (SSR)", () => {
  it("does not throw and keeps bare <mark> tags", () => {
    expect(typeof window).toBe("undefined");
    expect(sanitizeHighlightHtml("hello <mark>world</mark>")).toBe(
      "hello <mark>world</mark>"
    );
  });

  it("drops every other tag, like DOMPurify with ALLOWED_TAGS: [mark]", () => {
    expect(sanitizeHighlightHtml('<script>alert(1)</script>safe')).toBe("safe");
    expect(sanitizeHighlightHtml('<img src=x onerror=alert(1)>')).toBe("");
    expect(sanitizeHighlightHtml("<b>bold</b> &lt;i&gt;kept&lt;/i&gt;")).toBe(
      "bold &lt;i&gt;kept&lt;/i&gt;"
    );
  });

  it("never lets a pre-escaped mark become a tag", () => {
    expect(sanitizeHighlightHtml("&lt;mark&gt;x&lt;/mark&gt;")).toBe(
      "&lt;mark&gt;x&lt;/mark&gt;"
    );
  });

  it("strips attributes from <mark>", () => {
    expect(sanitizeHighlightHtmlWithoutDom('<mark onclick="x" class="y">hi</mark>')).toBe(
      "<mark>hi</mark>"
    );
    expect(sanitizeHighlightHtmlWithoutDom("<MARK>hi</MARK>")).toBe("<mark>hi</mark>");
  });

  it("highlightQueryInText works end to end on the server", () => {
    expect(highlightQueryInText('Sąd <b>Najwyższy</b> "x"', "sąd")).toBe(
      '<mark>Sąd</mark> &lt;b&gt;Najwyższy&lt;/b&gt; "x"'
    );
  });
});
