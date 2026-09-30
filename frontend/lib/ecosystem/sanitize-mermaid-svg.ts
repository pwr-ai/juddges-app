import DOMPurify from "dompurify";

/**
 * Second sanitising pass over the SVG mermaid returns, before it goes into
 * `dangerouslySetInnerHTML`.
 *
 * Mermaid renders HTML labels (`htmlLabels: true`) as XHTML inside
 * `<foreignObject>`, so `<br/>` and `<i>` in a label become real elements
 * there. DOMPurify 3.4 dropped `foreignobject` from its default HTML
 * integration points, so with only the SVG profile every HTML element inside a
 * `<foreignObject>` is removed and its text is concatenated with no separator:
 * `Polish<br/>court judgments` came out as "Polishcourt judgments" (#747).
 *
 * The integration point is re-enabled for exactly the inline elements mermaid
 * emits for a label — no HTML profile, so forms, inputs, iframes and images
 * inside a `<foreignObject>` are still dropped along with scripts, event
 * handlers and `javascript:` URLs (see the unit test). The only caller feeds a
 * string literal that mermaid has already sanitised (`securityLevel: "strict"`).
 */
const LABEL_HTML_TAGS = ["div", "span", "p", "br", "i", "b", "em", "strong"];

export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["foreignObject", ...LABEL_HTML_TAGS],
    ADD_ATTR: ["target", "xmlns"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
}
