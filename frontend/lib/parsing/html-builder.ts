// HTML document builder

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildDocumentHtml(content: string = '', title: string = 'Document'): string {
  const inner = looksLikeHtml(content) ? content : textToHtml(content);
  const safeTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    /* Global styles for the document body - only affects this document, not parent page */
    html, body {
      margin: 0;
      padding: 0;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", "DejaVu Sans", Ubuntu, Cantarell, Arial, sans-serif;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      font-feature-settings: "kern" 1;
      font-kerning: normal;
    }

    /* Apply default font to all elements including headers */
    *, h1, h2, h3, h4, h5, h6 {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", "DejaVu Sans", Ubuntu, Cantarell, Arial, sans-serif;
    }

    /* Code blocks should use monospace */
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    /* Container styles - standalone document */
    .doc-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    /* When embedded in page, allow full width but with some padding */
    .document-content {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 24px;
    }

    /* Section styling for better structure - works with both .doc-container and .document-content */
    /* Removed section borders - headers already have borders to avoid double borders */
    .doc-container .doc-section,
    .document-content .doc-section {
      margin-bottom: 2.5em;
      padding-bottom: 0;
    }

    .doc-container .doc-section:last-child,
    .document-content .doc-section:last-child {
      margin-bottom: 0;
    }

    /* Headers with better hierarchy - works with both .doc-container and .document-content */
    .doc-container h1,
    .document-content h1 {
      font-size: 2em;
      margin: 1.5em 0 0.8em 0;
      line-height: 1.2;
      font-weight: 700;
    }

    /* Remove border from h1 if it immediately follows another header (to avoid double borders) */
    .doc-container h1 + h1,
    .document-content h1 + h1,
    .doc-container h2 + h1,
    .document-content h2 + h1 {
      border-bottom: none;
      padding-bottom: 0;
      margin-top: 0.5em;
    }

    .doc-container h2,
    .document-content h2 {
      font-size: 1.5em;
      margin: 1.5em 0 0.8em 0;
      line-height: 1.3;
      font-weight: 600;
      color: inherit;
    }

    /* Remove border from h2 if it immediately follows another header (to avoid double borders) */
    .doc-container h1 + h2,
    .document-content h1 + h2,
    .doc-container h2 + h2,
    .document-content h2 + h2,
    .doc-container h3 + h2,
    .document-content h3 + h2 {
      border-bottom: none;
      padding-bottom: 0;
      margin-top: 0.5em;
    }

    .doc-container h3,
    .document-content h3 {
      font-size: 1.25em;
      margin: 1.2em 0 0.6em 0;
      line-height: 1.3;
      font-weight: 600;
    }

    /* Remove border from h3 if it immediately follows another header (to avoid double borders) */
    .doc-container h1 + h3,
    .document-content h1 + h3,
    .doc-container h2 + h3,
    .document-content h2 + h3,
    .doc-container h3 + h3,
    .document-content h3 + h3 {
      border-bottom: none;
      padding-bottom: 0;
      margin-top: 0.4em;
    }

    .doc-container h4,
    .doc-container h5,
    .doc-container h6,
    .document-content h4,
    .document-content h5,
    .document-content h6 {
      margin: 1em 0 0.5em 0;
      line-height: 1.3;
      font-weight: 600;
    }

    /* Text justification for better readability - works with both */
    .doc-container p,
    .document-content p {
      margin: 0 0 1em 0;
      text-align: justify;
      text-justify: inter-word;
      hyphens: auto;
    }

    /* Lists with justification - works with both */
    .doc-container ul,
    .doc-container ol,
    .document-content ul,
    .document-content ol {
      margin: 0 0 1em 1.5em;
      padding-left: 1em;
    }

    .doc-container li,
    .document-content li {
      margin-bottom: 0.5em;
      text-align: justify;
    }

    /* Media elements - works with both */
    .doc-container img,
    .doc-container video,
    .doc-container iframe,
    .document-content img,
    .document-content video,
    .document-content iframe {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1em auto;
    }

    /* Tables with better styling - works with both */
    .doc-container table,
    .document-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }

    .doc-container th,
    .doc-container td,
    .document-content th,
    .document-content td {
      padding: 8px 12px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      text-align: left;
    }

    .doc-container th,
    .document-content th {
      font-weight: 600;
      background-color: rgba(0, 0, 0, 0.05);
    }

    /* Code blocks - works with both */
    .doc-container code,
    .doc-container pre,
    .document-content code,
    .document-content pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                   "Liberation Mono", "Courier New", monospace;
    }

    .doc-container code,
    .document-content code {
      background-color: rgba(0, 0, 0, 0.05);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
    }

    .doc-container pre,
    .document-content pre {
      padding: 12px 16px;
      border-radius: 6px;
      overflow: auto;
      background-color: rgba(0, 0, 0, 0.05);
      border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .doc-container pre code,
    .document-content pre code {
      background-color: transparent;
      padding: 0;
    }

    /* Blockquotes - works with both */
    .doc-container blockquote,
    .document-content blockquote {
      margin: 1em 0;
      padding-left: 1.5em;
      border-left: 3px solid rgba(0, 0, 0, 0.2);
      font-style: italic;
      text-align: justify;
    }

    /* Links - works with both */
    .doc-container a,
    .document-content a {
      color: inherit;
      text-decoration: underline;
    }

    /* Spacing niceties - works with both */
    .doc-container h1:first-child,
    .doc-container h2:first-child,
    .doc-container h3:first-child,
    .document-content h1:first-child,
    .document-content h2:first-child,
    .document-content h3:first-child { margin-top: 0; }
    .doc-container :target,
    .document-content :target { scroll-margin-top: 24px; }

    /* Print styles - works with both */
    @media print {
      .doc-container,
      .document-content {
        max-width: 100%;
        padding: 0;
      }

      .doc-container .doc-section,
      .document-content .doc-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="doc-container">
    ${inner}
  </div>
</body>
</html>`;
}

export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(String(s));
}

export function textToHtml(s: string): string {
  const t = String(s || '').trim();
  if (!t) return '<p>No content available</p>';
  const lines = t.split(/\r?\n/);
  const blocks: string[] = [];
  let buf: string[] = [];
  const flush = (): void => {
    if (buf.length) {
      blocks.push(`<p>${buf.map(escapeHtml).join('<br>')}</p>`);
      buf = [];
    }
  };
  for (const line of lines) {
    if (line.trim() === '') {
      flush();
    } else {
      buf.push(line);
    }
  }
  flush();
  return blocks.join('\n');
}
