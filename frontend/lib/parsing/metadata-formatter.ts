// Metadata formatting for English judgments

import { stripFakeSeparatorsFromNode } from './text-processor';

export function appendFormattedMetadataValue(metaP: Element, rawValue: string, document: Document, label?: string): void {
  if (!rawValue) return;
  let value = rawValue
    .replace(/_+/g, ' ')
    .replace(/[-–—]\s+and\s+[-–—]/gi, ' and ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!value) return;

  if (label && /^between:/i.test(label) && !/[.!?]$/.test(value)) {
    value = `${value}.`;
  }

  const appendTextSegment = (text: string): void => {
    appendNormalizedTextToMetadata(metaP, text, document);
  };

  const insertSeparator = (keyword: string): void => {
    if (!metaP.lastChild) {
      return;
    }

    if (/^Appellants?$/i.test(keyword)) {
      const metaPRecord = metaP as unknown as Record<string, unknown>;
      if (!metaPRecord.__hasAppellantBreak) {
        metaP.appendChild(document.createElement('br'));
        metaPRecord.__hasAppellantBreak = true;
        return;
      }
    }

    if (/^Approved$/i.test(keyword)) {
      metaP.appendChild(document.createElement('br'));
      return;
    }

    ensureMetadataSeparator(metaP, document);
  };

  const keywordRegex = /(Appellants?\b|Approved\b)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = keywordRegex.exec(value)) !== null) {
    const before = value.slice(lastIndex, match.index);
    appendTextSegment(before);

    insertSeparator(match[1]);

    const strong = document.createElement('strong');
    strong.textContent = match[1];
    metaP.appendChild(strong);

    lastIndex = match.index + match[0].length;
  }

  const remaining = value.slice(lastIndex);
  appendTextSegment(remaining);

  stripFakeSeparatorsFromNode(metaP);
}

export function ensureMetadataSeparator(metaP: Element, document: Document): void {
  const lastChild = metaP.lastChild;
  if (!lastChild) return;
  if (lastChild.nodeType === 1) {
    const el = lastChild as Element;
    if (el.tagName === 'BR') {
      return;
    }
  }
  if (lastChild.nodeType === 3) {
    const text = (lastChild as Text).textContent || '';
    if (/\s$/.test(text)) {
      return;
    }
  }
  metaP.appendChild(document.createTextNode(' '));
}

export function appendNormalizedTextToMetadata(metaP: Element, text: string, document: Document): void {
  if (!text) return;
  const normalized = text
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return;
  if (metaP.lastChild) {
    ensureMetadataSeparator(metaP, document);
  }
  metaP.appendChild(document.createTextNode(normalized));
}

export function moveChildNodesIntoMetadata(target: Element, source: Element, document: Document): void {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  while (source.firstChild) {
    const child = source.firstChild as Node;
    source.removeChild(child);
    if (child.nodeType === TEXT_NODE) {
      appendNormalizedTextToMetadata(target, (child as Text).textContent || '', document);
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      if (el.tagName === 'BR') {
        target.appendChild(el);
      } else {
        if (target.lastChild) {
          ensureMetadataSeparator(target, document);
        }
        target.appendChild(el);
      }
    }
  }
  stripFakeSeparatorsFromNode(target);
}
