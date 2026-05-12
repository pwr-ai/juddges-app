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
