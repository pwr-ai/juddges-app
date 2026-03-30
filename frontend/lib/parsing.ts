/**
 * HTML/XML parsing utilities for document content.
 */

/**
 * Convert XML-style tags to HTML equivalents.
 */
export function convertXmlTagsToHtml(content: string): string {
  if (!content) return "";

  // Convert common XML tags to semantic HTML
  let html = content;
  html = html.replace(/<paragraph>/gi, "<p>");
  html = html.replace(/<\/paragraph>/gi, "</p>");
  html = html.replace(/<heading>/gi, "<h3>");
  html = html.replace(/<\/heading>/gi, "</h3>");
  html = html.replace(/<emphasis>/gi, "<em>");
  html = html.replace(/<\/emphasis>/gi, "</em>");
  html = html.replace(/<strong_emphasis>/gi, "<strong>");
  html = html.replace(/<\/strong_emphasis>/gi, "</strong>");
  html = html.replace(/<list_item>/gi, "<li>");
  html = html.replace(/<\/list_item>/gi, "</li>");
  html = html.replace(/<ordered_list>/gi, "<ol>");
  html = html.replace(/<\/ordered_list>/gi, "</ol>");
  html = html.replace(/<unordered_list>/gi, "<ul>");
  html = html.replace(/<\/unordered_list>/gi, "</ul>");

  return html;
}

/**
 * Fix common HTML content issues for server-side rendering.
 */
export function fixHtmlContentServer(html: string): string {
  if (!html) return "";

  let fixed = html;

  // Ensure proper paragraph wrapping
  fixed = fixed.replace(/\n{2,}/g, "</p><p>");

  // Remove empty paragraphs
  fixed = fixed.replace(/<p>\s*<\/p>/g, "");

  // Fix unclosed tags
  const selfClosingTags = ["br", "hr", "img", "input"];
  for (const tag of selfClosingTags) {
    const regex = new RegExp(`<${tag}([^/]*?)(?<!/)>`, "gi");
    fixed = fixed.replace(regex, `<${tag}$1 />`);
  }

  return fixed;
}

/**
 * Build a complete HTML document from content and metadata.
 */
export function buildDocumentHtml(
  content: string,
  options?: {
    title?: string;
    styles?: string;
    wrapInBody?: boolean;
  }
): string {
  const { title, styles, wrapInBody = true } = options ?? {};

  const processedContent = fixHtmlContentServer(convertXmlTagsToHtml(content));

  if (!wrapInBody) return processedContent;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${title ? `<title>${title}</title>` : ""}
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
    h1, h2, h3 { margin-top: 1.5em; }
    p { margin: 0.5em 0; }
    ${styles ?? ""}
  </style>
</head>
<body>
  ${processedContent}
</body>
</html>`;
}
