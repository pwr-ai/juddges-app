import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

type Props = {
  htmlString?: string | null;
  metadata?: { title?: string | null };
};

export function SanitizedHtmlView({
  htmlString,
  metadata,
}: Props): React.JSX.Element {
  const { purified, extractedStyles } = useMemo(() => {
    if (!htmlString) return { purified: '', extractedStyles: '' };

    // Check if it's a full HTML document
    const isFullDocument = /<!doctype\s+html|<\s*html[\s>]/i.test(htmlString);

    let bodyContent = htmlString;
    let styles = '';

    if (isFullDocument) {
      // Extract all styles from <head> (handle multiple style tags)
      const styleMatches = htmlString.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      const styleArray: string[] = [];
      for (const match of styleMatches) {
        if (match[1]) {
          styleArray.push(match[1]);
        }
      }
      styles = styleArray.join('\n');

      // Extract body content
      const bodyMatch = htmlString.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        bodyContent = bodyMatch[1];
        // If body contains doc-container, extract just that content
        // Use DOMParser to safely extract doc-container content
        const parser = new DOMParser();
        const doc = parser.parseFromString(bodyContent, 'text/html');
        const container = doc.querySelector('.doc-container');
        if (container) {
          bodyContent = container.innerHTML;
        }
      } else {
        // If no body tag, try to extract content from doc-container directly
        const containerMatch = htmlString.match(/<div[^>]*class\s*=\s*["']doc-container["'][^>]*>([\s\S]*?)<\/div>/i);
        if (containerMatch) {
          bodyContent = containerMatch[1];
        }
      }
    }

    // Sanitize HTML with DOMPurify (trusted content from our own API, sanitized for safety)
    let purified = DOMPurify.sanitize(bodyContent, {
      USE_PROFILES: { html: true },
      ALLOW_ARIA_ATTR: true,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['on*'],
      ADD_ATTR: ['target', 'rel'],
      RETURN_TRUSTED_TYPE: false,
    })
      // Ensure safe external links
      .replaceAll(/<a\s+([^>]*?)>/gi, (_m: string, attrs: string) => {
        const hasTarget = /\btarget\s*=/i.test(attrs);
        const hasRel = /\brel\s*=/i.test(attrs);
        let out = `<a ${attrs}`;
        if (!hasTarget) out = out.replace(/<a\s+/i, '<a target="_blank"');
        if (!hasRel) out = out.replace(/<a\s+/i, '<a rel="noopener noreferrer nofollow"');
        return out + '>';
      });

    // Remove <unk> tokens (unknown tokens from text processing/AI models)
    // Replace with empty string to clean up the content
    purified = purified.replace(/<unk>/gi, '');

    return { purified, extractedStyles: styles };
  }, [htmlString]);

  if (!htmlString) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        <p>Document content not available</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/50 bg-white/60 backdrop-blur-md">
      <style>{`
        /* Extracted document styles */
        ${extractedStyles}

        /* Theme-aware overrides */
        .document-content {
          background-color: white !important;
          color: rgb(15 23 42) !important;
        }
        /* Override white backgrounds in the HTML content */
        .document-content [style*="background"][style*="white"i],
        .document-content [style*="background"][style*="#fff"i],
        .document-content [style*="background"][style*="#ffffff"i],
        .document-content [style*="background"][style*="rgb(255,255,255)"i] {
          background-color: transparent !important;
        }
        .document-content table,
        .document-content th,
        .document-content td {
          background-color: transparent !important;
        }
        /* Ensure document styles are scoped to document-content */
        .document-content .doc-container {
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        /* Override prose styles for last element to reduce bottom spacing */
        .document-content > *:last-child {
          margin-bottom: 0 !important;
        }
        .document-content p:last-child {
          margin-bottom: 0 !important;
        }
        /* Ensure document content has proper bottom padding */
        .document-content {
          padding-bottom: 1rem !important;
        }

        /* Ensure bullet lists are visible */
        .document-content ul,
        .document-content ol {
          list-style-type: disc !important;
          padding-left: 1.5rem !important;
          margin: 1rem 0 !important;
        }
        .document-content ol {
          list-style-type: decimal !important;
        }
        .document-content ul ul {
          list-style-type: circle !important;
        }
        .document-content ul ul ul {
          list-style-type: square !important;
        }
        .document-content li {
          display: list-item !important;
          list-style-position: outside !important;
          margin: 0.25rem 0 !important;
        }

        /* Print-specific styles - CRITICAL for preventing text cutoff */
        @media print {
          /* Remove ALL height and overflow restrictions on document-content and its parents */
          .document-content,
          div.document-content,
          [role="document"] {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            visibility: visible !important;
          }

          /* Remove ALL restrictions from everything inside */
          .document-content *,
          .document-content * * {
            overflow: visible !important;
            max-height: none !important;
            min-height: 0 !important;
            height: auto !important;
          }
        }
      `}</style>
      {/* Content is sanitized with DOMPurify above before being rendered */}
      <div
        className="document-content w-full px-6 pt-6 pb-4 prose prose-slate max-w-none text-slate-900"
        role="document"
        aria-label={metadata?.title || 'Document'}
        dangerouslySetInnerHTML={{ __html: purified }}
      />
    </div>
  );
}
