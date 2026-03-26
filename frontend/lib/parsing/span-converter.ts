// Long span to paragraph conversion

import {
  ELEMENT_NODE,
  TEXT_NODE,
  COMMENT_NODE,
  isSpanNode,
  isSpanNodeWithText,
  isInlineWrapperElement,
  isWhitespaceTextNode,
  getNodeTextLength,
  getNodeTextLengthDeep,
  hasLongSpanDescendant,
  isConvertibleInlineWrapper,
  findConvertibleAncestor,
  appendTextNodeToContainer,
  appendSpanContentToContainer,
  appendNonSpanNodeToContainer,
  appendInlineWrapperToContainer,
} from './dom-utils';

export function convertLongSpansToParagraphs(root: HTMLElement, document: Document): void {
  const BLOCK_CONTAINER_TAGS = new Set([
    'DIV',
    'SECTION',
    'ARTICLE',
    'MAIN',
    'ASIDE',
    'HEADER',
    'FOOTER',
    'NAV',
    'BODY',
    'TD',
    'TH',
  ]);

  const DISALLOWED_PARENT_TAGS = new Set([
    'LI',
    'DT',
    'DD',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'FIGCAPTION',
    'CAPTION',
  ]);

  const APPROX_LINE_LENGTH = 80;
  const LONG_SPAN_THRESHOLD = APPROX_LINE_LENGTH * 2;
  const GROUP_THRESHOLD = LONG_SPAN_THRESHOLD;

  const candidateParents = new Set<HTMLElement>();
  const paragraphCandidates = new Set<HTMLElement>();

  const spans = Array.from(root.querySelectorAll('span')) as HTMLElement[];
  spans.forEach((span) => {
    const length = getNodeTextLength(span);
    if (length < LONG_SPAN_THRESHOLD) {
      return;
    }

    const blockAncestor = findConvertibleAncestor(span, root, BLOCK_CONTAINER_TAGS);
    if (!blockAncestor) {
      return;
    }

    if (blockAncestor.tagName === 'P') {
      paragraphCandidates.add(blockAncestor);
      return;
    }

    if (DISALLOWED_PARENT_TAGS.has(blockAncestor.tagName)) {
      return;
    }

    candidateParents.add(blockAncestor);
  });

  candidateParents.forEach((parent) => {
    let childNodes = Array.from(parent.childNodes);

    for (let i = 0; i < childNodes.length;) {
      const node = childNodes[i];

      if (
        !isSpanNodeWithText(node) &&
        !isConvertibleInlineWrapper(node, LONG_SPAN_THRESHOLD)
      ) {
        i += 1;
        continue;
      }

      const sequence: Node[] = [];
      let j = i;
      let spanCount = 0;
      let hasLongSpan = false;
      let totalLength = 0;

      while (j < childNodes.length) {
        const current = childNodes[j];

        if (isSpanNode(current)) {
          const spanLen = getNodeTextLength(current as HTMLElement);
          if (spanLen === 0) {
            j += 1;
            continue;
          }
          sequence.push(current);
          spanCount += 1;
          totalLength += spanLen;
          if (spanLen >= LONG_SPAN_THRESHOLD) {
            hasLongSpan = true;
          }
          j += 1;
          continue;
        }

        if (isConvertibleInlineWrapper(current, LONG_SPAN_THRESHOLD)) {
          const wrapper = current as HTMLElement;
          const wrapperLength = getNodeTextLengthDeep(wrapper);
          sequence.push(wrapper);
          spanCount += 1;
          totalLength += wrapperLength;
          if (
            wrapperLength >= LONG_SPAN_THRESHOLD ||
            hasLongSpanDescendant(wrapper, LONG_SPAN_THRESHOLD)
          ) {
            hasLongSpan = true;
          }
          j += 1;
          continue;
        }

        if (isWhitespaceTextNode(current)) {
          sequence.push(current);
          j += 1;
          continue;
        }

        break;
      }

      if (spanCount === 0) {
        i = j;
        continue;
      }

      if (!hasLongSpan && totalLength < GROUP_THRESHOLD) {
        i = j;
        continue;
      }

      const paragraph = document.createElement('p');

      sequence.forEach((item) => {
        if (item.nodeType === TEXT_NODE) {
          appendTextNodeToContainer(paragraph, item as Text, document);
        } else if (isSpanNode(item)) {
          appendSpanContentToContainer(paragraph, item as HTMLElement, document);
        } else if (isInlineWrapperElement(item)) {
          appendInlineWrapperToContainer(paragraph, item as HTMLElement, document);
        } else if (item.nodeType === ELEMENT_NODE) {
          appendNonSpanNodeToContainer(paragraph, item as Node, document);
        }
      });

      paragraph.normalize();

      const reference = sequence[sequence.length - 1].nextSibling;
      parent.insertBefore(paragraph, reference);
      sequence.forEach((nodeToRemove) => nodeToRemove.parentNode?.removeChild(nodeToRemove));

      childNodes = Array.from(parent.childNodes);
      i = childNodes.indexOf(paragraph) + 1;
    }
  });

  paragraphCandidates.forEach((paragraph) => {
    if (!paragraph.parentNode) {
      return;
    }

    const replacement = paragraph.cloneNode(false) as HTMLElement;
    const childNodes = Array.from(paragraph.childNodes);

    childNodes.forEach((node) => {
      if (node.nodeType === TEXT_NODE) {
        appendTextNodeToContainer(replacement, node as Text, document);
        return;
      }

      if (isSpanNode(node)) {
        appendSpanContentToContainer(replacement, node as HTMLElement, document);
        return;
      }

      if (node.nodeType === COMMENT_NODE) {
        return;
      }

      if (isInlineWrapperElement(node)) {
        appendInlineWrapperToContainer(replacement, node as HTMLElement, document);
        return;
      }

      appendNonSpanNodeToContainer(replacement, node as Node, document);
    });

    replacement.normalize();
    paragraph.replaceWith(replacement);
  });
}
