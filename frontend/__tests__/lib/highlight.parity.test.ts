import DOMPurify from "dompurify";

import { sanitizeHighlightHtmlWithoutDom } from "@/lib/highlight";

const ALLOWED = { ALLOWED_TAGS: ["mark"], ALLOWED_ATTR: [], ALLOW_DATA_ATTR: false };

// The server fallback must produce the same markup DOMPurify produces in the
// browser for everything Meilisearch and highlightQueryInText can emit, or
// SSR and the client would paint different highlights.
describe("sanitizeHighlightHtmlWithoutDom parity with DOMPurify", () => {
  const cases = [
    "plain text",
    "hello <mark>world</mark>",
    "<mark>a</mark> and <mark>b</mark>",
    "<MARK>upper</MARK>",
    '<mark class="x" onclick="alert(1)">attrs</mark>',
    "<mark>unclosed",
    "stray </mark> close",
    "<script>alert(1)</script>safe",
    "<img src=x onerror=alert(1)>",
    "<b>bold</b> <i>it</i>",
    "already &lt;mark&gt;escaped&lt;/mark&gt; text",
    "Sąd &amp; Trybunał &lt;b&gt; &quot;q&quot; &#39;s&#39;",
    "5 &lt; 6 &amp;&amp; 7 &gt; 3",
    "<mark>Sąd</mark> Najwyższy &quot;x&quot;",
    "a < b and c > d",
    "<mark><b>nested</b></mark>",
    "<mark>outer <mark>inner</mark> tail</mark>",
    "<style>p{}</style>text<script>x</script>",
    "<mark onclick=\"a>b\">x</mark>",
    "&lt;mark onclick=x&gt;text&lt;/mark&gt;",
    "mixed &amp;lt;mark&amp;gt; entity",
    "tab\tand\nnewline <mark>ok</mark>",
    "<mark>emoji 🔥</mark> &#x1F525;",
    "<mark>x</mark> &#60;b&#62; &#38;amp; &#160; &#34;q&#34; &#1114112;",
    "<mark>a</mark>&#x110000;&#xD800;",
    "<mark title='a>b' data-x=\"c>d\">x</mark>",
  ];

  it.each(cases)("%s", (input) => {
    expect(sanitizeHighlightHtmlWithoutDom(input)).toBe(
      DOMPurify.sanitize(input, ALLOWED)
    );
  });
});
