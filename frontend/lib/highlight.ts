import DOMPurify from "dompurify";

// ALLOW_DATA_ATTR off: DOMPurify keeps data-* by default even with an empty
// ALLOWED_ATTR; a highlight snippet never needs attributes of any kind.
const ALLOWED = { ALLOWED_TAGS: ["mark"], ALLOWED_ATTR: [], ALLOW_DATA_ATTR: false };
const MAX_TOKENS = 10;

/**
 * Allow-list sanitizer for Meilisearch highlight snippets: only bare `<mark>`
 * survives, everything else is escaped to text.
 *
 * DOMPurify needs a DOM. The default export of `dompurify` built without a
 * `window` has no `sanitize` method at all, so calling it during SSR of a
 * "use client" component (QueryHighlight on /documents/[id]?q=…) crashed the
 * render with `TypeError: sanitize is not a function`. On the server we use an
 * equivalent escape-and-reallow pass instead; the output is identical for the
 * plain `<mark>…</mark>` markup Meilisearch emits.
 */
export function sanitizeHighlightHtml(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined" || !DOMPurify.isSupported) {
    return sanitizeHighlightHtmlWithoutDom(html);
  }
  return DOMPurify.sanitize(html, ALLOWED);
}

// Attribute values may contain ">" when quoted; match them like the parser.
const MARK_OPEN_WITH_ATTRS = /<mark\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const MARK_CLOSE = /<\/mark\s*>/gi;
// Elements whose content DOMPurify drops together with the tag.
const DROPPED_WITH_CONTENT =
  /<(script|style|template|noscript|iframe|object|embed|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// Any other tag: the markup goes, its text content stays (DOMPurify behaviour
// for tags outside ALLOWED_TAGS).
const OTHER_TAG = /<\/?[a-zA-Z][^>]*>/g;
// Private-use sentinels: cannot appear in real text, so a pre-escaped
// "&lt;mark&gt;" in the input stays text, exactly as DOMPurify treats it.
const OPEN_SENTINEL = "\uE000";
const CLOSE_SENTINEL = "\uE001";
const SENTINELS = /[\uE000\uE001]/g;
// `&` that does not already start an entity. Existing entities (from
// escapeHtml above, or from Meilisearch) must survive untouched, the same
// way DOMPurify's parse-and-serialize round-trip keeps them. Legacy
// semicolon-less entities (e.g. "&copy") are escaped as text here while a
// browser parser would decode them; Meilisearch never emits those.
const BARE_AMPERSAND = /&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g;

/**
 * DOM-free equivalent of `DOMPurify.sanitize(html, ALLOWED)` for the markup
 * this module deals with (plain text, entities, bare `<mark>`). Mirrors the
 * parser round-trip: disallowed tags are stripped but keep their text,
 * script-like elements are dropped with their content, quotes come out raw,
 * unclosed marks are closed and stray closers are dropped. Covered by
 * `__tests__/lib/highlight.parity.test.ts` against the real DOMPurify.
 */
const NUMERIC_ENTITY = /&#(?:x([0-9a-fA-F]+)|(\d+));/g;

function decodeNumericEntity(_m: string, hex: string | undefined, dec: string | undefined): string {
  const code = hex !== undefined ? parseInt(hex, 16) : parseInt(dec ?? "", 10);
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    return "\uFFFD";
  }
  // Characters the serializer re-escapes in text nodes.
  switch (code) {
    case 0x26: return "&amp;";
    case 0x3c: return "&lt;";
    case 0x3e: return "&gt;";
    case 0xa0: return "&nbsp;";
    default: return String.fromCodePoint(code);
  }
}

export function sanitizeHighlightHtmlWithoutDom(html: string): string {
  if (!html) return "";
  // DOMPurify fast path: a string without "<" is returned verbatim.
  if (!html.includes("<")) return html;
  const neutral = html
    .replace(SENTINELS, "")
    .replace(DROPPED_WITH_CONTENT, "")
    .replace(MARK_OPEN_WITH_ATTRS, OPEN_SENTINEL)
    .replace(MARK_CLOSE, CLOSE_SENTINEL)
    .replace(OTHER_TAG, "")
    .replace(BARE_AMPERSAND, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // The parser decodes numeric references and the serializer emits quotes
    // raw in text nodes. Named entities other than the quote forms are left
    // as written; the parser would decode them, Meilisearch never emits them.
    .replace(NUMERIC_ENTITY, decodeNumericEntity)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/gi, "'");

  // Balance the mark tags the way the HTML parser would.
  let out = "";
  let depth = 0;
  for (const ch of neutral) {
    if (ch === OPEN_SENTINEL) {
      depth += 1;
      out += "<mark>";
    } else if (ch === CLOSE_SENTINEL) {
      if (depth > 0) {
        depth -= 1;
        out += "</mark>";
      }
    } else {
      out += ch;
    }
  }
  return out + "</mark>".repeat(depth);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightQueryInText(
  text: string | null | undefined,
  query: string | null | undefined
): string {
  if (text == null) return "";
  const safe = escapeHtml(String(text));

  if (!query) return safe;
  const tokens = String(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TOKENS);
  if (tokens.length === 0) return safe;

  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
  const marked = safe.replace(pattern, "<mark>$1</mark>");
  return sanitizeHighlightHtml(marked);
}

// Trims leading text before the first <mark> so the highlight survives a tight
// CSS line-clamp truncation. Meilisearch crops the summary to ~48 tokens
// centered on the match, but in a narrow card column the centered <mark>
// often lands on line 4+, hidden by `line-clamp-3`. Splitting only the plain
// text segment before the first <mark> is safe because `<mark>` is the only
// allowed tag — there's no other markup to break.
export function recenterHighlightSnippet(
  html: string | null | undefined,
  maxCharsBeforeMark = 60
): string {
  if (!html) return "";
  const markIdx = html.indexOf("<mark>");
  if (markIdx < 0 || markIdx <= maxCharsBeforeMark) return html;

  const cutFrom = markIdx - maxCharsBeforeMark;
  const window = html.slice(cutFrom, markIdx);
  const spaceIdx = window.indexOf(" ");
  const start = spaceIdx >= 0 ? cutFrom + spaceIdx + 1 : cutFrom;

  return "… " + html.slice(start);
}
