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
 * Re-enabling the integration point is safe here because the diagram source
 * is a string literal in the page, mermaid has already sanitised the labels
 * itself (`securityLevel: "strict"`), and this pass still strips scripts,
 * event handlers and `javascript:` URLs — see the unit test.
 */
export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ["foreignObject"],
    ADD_ATTR: ["target", "xmlns"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
}
