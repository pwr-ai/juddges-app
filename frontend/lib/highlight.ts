import DOMPurify from "dompurify";

const ALLOWED = { ALLOWED_TAGS: ["mark"], ALLOWED_ATTR: [] };
const MAX_TOKENS = 10;

export function sanitizeHighlightHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, ALLOWED);
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
