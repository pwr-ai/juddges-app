import {
  sanitizeHighlightHtml,
  highlightQueryInText,
  recenterHighlightSnippet,
} from "@/lib/highlight";

describe("sanitizeHighlightHtml", () => {
  it("preserves <mark> tags", () => {
    expect(sanitizeHighlightHtml("hello <mark>world</mark>")).toBe(
      "hello <mark>world</mark>"
    );
  });

  it("strips disallowed tags but keeps text content", () => {
    expect(sanitizeHighlightHtml('<script>alert(1)</script>safe')).toBe("safe");
  });

  it("strips event handlers from <mark>", () => {
    const out = sanitizeHighlightHtml('<mark onclick="x">hi</mark>');
    expect(out).toBe("<mark>hi</mark>");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHighlightHtml("")).toBe("");
  });
});

describe("highlightQueryInText", () => {
  it("wraps a basic match in <mark>", () => {
    expect(highlightQueryInText("the law is clear", "law")).toBe(
      "the <mark>law</mark> is clear"
    );
  });

  it("matches case-insensitively", () => {
    expect(highlightQueryInText("The Law", "law")).toBe(
      "The <mark>Law</mark>"
    );
  });

  it("matches Polish diacritics exactly", () => {
    expect(highlightQueryInText("miasto Łódź", "łódź")).toBe(
      "miasto <mark>Łódź</mark>"
    );
  });

  it("matches substrings (prefix queries)", () => {
    expect(highlightQueryInText("konstytucja RP", "konst")).toBe(
      "<mark>konst</mark>ytucja RP"
    );
  });

  it("escapes regex special characters in the query", () => {
    expect(highlightQueryInText("a.b and a+b", "a.b")).toBe(
      "<mark>a.b</mark> and a+b"
    );
  });

  it("HTML-escapes source text so it cannot form tags", () => {
    const out = highlightQueryInText("<script>x</script> law", "law");
    expect(out).toBe("&lt;script&gt;x&lt;/script&gt; <mark>law</mark>");
  });

  it("returns escaped plain text for empty query", () => {
    expect(highlightQueryInText("<b>hi</b>", "")).toBe("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("returns escaped plain text when query has no whitespace tokens", () => {
    expect(highlightQueryInText("hi", "   ")).toBe("hi");
  });

  it("returns escaped plain text when no match", () => {
    expect(highlightQueryInText("nothing here", "zzz")).toBe("nothing here");
  });

  it("highlights multiple tokens independently", () => {
    expect(highlightQueryInText("foo and bar", "foo bar")).toBe(
      "<mark>foo</mark> and <mark>bar</mark>"
    );
  });

  it("caps at 10 tokens (DoS guard)", () => {
    const words = [
      "alpha", "bravo", "charlie", "delta", "echo",
      "foxtrot", "golf", "hotel", "india", "juliet",
      "kilo", "lima", "mike", "november", "oscar",
    ];
    const text = words.join(" ");
    const out = highlightQueryInText(text, words.join(" "));
    // Only the first 10 tokens are used; remaining 5 appear plain in the text.
    expect(out.match(/<mark>/g)?.length).toBe(10);
    expect(out).toContain("kilo");
    expect(out).not.toContain("<mark>kilo</mark>");
  });

  it("returns empty string when text is null/undefined", () => {
    expect(highlightQueryInText(null as unknown as string, "x")).toBe("");
    expect(highlightQueryInText(undefined as unknown as string, "x")).toBe("");
  });

  it("returns escaped plain text when query is null/undefined", () => {
    expect(highlightQueryInText("hi", null)).toBe("hi");
    expect(highlightQueryInText("hi", undefined)).toBe("hi");
  });
});

describe("recenterHighlightSnippet", () => {
  it("returns input unchanged when there is no <mark>", () => {
    expect(recenterHighlightSnippet("plain text, nothing to mark")).toBe(
      "plain text, nothing to mark"
    );
  });

  it("returns input unchanged when <mark> is already near the start", () => {
    const input = "Lorem ipsum <mark>dolor</mark> sit amet";
    expect(recenterHighlightSnippet(input, 60)).toBe(input);
  });

  it("trims leading text and prepends ellipsis when <mark> is far from the start", () => {
    const longPrefix = "alpha bravo charlie delta echo foxtrot ".repeat(5);
    const input = `${longPrefix}<mark>match</mark> trailing text`;
    const out = recenterHighlightSnippet(input, 40);
    expect(out.startsWith("… ")).toBe(true);
    expect(out).toContain("<mark>match</mark>");
    expect(out).toContain("trailing text");
    expect(out.indexOf("<mark>")).toBeLessThanOrEqual(2 + 40);
  });

  it("preserves <mark> and trailing content verbatim when trimming", () => {
    const longPrefix = "x ".repeat(80);
    const input = `${longPrefix}<mark>important</mark> tail`;
    const out = recenterHighlightSnippet(input, 30);
    expect(out).toContain("<mark>important</mark>");
    expect(out.endsWith(" tail")).toBe(true);
  });

  it("returns empty string for empty input", () => {
    expect(recenterHighlightSnippet("")).toBe("");
    expect(recenterHighlightSnippet(null)).toBe("");
    expect(recenterHighlightSnippet(undefined)).toBe("");
  });

  it("does not split inside the <mark> tag", () => {
    const longPrefix = "lorem ".repeat(20);
    const input = `${longPrefix}<mark>m</mark> tail`;
    const out = recenterHighlightSnippet(input, 10);
    // The opening <mark> must remain intact in the output.
    expect(out).toContain("<mark>m</mark>");
    expect(out).not.toMatch(/<mar(?!k>)/);
  });
});
