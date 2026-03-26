// Polish document parsing (headers, text processing)

export function convertStyledSpansToHeaders(root: HTMLElement, document: Document): void {
  // Find all spans that might be headers
  // Look for spans containing "Interpretacja indywidualna" or similar patterns
  const spans = Array.from(root.querySelectorAll('span')) as HTMLElement[];

  // Process in reverse to avoid DOM mutation issues
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    if (!span || !span.parentNode) continue;

    const text = (span.textContent || '').trim();
    if (text.length === 0) continue;

    // STRICTER: EXCLUDE FIRST - Check for punctuation at the end (period, exclamation, question mark)
    // Complete sentences ending with punctuation are content, not headers
    const endsWithPunctuation = /[.!?]$/.test(text);
    if (endsWithPunctuation && text.length > 20) {
      // Exception: very short legal references like "Art. 1." can be headers
      const isShortLegalRef = /^(Art\.|§|§§|pkt\.|ust\.|lit\.|zm\.)\s*\d+/i.test(text) && text.length < 30;
      if (!isShortLegalRef) {
        continue; // Skip - this is a complete sentence, not a header
      }
    }

    // STRICTER: EXCLUDE - Check for assessment phrases (e.g., "jest prawidłowe", "jest nieprawidłowe")
    const hasAssessmentPhrase = /(jest|są|było|była|były|będzie|będą)\s+(prawidłowe|prawidłowe|nieprawidłowe|nieprawidłowe|prawidłowy|prawidłowa|prawidłowi|prawidłowi)/i.test(text);
    if (hasAssessmentPhrase) {
      continue; // Skip - this is an assessment statement, not a header
    }

    // STRICTER: EXCLUDE - Check for "Stanowisko" followed by assessment
    const isStanowiskoAssessment = /^Stanowisko[,\s].*?(jest|są|było|była|były|będzie|będą)\s+(prawidłowe|prawidłowe|nieprawidłowe|nieprawidłowe|prawidłowy|prawidłowa|prawidłowi|prawidłowi)/i.test(text);
    if (isStanowiskoAssessment) {
      continue; // Skip - this is an assessment statement, not a header
    }

    // Check if span contains "Interpretacja indywidualna" or similar document title patterns
    const isDocumentTitle = /^Interpretacja\s+indywidualna/i.test(text) ||
      /^Interpretacja\s+indywidualna\s*[–-]\s*stanowisko/i.test(text);

    // Check if span is inside a strong/bold element or has bold styling
    const isBold = span.closest('strong, b') !== null ||
      span.style.fontWeight === 'bold' ||
      span.style.fontWeight === '700' ||
      /bold|700/.test(span.style.fontWeight);

    // Check if span has larger font size (likely a header)
    const fontSize = span.style.fontSize || '';
    const hasLargeFont = /1[6-9]px|2[0-9]px|[3-9][0-9]px|em/.test(fontSize);

    // Check if span is in a paragraph that might be a header
    const parent = span.parentElement;
    const isInParagraph = parent && parent.tagName === 'P';
    const parentText = parent ? (parent.textContent || '').trim() : '';
    const isShortParagraph = parentText.length < 100 && parentText.length === text.length;

    // Convert to header if it matches document title pattern
    if (isDocumentTitle) {
      // "Interpretacja indywidualna" should be h2 (h1 is reserved for first line only)
      const header = document.createElement('h2');
      header.textContent = text;

      // Replace the parent paragraph or the span itself
      if (isInParagraph && isShortParagraph) {
        const gp = parent.parentNode;
        if (gp && 'contains' in gp && typeof (gp as { contains: (node: Node) => boolean }).contains === 'function' && (gp as { contains: (node: Node) => boolean }).contains(parent)) {
          gp.replaceChild(header, parent);
        } else if (gp) {
          try { gp.replaceChild(header, parent); } catch { }
        }
      } else {
        const sp = span.parentNode;
        if (sp && 'contains' in sp && typeof (sp as { contains: (node: Node) => boolean }).contains === 'function' && (sp as { contains: (node: Node) => boolean }).contains(span)) {
          sp.replaceChild(header, span);
        } else if (sp) {
          try { sp.replaceChild(header, span); } catch { }
        }
      }
      continue;
    }

    // Also convert bold, large-font spans that are short and look like headers
    // Check if it's a known header pattern (like "Zakres wniosku o wydanie interpretacji indywidualnej")
    // BUT exclude "Stanowisko" if it's followed by assessment (already checked above)
    const isKnownHeader = /^(Zakres|Uzasadnienie|Opis|Pytanie|Decyzja|Orzeczenie|Postanowienie|Sentencja|Uzasadnienie|Ocena)/i.test(text) ||
      /^Zakres\s+wniosku/i.test(text) ||
      /^Ocena\s+stanowiska/i.test(text);

    // Only convert "Stanowisko" if it's NOT an assessment sentence
    const isStanowiskoHeader = /^Stanowisko/i.test(text) && !isStanowiskoAssessment;

    if ((isKnownHeader || isStanowiskoHeader) && (isBold || hasLargeFont || isShortParagraph) && text.length < 150 && text.length > 5) {
      // Other section headers (like "Ocena stanowiska", "Zakres wniosku") should be h3
      // "Interpretacja indywidualna" is already handled above as h2
      const header = document.createElement('h3');
      header.textContent = text;

      if (isInParagraph && isShortParagraph) {
        const gp = parent.parentNode;
        if (gp && 'contains' in gp && typeof (gp as { contains: (node: Node) => boolean }).contains === 'function' && (gp as { contains: (node: Node) => boolean }).contains(parent)) {
          gp.replaceChild(header, parent);
        } else if (gp) {
          try { gp.replaceChild(header, parent); } catch { }
        }
      } else {
        const sp = span.parentNode;
        if (sp && 'contains' in sp && typeof (sp as { contains: (node: Node) => boolean }).contains === 'function' && (sp as { contains: (node: Node) => boolean }).contains(span)) {
          sp.replaceChild(header, span);
        } else if (sp) {
          try { sp.replaceChild(header, span); } catch { }
        }
      }
    }
  }
}

export function processPlainTextHeaders(root: HTMLElement, document: Document): void {
  // Skip if root already has HTML structure elements (header, nav, etc.) - don't break existing HTML!
  const hasStructureElements = root.querySelector('header, nav, footer, aside, main, article, section[class*="header"], div[class*="header"]');
  if (hasStructureElements) {
    return; // Already has HTML structure, don't process
  }

  // Skip if root has ANY HTML elements (not just text) - only process truly plain text content
  // This prevents breaking existing HTML structure
  const hasAnyHtmlElements = root.querySelector('*');
  if (hasAnyHtmlElements && root.children.length > 0) {
    // Only process if we have direct text nodes AND no complex HTML structure
    // Check if all children are simple elements (p, div, span) without nested structure
    const hasComplexStructure = Array.from(root.children).some(child => {
      const tagName = child.tagName.toLowerCase();
      return !['p', 'div', 'span', 'br'].includes(tagName) || child.children.length > 0;
    });
    if (hasComplexStructure) {
      return; // Has complex HTML structure, don't process
    }
  }

  // Check if root has direct text content (not wrapped in tags)
  // This handles cases like: <div>SENTENCJA\n\nDnia 12 czerwca...\n\nUZASADNIENIE\n\nZaskarżoną...</div>
  const textContent = root.textContent || '';
  const hasOnlyText = root.children.length === 0 && textContent.trim().length > 0;

  if (!hasOnlyText) {
    // Check if root has text nodes directly (mixed with other elements)
    const childNodes = Array.from(root.childNodes);
    const hasTextNodes = childNodes.some(node => node.nodeType === 3 && (node.textContent || '').trim().length > 0);

    if (!hasTextNodes) return;

    // Only process text nodes that are direct children of root, not inside other elements
    // Skip if parent is a structural element
    childNodes.forEach(node => {
      if (node.nodeType === 3) { // Text node
        // Skip if parent is a structural element
        if (node.parentNode && node.parentNode !== root) {
          const parentTag = (node.parentNode as Element)?.tagName?.toLowerCase();
          if (parentTag && ['header', 'nav', 'footer', 'aside', 'main', 'article'].includes(parentTag)) {
            return; // Skip processing text inside structural elements
          }
        }

        const text = (node.textContent || '').trim();
        if (text.length === 0) return;

        // Process the ENTIRE text to find ALL headers
        const processed = processTextWithMultipleHeaders(text, document);
        if (processed && processed.length > 0) {
          // Replace text node with processed elements
          if (node.parentNode) {
            // Insert all elements before the text node
            processed.forEach((el) => {
              node.parentNode!.insertBefore(el, node);
            });
            // Remove the original text node
            node.parentNode!.removeChild(node);
          }
        }
      }
    });
    return;
  }

  // Root has only text content - parse it and find ALL headers!
  const text = textContent.trim();
  if (text.length === 0) return;

  // Process the ENTIRE text to find ALL headers (SENTENCJA, UZASADNIENIE, etc.)
  const processed = processTextWithMultipleHeaders(text, document);
  if (processed && processed.length > 0) {
    // Clear root and add all processed elements
    root.innerHTML = '';
    processed.forEach(el => root.appendChild(el));
  }
}

export function processTextWithMultipleHeaders(text: string, document: Document): Node[] {
  const result: Node[] = [];

  // Split text by double newlines (paragraph separators)
  // Keep single newlines and spaces intact for processing
  const sections = text.split(/(?:\n\s*\n|\r\n\s*\r\n)/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length === 0) continue;

    // Check if this section starts with an all-caps header followed by content
    // Pattern: all caps word(s) (3-50 chars) at start, followed by space(s) and more text
    // Examples: "SENTENCJA Dnia..." or "SENTENCJA  Dnia..." (single or multiple spaces)
    const headerMatch = trimmed.match(/^([A-ZĄĆĘŁŃÓŚŹŻ\s]{3,50})(\s+)([\s\S]+)$/);

    if (headerMatch) {
      const potentialHeader = headerMatch[1].trim();
      const restText = headerMatch[3].trim();

      // Check if first part is all caps
      const textLetters = potentialHeader.replace(/[^A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]/g, '');
      if (textLetters.length > 0 && !/[a-ząćęłńóśźż]/.test(textLetters)) {
        // It's all caps! Create header and paragraph
        // Check if it's "Interpretacja indywidualna" - should be h2, otherwise h3
        const isInterpretacjaIndywidualna = /^Interpretacja\s+indywidualna/i.test(potentialHeader);
        const header = document.createElement(isInterpretacjaIndywidualna ? 'h2' : 'h3');
        header.textContent = potentialHeader;
        result.push(header);

        if (restText.length > 0) {
          const p = document.createElement('p');
          p.textContent = restText;
          result.push(p);
        }
        continue;
      }
    }

    // Check if entire section is a short all-caps header (standalone header)
    // Examples: "SENTENCJA" or "UZASADNIENIE" on their own line
    const textLetters = trimmed.replace(/[^A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]/g, '');
    if (trimmed.length >= 3 && trimmed.length <= 50 &&
      textLetters.length > 0 && !/[a-ząćęłńóśźż]/.test(textLetters)) {
      // It's a standalone header (like "UZASADNIENIE" on its own line)
      // Check if it's "Interpretacja indywidualna" - should be h2, otherwise h3
      const isInterpretacjaIndywidualna = /^Interpretacja\s+indywidualna/i.test(trimmed);
      const header = document.createElement(isInterpretacjaIndywidualna ? 'h2' : 'h3');
      header.textContent = trimmed;
      // Center and remove padding/margin for Wyrok/Uzasadnienie headers
      if (/^WYROK$/i.test(trimmed) || /^UZASADNIENIE$/i.test(trimmed)) {
        header.style.textAlign = 'center';
        header.style.margin = '0';
        header.style.padding = '0';
        header.style.border = 'none';
      }
      result.push(header);
      continue;
    }

    // Not a header, just regular content
    const p = document.createElement('p');
    p.textContent = trimmed;
    result.push(p);
  }

  return result;
}

export function splitTextNodesWithHeaders(root: HTMLElement, document: Document): void {
  // Find all paragraphs - MUST process ALL paragraphs to detect headers like <p>SENTENCJA</p>
  // Process in REVERSE order to avoid DOM mutation issues during iteration
  const paragraphs = Array.from(root.querySelectorAll('p')) as HTMLElement[];

  if (paragraphs.length === 0) return; // No paragraphs to process

  // Pre-compile regexes outside the loop for better performance
  const endsWithPunctuationRegex = /[.!?]$/;
  const shortLegalRefRegex = /^(Art\.|§|§§|pkt\.|ust\.|lit\.|zm\.)\s*\d+/i;
  const assessmentPhraseRegex = /(jest|są|było|była|były|będzie|będą)\s+(prawidłowe|prawidłowe|nieprawidłowe|nieprawidłowe|prawidłowy|prawidłowa|prawidłowi|prawidłowi)/i;
  const stanowiskoAssessmentRegex = /^Stanowisko[,\s].*?(jest|są|było|była|były|będzie|będą)\s+(prawidłowe|prawidłowe|nieprawidłowe|nieprawidłowe|prawidłowy|prawidłowa|prawidłowi|prawidłowi)/i;
  const nonLetterRegex = /[^A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]/g;
  const lowercaseRegex = /[a-ząćęłńóśźż]/;
  const excludePatternsRegex = /^(NSA|E\.|S-Z\.|Ł\.|I\.|II\.|III\.|IV\.|V\.|VI\.|VII\.|VIII\.|IX\.|X\.|Art\.|§|§§|pkt\.|ust\.|lit\.|zm\.|t\.j\.|tj\.|np\.|itp\.|itd\.|m\.in\.|m\.in|m\.|r\.|roku|r|p\.|p|z\.|z|w\.|w|i\.|i|a\.|a|o\.|o|u\.|u)$/i;
  const salutationPatternRegex = /^(Szanowna|Szanowny|Szanowni|Szanowne|szanowna|szanowny|szanowni|szanowne)\s+(Pani|Pan|Państwo|pani|pan|państwo)/i;
  const interpretacjaIndywidualnaRegex = /^Interpretacja\s+indywidualna/i;

  // Process in reverse to avoid index issues when replacing elements
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i];
    if (!p || !p.parentNode) continue;

    // Get text content - this is the KEY: get the actual text
    const text = (p.textContent || '').trim();

    // Skip empty paragraphs
    if (text.length === 0) continue;

    // STRICTER: EXCLUDE FIRST - Check for punctuation at the end (period, exclamation, question mark)
    // Complete sentences ending with punctuation are content, not headers
    if (endsWithPunctuationRegex.test(text) && text.length > 20) {
      // Exception: very short legal references like "Art. 1." can be headers
      if (!(shortLegalRefRegex.test(text) && text.length < 30)) {
        continue; // Skip - this is a complete sentence, not a header
      }
    }

    // STRICTER: EXCLUDE - Check for assessment phrases (e.g., "jest prawidłowe", "jest nieprawidłowe")
    if (assessmentPhraseRegex.test(text)) {
      continue; // Skip - this is an assessment statement, not a header
    }

    // STRICTER: EXCLUDE - Check for "Stanowisko" followed by assessment
    if (stanowiskoAssessmentRegex.test(text)) {
      continue; // Skip - this is an assessment statement, not a header
    }

    // FIRST: Check if it's a small paragraph (3-50 chars)
    if (text.length < 3 || text.length > 50) continue;

    // SECOND: Check if it's all caps - SIMPLE AND DIRECT
    // Extract only letters (including Polish characters)
    const textLetters = text.replace(nonLetterRegex, '');
    if (textLetters.length === 0) continue;

    // SIMPLE CHECK: If text has any lowercase, it's NOT all caps
    // This is the most direct way to check
    if (lowercaseRegex.test(textLetters)) continue;

    // Additional check: all letters must be uppercase (redundant but safe)
    if (textLetters !== textLetters.toUpperCase()) continue;

    // Exclude common abbreviations (case-insensitive)
    if (excludePatternsRegex.test(text)) continue;

    // STRICTER: Exclude salutations like "Szanowna Pani", "Szanowny Pan", etc.
    if (salutationPatternRegex.test(text)) continue;

    // Convert to header! This catches cases like <p>SENTENCJA</p>
    // Check if it's "Interpretacja indywidualna" - should be h2, otherwise h3
    const isInterpretacjaIndywidualna = interpretacjaIndywidualnaRegex.test(text);
    const headerLevel = isInterpretacjaIndywidualna ? 'h2' : 'h3';
    // Use insertBefore and remove to ensure it works
    try {
      const header = document.createElement(headerLevel);
      header.textContent = text;
      // Center and remove padding/margin for Wyrok/Uzasadnienie headers
      if (/^WYROK$/i.test(text) || /^UZASADNIENIE$/i.test(text)) {
        header.style.textAlign = 'center';
        header.style.margin = '0';
        header.style.padding = '0';
        header.style.border = 'none';
      }
      const parent = p.parentNode;
      if (parent) {
        parent.insertBefore(header, p);
        parent.removeChild(p);
      }
    } catch {
      // If replacement fails, try alternative method
      try {
        const header = document.createElement(headerLevel);
        header.textContent = text;
        // Center and remove padding/margin for Wyrok/Uzasadnienie headers
        if (/^WYROK$/i.test(text) || /^UZASADNIENIE$/i.test(text)) {
          header.style.textAlign = 'center';
          header.style.margin = '0';
          header.style.padding = '0';
          header.style.border = 'none';
        }
        if (p.parentNode && 'contains' in p.parentNode && typeof (p.parentNode as { contains: (node: Node) => boolean }).contains === 'function' && (p.parentNode as { contains: (node: Node) => boolean }).contains(p)) {
          p.parentNode.replaceChild(header, p);
        } else if (p.parentNode) {
          try { p.parentNode.replaceChild(header, p); } catch { }
        }
      } catch {
        // If both methods fail, continue to next paragraph
        continue;
      }
    }
  }
}

export function addHeadersToContent(root: HTMLElement, document: Document): void {
  // Pre-compile regexes for better performance
  const divHeaderPatternRegex = /^([A-ZĄĆĘŁŃÓŚŹŻ\s]{2,30})\s+(.+)$/;
  const interpretacjaIndywidualnaRegex = /^Interpretacja\s+indywidualna/i;
  const commonContentPhrasesPattern = /^(Opis|opis|Stan|stan|Zdarzenie|zdarzenie|Wniosek|wniosek|Podstawa|podstawa|Uzasadnienie|uzasadnienie|Stanowisko|stanowisko|Decyzja|decyzja|Orzeczenie|orzeczenie|Postanowienie|postanowienie|stwierdzam|stwierdza|stwierdzamy|stwierdzają|oceny|ocena|ocenę|skutków|skutki|skutek|podatkowych|podatkowy|podatkowa|podatkowego|podatkowym|podatkową|podatkowym|podatkowymi|podatkowych|w podatku|w sprawie|w sprawach|Szanowna|Szanowny|Szanowni|Szanowne|szanowna|szanowny|szanowni|szanowne|Pani|Pan|Państwo|pani|pan|państwo)/i;
  const endsWithPunctuationRegex = /[.!?]$/;
  const shortLegalRefRegex = /^(Art\.|§|§§|pkt\.|ust\.|lit\.|zm\.)\s*\d+/i;
  const assessmentPhraseRegex = /(jest|są|było|była|były|będzie|będą)\s+(prawidłowe|prawidłowe|nieprawidłowe|nieprawidłowe|prawidłowy|prawidłowa|prawidłowi|prawidłowi)/i;
  const stanowiskoAssessmentRegex = /^Stanowisko[,\s].*?(jest|są|było|była|były|będzie|będą)\s+(prawidłowe|prawidłowe|nieprawidłowe|nieprawidłowe|prawidłowy|prawidłowa|prawidłowi|prawidłowi)/i;
  const whitespaceRegex = /\s/g;

  // First, check if content is in divs or other containers without proper structure
  // Look for divs with text content that might need headers
  const divs = Array.from(root.querySelectorAll('div'));
  divs.forEach(div => {
    const text = (div.textContent || '').trim();
    // If div has text and starts with a short all-caps word followed by more content, split it
    if (text.length > 50) {
      // Look for pattern: short all-caps word(s) at the start, followed by space and more text
      // Match: 2-30 uppercase letters (with optional spaces), then space, then rest of text
      const match = text.match(divHeaderPatternRegex);
      if (match) {
        const potentialHeader = match[1].trim();
        const restText = match[2].trim();

        // Check if the first part is all caps and short
        const textNoSpaces = potentialHeader.replace(whitespaceRegex, '');
        const isShortAllCaps = textNoSpaces.length > 0 &&
          textNoSpaces === textNoSpaces.toUpperCase() &&
          potentialHeader.length < 30 &&
          potentialHeader.length > 2 &&
          restText.length > 50; // Rest should be substantial

        if (isShortAllCaps) {
          // Split the div: create a header and move rest to a paragraph
          // Check if it's "Interpretacja indywidualna" - should be h2, otherwise h3
          const isInterpretacjaIndywidualna = interpretacjaIndywidualnaRegex.test(potentialHeader);
          const header = document.createElement(isInterpretacjaIndywidualna ? 'h2' : 'h3');
          header.textContent = potentialHeader;

          // Create paragraph for rest
          const p = document.createElement('p');
          p.textContent = restText;

          // Replace div content
          div.innerHTML = '';
          div.appendChild(header);
          div.appendChild(p);
        }
      }
    }
  });

  // Find paragraphs that might be headers
  const paragraphs = Array.from(root.querySelectorAll('p'));
  const headersToAdd: { element: HTMLElement; level: number }[] = [];

  // First pass: Very simple and direct detection for obvious headers
  paragraphs.forEach((p, index) => {
    const text = (p.textContent || '').trim();
    if (!text || text.length === 0) return;

    // STRICTER: Exclude common content phrases immediately
    if (commonContentPhrasesPattern.test(text)) {
      return; // Skip - this is clearly content, not a header
    }

    // STRICTER: EXCLUDE FIRST - Check for punctuation at the end (period, exclamation, question mark)
    // Complete sentences ending with punctuation are content, not headers
    if (endsWithPunctuationRegex.test(text) && text.length > 20) {
      // Exception: very short legal references like "Art. 1." can be headers
      if (!(shortLegalRefRegex.test(text) && text.length < 30)) {
        return; // Skip - this is a complete sentence, not a header
      }
    }

    // STRICTER: EXCLUDE - Check for assessment phrases (e.g., "jest prawidłowe", "jest nieprawidłowe")
    if (assessmentPhraseRegex.test(text)) {
      return; // Skip - this is an assessment statement, not a header
    }

    // STRICTER: EXCLUDE - Check for "Stanowisko" followed by assessment
    if (stanowiskoAssessmentRegex.test(text)) {
      return; // Skip - this is an assessment statement, not a header
    }

    // Simple check: short text (< 30 chars) that's all uppercase
    const textNoSpaces = text.replace(whitespaceRegex, '');
    const isShortAllCaps = textNoSpaces.length > 0 &&
      textNoSpaces === textNoSpaces.toUpperCase() &&
      text.length < 30 &&
      text.length > 2;

    // Check if followed by a longer paragraph
    const nextP = paragraphs[index + 1];
    const nextText = nextP ? (nextP.textContent || '').trim() : '';
    const hasNextLonger = nextText.length > text.length && nextText.length > 50;

    // Check if previous paragraph was long (section break)
    const prevP = paragraphs[index - 1];
    const prevText = prevP ? (prevP.textContent || '').trim() : '';
    const followsLongParagraph = prevText.length > 100;

    // If it's short all-caps, it's very likely a header
    // H1 is reserved ONLY for the first line of document
    // "Interpretacja indywidualna" should be h2, other headers should be h3
    // Mark it as header if: followed by longer text, follows long paragraph, is first, or has any following content
    if (isShortAllCaps) {
      const hasFollowingContent = index < paragraphs.length - 1; // Not the last paragraph
      if (hasNextLonger || followsLongParagraph || index === 0 || hasFollowingContent) {
        // Check if it's "Interpretacja indywidualna"
        const isInterpretacjaIndywidualna = interpretacjaIndywidualnaRegex.test(text);
        // H1 ONLY for first paragraph, h2 for "Interpretacja indywidualna", otherwise h3
        const level = index === 0 ? 1 : (isInterpretacjaIndywidualna ? 2 : 3);
        headersToAdd.push({ element: p, level });
      }
    }
  });

  // Second pass: More complex detection for other patterns
  paragraphs.forEach((p, index) => {
    // Skip if already marked as header
    if (headersToAdd.some(h => h.element === p)) return;

    const text = (p.textContent || '').trim();
    if (!text || text.length === 0) return;

    // STRICTER: EXCLUDE FIRST - Check for punctuation at the end (period, exclamation, question mark)
    // Complete sentences ending with punctuation are content, not headers
    if (endsWithPunctuationRegex.test(text) && text.length > 20) {
      // Exception: very short legal references like "Art. 1." can be headers
      if (!(shortLegalRefRegex.test(text) && text.length < 30)) {
        return; // Skip - this is a complete sentence, not a header
      }
    }

    // STRICTER: EXCLUDE - Check for assessment phrases (e.g., "jest prawidłowe", "jest nieprawidłowe")
    if (assessmentPhraseRegex.test(text)) {
      return; // Skip - this is an assessment statement, not a header
    }

    // STRICTER: EXCLUDE - Check for "Stanowisko" followed by assessment
    if (stanowiskoAssessmentRegex.test(text)) {
      return; // Skip - this is an assessment statement, not a header
    }

    // Basic characteristics
    const isShort = text.length < 120;
    const isVeryShort = text.length < 60;
    const isExtremelyShort = text.length < 30;
    const hasBold = p.querySelector('strong, b') !== null;
    const isFirstParagraph = index === 0;

    // Pattern: All caps (common for headers in many languages)
    // Simple check: text equals its uppercase version (ignoring spaces)
    const textNoSpaces = text.replace(/\s/g, '');
    const isAllCaps = textNoSpaces.length > 0 &&
      textNoSpaces === textNoSpaces.toUpperCase() &&
      text.length > 2 &&
      text.length < 100 &&
      /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(text); // Has at least one uppercase letter

    // Pattern: Numbered sections (universal pattern: 1., 2., I., II., Art., §, etc.)
    // Pre-compiled regex for better performance
    const numberedPattern = /^(?:\d+[\.\)]|[IVX]+[\.\)]|Art\.|§|§§|Art|§)\s*/i;
    const isNumbered = numberedPattern.test(text);

    // Pattern: Ends with colon (often indicates a header/section title)
    const endsWithColon = text.endsWith(':') && isShort;

    // Pattern: Roman numerals
    // Pre-compiled regex for better performance
    const romanNumeralPattern = /^[IVX]+[\.\)]\s+/i;
    const hasRomanNumeral = romanNumeralPattern.test(text);

    // Pattern: Single word or very short phrase (likely a header)
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    // STRICTER: Only 1-2 words for single word/phrase, and must be very short
    const isSingleWordOrPhrase = wordCount <= 2 && isExtremelyShort;

    // Pattern: No sentence-ending punctuation (headers rarely end with . ! ?)
    const hasSentenceEnding = /[.!?]$/.test(text);
    const lacksSentenceEnding = !hasSentenceEnding && text.length > 0;

    // Context: Check if next paragraph is significantly longer (suggests this is a header)
    const nextP = paragraphs[index + 1];
    const nextText = nextP ? (nextP.textContent || '').trim() : '';
    const isFollowedByLonger = nextText.length > text.length * 2 && nextText.length > 150;
    // More lenient: just check if next paragraph exists and is longer
    const isFollowedByAnyLonger = nextText.length > text.length && nextText.length > 50;
    // STRICTER: Require much longer following content for title case
    const isFollowedByMuchLonger = nextText.length > text.length * 3 && nextText.length > 200;

    // Context: Check if previous paragraph was long (suggests section break)
    const prevP = paragraphs[index - 1];
    const prevText = prevP ? (prevP.textContent || '').trim() : '';
    const followsLongParagraph = prevText.length > 100;

    // Context: Standalone short paragraph (likely a header)
    const isStandalone = isExtremelyShort && (followsLongParagraph || index === 0);

    // STRICTER: Exclude common document phrases that are clearly content, not headers
    // MUCH MORE AGGRESSIVE: Exclude ANY text starting with these phrases, regardless of word count
    // Include salutations like "Szanowna Pani", "Szanowny Pan", etc.
    // Include assessment phrases like "Stanowisko... jest prawidłowe"
    // BUT exclude "Ocena stanowiska" from exclusion - it's a valid header
    // Define this BEFORE isTitleCase since it's used there
    const commonContentPhrases = /^(Opis|opis|Stan|stan|Zdarzenie|zdarzenie|Wniosek|wniosek|Podstawa|podstawa|Uzasadnienie|uzasadnienie|Stanowisko|stanowisko|Decyzja|decyzja|Orzeczenie|orzeczenie|Postanowienie|postanowienie|stwierdzam|stwierdza|stwierdzamy|stwierdzają|oceny|ocena|ocenę|skutków|skutki|skutek|podatkowych|podatkowy|podatkowa|podatkowego|podatkowym|podatkową|podatkowym|podatkowymi|podatkowych|w podatku|w sprawie|w sprawach|Szanowna|Szanowny|Szanowni|Szanowne|szanowna|szanowny|szanowni|szanowne|Pani|Pan|Państwo|pani|pan|państwo)/i;
    // STRICTER: Exclude if it starts with these phrases OR has 3+ words and contains these phrases
    // BUT allow "Ocena stanowiska" as it's a valid header
    const isOcenaStanowiska = /^Ocena\s+stanowiska/i.test(text);
    const isCommonContentPhrase = !isOcenaStanowiska && (commonContentPhrases.test(text) ||
      (wordCount >= 3 && /(Opis|opis|stanu|stan|faktycznego|faktyczny|zdarzenia|zdarzenie|zdarzenia przyszłego|przyszłego|przyszły|przyszła|przyszłe|Wniosek|wniosek|Podstawa|podstawa|Uzasadnienie|uzasadnienie|Stanowisko|stanowisko|Decyzja|decyzja|Orzeczenie|orzeczenie|Postanowienie|postanowienie|stwierdzam|stwierdza|oceny|ocena|skutków|skutki|podatkowych|podatkowy|w podatku|w sprawie)/i.test(text)));

    // Pattern: Title case (first letter of each word capitalized)
    // MUCH STRICTER: Only consider title case for VERY short text (max 2 words, max 30 chars)
    // AND must NOT contain common content phrases
    // BUT allow "Ocena stanowiska" as it's a valid header
    const isTitleCase = /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]*(\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]*)*$/.test(text) &&
      wordCount >= 1 &&
      wordCount <= 2 && // STRICTER: Max 2 words (was 3)
      text.length <= 30 && // STRICTER: Max 30 chars (was 40)
      (!commonContentPhrases.test(text) || isOcenaStanowiska); // STRICTER: Must NOT contain common phrases, except "Ocena stanowiska"

    // Check if it's "Interpretacja indywidualna" - this should be h2
    const isInterpretacjaIndywidualna = /^Interpretacja\s+indywidualna/i.test(text) ||
      /^Interpretacja\s+indywidualna\s*[–-]\s*stanowisko/i.test(text);

    // Check if it's a known header pattern like "Ocena stanowiska" - these should be h3
    const isKnownHeaderPattern = /^Ocena\s+stanowiska/i.test(text) ||
      /^Zakres\s+wniosku/i.test(text) ||
      /^Uzasadnienie/i.test(text);

    // Determine header level based on patterns
    // H1 is reserved ONLY for the first line/paragraph of the document
    // "Interpretacja indywidualna" should be h2
    // Other section headers should be h3
    let headerLevel = 3; // Default to h3 for section headers (h1 is only for first paragraph, h2 for "Interpretacja indywidualna")

    // H1 ONLY for first paragraph - this is the document title
    if (isFirstParagraph) {
      headerLevel = 1; // First line of document
    }
    // "Interpretacja indywidualna" should be h2
    else if (isInterpretacjaIndywidualna) {
      headerLevel = 2; // "Interpretacja indywidualna" is h2
    }
    // Main sections (h3): All-caps short text, numbered sections, known header patterns
    else if ((isAllCaps && isExtremelyShort) || (isNumbered && isVeryShort) || isKnownHeaderPattern) {
      headerLevel = 3; // Main sections (h3, not h2)
    }
    // All-caps short text should be h3 (legitimate titles like "SENTENCJA", "UZASADNIENIE")
    else if (isAllCaps && isVeryShort) {
      headerLevel = 3; // All-caps short text should be h3, not h2
    }
    // Subsections (h3): Numbered, roman numerals
    else if (isNumbered || hasRomanNumeral) {
      headerLevel = 3; // Subsections
    }
    // STRICTER: Title case only if very short AND followed by much longer content
    // OR if it's a known header pattern like "Ocena stanowiska"
    else if ((isTitleCase && isFollowedByMuchLonger && wordCount <= 2) || isKnownHeaderPattern) {
      headerLevel = 3; // Subsections - only for very short title case or known headers (h3)
    }
    // Sub-subsections (h3): Colon ending, bold, single word/phrase
    else if (endsWithColon && isExtremelyShort && wordCount <= 2) {
      // STRICTER: Colon ending only for very short phrases
      headerLevel = 3; // Sub-subsections
    } else if (isShort && hasBold && isExtremelyShort) {
      // STRICTER: Bold only for extremely short text
      headerLevel = 3; // Sub-subsections
    } else if (isSingleWordOrPhrase) {
      headerLevel = 3; // Sub-subsections
    }

    // Scoring system - based on structural patterns, not specific words
    // STRICTER: Require higher scores, especially for title case
    const score =
      (isShort ? 1 : 0) +
      (isVeryShort ? 2 : 0) +
      (isExtremelyShort ? 3 : 0) +
      (isAllCaps ? 5 : 0) + // Strong indicator - increased weight
      (hasBold ? 2 : 0) +
      (isNumbered ? 4 : 0) + // Increased weight
      (endsWithColon && isExtremelyShort ? 3 : 0) + // Only if extremely short
      (hasRomanNumeral ? 2 : 0) +
      (isFollowedByLonger ? 5 : 0) + // Very strong indicator - increased weight
      (isFollowedByMuchLonger ? 3 : 0) + // Additional weight for much longer
      (isFollowedByAnyLonger && isAllCaps ? 2 : 0) + // Only for all caps
      (isStandalone ? 3 : 0) +
      (isSingleWordOrPhrase ? 2 : 0) +
      (lacksSentenceEnding && isExtremelyShort ? 1 : 0) + // Only if extremely short
      (isTitleCase && isFollowedByMuchLonger && wordCount <= 2 ? 2 : 0) + // STRICTER: Only for very short title case with much longer following
      (followsLongParagraph && isExtremelyShort ? 2 : 0) + // Only if extremely short
      (isFirstParagraph ? 1 : 0) -
      (isCommonContentPhrase ? 5 : 0); // STRICTER: Penalize common content phrases

    // Special cases that should always be headers - very simple rules
    const isShortAllCapsHeader = isAllCaps && isExtremelyShort && isFollowedByLonger;
    // const isShortAllCapsWithAnyNext = isAllCaps && isExtremelyShort && isFollowedByAnyLonger; // Unused
    const isShortAllCapsStandalone = isAllCaps && isExtremelyShort && (followsLongParagraph || index === 0);
    const isShortFollowedByMuchLonger = isExtremelyShort && nextText.length > text.length * 5 && nextText.length > 200;

    // STRICTER: Exclude common content phrases from being headers - CHECK FIRST
    if (isCommonContentPhrase) {
      return; // Skip this paragraph - it's clearly content, not a header
    }

    // STRICTER: Additional check - if text contains "stanu faktycznego" or "zdarzenia przyszłego", skip
    // Also exclude salutations like "Szanowna Pani", "Szanowny Pan", etc.
    if (/(stanu|stan)\s+(faktycznego|faktyczny|faktycznym|faktyczną|faktyczne|faktycznych)/i.test(text) ||
      /(zdarzenia|zdarzenie|zdarzeniu|zdarzeniem|zdarzeniu)\s+(przyszłego|przyszły|przyszła|przyszłe|przyszłym|przyszłą|przyszłych|przyszłymi)/i.test(text) ||
      /(opis|Opis)\s+(stanu|stan|zdarzenia|zdarzenie)/i.test(text) ||
      /^(Szanowna|Szanowny|Szanowni|Szanowne|szanowna|szanowny|szanowni|szanowne)\s+(Pani|Pan|Państwo|pani|pan|państwo)/i.test(text) ||
      /^(Pani|Pan|Państwo|pani|pan|państwo)\s/i.test(text)) {
      return; // Skip - this is clearly content, not a header
    }

    // Very simple rule: extremely short all-caps text followed by any longer paragraph = header
    if (isAllCaps && isExtremelyShort && isFollowedByAnyLonger) {
      headersToAdd.push({ element: p, level: headerLevel });
    }
    // Known header patterns like "Ocena stanowiska" should always be headers
    else if (isKnownHeaderPattern) {
      headersToAdd.push({ element: p, level: headerLevel });
    }
    // STRICTER: Require higher scores, especially for title case
    // Title case needs much stronger signals (score >= 10) or must be all caps/numbered
    else if (isTitleCase && !isAllCaps && !isNumbered) {
      // Title case alone is not enough - require very strong contextual signals
      // STRICTER: Require score >= 10 (was 8) AND must be followed by much longer content
      if (score >= 10 && isFollowedByMuchLonger && wordCount <= 2 && text.length <= 30) {
        headersToAdd.push({ element: p, level: headerLevel });
      }
    }
    // Other clear header patterns - MUCH STRICTER threshold
    else if (score >= 8 || // STRICTER: Increased from 6 to 8
      (isShortAllCapsHeader && score >= 4) || // STRICTER: Increased from 3
      (isShortAllCapsStandalone && score >= 4) || // STRICTER: Increased from 3
      (isShortFollowedByMuchLonger && score >= 5)) { // STRICTER: Increased from 4
      headersToAdd.push({ element: p, level: headerLevel });
    }
  });

  // Apply headers (in reverse order to maintain indices when removing)
  headersToAdd.reverse().forEach(({ element, level }) => {
    if (!element.parentNode) return; // Element might have been removed already

    const text = (element.textContent || '').trim();
    if (text.length === 0) return;

    const header = document.createElement(`h${Math.min(Math.max(level, 1), 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6');
    header.textContent = text;
    if (element.parentNode && 'contains' in element.parentNode && typeof (element.parentNode as { contains: (node: Node) => boolean }).contains === 'function' && (element.parentNode as { contains: (node: Node) => boolean }).contains(element)) {
      element.parentNode.replaceChild(header, element);
    } else if (element.parentNode) {
      try { element.parentNode.replaceChild(header, element); } catch { }
    }
  });

  // If no headers were detected but we have multiple paragraphs, add a title header
  if (headersToAdd.length === 0 && paragraphs.length > 0) {
    const firstP = paragraphs[0];
    if (firstP && firstP.parentNode) {
      const firstText = (firstP.textContent || '').trim();
      if (firstText.length > 0 && firstText.length < 200) {
        const h1 = document.createElement('h1');
        h1.textContent = firstText;
        if (firstP.parentNode && 'contains' in firstP.parentNode && typeof (firstP.parentNode as { contains: (node: Node) => boolean }).contains === 'function' && (firstP.parentNode as { contains: (node: Node) => boolean }).contains(firstP)) {
          firstP.parentNode.replaceChild(h1, firstP);
        } else if (firstP.parentNode) {
          try { firstP.parentNode.replaceChild(h1, firstP); } catch { }
        }
      }
    }
  }
}
