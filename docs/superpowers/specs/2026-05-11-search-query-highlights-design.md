# Query highlights on search results + document detail

**Status:** Approved, ready for implementation plan
**Date:** 2026-05-11
**Scope:** Frontend only (backend already returns highlights)

## Problem

Autocomplete suggestions show `<mark>`-highlighted query matches and users like the
UX. Search result cards and the document detail page render the same fields
(title, summary) as plain text. The backend already returns highlighted HTML for
the cards path; it is not being rendered.

## Goal

Show the same `<mark>` highlighting users see in autocomplete on:

1. Search result cards (`/search`) - title and summary.
2. Document detail page (`/documents/[id]`) - title and summary, when the user
   arrived from a search.

Use the editorial design system's citation-gold treatment (`--gold-soft`)
instead of the browser's default yellow.

## Non-Goals

- Highlighting fields other than title and summary (e.g. court name, case
  number, judges). Autocomplete highlights court_name too, but cards have
  limited horizontal space and the existing design displays court name as
  metadata, not as a search-hit indicator.
- Highlighting in chat sources, collection previews, similar-documents lists.
- Semantic-match highlighting in hybrid mode. Meilisearch only marks keyword
  matches; pure-semantic hits will render plain. Acceptable.
- Backend changes. The Meilisearch payload already requests
  `attributesToHighlight: ["title", "summary"]` for `documents_search` and
  returns `<mark>...</mark>` tags.

## Current State

Discovered during brainstorming:

- `backend/app/services/search.py:196,221` - `documents_search` requests
  highlights with `<mark>` tags. Already shipped.
- `frontend/hooks/useSearchResults.ts:71` - `meiliHitToSearchDocument` already
  reads `formatted?.title` and `formatted?.summary` into
  `SearchDocument.title/summary`, so the `<mark>` HTML is already in the
  client-side data. But:
  - `meiliHitToMetadata` (same file, ~line 117) uses raw `hit.title` /
    `hit.summary` without marks. Cards are rendered from this `metadata` path
    via `convertMetadataToSearchDocument`, so the highlights are dropped.
  - `document-card.tsx:83,111` renders `{title}` / `{summary}` as plain text;
    if `<mark>` tags arrived they would render as literal characters.
- `lib/styles/components/search/SearchForm.tsx:14-21,227,234` - autocomplete
  has an inline `sanitizeHighlight` (DOMPurify with `ALLOWED_TAGS: ["mark"]`)
  and renders sanitized HTML. This is the rendering pattern to reuse.
- `lib/styles/components/document-card.tsx:22-33` - `buildDocumentHref` builds
  the detail-page link. Latent bug: `params.set("from ", from)` (trailing space
  in the key). Fix while in the area.
- `app/documents/[id]/page.tsx:276,694` - already reads `useSearchParams()`
  and computes `headerTitle` / renders `metadata.summary` as plain text.

## Architecture

Two highlighting sources, one shared rendering primitive.

### Source 1: server-side `<mark>` (search result cards)

Meilisearch returns `_formatted.title` / `_formatted.summary` with `<mark>`
tags. Plumb that HTML through to the card. Keep it on a *separate* field
(`highlighted: { title, summary }`) so the plain `doc.title` / `doc.summary`
stays HTML-free for non-rendering uses (ARIA labels, feedback payloads,
breadcrumbs, sessionStorage).

### Source 2: client-side highlight from query (document detail page)

The detail page fetches metadata from Supabase, not Meilisearch - no
`_formatted` available. Pass the query via `?q=<encoded>` when navigating from
a search card. On the detail page, if `q` is present, wrap matches in `<mark>`
in JavaScript and render sanitized HTML. Same DOMPurify sanitizer as the
autocomplete path.

This is a behavioral difference from the cards path: client-side highlight
won't match Meilisearch's tokenizer exactly (no stemming, no last-word prefix).
For the title/summary use case this is acceptable - users expect their literal
query to be highlighted.

### Shared rendering primitive

A single `<QueryHighlight>` component that accepts either pre-marked HTML or a
`(text, query)` pair, and falls back to plain text when neither is available.
Every consumer (cards, detail page, future consumers) goes through it. All
HTML rendering passes through DOMPurify with `ALLOWED_TAGS: ["mark"]`.

## Components

### `frontend/lib/highlight.ts` (new)

Two exports:

```ts
// Sanitize HTML that already contains <mark> tags.
// Strips everything except <mark>; safe for HTML rendering.
export function sanitizeHighlightHtml(html: string): string

// Tokenize the query, escape regex special chars, wrap case-insensitive
// matches in <mark>, return sanitized HTML.
// Returns escaped plain text (no marks) when query is empty or has no match.
export function highlightQueryInText(text: string, query: string | null | undefined): string
```

`highlightQueryInText` details:

- Split query on whitespace; filter empty tokens; cap at 10 tokens.
- HTML-escape `text` first (replace `& < > " '`) so any `<` in source text
  cannot form a tag.
- Escape regex special characters in each token.
- Build one regex with `gi` flags; substring match (no `\b`) to handle
  prefix queries like `"konst"` matching `"konstytucja"`.
- Run the regex over the escaped text, wrap matches in `<mark>`.
- Run final string through DOMPurify with `ALLOWED_TAGS: ["mark"]` as a
  belt-and-braces step.

Remove the inline `sanitizeHighlight` in `SearchForm.tsx`; it imports from
`lib/highlight.ts`.

### `frontend/lib/styles/components/query-highlight.tsx` (new)

Naming: there is already a `HighlightedText` for chunk-based highlighting in
document dialogs (`lib/styles/components/highlighted-text.tsx`). To avoid a
collision, the new primitive is `<QueryHighlight>`.

```tsx
interface QueryHighlightProps {
  // Plain text to render (fallback and source for client-side highlight)
  text: string | null | undefined;
  // Pre-marked HTML from the server (Meilisearch _formatted). Preferred.
  serverHtml?: string | null;
  // Query string for client-side highlighting (used when serverHtml absent).
  query?: string | null;
  // Optional className applied to the wrapper.
  className?: string;
  // Optional element override (default: span).
  as?: "span" | "p" | "div";
}
```

Resolution order:
1. If `serverHtml` is provided and non-empty: render sanitized HTML via
   `sanitizeHighlightHtml(serverHtml)`.
2. Else if `query` is non-empty and `text` matches: render sanitized HTML via
   `highlightQueryInText(text, query)`.
3. Else: render plain `{text}`.

### `frontend/types/search.ts`

Add optional `highlighted` to `SearchDocument`:

```ts
export interface SearchDocument {
  // ... existing fields
  highlighted?: {
    title?: string | null;
    summary?: string | null;
  } | null;
}
```

Add the same field to the metadata interface used as the round-trip carrier
(see `hooks/useSearchResults.ts` - `LegalDocumentMetadata` or whichever shape
`filteredMetadata` uses). Optional; non-search callers won't set it.

### `frontend/hooks/useSearchResults.ts`

- `meiliHitToSearchDocument`: set
  `highlighted: { title: formatted?.title ?? null, summary: formatted?.summary ?? null }`.
  Keep plain `title` / `summary` *without* the `<mark>` tags (currently they
  include them via `formatted?.title || hit.title`; switch to `hit.title` for
  the plain field, and put the formatted version only in `highlighted`).
- `meiliHitToMetadata`: propagate the same `highlighted` block so it survives
  the metadata round-trip.
- `convertMetadataToSearchDocument` (wherever it's defined; search the codebase
  for its definition): copy `highlighted` through.

### `frontend/lib/styles/components/document-card.tsx`

- `buildDocumentHref`: accept an optional `query?: string` arg; when present
  and non-empty, set `q=<encoded>` on the URL. Fix the trailing-space bug on
  line 26 (`"from "` to `"from"`) and audit any consumer that reads the `from`
  param to ensure they read the corrected key. If anything currently relies
  on the broken `"from "` key, that code is dead; remove it.
- Use `<QueryHighlight text={title} serverHtml={document.highlighted?.title} />`
  for the card title.
- Use `<QueryHighlight text={summary} serverHtml={document.highlighted?.summary} />`
  for the summary.

### `frontend/lib/styles/components/search-document-card.tsx`

Pass the active search query through to `DocumentCard` so the card knows what
to use when building the detail-page link. Read `searchQuery` from
`searchContextParams` (already wired) and pass via a new optional prop on
`DocumentCard`:

```tsx
<DocumentCard document={doc} from="search" query={searchContextParams?.searchQuery} />
```

`DocumentCard` forwards `query` into `buildDocumentHref`.

### `frontend/app/documents/[id]/page.tsx`

- After `useSearchParams()`, derive
  `const queryFromSearch = searchParams.get("q") ?? null;`.
- Replace the plain `{headerTitle}` rendering and the `{metadata.summary}`
  block (line 985 area) with `<QueryHighlight>` calls, passing `text` and
  `query={queryFromSearch}`.

### `frontend/app/globals.css`

Add a global `mark` rule keyed off the editorial tokens:

```css
mark {
  background: var(--gold-soft);
  color: var(--ink);
  padding: 0 0.15em;
  border-radius: 2px;
  font-weight: inherit;
}
```

This also restyles autocomplete suggestions (same `<mark>` element) - by
design, since autocomplete is the reference UX and we want consistency.

## Data Flow

```
Search:
  Meilisearch -> backend -> /api/search/documents
    -> hit._formatted.{title,summary} (HTML with <mark>)
        -> useSearchResults: SearchDocument.highlighted = { title, summary }
            -> metadata.highlighted (round-trip)
                -> convertMetadataToSearchDocument: preserves highlighted
                    -> DocumentCard -> <QueryHighlight serverHtml=... text=... />

Search card click:
  buildDocumentHref(id, "search", query) -> /documents/<id>?from=search&q=<query>
    -> Detail page useSearchParams -> q
        -> <QueryHighlight text={headerTitle} query={q} />
        -> <QueryHighlight text={metadata.summary} query={q} />
```

## Edge Cases

- **Hybrid mode, semantic-only match:** Meilisearch omits `<mark>`. Card
  renders plain title/summary. Detail page client-highlights from `q` if the
  user's query happens to match - typically won't for semantic-only hits.
- **No query (browsing, chat sources, collections):** `highlighted` undefined,
  `query` empty -> plain text. Verified by `<QueryHighlight>` fallback order.
- **XSS:** Both paths sanitize via DOMPurify with `ALLOWED_TAGS: ["mark"]`.
  Client-side path HTML-escapes `text` before applying the regex so any `<`
  in the source text can't form a tag.
- **Regex injection:** `highlightQueryInText` escapes regex special chars in
  the query before building the pattern.
- **Polish diacritics and case:** `i` flag handles case; substring match (no
  `\b`) handles partial matches like `"konst"` -> `"konstytucja"`. Test
  explicitly with `"łódź"` and `"łódzki"`.
- **Empty / whitespace query:** `highlightQueryInText` returns plain text.
- **Very long query / many tokens:** Cap at 10 tokens inside
  `highlightQueryInText` to avoid pathological regex; truncate the rest.
- **Overlapping matches:** Regex alternation with `g` flag handles
  non-overlapping left-to-right matches. Acceptable behavior.

## Testing

### Unit (Jest)

`frontend/__tests__/lib/highlight.test.ts`:

- `sanitizeHighlightHtml` strips non-`<mark>` tags, preserves `<mark>`.
- `highlightQueryInText`:
  - Basic single-word match wraps in `<mark>`.
  - Case-insensitive: `"law"` matches `"Law"`.
  - Polish diacritics: `"łódź"` matches `"łódź"`.
  - Substring: `"konst"` matches `"konstytucja"`.
  - Regex special chars in query (`"a.b"`, `"a+b"`) match literally.
  - HTML in source text is escaped: `"<script>"` in source doesn't form a tag.
  - Empty query returns escaped plain text (no marks).
  - No match returns escaped plain text (no marks).
  - Multi-token query: `"foo bar"` highlights both `foo` and `bar` independently.

`frontend/__tests__/components/query-highlight.test.tsx`:

- Renders `<mark>` when `serverHtml` provided.
- Falls back to client-highlight when only `query` provided.
- Renders plain text when neither provided.
- Renders plain text when `serverHtml` is empty string.
- Sanitizes malicious HTML in `serverHtml` (e.g. `<script>` stripped).

### Component (Jest + RTL)

- `DocumentCard` shows `<mark>` for a doc with `highlighted.title` set.
- `DocumentCard` link href includes `q=...` when query passed.
- `SearchDocumentCard` forwards `searchQuery` to `DocumentCard`.

### E2E (Playwright)

`tests/e2e/search/query-highlights.spec.ts`:

- Run a known search (e.g. `"konstytucja"`); first result card renders a
  `<mark>` element inside the title or summary.
- Click into the first result; detail page URL contains `q=konstytucja`;
  the document title contains a `<mark>` element.
- Search with a query that produces semantic-only hits: card may render
  without `<mark>` (assertion: page does not crash, plain text visible).

### Manual

- Open `/search`, search `"law"`; confirm gold highlight in result titles.
- Click into a result; confirm gold highlight on detail page title/summary.
- Browse `/collections/<id>`; confirm collection document cards render plain.
- Open `/chat`; confirm chat source previews render plain.

## Implementation Order

1. `frontend/lib/highlight.ts` + tests.
2. `frontend/lib/styles/components/query-highlight.tsx` + tests.
3. `globals.css` `mark` rule (verify autocomplete restyles correctly).
4. `SearchForm.tsx` - replace inline `sanitizeHighlight` import path; no
   behavior change.
5. `types/search.ts` - add `highlighted` field.
6. `useSearchResults.ts` - populate `highlighted` on both
   `meiliHitToSearchDocument` and `meiliHitToMetadata`; stop putting `<mark>`
   tags in plain `title` / `summary`.
7. Track down `convertMetadataToSearchDocument`; propagate `highlighted`.
8. `buildDocumentHref` - add `query` param; fix `"from "` typo (and any
   consumers of the broken key).
9. `document-card.tsx` - wire `<QueryHighlight>` + pass query through.
10. `search-document-card.tsx` - pass `searchQuery` into `DocumentCard`.
11. `app/documents/[id]/page.tsx` - read `q` and wire `<QueryHighlight>` for
    title and summary.
12. E2E test for the full search -> card -> detail flow.

## Risks

- **`convertMetadataToSearchDocument` may live in a hook or component that
  expects a specific metadata shape.** Audit consumers before adding the
  `highlighted` field to the metadata type.
- **The `"from "` typo fix may unmask code that silently no-ops today.**
  Search for `"from "` (with trailing space) and the corrected `"from"` reads
  to confirm.
- **Global `mark` styling affects every `<mark>` in the app**, including any
  rendered by markdown content or rich-text editors. Scope check: grep for
  `<mark` outside of autocomplete and the new code path before merging.
