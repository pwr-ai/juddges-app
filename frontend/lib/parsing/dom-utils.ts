// DOM manipulation utilities

// Constants
export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;
export const SHOW_TEXT = (globalThis as { NodeFilter?: { SHOW_TEXT?: number } }).NodeFilter?.SHOW_TEXT ?? 4;
export const INLINE_WRAPPER_TAGS = new Set([
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'DEL',
  'INS',
  'MARK',
  'SMALL',
  'SUP',
  'SUB',
  'A',
  'CITE',
  'DFN',
  'KBD',
  'Q',
  'TIME',
  'CODE',
]);

export function isElementNode(node: Node | null): node is HTMLElement {
  return Boolean(node && node.nodeType === ELEMENT_NODE);
}

export function isSpanNode(node: Node | null): node is HTMLElement {
  return isElementNode(node) && (node as HTMLElement).tagName === 'SPAN';
}

export function isSpanNodeWithText(node: Node | null): boolean {
  return isSpanNode(node) && getNodeTextLength(node as HTMLElement) > 0;
}

export function isInlineWrapperElement(node: Node | null): node is HTMLElement {
  return isElementNode(node) && INLINE_WRAPPER_TAGS.has((node as HTMLElement).tagName);
}

export function isWhitespaceTextNode(node: Node | null): node is Text {
  if (!node || node.nodeType !== TEXT_NODE) {
    return false;
  }
  const text = (node.textContent || '').replace(/\u00A0/g, ' ');
  return text.trim().length === 0;
}

export function getNodeTextLength(element: HTMLElement): number {
  const text = (element.textContent || '').replace(/\u00A0/g, ' ');
  return text.replace(/\s+/g, ' ').trim().length;
}

export function getNodeTextLengthDeep(element: HTMLElement): number {
  const text = (element.textContent || '').replace(/\u00A0/g, ' ');
  return text.replace(/\s+/g, ' ').trim().length;
}

export function hasLongSpanDescendant(element: HTMLElement, threshold: number): boolean {
  return Array.from(element.querySelectorAll('span')).some((span) => getNodeTextLength(span as HTMLElement) >= threshold);
}

export function containsBlockDescendant(element: HTMLElement): boolean {
  return element.querySelector('p, div, section, article, table, ul, ol, li, blockquote, header, footer, aside, main') !== null;
}

export function isConvertibleInlineWrapper(node: Node | null, threshold: number): node is HTMLElement {
  if (!isInlineWrapperElement(node)) {
    return false;
  }

  const element = node as HTMLElement;
  if (containsBlockDescendant(element)) {
    return false;
  }

  const length = getNodeTextLengthDeep(element);
  if (length === 0) {
    return false;
  }

  return length >= threshold || hasLongSpanDescendant(element, threshold);
}

export function findConvertibleAncestor(
  span: HTMLElement,
  root: HTMLElement,
  blockTags: Set<string>
): HTMLElement | null {
  let current: HTMLElement | null = span.parentElement;

  while (current) {
    if (current === span) {
      break;
    }
    if (current === root) {
      return current;
    }
    if (current.tagName === 'P') {
      return current;
    }
    if (blockTags.has(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function appendTextNodeToContainer(container: HTMLElement, node: Text, document: Document): void {
  let value = (node.textContent || '').replace(/\u00A0/g, ' ');
  if (!value) {
    return;
  }

  value = value.replace(/\s+/g, ' ');
  if (container.childNodes.length === 0) {
    value = value.replace(/^\s+/, '');
  }

  if (!value) {
    return;
  }

  if (needsSpaceBeforeAppend(container, value)) {
    container.appendChild(document.createTextNode(' '));
  }

  node.textContent = value.replace(/^\s+/, '');
  container.appendChild(node);
}

export function appendSpanContentToContainer(
  container: HTMLElement,
  span: HTMLElement,
  document: Document
): void {
  const spanText = (span.textContent || '').replace(/\u00A0/g, ' ');

  if (container.childNodes.length > 0 && needsSpaceBeforeAppend(container, spanText)) {
    container.appendChild(document.createTextNode(' '));
  }

  while (span.firstChild) {
    const child = span.firstChild;
    span.removeChild(child);

    if (child.nodeType === TEXT_NODE) {
      const textNode = child as Text;
      let value = (textNode.textContent || '').replace(/\u00A0/g, ' ');

      if (container.childNodes.length === 0) {
        value = value.replace(/^\s+/, '');
      }

      value = value.replace(/\s+/g, ' ');

      if (!value) {
        continue;
      }

      if (needsSpaceBeforeAppend(container, value)) {
        container.appendChild(document.createTextNode(' '));
      }

      textNode.textContent = value.replace(/^\s+/, '');
      container.appendChild(textNode);
      continue;
    }

    container.appendChild(child);
  }
}

export function needsSpaceBeforeAppend(container: HTMLElement, incomingText: string): boolean {
  const trimmedIncoming = incomingText.replace(/\u00A0/g, ' ').replace(/^\s+/, '');
  if (!trimmedIncoming) {
    return false;
  }

  const firstChar = trimmedIncoming[0];
  if (/[.,;:!?)]/.test(firstChar)) {
    return false;
  }

  const existingText = (container.textContent || '').replace(/\u00A0/g, ' ');
  const trimmedExisting = existingText.replace(/\s+$/, '');

  if (!trimmedExisting) {
    return false;
  }

  const lastChar = trimmedExisting[trimmedExisting.length - 1];
  if (!lastChar || /\s/.test(lastChar) || lastChar === '(') {
    return false;
  }

  return true;
}

export function appendNonSpanNodeToContainer(
  container: HTMLElement,
  node: Node,
  document: Document
): void {
  if (!isElementNode(node)) {
    container.appendChild(node);
    return;
  }

  appendElementNodeToContainer(container, node as HTMLElement, document);
}

export function appendElementNodeToContainer(
  container: HTMLElement,
  element: HTMLElement,
  document: Document
): void {
  if (isInlineWrapperElement(element)) {
    appendInlineWrapperToContainer(container, element, document);
    return;
  }

  const elementAny = element as unknown as { cloneNode: (deep?: boolean) => Node; firstChild: Node | null; removeChild: (child: Node) => Node };
  const clone = elementAny.cloneNode(false) as HTMLElement;

  while (elementAny.firstChild) {
    const child = elementAny.firstChild;
    elementAny.removeChild(child);

    if (child.nodeType === TEXT_NODE) {
      appendTextNodeToContainer(clone, child as Text, document);
    } else if (isSpanNode(child)) {
      appendSpanContentToContainer(clone, child as HTMLElement, document);
    } else if (isInlineWrapperElement(child)) {
      appendInlineWrapperToContainer(clone, child as HTMLElement, document);
    } else {
      appendNonSpanNodeToContainer(clone, child as Node, document);
    }
  }

  clone.normalize();

  if (container.childNodes.length > 0 && needsSpaceBeforeAppend(container, clone.textContent || '')) {
    container.appendChild(document.createTextNode(' '));
  }

  container.appendChild(clone);
}

export function appendInlineWrapperToContainer(
  container: HTMLElement,
  wrapper: HTMLElement,
  document: Document
): void {
  const wrapperAny = wrapper as unknown as { cloneNode: (deep?: boolean) => Node; firstChild: Node | null; removeChild: (child: Node) => Node };
  const clone = wrapperAny.cloneNode(false) as HTMLElement;

  while (wrapperAny.firstChild) {
    const child = wrapperAny.firstChild;
    wrapperAny.removeChild(child);

    if (child.nodeType === TEXT_NODE) {
      appendTextNodeToContainer(clone, child as Text, document);
    } else if (isSpanNode(child)) {
      appendSpanContentToContainer(clone, child as HTMLElement, document);
    } else if (isInlineWrapperElement(child)) {
      appendInlineWrapperToContainer(clone, child as HTMLElement, document);
    } else {
      appendNonSpanNodeToContainer(clone, child as Node, document);
    }
  }

  clone.normalize();

  if (!clone.childNodes.length && !(clone.textContent || '').trim() && !clone.attributes.length) {
    return;
  }

  if (container.childNodes.length > 0 && needsSpaceBeforeAppend(container, clone.textContent || '')) {
    container.appendChild(document.createTextNode(' '));
  }

  container.appendChild(clone);
}

export function isIgnorableLeadingNode(node: Node): boolean {
  if (node.nodeType === TEXT_NODE) {
    return !((node.textContent || '').trim());
  }
  if (!isElementNode(node)) {
    return node.nodeType === COMMENT_NODE;
  }
  return !((node.textContent || '').replace(/\u00A0/g, ' ').trim());
}

export function isWhitespaceOrBreakNode(node: Node): boolean {
  if (node.nodeType === TEXT_NODE) {
    const text = (node.textContent || '').replace(/\u00A0/g, ' ');
    return text.trim().length === 0;
  }
  if (!isElementNode(node)) {
    return false;
  }
  if (node.tagName === 'BR') {
    return true;
  }
  const text = (node.textContent || '').replace(/\u00A0/g, ' ');
  return text.trim().length === 0 && node.attributes.length === 0;
}

export function removeEdgeWhitespaceNodes(container: Node, fromStart: boolean): void {
  while (true) {
    const child = fromStart ? container.firstChild : container.lastChild;
    if (!child) {
      break;
    }
    if (!isWhitespaceOrBreakNode(child)) {
      break;
    }
    container.removeChild(child);
  }
}

export function trimWhitespaceInsideNode(node: Node, fromStart: boolean): void {
  let child = fromStart ? node.firstChild : node.lastChild;
  while (child) {
    if (child.nodeType === TEXT_NODE) {
      const textNode = child as Text;
      const content = (textNode.textContent || '').replace(/\u00A0/g, ' ');
      const updated = fromStart ? content.replace(/^\s+/, '') : content.replace(/\s+$/, '');
      if (updated.length === 0) {
        const next = fromStart ? child.nextSibling : child.previousSibling;
        child.parentNode?.removeChild(child);
        child = next;
        continue;
      }
      textNode.textContent = updated;
      break;
    }

    if (isElementNode(child)) {
      trimWhitespaceInsideNode(child, fromStart);
      const text = (child.textContent || '').replace(/\u00A0/g, ' ');
      if (!text.trim()) {
        const next = fromStart ? child.nextSibling : child.previousSibling;
        child.parentNode?.removeChild(child);
        child = next;
        continue;
      }
      break;
    }

    break;
  }
}
