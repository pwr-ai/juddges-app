// Text node processing utilities

import {
  ELEMENT_NODE,
  TEXT_NODE,
  SHOW_TEXT,
  isElementNode,
  isWhitespaceOrBreakNode,
  removeEdgeWhitespaceNodes,
} from './dom-utils';

export function removeEmptyParagraphs(root: HTMLElement): void {
  const paragraphs = Array.from(root.querySelectorAll('p')) as HTMLElement[];
  const meaningfulChildTags = new Set([
    'IMG',
    'VIDEO',
    'AUDIO',
    'IFRAME',
    'TABLE',
    'UL',
    'OL',
    'LI',
    'PRE',
    'CODE',
    'BLOCKQUOTE',
    'CANVAS',
    'SVG',
    'EMBED',
    'OBJECT',
    'HR',
  ]);

  paragraphs.forEach((paragraph) => {
    if (!paragraph.parentNode) {
      return;
    }

    const text = (paragraph.textContent || '').replace(/\u00A0/g, ' ').trim();
    if (text.length > 0) {
      return;
    }

    const hasMeaningfulChild = Array.from(paragraph.childNodes).some((node) => {
      if (node.nodeType === ELEMENT_NODE) {
        const el = node as Element;
        if (meaningfulChildTags.has(el.tagName)) {
          return true;
        }
        const childText = (el.textContent || '').replace(/\u00A0/g, ' ').trim();
        return childText.length > 0;
      }

      if (node.nodeType === TEXT_NODE) {
        return ((node.textContent || '').replace(/\u00A0/g, ' ').trim().length > 0);
      }

      return false;
    });

    if (!hasMeaningfulChild) {
      paragraph.remove();
    }
  });
}

export function removeInlineFontStyles(root: HTMLElement): void {
  // Remove all inline font-related styles from all elements
  const allElements = root.querySelectorAll('*');
  allElements.forEach((el) => {
    if (el.nodeType === 1 && 'style' in el) {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style) {
        const style = htmlEl.style;
        // Remove all font-related styles
        style.removeProperty('font-family');
        style.removeProperty('font-size');
        style.removeProperty('font-weight');
        style.removeProperty('font-style');
        style.removeProperty('font-variant');
        style.removeProperty('font');
        style.removeProperty('color');
        style.removeProperty('line-height');
      }
    }
  });

  // Also remove inline styles from body tags if present
  const bodyElements = root.querySelectorAll('body');
  bodyElements.forEach((body) => {
    if (body.nodeType === 1 && 'style' in body) {
      const htmlBody = body as HTMLElement;
      if (htmlBody.style) {
        const style = htmlBody.style;
        style.removeProperty('font-family');
        style.removeProperty('font-size');
        style.removeProperty('font-weight');
        style.removeProperty('font-style');
        style.removeProperty('font-variant');
        style.removeProperty('font');
        style.removeProperty('color');
        style.removeProperty('line-height');
      }
    }
  });
}

export function endsWithSentenceBoundary(text: string): boolean {
  if (!text) return false;
  const trimmed = text.replace(/[\s\u00A0]+$/, '');
  if (!trimmed) return false;

  let index = trimmed.length - 1;
  while (index >= 0 && /["'"]/.test(trimmed[index])) {
    index--;
  }

  if (index < 0) return false;
  const lastChar = trimmed[index];
  return /[.!?]/.test(lastChar);
}

export function collapseParagraphWhitespace(paragraph: HTMLElement): void {
  const skipTags = new Set(['PRE', 'CODE']);
  collapseWhitespaceWithin(paragraph, skipTags);
  normalizeParagraphWhitespace(paragraph);
}

export function collapseWhitespaceWithin(node: Node, skipTags: Set<string>): void {
  if (node.nodeType === TEXT_NODE) {
    const original = node.textContent || '';
    const collapsed = original
      .replace(/[\r\n\u2028\u2029]+/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ');
    if (collapsed !== original) {
      node.textContent = collapsed;
    }
    return;
  }

  if (!isElementNode(node)) {
    return;
  }

  if (skipTags.has(node.tagName)) {
    return;
  }

  Array.from(node.childNodes).forEach((child) => collapseWhitespaceWithin(child, skipTags));
}

export function normalizeParagraphWhitespace(paragraph: HTMLElement): void {
  const doc = paragraph.ownerDocument || document;
  const walker = doc.createTreeWalker(paragraph, SHOW_TEXT, null);

  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    const parentElement = textNode.parentElement;
    if (parentElement && parentElement.closest('pre, code')) {
      continue;
    }
    textNodes.push(textNode);
  }

  textNodes.forEach((textNode, index) => {
    let value = textNode.textContent || '';
    value = value
      .replace(/[\r\n\u2028\u2029]+/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\u00A0/g, ' ');

    if (index === 0) {
      value = value.replace(/^\s+/, '');
    } else {
      value = value.replace(/^\s+/, ' ');
    }

    if (index === textNodes.length - 1) {
      value = value.replace(/\s+$/, '');
    } else {
      value = value.replace(/\s{2,}/g, ' ');
      value = value.replace(/\s+$/, ' ');
    }

    if (!value.length) {
      textNode.parentNode?.removeChild(textNode);
    } else {
      textNode.textContent = value;
    }
  });

  removeEdgeWhitespaceNodes(paragraph, true);
  removeEdgeWhitespaceNodes(paragraph, false);
}

export function cleanupParagraphPresentation(root: HTMLElement): void {
  const paragraphs = Array.from(root.querySelectorAll('p')) as HTMLElement[];
  const wordClassPattern = /^Mso/i;

  paragraphs.forEach((paragraph) => {
    const classes = (paragraph.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean);

    const retainedClasses = classes.filter((cls) => !wordClassPattern.test(cls));

    if (retainedClasses.length > 0) {
      paragraph.className = retainedClasses.join(' ');
    } else {
      paragraph.removeAttribute('class');
    }

    if (paragraph.hasAttribute('align')) {
      paragraph.removeAttribute('align');
    }

    const styleAttr = paragraph.getAttribute('style');
    if (styleAttr) {
      const sanitized = styleAttr
        .split(';')
        .map((rule) => rule.trim())
        .filter(Boolean)
        .filter((rule) => !/^margin\b/i.test(rule) && !/^text-align\b/i.test(rule) && !/^text-indent\b/i.test(rule));

      if (sanitized.length > 0) {
        paragraph.setAttribute('style', sanitized.join('; '));
      } else {
        paragraph.removeAttribute('style');
      }
    }

    if (!paragraph.style.marginTop && !paragraph.style.marginBottom) {
      paragraph.style.marginTop = '0.6em';
      paragraph.style.marginBottom = '0.6em';
    }

    collapseParagraphWhitespace(paragraph);
  });
}

export function enhanceStandaloneStrongBlocks(root: HTMLElement, document: Document): void {
  const strongElements = Array.from(root.querySelectorAll('strong')) as HTMLElement[];

  strongElements.forEach((strong) => {
    const text = (strong.textContent || '').trim();
    if (!text) {
      return;
    }

    const parent = strong.parentElement;
    if (!parent) {
      return;
    }

    if (parent.closest('li, ol, ul, table, thead, tbody, tfoot, tr')) {
      return;
    }

    const siblings = Array.from(parent.childNodes);
    const hasOtherContent = siblings.some(
      (node) => node !== strong && !isWhitespaceOrBreakNode(node)
    );

    if (parent.tagName === 'P') {
      if (!hasOtherContent) {
        if (!parent.style.marginTop || parseFloat(parent.style.marginTop) < 1) {
          parent.style.marginTop = '1.2em';
        }
        if (!parent.style.marginBottom) {
          parent.style.marginBottom = '0.6em';
        }
        parent.normalize();
        removeEdgeWhitespaceNodes(parent, true);
        removeEdgeWhitespaceNodes(parent, false);
      }
      return;
    }

    if (!hasOtherContent) {
      const wrapper = document.createElement('p');
      wrapper.style.marginTop = '1.2em';
      wrapper.style.marginBottom = '0.6em';
      parent.insertBefore(wrapper, strong);
      wrapper.appendChild(strong);
    }
  });
}

export function wrapContentInSections(root: HTMLElement, document: Document): void {
  // Simple approach: wrap consecutive content between headers in sections
  const children = Array.from(root.children);
  if (children.length === 0) return;

  let currentSection: HTMLElement | null = null;
  const newChildren: Node[] = [];

  children.forEach((el) => {
    if (/^h[1-6]$/i.test(el.tagName)) {
      // Close previous section
      if (currentSection) {
        newChildren.push(currentSection);
        currentSection = null;
      }

      // Start new section with header
      currentSection = document.createElement('section');
      currentSection.className = 'doc-section';
      currentSection.appendChild(el.cloneNode(true));
    } else if (currentSection) {
      // Add to current section
      currentSection.appendChild(el.cloneNode(true));
    } else {
      // No section yet, add directly
      newChildren.push(el.cloneNode(true));
    }
  });

  // Add last section
  if (currentSection) {
    newChildren.push(currentSection);
  }

  // Replace content if we created sections
  if (newChildren.length > 0 && newChildren.some(n => n.nodeName === 'SECTION')) {
    root.innerHTML = '';
    newChildren.forEach(child => root.appendChild(child));
  }
}

export function stripFakeSeparatorsFromNode(node: Node): void {
  if (node.nodeType === TEXT_NODE) {
    const textNode = node as Text;
    if (textNode.textContent && textNode.textContent.includes('_')) {
      textNode.textContent = textNode.textContent.replace(/_+/g, ' ');
    }
    return;
  }
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    for (let i = 0; i < el.childNodes.length; i++) {
      stripFakeSeparatorsFromNode(el.childNodes[i]);
    }
  }
}

export function removeIfIgnorableBetweenListNode(node: Node): Node | null {
  if (node.nodeType === TEXT_NODE) {
    const text = (node.textContent || '').replace(/\u00A0/g, ' ').trim();
    if (text.length === 0) {
      const next = node.nextSibling;
      node.parentNode?.removeChild(node);
      return next;
    }
    return null;
  }

  if (!isElementNode(node)) {
    return null;
  }

  if (node.tagName === 'BR') {
    const next = node.nextSibling;
    node.parentNode?.removeChild(node);
    return next;
  }

  if (node.tagName === 'SPAN') {
    const text = (node.textContent || '').replace(/\u00A0/g, ' ').trim();
    const hasMeaningfulAttributes = Array.from(node.attributes).some((attr) => attr.value.trim().length > 0);
    if (text.length === 0 && !hasMeaningfulAttributes) {
      const next = node.nextSibling;
      node.parentNode?.removeChild(node);
      return next;
    }
  }

  return null;
}

export function trimListItemWhitespace(listItem: HTMLElement, document: Document): void {
  removeEdgeWhitespaceNodes(listItem, true);
  removeEdgeWhitespaceNodes(listItem, false);
  trimWhitespaceInsideNode(listItem, true);
  trimWhitespaceInsideNode(listItem, false);

  if (!listItem.firstChild) {
    listItem.appendChild(document.createTextNode(''));
    return;
  }

  if (listItem.firstChild!.nodeType === TEXT_NODE) {
    const textNode = listItem.firstChild as Text;
    textNode.textContent = (textNode.textContent || '').replace(/\s+/g, ' ').trimStart();
  }

  if (listItem.lastChild && listItem.lastChild.nodeType === TEXT_NODE) {
    const textNode = listItem.lastChild as Text;
    textNode.textContent = (textNode.textContent || '').replace(/\s+/g, ' ').trimEnd();
  }
}

function trimWhitespaceInsideNode(node: Node, fromStart: boolean): void {
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
