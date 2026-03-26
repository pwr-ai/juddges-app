// English judgment parsing functions

import { endsWithSentenceBoundary } from './text-processor';
import {
  appendFormattedMetadataValue,
  moveChildNodesIntoMetadata,
} from './metadata-formatter';
import { stripFakeSeparatorsFromNode } from './text-processor';

let enumeratedParagraphCounter = 0;

export function detectEnglishJudgment(root: HTMLElement): boolean {
  const text = (root.textContent || '').toUpperCase();

  // Check for common English judgment patterns
  const englishJudgmentPatterns = [
    /NEUTRAL CITATION NUMBER/i,
    /IN THE COURT OF APPEAL/i,
    /IN THE HIGH COURT/i,
    /IN THE SUPREME COURT/i,
    /ON APPEAL FROM/i,
    /BEFORE/i,
    /LORD JUSTICE|LADY JUSTICE/i,
    /JUDGMENT OF/i,
    /EWCA|EWHC|UKSC|UKHL/i, // English court abbreviations
    /\[20\d{2}\]\s*(EWCA|EWHC|UKSC|UKHL)/i, // Citation format like [2015] EWCA Crim 538
  ];

  return englishJudgmentPatterns.some(pattern => pattern.test(text));
}

export function parseEnglishJudgment(root: HTMLElement, document: Document): void {
  enumeratedParagraphCounter = 0;
  // Process all paragraphs to find and structure English judgment content
  const paragraphs = Array.from(root.querySelectorAll('p')) as HTMLElement[];

  if (paragraphs.length === 0) {
    // If no paragraphs, check if root has direct text content or text in divs
    const allText = root.textContent || '';
    const directText = allText.trim();

    if (directText.length > 0) {
      // Process the entire text content
      const processed = processEnglishJudgmentParagraph(directText, document, root);

      if (processed.length > 0) {
        // Remove all child nodes
        const nodesToRemove = Array.from(root.childNodes);
        nodesToRemove.forEach(node => {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        });

        // Add processed elements
        processed.forEach(el => root.appendChild(el));
      }
    }
    return;
  }

  // Process paragraphs in reverse to avoid index issues
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i];
    if (!p || !p.parentNode) continue;

    const text = (p.textContent || '').trim();
    if (text.length === 0) continue;

    // Check if paragraph contains multiple sections that need to be split
    const processed = processEnglishJudgmentParagraph(text, document, root);

    const firstProcessed = processed[0];
    const isNotParagraph = firstProcessed && firstProcessed.nodeType === 1 && (firstProcessed as Element).tagName !== 'P';
    if (processed.length > 1 || (processed.length === 1 && isNotParagraph)) {
      // Replace paragraph with processed elements
      processed.forEach((el, idx) => {
        if (idx === 0) {
          if (p.parentNode && 'contains' in p.parentNode && typeof (p.parentNode as { contains: (node: Node) => boolean }).contains === 'function' && (p.parentNode as { contains: (node: Node) => boolean }).contains(p)) {
            p.parentNode.replaceChild(el, p);
          } else if (p.parentNode) {
            try { p.parentNode.replaceChild(el, p); } catch { }
          }
        } else {
          p.parentNode!.insertBefore(el, p.nextSibling);
        }
      });
    }
  }
}

export function processEnglishJudgmentParagraph(text: string, document: Document, root?: HTMLElement): Node[] {
  const result: Node[] = [];

  // First, check for "---" section separators (like "Between", "Respondents", "Judgement")
  // Match dashes with or without spaces: "-----" or "- - - - - -" or " - - - - - - "
  // Must have at least 3 dashes, can be on their own line or between text
  // Pattern: match any sequence of dashes and spaces that contains at least 3 dashes
  // Match: "- - - - - -" (dash space dash space...) or "-----" (all dashes)
  // Simple pattern: match sequences of dashes and spaces, at least 3 dashes total
  const sectionSeparatorPattern = /(?:[-]\s*){3,}[-]*/;
  const hasSectionSeparators = sectionSeparatorPattern.test(text);

  // Split by section separators if they exist
  if (hasSectionSeparators) {
    // Split by dashes with or without spaces (at least 3 dashes), keeping the separators
    // Pattern matches: "-----", "- - - - -", " - - - - - - ", etc.
    // Can be on their own line or in the middle of a line
    // Pattern: match any sequence of dashes and spaces that contains at least 3 dashes
    const separatorPattern = /(?:[-]\s*){3,}[-]*/;
    const parts = text.split(separatorPattern);

    // Re-split to get both content and separators
    const allParts: Array<{ type: 'separator' | 'content'; text: string }> = [];
    let lastIndex = 0;
    // matchAll requires global flag
    const separatorPatternGlobal = new RegExp(separatorPattern.source, 'g');
    const separatorMatches = [...text.matchAll(separatorPatternGlobal)];

    for (const match of separatorMatches) {
      if (match.index !== undefined) {
        // Add content before separator
        if (match.index > lastIndex) {
          const content = text.substring(lastIndex, match.index).trim();
          if (content.length > 0) {
            allParts.push({ type: 'content', text: content });
          }
        }
        // Add separator
        allParts.push({ type: 'separator', text: match[0] });
        lastIndex = match.index + match[0].length;
      }
    }
    // Add remaining content
    if (lastIndex < text.length) {
      const content = text.substring(lastIndex).trim();
      if (content.length > 0) {
        allParts.push({ type: 'content', text: content });
      }
    }

    // If no matches found, just use the original parts
    if (allParts.length === 0) {
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          allParts.push({ type: 'content', text: trimmed });
        }
      }
    }

    let pendingRespondentsText = '';

    for (let i = 0; i < allParts.length; i++) {
      const part = allParts[i];

      // Check if this part is a separator
      if (part.type === 'separator') {
        // Check the content BEFORE this separator for "Respondents"
        if (i > 0 && allParts[i - 1].type === 'content') {
          const contentBeforeSeparator = allParts[i - 1].text.trim();

          // Check if content ends with "Respondents" (case-insensitive)
          const respondentsMatch = contentBeforeSeparator.match(/\s+(Respondents?)\s*$/i);
          if (respondentsMatch) {
            pendingRespondentsText = respondentsMatch[1];

            // Remove "Respondents" from the content before separator
            const respondentsIndex = contentBeforeSeparator.lastIndexOf(respondentsMatch[0]);
            allParts[i - 1].text = contentBeforeSeparator.substring(0, respondentsIndex).trim();
          }
        }

        // Skip separator - no longer creating hr elements
      } else {
        // Process the section content
        const sectionResult = processEnglishJudgmentSection(part.text, document, root);

        // If we have pending "Respondents" text, prepend it to the first paragraph
        if (pendingRespondentsText && sectionResult.length > 0) {
          const firstElement = sectionResult[0];
          // Check if first element is a paragraph
          if (firstElement.nodeType === 1 && (firstElement as Element).tagName === 'P') {
            // Create strong element for "Respondents"
            const strong = document.createElement('strong');
            strong.textContent = pendingRespondentsText;

            // Insert "Respondents" at the beginning of the paragraph
            firstElement.insertBefore(strong, firstElement.firstChild);

            // Add a space after "Respondents"
            firstElement.insertBefore(document.createTextNode(' '), strong.nextSibling);
          }
          pendingRespondentsText = '';
        }

        if (sectionResult.length > 0) {
          const lastResultNode = result.length > 0 ? result[result.length - 1] : null;
          let firstSectionNode = sectionResult[0];
          let metadataParagraph: Element | null = null;
          for (let idx = result.length - 1; idx >= 0; idx--) {
            const node = result[idx];
            if (node.nodeType === 1) {
              const el = node as Element;
              if (el.tagName === 'P' && el.className === 'judgment-metadata') {
                metadataParagraph = el;
                break;
              }
            }
          }
          if (metadataParagraph) {
            while (
              sectionResult.length > 0 &&
              sectionResult[0].nodeType === 1 &&
              /^H[1-6]$/i.test((sectionResult[0] as Element).tagName) &&
              /\bMetadata\b/i.test((sectionResult[0] as Element).textContent || '')
            ) {
              sectionResult.shift();
            }
            firstSectionNode = sectionResult[0];
          }
          if (
            lastResultNode &&
            firstSectionNode &&
            lastResultNode.nodeType === 1 &&
            (lastResultNode as Element).tagName === 'P' &&
            (lastResultNode as Element).className === 'judgment-metadata'
          ) {
            const lastMeta = lastResultNode as Element;
            if (
              firstSectionNode &&
              firstSectionNode.nodeType === 1 &&
              (firstSectionNode as Element).tagName === 'P' &&
              (firstSectionNode as Element).className === 'judgment-metadata'
            ) {
              const currentMeta = firstSectionNode as Element;
              if (currentMeta.childNodes.length > 0) {
                lastMeta.appendChild(document.createElement('br'));
                moveChildNodesIntoMetadata(lastMeta, currentMeta, document);
              }
              sectionResult.shift();
            } else if (
              firstSectionNode &&
              firstSectionNode.nodeType === 1 &&
              (firstSectionNode as Element).tagName === 'P'
            ) {
              const firstPara = firstSectionNode as Element;
              const firstParaText = (firstPara.textContent || '').trim().toLowerCase();
              if (/^respondents?\b/.test(firstParaText)) {
                if (firstPara.childNodes.length > 0) {
                  lastMeta.appendChild(document.createElement('br'));
                  moveChildNodesIntoMetadata(lastMeta, firstPara, document);
                }
                sectionResult.shift();
              }
            }
          }
        }

        result.push(...sectionResult);
      }
    }
  } else {
    // No separators, just process the whole text
    const sectionResult = processEnglishJudgmentSection(text, document, root);
    result.push(...sectionResult);
  }

  return result.length > 0 ? result : [document.createElement('p')];
}

// Helper function to bold text in parentheses and add line breaks before "Before: "
function boldTextInParentheses(text: string, document: Document): Node[] {
  // Find all text in parentheses and "Before: " patterns
  const parenthesesRegex = /(\([^)]+\))/g;
  const beforeRegex = /(\s+)(Before)\s*(:+)/gi; // Capture whitespace, "Before", and one or more colons separately

  const matches: Array<{ index: number; fullLength: number; text: string; type: 'parentheses' | 'before' }> = [];
  let match;

  // Find parentheses
  parenthesesRegex.lastIndex = 0;
  while ((match = parenthesesRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      fullLength: match[0].length,
      text: match[1],
      type: 'parentheses'
    });
  }

  // Find "Before: " patterns (with optional spaces and multiple colons)
  beforeRegex.lastIndex = 0;
  while ((match = beforeRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      fullLength: match[0].length, // Full match length including leading whitespace
      text: 'Before:', // Always use "Before: " without space
      type: 'before'
    });
  }

  if (matches.length === 0) {
    return [document.createTextNode(text)];
  }

  // Sort matches by index
  matches.sort((a, b) => a.index - b.index);

  const nodes: Node[] = [];
  let lastIndex = 0;

  for (const m of matches) {
    // Add text before the match
    if (m.index > lastIndex) {
      const beforeText = text.substring(lastIndex, m.index);
      if (beforeText.length > 0) {
        nodes.push(document.createTextNode(beforeText));
      }
    }

    if (m.type === 'before') {
      // Add line break before "Before: "
      nodes.push(document.createElement('br'));

      // Add "Before: " in bold (no space)
      const strong = document.createElement('strong');
      strong.textContent = m.text; // "Before: " without space
      nodes.push(strong);

      lastIndex = m.index + m.fullLength; // Skip the entire match including leading whitespace
    } else {
      // Add the parenthetical text in bold
      const strong = document.createElement('strong');
      const normalizedParenthetical = m.text
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')');
      strong.textContent = normalizedParenthetical;
      nodes.push(strong);

      lastIndex = m.index + m.fullLength;
    }
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText.length > 0) {
      nodes.push(document.createTextNode(remainingText));
    }
  }

  return nodes.length > 0 ? nodes : [document.createTextNode(text)];
}

function splitTextByNewlines(text: string, document: Document): Node[] {
  if (!text.includes('\n')) {
    return [document.createTextNode(text)];
  }

  const nodes: Node[] = [];
  const parts = text.split(/\n{2,}/);

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i].replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (segment.length > 0) {
      nodes.push(document.createTextNode(segment));
    }
    if (i < parts.length - 1) {
      nodes.push(document.createElement('br'));
    }
  }

  return nodes.length > 0 ? nodes : [document.createTextNode('')];
}

function formatParagraphText(text: string, document: Document, applyRespondentFormatting: boolean = false): Node[] {
  // First, apply parentheses bolding
  const withParentheses = boldTextInParentheses(text, document);

  // Expand any newline characters into <br> elements
  const withLineBreaks: Node[] = [];
  for (const node of withParentheses) {
    if (node.nodeType === 3 && node.textContent && node.textContent.includes('\n')) {
      withLineBreaks.push(...splitTextByNewlines(node.textContent, document));
    } else {
      withLineBreaks.push(node);
    }
  }

  // If we don't need to apply respondent formatting, return as is
  if (!applyRespondentFormatting) {
    return withLineBreaks;
  }

  // Now apply respondent formatting to text nodes
  const finalNodes: Node[] = [];

  for (const node of withLineBreaks) {
    // nodeType 3 is TEXT_NODE in DOM
    if (node.nodeType === 3 && node.textContent) {
      // Check if this text node contains "Respondent"
      if (/\bRespondents?\b/i.test(node.textContent)) {
        // Apply respondent formatting
        const respondentNodes = addLineBreaksBeforeRespondent(node.textContent, document);
        finalNodes.push(...respondentNodes);
      } else {
        finalNodes.push(node);
      }
    } else {
      // Keep non-text nodes as is (like <strong> tags from parentheses)
      finalNodes.push(node);
    }
  }

  return finalNodes.length > 0 ? finalNodes : [document.createTextNode(text)];
}

// Helper function to add line breaks before "Respondent" words in a paragraph
function addLineBreaksBeforeRespondent(text: string, document: Document): Node[] {
  // Find all matches of space(s) before "Respondent" or "Respondents" (case-insensitive)
  const regex = /\s+(Respondents?)/gi;
  const matches: Array<{ index: number; fullMatch: string; word: string }> = [];
  let match;

  // Reset regex lastIndex
  regex.lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      fullMatch: match[0], // Full match includes spaces + word
      word: match[1] // Just the word "Respondent" or "Respondents"
    });
  }

  if (matches.length === 0) {
    // No matches, return text as-is
    return [document.createTextNode(text)];
  }

  const nodes: Node[] = [];
  let lastIndex = 0;

  for (const m of matches) {
    // Add text before the match (before the spaces)
    if (m.index > lastIndex) {
      const beforeText = text.substring(lastIndex, m.index);
      if (beforeText.length > 0) {
        nodes.push(document.createTextNode(beforeText));
      }
    }

    // Add line break before "Respondent"
    nodes.push(document.createElement('br'));

    // Add "Respondent" word in bold (without the leading spaces)
    const strong = document.createElement('strong');
    strong.textContent = m.word;
    nodes.push(strong);

    // Update lastIndex to after the full match (spaces + word)
    lastIndex = m.index + m.fullMatch.length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText.length > 0) {
      nodes.push(document.createTextNode(remainingText));
    }
  }

  return nodes.length > 0 ? nodes : [document.createTextNode(text)];
}

// Helper function to detect and format enumerated paragraphs (1., 2., 3., etc.)
function formatEnumeratedParagraphs(text: string, document: Document): Node[] {
  // Pattern to find the start of enumerated paragraphs: number followed by a dot and whitespace
  const enumPattern = /\b([1-9]\d{0,2})\.\s+/g;

  const matches: Array<{ index: number; number: string; content: string; fullMatch: string; numberValue: number }> = [];
  const potentialMatches: Array<{ index: number; number: string; numberValue: number; contentStart: number }> = [];
  const seenMatchIndexes: Set<number> = new Set();

  let match: RegExpExecArray | null;
  let lastAcceptedNumber: number | null = null;

  enumPattern.lastIndex = 0;

  while ((match = enumPattern.exec(text)) !== null) {
    const matchStart = match.index;
    const numberValue = parseInt(match[1], 10);
    const contentStart = enumPattern.lastIndex; // Position right after "number. "

    // Safety checks using context before and after the match
    const beforeText = text.substring(0, matchStart);

    const contentAfter = text.substring(contentStart, Math.min(text.length, contentStart + 100));

    const hasSentenceEndBefore = matchStart === 0 ||
      endsWithSentenceBoundary(beforeText) ||
      /^\s*$/.test(beforeText) ||
      /\n\s*$/.test(beforeText);

    const isNotDate = !/^\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(contentAfter);
    const isNotCitation = !/^\[\d{4}\]/.test(contentAfter);
    const isNotCaseNumber = !/^\d{6,}/.test(contentAfter);

    const gap = lastAcceptedNumber !== null ? numberValue - lastAcceptedNumber : null;
    const smallNumber = numberValue <= 400;
    const isSequential =
      lastAcceptedNumber === null ||
      gap === 1 ||
      gap === 0 ||
      numberValue === 1 ||
      (gap !== null && gap > 1 && gap <= 50 && smallNumber) ||
      (gap !== null && gap < 0 && Math.abs(gap) <= 50 && smallNumber);

    if (hasSentenceEndBefore && isNotDate && isNotCitation && isNotCaseNumber && isSequential) {
      potentialMatches.push({
        index: matchStart,
        number: match[1],
        numberValue,
        contentStart
      });
      seenMatchIndexes.add(matchStart);
      lastAcceptedNumber = numberValue;
    }
  }

  // Second pass: numbers without explicit trailing dot (e.g., "21 She...")
  const enumNoDotPattern = /\b([1-9]\d{0,2})\s+(?=[A-Za-z(\["'"])/g;
  enumNoDotPattern.lastIndex = 0;
  while ((match = enumNoDotPattern.exec(text)) !== null) {
    const matchStart = match.index;
    if (seenMatchIndexes.has(matchStart)) continue;

    const numberValue = parseInt(match[1], 10);
    const numberEndIndex = matchStart + match[1].length;

    // Skip if immediately followed by another digit or period (handled in primary pattern)
    const immediateAfter = text[numberEndIndex] || '';
    if (/\d/.test(immediateAfter) || immediateAfter === '.') {
      continue;
    }

    const prevChar = matchStart > 0 ? text[matchStart - 1] : '';
    if (/[0-9]/.test(prevChar)) {
      continue;
    }

    const contentStart = enumNoDotPattern.lastIndex;
    const beforeText = text.substring(0, matchStart);
    const contentAfter = text.substring(contentStart, Math.min(text.length, contentStart + 100));

    const hasSentenceEndBefore = matchStart === 0 ||
      endsWithSentenceBoundary(beforeText) ||
      /^\s*$/.test(beforeText) ||
      /\n\s*$/.test(beforeText);

    const isNotDate = !/^\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(contentAfter);
    const isNotCitation = !/^\[\d{4}\]/.test(contentAfter);
    const isNotCaseNumber = !/^\d{6,}/.test(contentAfter);

    const gap = lastAcceptedNumber !== null ? numberValue - lastAcceptedNumber : null;
    const smallNumber = numberValue <= 400;
    const isSequential =
      lastAcceptedNumber === null ||
      gap === 1 ||
      gap === 0 ||
      numberValue === 1 ||
      (gap !== null && gap > 1 && gap <= 50 && smallNumber) ||
      (gap !== null && gap < 0 && Math.abs(gap) <= 50 && smallNumber);

    if (hasSentenceEndBefore && isNotDate && isNotCitation && isNotCaseNumber && isSequential) {
      potentialMatches.push({
        index: matchStart,
        number: match[1],
        numberValue,
        contentStart
      });
      seenMatchIndexes.add(matchStart);
      lastAcceptedNumber = numberValue;
    }
  }

  if (potentialMatches.length === 0) {
    return [document.createTextNode(text)];
  }

  // Sort matches by index
  potentialMatches.sort((a, b) => a.index - b.index);

  // First pass: detect all-caps prefixes for each paragraph
  const prefixInfo: Map<number, { prefixText: string; actualStartIndex: number }> = new Map();

  for (let i = 0; i < potentialMatches.length; i++) {
    const current = potentialMatches[i];

    // Check if there's an all-caps word (like "CONCLUSION", "INTRODUCTION") immediately before the number
    const beforeMatchStart = Math.max(0, current.index - 50);
    const beforeMatch = text.substring(beforeMatchStart, current.index);
    const allCapsWordMatch = beforeMatch.match(/([A-Z][A-Z\s]{2,})\s*$/);

    if (allCapsWordMatch) {
      const allCapsWord = allCapsWordMatch[1].trim();
      // Verify it's truly all caps (no lowercase letters)
      if (allCapsWord.length >= 4 && !/[a-z]/.test(allCapsWord)) {
        const prefixText = allCapsWord + ' ';
        const actualStartIndex = beforeMatchStart + allCapsWordMatch.index!;
        prefixInfo.set(i, { prefixText, actualStartIndex });
      }
    }
  }

  // Second pass: extract content for each paragraph
  for (let i = 0; i < potentialMatches.length; i++) {
    const current = potentialMatches[i];
    const next = potentialMatches[i + 1];

    const contentStart = current.contentStart;

    // Determine where this paragraph's content ends
    // If the next paragraph has a prefix, end before the prefix
    // Otherwise, end at the next paragraph number
    let contentEnd: number;
    if (next) {
      const nextPrefixInfo = prefixInfo.get(i + 1);
      if (nextPrefixInfo) {
        // End before the next paragraph's prefix
        contentEnd = nextPrefixInfo.actualStartIndex;
      } else {
        // End at the next paragraph's number
        contentEnd = next.index;
      }
    } else {
      contentEnd = text.length;
    }

    // Get prefix and actual start for current paragraph
    const currentPrefixInfo = prefixInfo.get(i);
    const prefixText = currentPrefixInfo ? currentPrefixInfo.prefixText : '';
    const actualStartIndex = currentPrefixInfo ? currentPrefixInfo.actualStartIndex : current.index;

    const rawContent = text.substring(contentStart, contentEnd);
    const content = (prefixText + rawContent).trim();

    if (content.length >= 10) {
      matches.push({
        index: actualStartIndex,
        number: current.number,
        content,
        fullMatch: text.substring(actualStartIndex, contentEnd),
        numberValue: current.numberValue
      });
    }
  }

  if (matches.length === 0) {
    return [document.createTextNode(text)];
  }

  const nodes: Node[] = [];
  let consumedUntil = 0;

  for (const m of matches) {
    if (m.index > consumedUntil) {
      const beforeText = text.substring(consumedUntil, m.index).trim();
      if (beforeText.length > 0) {
        nodes.push(document.createTextNode(beforeText + ' '));
      }
    }

    const enumP = document.createElement('p');
    enumP.style.cssText = 'margin: 10px 0; padding-left: 20px;';
    enumP.className = 'enumerated-paragraph';

    // Check if content starts with an all-caps word (like "CONCLUSION")
    const allCapsPrefix = m.content.match(/^([A-Z][A-Z\s]{2,}?)\s+/);
    let actualContent = m.content;
    let prefix = '';

    if (allCapsPrefix) {
      const capsWord = allCapsPrefix[1].trim();
      // Verify it's truly all caps (no lowercase letters)
      if (capsWord.length >= 4 && !/[a-z]/.test(capsWord)) {
        prefix = capsWord + ' ';
        actualContent = m.content.substring(allCapsPrefix[0].length);
      }
    }

    const numberSpan = document.createElement('strong');
    const displayNumber = ++enumeratedParagraphCounter;
    numberSpan.textContent = `${prefix}${displayNumber}. `;
    enumP.appendChild(numberSpan);

    // Apply formatting (parentheses bolding and respondent formatting)
    const contentNodes = formatParagraphText(actualContent, document, false);
    contentNodes.forEach(node => enumP.appendChild(node));

    nodes.push(enumP);
    consumedUntil = m.index + m.fullMatch.length;
  }

  if (consumedUntil < text.length) {
    const remainingText = text.substring(consumedUntil).trim();
    if (remainingText.length > 0) {
      nodes.push(document.createTextNode(remainingText));
    }
  }

  return nodes.length > 0 ? nodes : [document.createElement('p')];
}

export function processEnglishJudgmentSection(text: string, document: Document, root?: HTMLElement): Node[] {
  const result: Node[] = [];

  // First, extract and separate metadata (like "Neutral Citation Number: ", "Case No: ", "Between: ")
  // Use a simpler approach: find each label, extract value up to next label or header
  const metadataLabels = ['Neutral Citation Number:', 'Case No:', 'Case Number:', 'Citation:', 'Date:', 'Between:'];
  let processedText = text;
  const metadataItems: Array<{ label: string; value: string; startIndex: number; endIndex: number }> = [];

  // Find all metadata items - make search case-insensitive
  const textUpper = processedText.toUpperCase();
  for (const label of metadataLabels) {
    const labelUpper = label.toUpperCase();
    let searchIndex = 0;
    let labelIndex: number;

    while ((labelIndex = textUpper.indexOf(labelUpper, searchIndex)) !== -1) {
      const valueStart = labelIndex + label.length;
      const afterLabel = processedText.substring(valueStart);
      const afterLabelUpper = afterLabel.toUpperCase();

      // Find next metadata label or header marker
      let valueEnd = afterLabel.length;
      for (const nextLabel of metadataLabels) {
        const nextLabelUpper = nextLabel.toUpperCase();
        const nextLabelIndex = afterLabelUpper.indexOf(nextLabelUpper);
        if (nextLabelIndex !== -1 && nextLabelIndex < valueEnd) {
          valueEnd = nextLabelIndex;
        }
      }

      // Also check for header markers
      const headerMarkers = ['IN THE', 'ON APPEAL', 'BEFORE', 'JUDGMENT'];
      for (const marker of headerMarkers) {
        const markerIndex = afterLabelUpper.indexOf(marker);
        if (markerIndex !== -1 && markerIndex < valueEnd) {
          valueEnd = markerIndex;
        }
      }

      const value = afterLabel.substring(0, valueEnd).trim();

      // Only add if we found a value
      if (value.length > 0) {
        metadataItems.push({
          label: label,
          value: value,
          startIndex: labelIndex,
          endIndex: valueStart + valueEnd
        });
      }

      searchIndex = labelIndex + 1;
    }
  }

  // Sort by start index
  metadataItems.sort((a, b) => a.startIndex - b.startIndex);

  // Remove duplicates (same start index)
  const uniqueItems = metadataItems.filter((item, index, arr) =>
    index === 0 || item.startIndex !== arr[index - 1].startIndex
  );

  // Remove metadata from processed text (in reverse order to maintain indices)
  for (let i = uniqueItems.length - 1; i >= 0; i--) {
    const item = uniqueItems[i];
    processedText = processedText.substring(0, item.startIndex) +
      processedText.substring(item.endIndex);
  }

  // Add metadata items to result - combine all into one paragraph with line breaks
  if (uniqueItems.length > 0) {
    const metaHeader = document.createElement('h2');
    metaHeader.textContent = 'Metadata';
    result.push(metaHeader);

    const metaP = document.createElement('p');
    metaP.className = 'judgment-metadata';

    for (let i = 0; i < uniqueItems.length; i++) {
      const meta = uniqueItems[i];

      // Make label bold - normalize label to remove spaces before colon
      const label = meta.label.replace(/\s+:/g, ':').replace(/:\s+/g, ':');
      const labelSpan = document.createElement('strong');
      labelSpan.textContent = label;
      metaP.appendChild(labelSpan);

      // Add value as text (no "Respondents" extraction here - that's done based on separators)
      // Clean up separators like " - and - " that destroy the style
      let value = meta.value.trim();
      // Remove " - and - " separators and replace with a cleaner separator
      value = value.replace(/\s*-\s+and\s+-\s*/gi, ' ');
      // Also remove any standalone "Respondents" at the end (it will be handled separately)
      value = value.replace(/\s+Respondents?\s*$/i, '');
      appendFormattedMetadataValue(metaP, value, document, label);

      // Add line break between metadata items (except for the last one)
      if (i < uniqueItems.length - 1) {
        metaP.appendChild(document.createElement('br'));
      }
    }

    result.push(metaP);
  }

  // Clean up processedText - remove any remaining metadata fragments
  processedText = processedText.trim();

  // Now process the remaining text for headers
  // Find headers in the remaining text - BE VERY STRICT, only match actual section headers
  // Also match after "-----" section separators
  const headerPatterns = [
    // Major headers (h1) - must be at start of line, after whitespace, or after "-----"
    // NOTE: "IN THE COURT OF APPEAL" is NOT a header - it's part of the document structure
    { pattern: /(?:^|\n|-{3,})\s*(JUDGMENT(?:\s+OF)?)\s*(?:\n|$)/i, level: 2 },

    // Section headers (h2) - must be at start of line, after whitespace, or after "-----"
    { pattern: /(?:^|\n|-{3,})\s*(ON APPEAL FROM[^A-Z\n]*?)(?:\s*\n|$)/i, level: 2 },
    { pattern: /(?:^|\n|-{3,})\s*(BACKGROUND|FACTS|HISTORY|SUMMARY|DECISION|ORDER)\s*(?:\n|$)/i, level: 2 },

    // Subsection headers (h3) - must be at start of line or after "-----"
    { pattern: /(?:^|\n|-{3,})\s*(GROUNDS?(?:\s+OF)?\s+APPEAL|ARGUMENTS?|LEGAL FRAMEWORK|ANALYSIS|DISCUSSION|REASONS?)\s*(?:\n|$)/i, level: 3 },
  ];

  // Find all header markers
  const markers: Array<{ index: number; text: string; level: number }> = [];

  for (const { pattern, level } of headerPatterns) {
    const regex = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = regex.exec(processedText)) !== null) {
      const headerStart = match.index;
      const headerMatch = match[0];

      // Find where header ends - look for next header marker or end of text
      const afterMatch = processedText.substring(headerStart + headerMatch.length);
      const nextHeaderMatch = afterMatch.match(new RegExp(`(${headerPatterns.map(h => h.pattern.source).join('|')})`, 'i'));

      let headerText = headerMatch;
      if (nextHeaderMatch) {
        // Header ends before next header marker
        const headerEndIndex = afterMatch.indexOf(nextHeaderMatch[0]);
        if (headerEndIndex > 0) {
          headerText = processedText.substring(headerStart, headerStart + headerMatch.length + headerEndIndex).trim();
        }
      } else {
        // Try to find end of header phrase (before lowercase text)
        const headerEndMatch = afterMatch.match(/^([A-Z\s()]+?)(?:\s+[a-z]|$)/);
        if (headerEndMatch) {
          headerText = processedText.substring(headerStart, headerStart + headerMatch.length + headerEndMatch[0].length).trim();
        }
      }

      // Only add if not already added (avoid duplicates)
      if (!markers.some(m => m.index === headerStart)) {
        markers.push({ index: headerStart, text: headerText.trim(), level });
      }
    }
  }

  // Sort markers by index
  markers.sort((a, b) => a.index - b.index);

  // Filter out markers that are too close together or not clearly separated
  const filteredMarkers: Array<{ index: number; text: string; level: number }> = [];
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const prevMarker = i > 0 ? markers[i - 1] : null;

    // Check if this is a known header pattern (like "CONCLUSION", etc.) - don't filter these
    // NOTE: "IN THE" is NOT a header - it's part of the document structure
    const isKnownHeader = /^(BACKGROUND|FACTS|HISTORY|SUMMARY|DECISION|ORDER|JUDGMENT|ON APPEAL FROM)/i.test(marker.text.trim());

    // Only keep marker if:
    // 1. It's the first one, OR
    // 2. It's a known header pattern, OR
    // 3. It's at least 50 characters after the previous one (to avoid matching random text)
    if (!prevMarker || isKnownHeader || (marker.index - prevMarker.index) > 50) {
      // Also check that the marker text is actually a header (not random all-caps in middle of sentence)
      const beforeText = processedText.substring(Math.max(0, marker.index - 20), marker.index);
      const afterText = processedText.substring(marker.index + marker.text.length, Math.min(processedText.length, marker.index + marker.text.length + 20));

      // Header should be preceded by newline/start or whitespace, and followed by newline or content
      // For known headers, be more lenient
      const isAtLineStart = /(?:^|\n|-{3,})\s*$/.test(beforeText) || marker.index < 20 || isKnownHeader;
      const isFollowedByContent = /\n/.test(afterText) || afterText.trim().length > 0;

      if (isAtLineStart && isFollowedByContent) {
        filteredMarkers.push(marker);
      }
    }
  }

  if (filteredMarkers.length > 0) {
    // Split text at markers
    let lastIndex = 0;

    // Get the metadata paragraph if it exists
    let metadataParagraph: Element | null = null;
    if (uniqueItems.length > 0 && result.length > 0 && result[result.length - 1].nodeType === 1) {
      const lastElement = result[result.length - 1] as Element;
      if (lastElement.tagName === 'P' && lastElement.className === 'judgment-metadata') {
        metadataParagraph = lastElement;
      }
    }

    for (let i = 0; i < filteredMarkers.length; i++) {
      const marker = filteredMarkers[i];
      const nextMarker = filteredMarkers[i + 1];

      // Text before marker
      if (marker.index > lastIndex) {
        const beforeText = processedText.substring(lastIndex, marker.index).trim();
        if (beforeText.length > 0) {
          // Check for enumerated paragraphs first
          const enumNodes = formatEnumeratedParagraphs(beforeText, document);
          if (enumNodes.length > 1 || (enumNodes.length === 1 && enumNodes[0].nodeType === 1)) {
            // Found enumerated paragraphs, add them directly
            result.push(...enumNodes);
          } else {
            // If we have a metadata paragraph, merge all content into it
            if (metadataParagraph) {
              // Add space and then the text to the metadata paragraph
              metadataParagraph.appendChild(document.createTextNode(' '));
              const nodes = formatParagraphText(beforeText, document, false);
              nodes.forEach(node => metadataParagraph!.appendChild(node));
              lastIndex = marker.index;
              continue;
            }

            // No enumerated paragraphs, create regular paragraph
            const p = document.createElement('p');
            // Apply formatting (parentheses bolding and optional respondent formatting)
            const nodes = formatParagraphText(beforeText, document, false);
            nodes.forEach(node => p.appendChild(node));
            result.push(p);
          }
        }
      }

      // Extract header phrase - ONLY the exact matched pattern, nothing more!
      // Find which pattern matched and extract only that
      let headerPhrase = '';

      // Try to match the exact pattern that was found
      for (const { pattern, level: patternLevel } of headerPatterns) {
        if (patternLevel === marker.level) {
          const match = processedText.substring(marker.index).match(pattern);
          if (match && match[1]) {
            // Extract ONLY the captured group (the actual header phrase)
            headerPhrase = match[1].trim();
            break;
          }
        }
      }

      // If we didn't find a match, fall back to extracting from marker text
      if (!headerPhrase) {
        headerPhrase = marker.text.trim();

        // NOTE: "IN THE COURT OF APPEAL" is NOT a header - skip it
        // For "ON APPEAL FROM", extract only the phrase itself
        if (/^ON APPEAL FROM/i.test(headerPhrase)) {
          headerPhrase = 'ON APPEAL FROM';
        }
        // For single word headers like "CONCLUSION", etc.
        else if (/^(BACKGROUND|FACTS|HISTORY|SUMMARY|DECISION|ORDER|JUDGMENT)$/i.test(headerPhrase)) {
          headerPhrase = headerPhrase.match(/^(BACKGROUND|FACTS|HISTORY|SUMMARY|DECISION|ORDER|JUDGMENT)/i)?.[1] || headerPhrase;
        }
        // For other headers, take only the first word/phrase
        else {
          // Split by space and take only the first meaningful part
          const words = headerPhrase.split(/\s+/);
          if (words.length > 0) {
            // Take first 1-3 words max
            headerPhrase = words.slice(0, Math.min(3, words.length)).join(' ').trim();
          }
        }
      }

      headerPhrase = headerPhrase.replace(/\s+/g, ' ').trim();

      const header = document.createElement(`h${marker.level}` as 'h1' | 'h2' | 'h3');
      header.textContent = headerPhrase;
      result.push(header);

      // Extract content after the header phrase (not the full marker text)
      // Find where the header phrase ends in the original text
      // The header phrase should be at the start of the marker text
      const textFromMarker = processedText.substring(marker.index);
      const headerPhraseEscaped = headerPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const headerMatch = textFromMarker.match(new RegExp(`^\\s*${headerPhraseEscaped}`, 'i'));

      let headerPhraseEndIndex = marker.index;
      if (headerMatch) {
        // Find where the header phrase ends
        headerPhraseEndIndex = marker.index + headerMatch[0].length;
      } else {
        // Fallback: use the marker text length
        headerPhraseEndIndex = marker.index + marker.text.length;
      }

      const nextIndex = nextMarker ? nextMarker.index : processedText.length;

      // Get all text after the header phrase up to the next marker
      if (headerPhraseEndIndex < nextIndex) {
        const afterHeader = processedText.substring(headerPhraseEndIndex, nextIndex).trim();
        if (afterHeader.length > 0) {
          // Check for enumerated paragraphs first
          const enumNodes = formatEnumeratedParagraphs(afterHeader, document);
          if (enumNodes.length > 1 || (enumNodes.length === 1 && enumNodes[0].nodeType === 1)) {
            // Found enumerated paragraphs, add them directly
            result.push(...enumNodes);
          } else {
            // If we have a metadata paragraph, merge content into it
            if (metadataParagraph) {
              metadataParagraph.appendChild(document.createTextNode(' '));
              const nodes = formatParagraphText(afterHeader, document, false);
              nodes.forEach(node => metadataParagraph!.appendChild(node));
            } else {
              // No enumerated paragraphs, create regular paragraph
              const p = document.createElement('p');
              // Apply formatting (parentheses bolding and optional respondent formatting)
              const nodes = formatParagraphText(afterHeader, document, false);
              nodes.forEach(node => p.appendChild(node));
              result.push(p);
            }
          }
        }
      }

      lastIndex = nextMarker ? nextMarker.index : processedText.length;
    }

    // Remaining text after last marker
    if (lastIndex < processedText.length) {
      const afterText = processedText.substring(lastIndex).trim();
      if (afterText.length > 0) {
        // Check for enumerated paragraphs first
        const enumNodes = formatEnumeratedParagraphs(afterText, document);
        if (enumNodes.length > 1 || (enumNodes.length === 1 && enumNodes[0].nodeType === 1)) {
          // Found enumerated paragraphs, add them directly
          result.push(...enumNodes);
        } else {
          // If we have a metadata paragraph, merge all remaining content into it
          if (metadataParagraph) {
            metadataParagraph.appendChild(document.createTextNode(' '));
            const nodes = formatParagraphText(afterText, document, false);
            nodes.forEach(node => metadataParagraph!.appendChild(node));
          } else {
            // No enumerated paragraphs, create regular paragraph
            const p = document.createElement('p');
            // Apply formatting (parentheses bolding and optional respondent formatting)
            const nodes = formatParagraphText(afterText, document, false);
            nodes.forEach(node => p.appendChild(node));
            result.push(p);
          }
        }
      }
    }
  } else {
    // No major markers found - merge all content into metadata paragraph if it exists
    if (processedText.trim().length > 0) {
      // Get the metadata paragraph if it exists
      let metadataParagraph: Element | null = null;
      if (uniqueItems.length > 0 && result.length > 0 && result[result.length - 1].nodeType === 1) {
        const lastElement = result[result.length - 1] as Element;
        if (lastElement.tagName === 'P' && lastElement.className === 'judgment-metadata') {
          metadataParagraph = lastElement;
        }
      }

      if (metadataParagraph) {
        // Process the text and merge all results into the metadata paragraph
        const processed = processEnglishJudgmentText(processedText, document, root, metadataParagraph);
        // If there are any additional results (like enumerated paragraphs), add them
        result.push(...processed);
      } else {
        // No metadata paragraph, process normally
        const processed = processEnglishJudgmentText(processedText, document, root);
        result.push(...processed);
      }
    }
  }

  const hasEnumeratedParagraph = result.some(node =>
    node.nodeType === 1 && (node as Element).classList?.contains('enumerated-paragraph')
  );
  const hasJudgmentHeader = result.some(node =>
    node.nodeType === 1 && /^H[1-6]$/i.test((node as Element).tagName) &&
    /\bJudgment\b/i.test((node as Element).textContent || '')
  );

  if (hasEnumeratedParagraph && !hasJudgmentHeader) {
    const firstEnumIndex = result.findIndex(node =>
      node.nodeType === 1 && (node as Element).classList?.contains('enumerated-paragraph')
    );
    if (firstEnumIndex !== -1) {
      const judgmentHeader = document.createElement('h2');
      judgmentHeader.textContent = 'Judgment';
      result.splice(firstEnumIndex, 0, judgmentHeader);
    }
  }

  for (const node of result) {
    stripFakeSeparatorsFromNode(node);
  }

  return result.length > 0 ? result : [document.createElement('p')];
}

export function processEnglishJudgmentText(text: string, document: Document, root?: HTMLElement, existingMetadataParagraph?: Element): Node[] {
  const result: Node[] = [];

  // Split by double newlines (paragraph separators)
  const sections = text.split(/(?:\n\s*\n|\r\n\s*\r\n)/);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const trimmed = section.trim();
    if (trimmed.length === 0) continue;

    // Check for metadata patterns
    if (isMetadata(trimmed)) {
      // Check if next section starts with "Respondents" - if so, merge them
      const nextSection = i + 1 < sections.length ? sections[i + 1].trim() : '';
      const shouldMergeWithNext = /^Respondents/i.test(nextSection);

      // If we have an existing metadata paragraph, merge into it
      const metadataP = existingMetadataParagraph || document.createElement('p');
      if (!existingMetadataParagraph) {
        metadataP.className = 'judgment-metadata';
      }

      // Extract label and value, make label bold
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        // Add space before adding new content to existing paragraph
        if (existingMetadataParagraph) {
          metadataP.appendChild(document.createTextNode(' '));
        }

        let label = trimmed.substring(0, colonIndex + 1);
        // Normalize label to remove spaces before colon
        label = label.replace(/\s+:/g, ':').replace(/:\s+/g, ':');
        let value = trimmed.substring(colonIndex + 1).trim();

        // Clean up separators like " - and - " that destroy the style
        value = value.replace(/\s*-\s+and\s+-\s*/gi, ' ');
        // Also remove any standalone "Respondents" at the end (it will be handled separately)
        value = value.replace(/\s+Respondents?\s*$/i, '');

        const labelSpan = document.createElement('strong');
        labelSpan.textContent = label;
        metadataP.appendChild(labelSpan);

        const valueText = document.createTextNode(` ${value}`);
        metadataP.appendChild(valueText);

        // If next section starts with "Respondents", merge it
        if (shouldMergeWithNext) {
          metadataP.appendChild(document.createTextNode(' '));
          // Process the "Respondents" section and add to this paragraph
          const nextSectionTrimmed = nextSection;
          const nodes = formatParagraphText(nextSectionTrimmed, document, false);
          nodes.forEach(node => metadataP.appendChild(node));
          i++; // Skip the next section since we've merged it
        }
      } else {
        if (existingMetadataParagraph) {
          metadataP.appendChild(document.createTextNode(' ' + trimmed));
        } else {
          metadataP.textContent = trimmed;
        }
      }

      // Only add to result if we created a new paragraph
      if (!existingMetadataParagraph) {
        result.push(metadataP);
      }
      continue;
    }

    // Check for all-caps headers (3-100 chars, all uppercase)
    const headerMatch = trimmed.match(/^([A-Z\s]{3,100})(?:\s+)([\s\S]+)$/);
    if (headerMatch) {
      const potentialHeader = headerMatch[1].trim();
      const restText = headerMatch[2].trim();

      // Verify it's actually all caps (not just starts with caps)
      const textLetters = potentialHeader.replace(/[^A-Za-z]/g, '');
      const isExcludedHeader = /^(IN THE COURT OF APPEAL|IN THE HIGH COURT|IN THE SUPREME COURT)/i.test(potentialHeader);

      if (textLetters.length > 0 && textLetters === textLetters.toUpperCase() &&
        !/[a-z]/.test(textLetters) && !isExcludedHeader) {

        // Determine header level based on content
        // NOTE: "IN THE" is NOT a header - it's part of the document structure
        let level = 3; // Default to h3
        if (/^(JUDGMENT)/i.test(potentialHeader)) {
          level = 1;
        } else if (/^(ON APPEAL|BACKGROUND)/i.test(potentialHeader)) {
          level = 2;
        }

        const header = document.createElement(`h${level}` as 'h1' | 'h2' | 'h3');
        header.textContent = potentialHeader;
        result.push(header);

        if (restText.length > 0) {
          // Check for enumerated paragraphs first
          const enumNodes = formatEnumeratedParagraphs(restText, document);
          if (enumNodes.length > 1 || (enumNodes.length === 1 && enumNodes[0].nodeType === 1)) {
            // Found enumerated paragraphs, add them directly
            result.push(...enumNodes);
          } else {
            // If we have an existing metadata paragraph, merge into it
            if (existingMetadataParagraph) {
              existingMetadataParagraph.appendChild(document.createTextNode(' '));
              const nodes = formatParagraphText(restText, document, false);
              nodes.forEach(node => existingMetadataParagraph!.appendChild(node));
            } else {
              // No enumerated paragraphs, create regular paragraph
              const p = document.createElement('p');
              // Apply formatting (parentheses bolding and optional respondent formatting)
              const nodes = formatParagraphText(restText, document, false);
              nodes.forEach(node => p.appendChild(node));
              result.push(p);
            }
          }
        }
        continue;
      }
    }

    // Check if entire section is a standalone all-caps header
    const textLetters = trimmed.replace(/[^A-Za-z]/g, '');
    const isExcludedFromHeaders = /^(IN THE COURT OF APPEAL|IN THE HIGH COURT|IN THE SUPREME COURT)/i.test(trimmed);

    if (trimmed.length >= 3 && trimmed.length <= 100 &&
      textLetters.length > 0 && textLetters === textLetters.toUpperCase() &&
      !/[a-z]/.test(textLetters) && !isExcludedFromHeaders) {

      // Determine header level
      // NOTE: "IN THE" is NOT a header - it's part of the document structure
      let level = 3;
      if (/^(JUDGMENT)/i.test(trimmed)) {
        level = 1;
      } else if (/^(ON APPEAL|BACKGROUND)/i.test(trimmed)) {
        level = 2;
      }

      const header = document.createElement(`h${level}` as 'h1' | 'h2' | 'h3');
      header.textContent = trimmed;
      result.push(header);
      continue;
    }

    // Regular paragraph - check for enumerated paragraphs first
    const enumNodes = formatEnumeratedParagraphs(trimmed, document);
    if (enumNodes.length > 1 || (enumNodes.length === 1 && enumNodes[0].nodeType === 1)) {
      // Found enumerated paragraphs, add them directly
      result.push(...enumNodes);
    } else {
      // If we have an existing metadata paragraph, merge into it
      if (existingMetadataParagraph) {
        existingMetadataParagraph.appendChild(document.createTextNode(' '));
        const nodes = formatParagraphText(trimmed, document, false);
        nodes.forEach(node => existingMetadataParagraph!.appendChild(node));
      } else {
        // No enumerated paragraphs, create regular paragraph
        const p = document.createElement('p');
        // Apply formatting (parentheses bolding and optional respondent formatting)
        const nodes = formatParagraphText(trimmed, document, false);
        nodes.forEach(node => p.appendChild(node));
        result.push(p);
      }
    }
  }

  return result;
}

export function isMetadata(text: string): boolean {
  // Check if text is metadata like "Neutral Citation Number: ", "Case No: ", etc.
  const metadataPatterns = [
    /^Neutral Citation Number:/i,
    /^Case No:/i,
    /^Case Number:/i,
    /^Citation:/i,
    /^Date:/i,
    /^Before:/i,
    /^Between:/i,
  ];

  return metadataPatterns.some(pattern => pattern.test(text)) ||
    (text.length < 150 && /^[A-Z][^.!?]*:/.test(text) && !text.includes('.'));
}
