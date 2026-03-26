// Bullet and numbered list conversion

import {
  isElementNode,
  isIgnorableLeadingNode,
} from './dom-utils';
import {
  removeIfIgnorableBetweenListNode,
  trimListItemWhitespace,
} from './text-processor';

export type ListOrderType = 'decimal' | 'lower-alpha';

export interface ListMarker {
  level: number;
  orderType: ListOrderType;
  numericValue: number;
  startValue: number;
}

export function convertNumberedParagraphsToLists(root: HTMLElement, document: Document): void {
  const paragraphs = Array.from(root.querySelectorAll('p')) as HTMLElement[];
  const candidateParents = new Set<HTMLElement>();

  paragraphs.forEach((paragraph) => {
    if (!paragraph.parentElement) {
      return;
    }
    if (paragraph.closest('ol, ul')) {
      return;
    }
    if (paragraph.classList.contains('enumerated-paragraph')) {
      return;
    }
    if (!isNumberedParagraph(paragraph)) {
      return;
    }
    candidateParents.add(paragraph.parentElement);
  });

  candidateParents.forEach((container) => {
    convertNumberedParagraphsWithinContainer(container, document);
  });
}

export function convertBulletParagraphsToLists(root: HTMLElement, document: Document): void {
  const bulletCandidates = Array.from(root.querySelectorAll('p, span')) as HTMLElement[];
  const candidateParents = new Set<HTMLElement>();

  bulletCandidates.forEach((element) => {
    if (!isBulletNode(element)) {
      return;
    }
    const parent = element.parentElement;
    if (parent) {
      candidateParents.add(parent);
    }
  });

  candidateParents.forEach((container) => {
    convertBulletNodesWithinContainer(container, document);
  });
}

export function convertBulletNodesWithinContainer(container: HTMLElement, document: Document): void {
  let node: Node | null = container.firstChild;

  while (node) {
    if (!isBulletNode(node)) {
      const next = removeIfIgnorableBetweenListNode(node);
      node = next ?? node.nextSibling;
      continue;
    }

    const bulletElements: HTMLElement[] = [];
    let scan: Node | null = node;

    while (scan) {
      const nextAfterRemoval = removeIfIgnorableBetweenListNode(scan);
      if (nextAfterRemoval) {
        scan = nextAfterRemoval;
        continue;
      }

      if (!isBulletNode(scan)) {
        break;
      }

      bulletElements.push(scan as HTMLElement);
      scan = scan.nextSibling;
    }

    if (bulletElements.length === 0) {
      node = scan;
      continue;
    }

    const list = document.createElement('ul');
    list.style.marginTop = '0.6em';
    list.style.marginBottom = '0.6em';

    bulletElements.forEach((element) => {
      const listItem = document.createElement('li');
      stripBulletPrefix(element);
      transferElementContentIntoListItem(element, listItem, document);
      trimListItemWhitespace(listItem, document);
      listItem.normalize();
      element.remove();
      list.appendChild(listItem);
    });

    if (list.childElementCount > 0) {
      // Safe insert: if scan is not a child of container, append instead
      if (scan && scan.parentNode === container) {
        container.insertBefore(list, scan);
      } else {
        container.appendChild(list);
      }
    } else {
      list.remove();
    }

    node = list.nextSibling;
  }
}

export function convertNumberedParagraphsWithinContainer(container: HTMLElement, document: Document): void {
  let node: Node | null = container.firstChild;

  while (node) {
    if (!isNumberedParagraphNode(node)) {
      const next = removeIfIgnorableBetweenListNode(node);
      node = next ?? node.nextSibling;
      continue;
    }

    const paragraphs: HTMLElement[] = [];
    const markers: ListMarker[] = [];
    let scan: Node | null = node;

    while (scan) {
      const nextAfterRemoval = removeIfIgnorableBetweenListNode(scan);
      if (nextAfterRemoval) {
        scan = nextAfterRemoval;
        continue;
      }

      if (!isNumberedParagraphNode(scan)) {
        break;
      }

      const paragraph = scan as HTMLElement;
      const marker = parseListMarkerFromParagraph(paragraph);
      if (!marker) {
        break;
      }

      paragraphs.push(paragraph);
      markers.push(marker);
      scan = paragraph.nextSibling;
    }

    if (paragraphs.length === 0) {
      node = scan;
      continue;
    }

    const rootList = document.createElement('ol');
    rootList.style.marginTop = '0.6em';
    rootList.style.marginBottom = '0.6em';

    const listStack: Array<{ list: HTMLOListElement; level: number; orderType: ListOrderType }> = [
      { list: rootList, level: 1, orderType: 'decimal' },
    ];

    paragraphs.forEach((paragraph, index) => {
      const marker = markers[index];
      const targetList = ensureListForMarker(listStack, marker, document);

      const listItem = document.createElement('li');
      stripLeadingEnumerationPrefix(paragraph);
      transferElementContentIntoListItem(paragraph, listItem, document);
      trimListItemWhitespace(listItem, document);
      listItem.normalize();
      paragraph.remove();
      targetList.appendChild(listItem);
    });

    if (rootList.childElementCount > 0) {
      // Safe insert: if scan is not a child of container, append instead
      if (scan && scan.parentNode === container) {
        container.insertBefore(rootList, scan);
      } else {
        container.appendChild(rootList);
      }
    } else {
      rootList.remove();
    }

    node = rootList.nextSibling;
  }
}

export function parseListMarkerFromParagraph(paragraph: HTMLElement): ListMarker | null {
  const text = (paragraph.textContent || '').replace(/\u00A0/g, ' ').trim();
  return parseListMarker(text);
}

export function parseListMarker(text: string): ListMarker | null {
  const alphaMatch = text.match(/^(\d{1,3})([a-z])[.)]\s+/i);
  if (alphaMatch) {
    const numericValue = parseInt(alphaMatch[1], 10);
    const letter = alphaMatch[2].toLowerCase();
    const startValue = Math.max(letter.charCodeAt(0) - 96, 1);
    return {
      level: 2,
      orderType: 'lower-alpha',
      numericValue,
      startValue,
    };
  }

  const numericMatch = text.match(/^(\d{1,3})[.)]\s+/);
  if (numericMatch) {
    const numericValue = parseInt(numericMatch[1], 10);
    return {
      level: 1,
      orderType: 'decimal',
      numericValue,
      startValue: numericValue,
    };
  }

  return null;
}

export function ensureListForMarker(
  listStack: Array<{ list: HTMLOListElement; level: number; orderType: ListOrderType }>,
  marker: ListMarker,
  document: Document
): HTMLOListElement {
  let effectiveMarker = marker;

  while (listStack.length && marker.level < listStack[listStack.length - 1].level) {
    listStack.pop();
  }

  if (!listStack.length) {
    const list = document.createElement('ol');
    list.style.marginTop = '0.6em';
    list.style.marginBottom = '0.6em';
    listStack.push({ list, level: marker.level, orderType: marker.orderType });
  }

  let current = listStack[listStack.length - 1];

  if (marker.level > current.level) {
    const parentInfo = current;
    const parentLi = parentInfo.list.lastElementChild as HTMLElement | null;
    if (parentLi) {
      const nested = document.createElement('ol');
      nested.style.marginTop = '0.4em';
      nested.style.marginBottom = '0.6em';
      configureListType(nested, marker);
      setListStartAttribute(nested, marker, true);
      parentLi.appendChild(nested);
      listStack.push({ list: nested, level: marker.level, orderType: marker.orderType });
      current = listStack[listStack.length - 1];
      effectiveMarker = marker;
    } else {
      effectiveMarker = {
        level: parentInfo.level,
        orderType: parentInfo.orderType,
        numericValue: marker.numericValue,
        startValue: marker.numericValue,
      };
      current = parentInfo;
    }
  }

  configureListType(current.list, effectiveMarker);
  setListStartAttribute(current.list, effectiveMarker, current.list.childElementCount === 0);
  return current.list;
}

export function configureListType(list: HTMLOListElement, marker: ListMarker): void {
  if (marker.orderType === 'lower-alpha') {
    list.setAttribute('type', 'a');
  } else {
    list.removeAttribute('type');
  }
}

export function setListStartAttribute(list: HTMLOListElement, marker: ListMarker, force: boolean = false): void {
  const defaultStart = 1;
  if (!force && list.childElementCount > 0) {
    return;
  }

  if (marker.startValue > defaultStart) {
    list.setAttribute('start', String(marker.startValue));
  } else if (force && list.hasAttribute('start')) {
    list.removeAttribute('start');
  }
}

export function transferElementContentIntoListItem(
  element: HTMLElement,
  listItem: HTMLElement,
  document: Document
): void {
  const TEXT_NODE = 3;
  while (element.firstChild) {
    const child = element.firstChild;
    element.removeChild(child);
    if (!child) {
      continue;
    }

    if (child.nodeType === TEXT_NODE) {
      const trimmed = (child.textContent || '').replace(/\u00A0/g, ' ');
      if (!trimmed.trim()) {
        continue;
      }
      const normalized = trimmed.replace(/\s+/g, ' ').trim();
      if (!normalized) {
        continue;
      }
      const textNode = document.createTextNode(normalized);
      listItem.appendChild(textNode);
      continue;
    }

    listItem.appendChild(child);
  }

  if (!listItem.childNodes.length) {
    listItem.appendChild(document.createTextNode(''));
  }
}

export function isBulletNode(node: Node | null): node is HTMLElement {
  if (!node || !isElementNode(node)) {
    return false;
  }

  if (!['P', 'SPAN', 'DIV'].includes(node.tagName)) {
    return false;
  }

  if (node.closest('ol, ul')) {
    return false;
  }

  const text = (node.textContent || '').replace(/\u00A0/g, ' ').trim();
  return /^[-•]\s+/.test(text);
}

export function stripBulletPrefix(element: HTMLElement): void {
  stripBulletPrefixFromNode(element);
}

function stripBulletPrefixFromNode(node: Node): boolean {
  const bulletPattern = /^\s*[-•]\s*/;

  if (node.nodeType === 3) { // TEXT_NODE
    const text = node.textContent || '';
    const updated = text.replace(bulletPattern, '');
    if (updated !== text) {
      node.textContent = updated;
      return true;
    }
    if (text.trim().length > 0) {
      return false;
    }
    return false;
  }

  if (!isElementNode(node)) {
    return false;
  }

  let child: Node | null = node.firstChild;
  while (child) {
    const removed = stripBulletPrefixFromNode(child);
    if (removed) {
      return true;
    }
    if (!isIgnorableLeadingNode(child)) {
      return false;
    }
    child = child.nextSibling;
  }

  return false;
}

export function isNumberedParagraph(paragraph: HTMLElement): boolean {
  return parseListMarkerFromParagraph(paragraph) !== null;
}

export function isNumberedParagraphNode(node: Node | null): node is HTMLElement {
  return Boolean(
    node &&
    isElementNode(node) &&
    node.tagName === 'P' &&
    !node.classList.contains('enumerated-paragraph') &&
    !node.closest('ol, ul') &&
    isNumberedParagraph(node as HTMLElement)
  );
}

export function stripLeadingEnumerationPrefix(element: HTMLElement): void {
  stripLeadingEnumerationFromNode(element);
}

function stripLeadingEnumerationFromNode(node: Node): boolean {
  const enumerationPattern = /^\s*\d{1,3}(?:[a-z])?[.)]\s*/i;

  if (node.nodeType === 3) { // TEXT_NODE
    const text = node.textContent || '';
    const updated = text.replace(enumerationPattern, '');
    if (updated !== text) {
      node.textContent = updated;
      return true;
    }
    if (text.trim().length > 0) {
      return false;
    }
    return false;
  }

  if (!isElementNode(node)) {
    return false;
  }

  let child: Node | null = node.firstChild;
  while (child) {
    const removed = stripLeadingEnumerationFromNode(child);
    if (removed) {
      return true;
    }
    if (!isIgnorableLeadingNode(child)) {
      return false;
    }
    child = child.nextSibling;
  }

  return false;
}
