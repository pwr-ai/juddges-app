// Main HTML fixing pipeline

import { JSDOM } from 'jsdom';
import { convertLongSpansToParagraphs } from './span-converter';
import { convertNumberedParagraphsToLists, convertBulletParagraphsToLists } from './list-converter';
import { highlightLegalReferences } from './legal-references';
import { cleanupParagraphPresentation, enhanceStandaloneStrongBlocks, removeEmptyParagraphs, removeInlineFontStyles, wrapContentInSections } from './text-processor';
import { convertStyledSpansToHeaders, processPlainTextHeaders, splitTextNodesWithHeaders, addHeadersToContent } from './polish-document';
import { detectEnglishJudgment, parseEnglishJudgment } from './english-judgment';

export function fixHtmlContentServer(input: string): string {
  const diagLog: string[] = [];
  const addDiag = (label: string, extra?: Record<string, unknown>): void => {
    try {
      const line = `[diag] ${label}${extra ? ' ' + JSON.stringify(extra) : ''}\n` +
        (new Error().stack || '');
      diagLog.push(line);
    } catch {
      // ignore diag errors
    }
  };
  let stage = 'init';
  const s = String(input ?? '');

  try {
    // Check if input already has HTML structure - if so, skip plain text processing
    // This prevents breaking existing HTML like page headers
    stage = 'detect-structure';
    const hasHtmlStructure = /<header|<nav|<footer|<aside|<main|<article/i.test(s) ||
      /<div[^>]*class[^>]*header/i.test(s) ||
      /<section[^>]*class[^>]*header/i.test(s);

    stage = 'jsdom-init';
    const dom = new JSDOM(`<body><div id="wrap">${s}</div></body>`);
    const { document } = dom.window;
    const root = document.getElementById('wrap')!;

    stage = 'sanitize-scripts';
    root.querySelectorAll('script').forEach((n) => n.remove());
    stage = 'root-normalize';
    root.normalize();

    stage = 'removeEmptyParagraphs(early)';
    removeEmptyParagraphs(root);

    // Remove all inline font styles from input HTML
    stage = 'removeInlineFontStyles';
    removeInlineFontStyles(root);

    stage = 'convertLongSpansToParagraphs';
    convertLongSpansToParagraphs(root, document);

    // FIRST: Check if this is an English judgment and parse it
    stage = 'detectEnglishJudgment';
    const isEnglishJudgment = detectEnglishJudgment(root);
    if (isEnglishJudgment) {
      stage = 'parseEnglishJudgment';
      parseEnglishJudgment(root, document);
    }

    // SECOND: Convert styled spans containing "Interpretacja indywidualna" to headers
    stage = 'convertStyledSpansToHeaders';
    convertStyledSpansToHeaders(root, document);

    // SECOND: Handle plain text content (no HTML tags)
    stage = 'processPlainTextHeaders?';
    if (!hasHtmlStructure) {
      processPlainTextHeaders(root, document);
    }

    // ALWAYS process paragraphs
    stage = 'splitTextNodesWithHeaders(pass1)';
    splitTextNodesWithHeaders(root, document);
    stage = 'splitTextNodesWithHeaders(pass2)';
    splitTextNodesWithHeaders(root, document);

    // Check headers - cache the query result
    stage = 'check-headers';
    const headers = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const hasHeaders = headers.length > 0;
    if (!hasHeaders) {
      stage = 'addHeadersToContent';
      addHeadersToContent(root, document);
    }

    stage = 'trim-empty-after-headings';
    // Re-query headers if we added new ones, otherwise use cached result
    const headersToTrim = hasHeaders ? headers : root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headersToTrim.forEach(heading => {
      const nextEl = heading.nextElementSibling as HTMLElement | null;
      if (nextEl && /^(P|DIV)$/.test(nextEl.tagName)) {
        const text = (nextEl.textContent || '').replace(/\u00A0/g, ' ');
        if (text.trim() === '') {
          nextEl.remove();
        }
      }
    });

    stage = 'removeEmptyParagraphs(late)';
    removeEmptyParagraphs(root);
    stage = 'convertBulletParagraphsToLists';
    convertBulletParagraphsToLists(root, document);
    stage = 'convertNumberedParagraphsToLists';
    convertNumberedParagraphsToLists(root, document);

    stage = 'wrapContentInSections';
    wrapContentInSections(root, document);

    stage = 'cleanupParagraphPresentation';
    cleanupParagraphPresentation(root);
    stage = 'enhanceStandaloneStrongBlocks';
    enhanceStandaloneStrongBlocks(root, document);
    stage = 'highlightLegalReferences';
    highlightLegalReferences(root, document, diagLog);

    stage = 'serialize';
    const out = root.innerHTML;
    return out;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    addDiag(`FAILED at stage=${stage}`, { message: errorMessage });
    const err = new Error(`[documents-html] failed at stage=${stage}: ${errorMessage}`);
    (err as unknown as Record<string, unknown>).diagLog = diagLog;
    (err as unknown as Record<string, unknown>).stage = stage;
    (err as unknown as Record<string, unknown>).cause = e;
    throw err;
  }
}
