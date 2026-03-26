// Legal reference highlighting

import { SHOW_TEXT } from './dom-utils';

export function highlightLegalReferences(root: HTMLElement, document: Document, diagLog?: string[]): void {
  const skipTags = new Set(['SCRIPT', 'STYLE', 'CODE', 'MARK']);
  const skipSelector = 'script,style,code,mark,strong.legal-ref';

  // Safe DOM replacement with robust diagnostics to avoid NotFoundError crashes
  const safeReplaceChild = (
    parent: Node | null | undefined,
    oldChild: Node | null | undefined,
    newChild: Node,
    ctx: { where: string; pattern?: string; snippet?: string }
  ): boolean => {
    try {
      if (!parent || !oldChild) {
        console.error('[documents-html] replaceChild skipped: missing parent/child', ctx);
        if (diagLog) {
          diagLog.push(`[safeReplaceChild] missing parent/child ${JSON.stringify(ctx)}\n` + (new Error().stack || ''));
        }
        return false;
      }
      // Ensure the parent still contains the child (DOM can mutate during wraps)
      if (!('contains' in parent) || typeof (parent as { contains: (node: Node) => boolean }).contains !== 'function' || !(parent as { contains: (node: Node) => boolean }).contains(oldChild)) {
        console.error('[documents-html] replaceChild skipped: parent no longer contains child', ctx);
        if (diagLog) {
          diagLog.push(`[safeReplaceChild] parent-no-contain ${JSON.stringify(ctx)}\n` + (new Error().stack || ''));
        }
        return false;
      }
      (parent as Node).replaceChild(newChild, oldChild);
      return true;
    } catch (err) {
      console.error('[documents-html] replaceChild failed:', { err, ...ctx });
      if (diagLog) {
        diagLog.push(`[safeReplaceChild] replace-failed ${JSON.stringify(ctx)}\n${(err instanceof Error ? err.stack : '') || ''}`);
      }
      return false;
    }
  };

  // COMPREHENSIVE PATTERN DEFINITIONS - covering all Polish legal reference formats
  // Ordered from most specific to least specific for proper matching priority
  const patternDefs = [
    // Art. with multiple components - NO \b at start to catch "w art.", "z art.", etc.
    { name: 'art_ust_pkt', source: '(?:^|[\\s(])art\\.\\s*\\d+[a-z]*\\s+ust\\.\\s*\\d+[a-z]*\\s+pkt\\s*\\d+[a-z]*' },
    { name: 'art_para_ust', source: '(?:^|[\\s(])art\\.\\s*\\d+[a-z]*\\s*§\\s*\\d+[a-z]*\\s+ust\\.\\s*\\d+[a-z]*' },
    { name: 'art_ust', source: '(?:^|[\\s(])art\\.\\s*\\d+[a-z]*\\s+ust\\.\\s*\\d+[a-z]*' },
    { name: 'art_para', source: '(?:^|[\\s(])art\\.\\s*\\d+[a-z]*\\s*§\\s*\\d+[a-z]*' },
    { name: 'art_pkt', source: '(?:^|[\\s(])art\\.\\s*\\d+[a-z]*\\s+pkt\\s*\\d+[a-z]*' },
    { name: 'art_only', source: '(?:^|[\\s(])art\\.\\s*\\d+[a-z]*' },

    // Number-based patterns (NO "art." prefix) - CRITICAL for "21 ust. 1 pkt 1"
    { name: 'num_ust_pkt', source: '\\b\\d+[a-z]*\\s+ust\\.\\s*\\d+[a-z]*\\s+pkt\\s*\\d+[a-z]*' },
    { name: 'num_ust', source: '\\b\\d+[a-z]*\\s+ust\\.\\s*\\d+[a-z]*' },
    { name: 'num_pkt', source: '\\b\\d+[a-z]*\\s+pkt\\s*\\d+[a-z]*' },

    // Component patterns (standalone ust., pkt., etc.)
    { name: 'ust_pkt', source: '\\bust\\.\\s*\\d+[a-z]*\\s+pkt\\s*\\d+[a-z]*' },
    { name: 'ust_only', source: '\\bust\\.\\s*\\d+[a-z]*' },
    { name: 'pkt_only', source: '\\bpkt\\s*\\d+[a-z]*' },
    { name: 'par_only', source: '§\\s*\\d+[a-z]*' },

    // NEW: Case signatures (sygn. akt ...) and short forms like "II FSK 1828/16" or "I SA/Wa 1234/18"
    { name: 'sygn_akt_full', source: '(?:^|[\\s(])sygn\\.\\s*akt\\s+[IVX]{1,4}\\s*[A-ZĄĆĘŁŃÓŚŹŻ]{1,5}(?:\\/[A-Za-zĄĆĘŁŃÓŚŹŻ]{1,4})?\\s+\\d{1,4}\\/\\d{2,4}' },
    { name: 'sygn_akt_short', source: '(?:^|[\\s(])[IVX]{1,4}\\s*[A-ZĄĆĘŁŃÓŚŹŻ]{1,5}(?:\\/[A-Za-zĄĆĘŁŃÓŚŹŻ]{1,4})?\\s+\\d{1,4}\\/\\d{2,4}' },

    // NEW: Journal citations Dz.U. and M.P., with optional year and "poz."
    { name: 'dzu_poz', source: '(?:^|[\\s(])(?:t\\.\\s*j\\\\.\\s*)?Dz\\.?\\s*U\\.?\\s*(?:z\\s*\\d{4}\\s*r\\.,?)?\\s*poz\\.?\\s*\\d+' },
    { name: 'mp_poz', source: '(?:^|[\\s(])M\\.?\\s*P\\.?\\s*(?:z\\s*\\d{4}\\s*r\\.,?)?\\s*poz\\.?\\s*\\d+' },

    // NEW: Ruling reference numbers starting with "Znak: "
    // Examples: "Znak: 0111-KDIB2-1.4010.282.2021.1.BKD"
    // Allow uppercase letters, digits, dots, dashes and slashes after the prefix
    { name: 'znak_ref', source: '(?:^|[\\s(])Znak:\\s*[A-Z0-9][A-Z0-9./-]*' },
  ];

  const tailRegex =
    /^(\s+(?:ustawy|ustawa|rozporządzenia|konwencji)(?:\s+o\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9][^,.;:)]*)?)/i;
  const chainRegex =
    /^\s*(?:[,;]|i|oraz)\s*(?:art\.?|ust\.?|ustęp|pkt\.?|punkt|lit\.?|litera|§)\s*\d+[a-z]*(?:\s*(?:ust\.?|ustęp|pkt\.?|punkt|lit\.?|litera|§)\s*\d+[a-z]*)*/i;
  const patternTotals = new Map<string, number>();
  const matchSamples: Array<{ pattern: string; text: string; context: string }> = [];

  const extendRange = (original: string, start: number, end: number): number => {
    let updated = true;
    while (updated) {
      updated = false;
      const sliceAfter = original.slice(end);

      const chainMatch = sliceAfter.match(chainRegex);
      if (chainMatch && chainMatch[0].trim()) {
        const candidate = chainMatch[0];
        const nextChar = original.charAt(end + candidate.length);
        if (!nextChar || /[\s,.;:)]/.test(nextChar)) {
          end += candidate.length;
          updated = true;
          continue;
        }
      }

      const tailMatch = sliceAfter.match(tailRegex);
      if (tailMatch) {
        const tailText = tailMatch[1];
        const nextChar = original.charAt(end + tailText.length);
        if (!nextChar || /[\s,.;:)]/.test(nextChar)) {
          end += tailText.length;
          updated = true;
          continue;
        }
      }
    }
    return end;
  };

  const createMatchRecord = (
    start: number,
    end: number,
    patternName: string,
    original: string
  ): { start: number; end: number; pattern: string; text: string; length: number } => ({
    start,
    end,
    pattern: patternName,
    text: original.slice(start, end),
    length: end - start,
  });

  const acceptedMatchesForText = (original: string): Array<{
    start: number;
    end: number;
    pattern: string;
    text: string;
    length: number;
  }> => {
    const rawMatches: Array<{
      start: number;
      end: number;
      pattern: string;
      text: string;
      length: number;
    }> = [];

    patternDefs.forEach((def) => {
      const regex = new RegExp(def.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = regex.exec(original)) !== null) {
        let start = m.index;

        // If pattern starts with (?:^|[\s(]), skip the leading space/paren
        if (m[0].match(/^[\s(]/)) {
          start += 1; // Skip the leading whitespace or paren
        }

        const prevChar = start > 0 ? original[start - 1] : '';
        if (prevChar && /[A-Za-z0-9]/.test(prevChar)) {
          continue;
        }

        let end = extendRange(original, start, regex.lastIndex);

        // Extend 'ust' references to include lists like ", 2b, 2d" or " i 2d"
        // and ranges like "-1e" following the initial ust. number.
        if (/ust/i.test(def.name)) {
          let extended = true;
          while (extended) {
            extended = false;
            const sliceAfter = original.slice(end);
            // Hyphenated range e.g. " - 1e"
            const rangeMatch = sliceAfter.match(/^\s*-\s*\d+[a-z]?\b/i);
            if (rangeMatch) {
              end += rangeMatch[0].length;
              extended = true;
              continue;
            }
            // Comma separated continuation e.g. ", 2b"
            const commaMatch = sliceAfter.match(/^\s*,\s*\d+[a-z]?\b/i);
            if (commaMatch) {
              end += commaMatch[0].length;
              extended = true;
              continue;
            }
            // Final "i 2d"
            const iMatch = sliceAfter.match(/^\s*i\s*\d+[a-z]?\b/i);
            if (iMatch) {
              end += iMatch[0].length;
              extended = true;
              continue;
            }
          }
        }

        rawMatches.push(createMatchRecord(start, end, def.name, original));
      }
    });

    rawMatches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.length - a.length;
    });

    const accepted: typeof rawMatches = [];
    rawMatches.forEach((match) => {
      const last = accepted[accepted.length - 1];
      if (!last || match.start >= last.end) {
        accepted.push(match);
        return;
      }

      if (match.end > last.end && match.length > last.length) {
        accepted[accepted.length - 1] = match;
      }
    });

    return accepted;
  };

  const getContextSnippet = (original: string, start: number, end: number): string => {
    const radius = 40;
    const before = original.slice(Math.max(0, start - radius), start);
    const after = original.slice(end, Math.min(original.length, end + radius));
    return `${before}[${original.slice(start, end)}]${after}`;
  };

  // PROCESS EACH PARAGRAPH DIRECTLY instead of using TreeWalker
  // TreeWalker has issues with complex DOM structures
  const elementsToProcess = Array.from(root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th'));
  const allTextNodesFound: Array<{ content: string; parent: string; skipped: boolean; reason?: string }> = [];

  elementsToProcess.forEach((element) => {
    // Skip if element is in skip list
    if (skipTags.has(element.tagName) || element.closest(skipSelector)) {
      return;
    }

    // NEW: Per-element, cross-text-node matching (no splitting). We:
    // 1) Build a merged text index over all descendant text nodes
    // 2) Find matches in merged text
    // 3) For each text node, rebuild its content once using segments (text/strong)
    // This avoids fragile split/replace sequences that can race in mutated DOMs.
    let replacedInElement = false;
    (() => {
      const localWalker = document.createTreeWalker(element, SHOW_TEXT, null);
      const textNodes: Array<{ node: Text; start: number; end: number; text: string }> = [];
      let mergedText = '';
      let n: Node | null;
      while ((n = localWalker.nextNode())) {
        const t = n as Text;
        const content = t.textContent || '';
        const start = mergedText.length;
        mergedText += content;
        const end = mergedText.length;
        textNodes.push({ node: t, start, end, text: content });
      }

      if (mergedText.trim().length === 0) {
        return;
      }

      // Track scanned text nodes for debug stats

      const matches = acceptedMatchesForText(mergedText);
      if (!matches.length) {
        return;
      }

      // Record matches once for stats/debug
      matches.forEach((match) => {
        patternTotals.set(match.pattern, (patternTotals.get(match.pattern) || 0) + 1);
        matchSamples.push({
          pattern: match.pattern,
          text: mergedText.slice(match.start, match.end),
          context: getContextSnippet(mergedText, match.start, match.end),
        });
      });

      // Rebuild each text node once, using segments derived from global matches
      const intersects = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
        Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

      for (const tn of textNodes) {
        const nodeMatches = matches.filter((m) => intersects(tn.start, tn.end, m.start, m.end));
        if (!nodeMatches.length) continue;

        const nodeText = tn.text;
        const frag = document.createDocumentFragment();
        let cursor = tn.start; // global cursor

        nodeMatches.forEach((m) => {
          const segStart = Math.max(tn.start, m.start);
          const segEnd = Math.min(tn.end, m.end);

          // Add plain text before this matched segment
          if (segStart > cursor) {
            const localStart = cursor - tn.start;
            const localEnd = segStart - tn.start;
            const slice = nodeText.slice(localStart, localEnd);
            if (slice) frag.appendChild(document.createTextNode(slice));
          }

          // Add bolded matched segment
          const localMs = segStart - tn.start;
          const localMe = segEnd - tn.start;
          const boldSlice = nodeText.slice(localMs, localMe);
          if (boldSlice) {
            const strong = document.createElement('strong');
            strong.className = 'legal-ref';
            strong.setAttribute('data-pattern', nodeMatches[0].pattern);
            strong.textContent = boldSlice;
            frag.appendChild(strong);
          }

          cursor = segEnd;
        });

        // Add trailing text after last segment
        if (cursor < tn.end) {
          const localStart = cursor - tn.start;
          const slice = nodeText.slice(localStart);
          if (slice) frag.appendChild(document.createTextNode(slice));
        }

        // Replace node safely
        if (frag.childNodes.length > 0) {
          safeReplaceChild(tn.node.parentNode || undefined, tn.node, frag, {
            where: 'cross-node-rebuild',
            snippet: nodeText.slice(0, 160),
          });
        }
      }

      // this element had at least one match
      replacedInElement = true;
      return;
    })();

    if (replacedInElement) {
      return; // Skip fallback walker for this element; already processed
    }

    // Process ALL text nodes within this element using TreeWalker scoped to this element
    const walker = document.createTreeWalker(element, SHOW_TEXT, null);
    let textNode: Node | null;

    while ((textNode = walker.nextNode())) {
      const original = textNode.textContent || '';
      const preview = original.slice(0, 100).replace(/\s+/g, ' ');
      const parent = (textNode as Text).parentElement;

      if (!parent) {
        allTextNodesFound.push({ content: preview, parent: 'NO_PARENT', skipped: true, reason: 'no parent' });
        continue;
      }

      if (skipTags.has(parent.tagName) || parent.closest(skipSelector)) {
        allTextNodesFound.push({ content: preview, parent: parent.tagName, skipped: true, reason: 'skip selector' });
        continue;
      }

      if (!original.trim()) {
        allTextNodesFound.push({ content: preview, parent: parent.tagName, skipped: true, reason: 'empty/whitespace' });
        continue;
      }

      allTextNodesFound.push({ content: preview, parent: parent.tagName, skipped: false });

      const matches = acceptedMatchesForText(original);

      if (!matches.length) continue;

      const fragment = document.createDocumentFragment();
      let cursor = 0;

      matches.forEach((match) => {
        if (match.start > cursor) {
          fragment.appendChild(document.createTextNode(original.slice(cursor, match.start)));
        }

        const strong = document.createElement('strong');
        strong.className = 'legal-ref';
        strong.setAttribute('data-pattern', match.pattern);
        strong.textContent = original.slice(match.start, match.end);
        fragment.appendChild(strong);

        cursor = match.end;

        patternTotals.set(match.pattern, (patternTotals.get(match.pattern) || 0) + 1);
        matchSamples.push({
          pattern: match.pattern,
          text: match.text,
          context: getContextSnippet(original, match.start, match.end),
        });
      });

      if (cursor < original.length) {
        fragment.appendChild(document.createTextNode(original.slice(cursor)));
      }

      safeReplaceChild(textNode.parentNode || undefined, textNode as Text, fragment, {
        where: 'fallback-textnode-wrap',
        snippet: original.slice(0, 160),
      });
    }
  });

  // Debug summaries (commented out - can be enabled for debugging)
  // const totalsSummary =
  //   Array.from(patternTotals.entries())
  //     .map(([pattern, count]) => `${pattern}: ${count}`)
  //     .join('\n') || '<<none>>';

  // const matchSummary =
  //   matchSamples
  //     .slice(0, 15)
  //     .map((entry) => `${entry.pattern}: ${entry.text}`)
  //     .join('\n') || '<<none>>';

  // Debug summaries (commented out - can be enabled for debugging)
  // const contextSummary =
  //   matchSamples
  //     .slice(0, 10)
  //     .map((entry) => `${entry.pattern}: ${entry.context}`)
  //     .join('\n') || '<<none>>';

  // (debug removed)
}
