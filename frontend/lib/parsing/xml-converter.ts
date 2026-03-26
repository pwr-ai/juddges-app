// Convert custom XML tags from Polish court documents to HTML

import { JSDOM } from 'jsdom';

/**
 * Convert custom XML tags from Polish court documents to HTML
 * Handles tags like <xpart>, <xtext>, <xunit>, <xname>, <xtitle>, <xbx>, <xix>, <xanon>
 * Uses JSDOM for robust parsing of nested structures
 */
export function convertXmlTagsToHtml(input: string): string {
  // If input doesn't look like XML, return as is
  if (!input.includes('<x')) return input;

  try {
    // Use JSDOM to parse the XML/HTML structure
    // We use text/html to be more forgiving with malformed tags, but it will lowercase tag names
    const dom = new JSDOM(`<body>${input}</body>`);
    const doc = dom.window.document;
    const body = doc.body;

    // Helper to replace a node with a new element while preserving children
    const replaceNode = (oldNode: Element, newTagName: string, className?: string): Element => {
      const newNode = doc.createElement(newTagName);
      if (className) newNode.className = className;

      // Move all children to new node
      while (oldNode.firstChild) {
        newNode.appendChild(oldNode.firstChild);
      }

      if (oldNode.parentNode) {
        oldNode.parentNode.replaceChild(newNode, oldNode);
      }
      return newNode;
    };

    // Helper to unwrap a node (replace with its children)
    const unwrapNode = (node: Element): void => {
      const parent = node.parentNode;
      if (!parent) return;

      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    };

    // Recursive function to transform nodes
    const transformNode = (node: Element): void => {
      // Process children first (depth-first) to handle nesting correctly
      // We convert to array because the child list will change
      const children = Array.from(node.children);
      children.forEach(child => transformNode(child));

      const tagName = node.tagName.toLowerCase();

      switch (tagName) {
        case 'xpart':
        case 'xblock':
          unwrapNode(node);
          break;

        case 'xunit': {
          const isTitle = node.getAttribute('xistitle') === 'true';
          // Use section for titled units, div for others
          // Map xistitle="true" to doc-section, others to doc-subsection
          const className = isTitle ? 'doc-section' : 'doc-subsection';
          const newTag = isTitle ? 'section' : 'div';
          replaceNode(node, newTag, className);
          break;
        }

        case 'xname': {
          // Check if parent is an xunit that will become a doc-subsection
          // (i.e., xunit without xistitle="true")
          const parent = node.parentElement;
          const isInDocSubsection = parent &&
            parent.tagName.toLowerCase() === 'xunit' &&
            parent.getAttribute('xistitle') !== 'true';

          // If inside a doc-subsection, convert to strong to keep it inline and bold
          // Don't convert to header - it should remain as inline content
          if (isInDocSubsection) {
            replaceNode(node, 'strong');
            break;
          }

          // Check content for enumeration (e.g. "I.", "1.", "A.")
          const text = node.textContent?.trim() || '';
          const isEnum = /^[IVX0-9]+\.?$/.test(text) || node.getAttribute('xsffx') === '.';

          // Use h4 for enumerations, h3 for section titles
          const newTag = isEnum ? 'h4' : 'h3';
          const className = isEnum ? 'doc-enum-title' : undefined;
          replaceNode(node, newTag, className);
          break;
        }

        case 'xtitle': {
          // Check if parent is an xunit that will become a doc-subsection
          // (i.e., xunit without xistitle="true")
          const parent = node.parentElement;
          const isInDocSubsection = parent &&
            parent.tagName.toLowerCase() === 'xunit' &&
            parent.getAttribute('xistitle') !== 'true';

          // If inside a doc-subsection, convert to span to keep it inline
          // Don't convert to header - it should remain as inline content
          if (isInDocSubsection) {
            replaceNode(node, 'span');
            break;
          }

          replaceNode(node, 'h4');
          break;
        }

        case 'xtext':
          // Check if it has block-level descendants (not just children)
          // Block tags: xunit, xpart, xblock, xenum, xtitle, xname, xtext (nested)
          // We use querySelector to find if any of these exist within the node
          const hasBlockDescendant = node.querySelector('xunit, xpart, xblock, xenum, xtitle, xname, xtext');

          if (hasBlockDescendant) {
            // It's a container xtext, convert to div to avoid invalid <p> nesting
            replaceNode(node, 'div');
          } else {
            // It's a leaf xtext, convert to p
            const text = node.textContent?.trim();
            // If xtext is empty or just whitespace, remove it
            if (!text && node.children.length === 0) {
              node.remove();
            } else if (text === 'UZASADNIENIE' || text === 'WYROK') {
              // Force specific headers
              replaceNode(node, 'h3', 'doc-section-title');
            } else {
              replaceNode(node, 'p');
            }
          }
          break;

        case 'xbx':
          replaceNode(node, 'strong');
          break;

        case 'xix':
          replaceNode(node, 'em');
          break;

        case 'xanon':
          // Anonymized content - just unwrap to show the text
          unwrapNode(node);
          break;

        case 'xenum':
          replaceNode(node, 'ul', 'doc-list');
          break;

        case 'xenumelem': {
          const li = replaceNode(node, 'li');
          // Unwrap any p tags inside li
          const pTags = Array.from(li.getElementsByTagName('p'));
          pTags.forEach(p => unwrapNode(p));
          break;
        }

        case 'xbullet':
          // Remove bullet points as UL/LI handles them
          node.remove();
          break;

        case 'xlexlink':
          replaceNode(node, 'span', 'doc-link');
          break;

        case 'xsupx':
          replaceNode(node, 'sup');
          break;

        case 'xux':
          replaceNode(node, 'u');
          break;
      }
    };

    // Start transformation from body children
    const rootChildren = Array.from(body.children);
    rootChildren.forEach(child => transformNode(child));

    // Post-processing: Handle doc-subsection divs
    const docSubsections = body.querySelectorAll('div.doc-subsection');
    docSubsections.forEach(subsection => {
      const children = Array.from(subsection.children);

      // First pass: Merge strong elements (from xname) with following p elements (from xtext)
      for (let i = 0; i < children.length - 1; i++) {
        const current = children[i];
        const next = children[i + 1];

        // If current is a strong (from xname) and next is a p (from xtext), merge them
        if (current.tagName.toLowerCase() === 'strong' && next.tagName.toLowerCase() === 'p') {
          // Move strong content into the paragraph at the beginning
          const strongContent = current.outerHTML;
          next.innerHTML = strongContent + ' ' + next.innerHTML;
          // Remove the standalone strong
          current.remove();
        }
      }

      // Second pass: Wrap all paragraph content in strong tags
      const paragraphs = subsection.querySelectorAll('p');
      paragraphs.forEach(p => {
        // Get the text content (this will unwrap any existing strong tags)
        const textContent = p.textContent || '';
        if (textContent.trim()) {
          // Wrap entire content in strong
          p.innerHTML = `<strong>${textContent}</strong>`;
        }
      });
    });

    // Post-processing: Detect and mark judgment header sections
    // These are sections that contain "WYROK" and court information
    const sections = body.querySelectorAll('section.doc-section');
    sections.forEach(section => {
      const text = (section.textContent || '').trim();
      // Check if this section contains judgment header information
      // Pattern: "WYROK" followed by "W IMIENIU RZECZYPOSPOLITEJ POLSKIEJ" and court info
      const hasWyrok = /WYROK/i.test(text);
      const hasImieniu = /W IMIENIU RZECZYPOSPOLITEJ POLSKIEJ/i.test(text);
      const hasCourtInfo = /Sąd/i.test(text) || /Dnia \d+ \w+ \d{4}/i.test(text);

      // It's a judgment header if it has WYROK and either the full "W IMIENIU..." phrase or court info
      const isJudgmentHeader = hasWyrok && (hasImieniu || hasCourtInfo);

      if (isJudgmentHeader) {
        section.classList.add('doc-judgment-header');
        // Don't modify content - just add the class for styling
        // Any formatting should be done via CSS only to avoid breaking content
      }
    });

    return body.innerHTML;
  } catch (e) {
    console.error('Error converting XML tags:', e);
    // Fallback to original input if parsing fails
    return input;
  }
}
