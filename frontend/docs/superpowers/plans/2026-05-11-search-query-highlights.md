# Search Query Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `<mark>`-highlighted query matches in search result cards and on the document detail page, matching the existing autocomplete UX, styled with the editorial citation-gold token.

**Architecture:** Two highlight sources, one shared rendering primitive. Cards use the Meilisearch `_formatted` HTML already returned by the backend; the detail page client-side highlights from a `?q=` URL param the card link now propagates. A `<QueryHighlight>` component picks server HTML if available, falls back to client-side highlighting, and renders plain text otherwise. All HTML paths sanitize through DOMPurify with `ALLOWED_TAGS: ["mark"]`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Tailwind 4, Jest + RTL, Playwright, DOMPurify 3.

**Spec:** `docs/superpowers/specs/2026-05-11-search-query-highlights-design.md`

---

## File Map

**Create:**
- `frontend/lib/highlight.ts` — `sanitizeHighlightHtml`, `highlightQueryInText`.
- `frontend/__tests__/lib/highlight.test.ts` — unit tests for both.
- `frontend/lib/styles/components/query-highlight.tsx` — `<QueryHighlight>` primitive.
- `frontend/__tests__/components/query-highlight.test.tsx` — component tests.
- `frontend/tests/e2e/search/query-highlights.spec.ts` — end-to-end coverage.

**Modify:**
- `frontend/app/globals.css` — global `mark` rule keyed to `--gold-soft`.
- `frontend/lib/styles/components/search/SearchForm.tsx` — drop inline `sanitizeHighlight`, import from shared lib.
- `frontend/types/search.ts` — add `highlighted` field to `SearchDocument` and `LegalDocumentMetadata`.
- `frontend/hooks/useSearchResults.ts` — populate `highlighted` from `_formatted`; strip `<mark>` from plain `title`/`summary`; propagate through `convertMetadataToSearchDocument`.
- `frontend/lib/styles/components/document-card.tsx` — `buildDocumentHref` accepts query; render `<QueryHighlight>` for title and summary; fix `"from "` typo.
- `frontend/lib/styles/components/search-document-card.tsx` — pass `searchQuery` into `DocumentCard`.
- `frontend/app/documents/[id]/page.tsx` — read `q`, render title/summary via `<QueryHighlight>`.

---

## Task 1: Highlight library + tests

**Files:**
- Create: `frontend/lib/highlight.ts`
- Create: `frontend/__tests__/lib/highlight.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/__tests__/lib/highlight.test.ts`:

```ts
import { sanitizeHighlightHtml, highlightQueryInText } from "@/lib/highlight";

describe("sanitizeHighlightHtml", () => {
  it("preserves <mark> tags", () => {
    expect(sanitizeHighlightHtml("hello <mark>world</mark>")).toBe(
      "hello <mark>world</mark>"
    );
  });

  it("strips disallowed tags but keeps text content", () => {
    expect(sanitizeHighlightHtml('<script>alert(1)</script>safe')).toBe("safe");
  });

  it("strips event handlers from <mark>", () => {
    const out = sanitizeHighlightHtml('<mark onclick="x">hi</mark>');
    expect(out).toBe("<mark>hi</mark>");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHighlightHtml("")).toBe("");
  });
});

describe("highlightQueryInText", () => {
  it("wraps a basic match in <mark>", () => {
    expect(highlightQueryInText("the law is clear", "law")).toBe(
      "the <mark>law</mark> is clear"
    );
  });

  it("matches case-insensitively", () => {
    expect(highlightQueryInText("The Law", "law")).toBe(
      "The <mark>Law</mark>"
    );
  });

  it("matches Polish diacritics exactly", () => {
    expect(highlightQueryInText("miasto Łódź", "łódź")).toBe(
      "miasto <mark>Łódź</mark>"
    );
  });

  it("matches substrings (prefix queries)", () => {
    expect(highlightQueryInText("konstytucja RP", "konst")).toBe(
      "<mark>konst</mark>ytucja RP"
    );
  });

  it("escapes regex special characters in the query", () => {
    expect(highlightQueryInText("a.b and a+b", "a.b")).toBe(
      "<mark>a.b</mark> and a+b"
    );
  });

  it("HTML-escapes source text so it cannot form tags", () => {
    const out = highlightQueryInText("<script>x</script> law", "law");
    expect(out).toBe("&lt;script&gt;x&lt;/script&gt; <mark>law</mark>");
  });

  it("returns escaped plain text for empty query", () => {
    expect(highlightQueryInText("<b>hi</b>", "")).toBe("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("returns escaped plain text when query has no whitespace tokens", () => {
    expect(highlightQueryInText("hi", "   ")).toBe("hi");
  });

  it("returns escaped plain text when no match", () => {
    expect(highlightQueryInText("nothing here", "zzz")).toBe("nothing here");
  });

  it("highlights multiple tokens independently", () => {
    expect(highlightQueryInText("foo and bar", "foo bar")).toBe(
      "<mark>foo</mark> and <mark>bar</mark>"
    );
  });

  it("caps at 10 tokens (DoS guard)", () => {
    const tokens = Array.from({ length: 15 }, (_, i) => `tok${i}`);
    const text = tokens.join(" ");
    const out = highlightQueryInText(text, tokens.join(" "));
    // First 10 tokens marked, last 5 plain.
    expect(out.match(/<mark>/g)?.length).toBe(10);
  });

  it("returns empty string when text is null/undefined", () => {
    expect(highlightQueryInText(null as unknown as string, "x")).toBe("");
    expect(highlightQueryInText(undefined as unknown as string, "x")).toBe("");
  });

  it("returns empty string when query is null/undefined", () => {
    expect(highlightQueryInText("hi", null)).toBe("hi");
    expect(highlightQueryInText("hi", undefined)).toBe("hi");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
cd frontend && npx jest __tests__/lib/highlight.test.ts
```

Expected: All tests fail (module not found).

- [ ] **Step 3: Implement `frontend/lib/highlight.ts`**

```ts
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
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
cd frontend && npx jest __tests__/lib/highlight.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/highlight.ts frontend/__tests__/lib/highlight.test.ts
git commit -m "feat(search): add shared highlight library with mark sanitizer + query matcher"
```

---

## Task 2: `<QueryHighlight>` component + tests

**Files:**
- Create: `frontend/lib/styles/components/query-highlight.tsx`
- Create: `frontend/__tests__/components/query-highlight.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/__tests__/components/query-highlight.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { QueryHighlight } from "@/lib/styles/components/query-highlight";

describe("<QueryHighlight>", () => {
  it("renders serverHtml when provided (preferred path)", () => {
    const { container } = render(
      <QueryHighlight text="foo" serverHtml="<mark>foo</mark>" />
    );
    expect(container.querySelector("mark")?.textContent).toBe("foo");
  });

  it("falls back to client-side highlight when only query provided", () => {
    const { container } = render(
      <QueryHighlight text="the law" query="law" />
    );
    expect(container.querySelector("mark")?.textContent).toBe("law");
  });

  it("renders plain text when neither serverHtml nor query provided", () => {
    const { container } = render(<QueryHighlight text="plain" />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("plain");
  });

  it("renders plain text when serverHtml is empty string", () => {
    const { container } = render(
      <QueryHighlight text="plain" serverHtml="" query="" />
    );
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("plain");
  });

  it("sanitizes malicious tags in serverHtml", () => {
    const { container } = render(
      <QueryHighlight
        text="x"
        serverHtml='<script>alert(1)</script><mark>safe</mark>'
      />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("safe");
  });

  it("respects the `as` prop", () => {
    const { container } = render(
      <QueryHighlight text="x" as="p" className="foo" />
    );
    const el = container.querySelector("p");
    expect(el).not.toBeNull();
    expect(el?.className).toContain("foo");
  });

  it("renders empty when text and serverHtml are both null/empty", () => {
    const { container } = render(<QueryHighlight text={null} />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
cd frontend && npx jest __tests__/components/query-highlight.test.tsx
```

Expected: All tests fail (module not found).

- [ ] **Step 3: Implement `frontend/lib/styles/components/query-highlight.tsx`**

```tsx
"use client";

import React from "react";

import { highlightQueryInText, sanitizeHighlightHtml } from "@/lib/highlight";

export interface QueryHighlightProps {
  text: string | null | undefined;
  serverHtml?: string | null;
  query?: string | null;
  className?: string;
  as?: "span" | "p" | "div";
}

export function QueryHighlight({
  text,
  serverHtml,
  query,
  className,
  as = "span",
}: QueryHighlightProps): React.JSX.Element {
  const Tag = as;
  const html = resolveHtml(text, serverHtml, query);

  if (html == null) {
    return <Tag className={className}>{text ?? ""}</Tag>;
  }

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function resolveHtml(
  text: string | null | undefined,
  serverHtml: string | null | undefined,
  query: string | null | undefined
): string | null {
  if (serverHtml && serverHtml.trim()) {
    return sanitizeHighlightHtml(serverHtml);
  }
  if (text && query && query.trim()) {
    const out = highlightQueryInText(text, query);
    if (out.includes("<mark>")) return out;
  }
  return null;
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
cd frontend && npx jest __tests__/components/query-highlight.test.tsx
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/styles/components/query-highlight.tsx frontend/__tests__/components/query-highlight.test.tsx
git commit -m "feat(search): add QueryHighlight primitive for server + client highlight rendering"
```

---

## Task 3: Global `<mark>` styling

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Locate the right insertion point**

Open `frontend/app/globals.css`. Find the `:root` block where editorial tokens (`--gold-soft`, `--ink`, etc.) are defined. The new rule should live alongside other base element rules (after token definitions, before component layer rules).

- [ ] **Step 2: Add the `mark` rule**

Append (or place near other base element styles):

```css
mark {
  background: var(--gold-soft);
  color: var(--ink);
  padding: 0 0.15em;
  border-radius: 2px;
  font-weight: inherit;
}
```

- [ ] **Step 3: Smoke test in the dev server**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3026`. Type a multi-character query in the search bar (e.g. `"law"`) to open the autocomplete dropdown. The highlighted spans must now render with the gold-soft background instead of the browser default yellow.

- [ ] **Step 4: Confirm no regressions**

```bash
cd frontend && npm run validate
```

Expected: lint + type-check pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css
git commit -m "style(search): restyle mark to editorial gold-soft token"
```

---

## Task 4: Refactor SearchForm to use shared sanitizer

**Files:**
- Modify: `frontend/lib/styles/components/search/SearchForm.tsx`

- [ ] **Step 1: Replace the inline sanitizer**

In `frontend/lib/styles/components/search/SearchForm.tsx`:

Replace the imports near the top (lines 1-9 area). Drop the `import DOMPurify from "dompurify";` line and replace it with:

```tsx
import { sanitizeHighlightHtml } from "@/lib/highlight";
```

Then delete the inline `sanitizeHighlight` function (lines 13-21):

```tsx
function sanitizeHighlight(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["mark"],
    ALLOWED_ATTR: [],
  });
}
```

Update the two call sites (around lines 227 and 234) to use `sanitizeHighlightHtml` instead of `sanitizeHighlight`:

```tsx
<div className="font-medium" dangerouslySetInnerHTML={{ __html: sanitizeHighlightHtml(item.title) }} />
```

```tsx
<div className="text-xs text-muted-foreground line-clamp-1" dangerouslySetInnerHTML={{ __html: sanitizeHighlightHtml(item.summary) }} />
```

- [ ] **Step 2: Run existing SearchForm tests**

```bash
cd frontend && npx jest __tests__/components/search/SearchForm.test.tsx
```

Expected: Tests still pass (pure refactor, no behavior change).

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run validate
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/styles/components/search/SearchForm.tsx
git commit -m "refactor(search): SearchForm uses shared sanitizeHighlightHtml"
```

---

## Task 5: Extend search types with `highlighted` field

**Files:**
- Modify: `frontend/types/search.ts`

- [ ] **Step 1: Add `highlighted` to `SearchDocument`**

In `frontend/types/search.ts`, inside the `SearchDocument` interface (line 64 onwards), add the optional field. Insert before the closing `}` and before the index signature (around line 115):

```ts
  // Highlighted HTML (with <mark>) from server-side search; rendered via QueryHighlight.
  highlighted?: {
    title?: string | null;
    summary?: string | null;
  } | null;
```

- [ ] **Step 2: Add `highlighted` to `LegalDocumentMetadata`**

In the same file, inside `LegalDocumentMetadata` (around line 128), add the same field before the closing brace:

```ts
  highlighted?: {
    title?: string | null;
    summary?: string | null;
  } | null;
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean (field is optional; no existing callers break).

- [ ] **Step 4: Commit**

```bash
git add frontend/types/search.ts
git commit -m "feat(search): add highlighted field to SearchDocument + LegalDocumentMetadata"
```

---

## Task 6: Populate `highlighted` in `useSearchResults`

**Files:**
- Modify: `frontend/hooks/useSearchResults.ts`

- [ ] **Step 1: Write failing test**

Open `frontend/__tests__/hooks/useSearchResults.test.ts`. Add a new test inside the existing `describe` block:

```ts
it('populates SearchDocument.highlighted from Meilisearch _formatted and strips marks from plain fields', () => {
  // This test asserts that `meiliHitToSearchDocument`-equivalent mapping
  // returns plain title/summary without <mark> tags, and puts the formatted
  // versions on `highlighted`. The hook re-exports this mapping indirectly,
  // so test via a small wrapper: import the mapper if exported, otherwise
  // exercise through a mocked fetch and inspect store state.
  // If `meiliHitToSearchDocument` is not exported, export it from the hook
  // module for testability.
  const { meiliHitToSearchDocument } = require('@/hooks/useSearchResults') as {
    meiliHitToSearchDocument: (hit: unknown) => Record<string, unknown>;
  };

  const hit = {
    id: 'doc-1',
    title: 'The Law',
    summary: 'A summary of law.',
    _formatted: {
      title: 'The <mark>Law</mark>',
      summary: 'A summary of <mark>law</mark>.',
    },
  };

  const result = meiliHitToSearchDocument(hit);

  expect(result.title).toBe('The Law');
  expect(result.summary).toBe('A summary of law.');
  expect(result.highlighted).toEqual({
    title: 'The <mark>Law</mark>',
    summary: 'A summary of <mark>law</mark>.',
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

```bash
cd frontend && npx jest __tests__/hooks/useSearchResults.test.ts -t "populates SearchDocument.highlighted"
```

Expected: FAIL (`meiliHitToSearchDocument` not exported, or `highlighted` undefined).

- [ ] **Step 3: Export and update `meiliHitToSearchDocument`**

In `frontend/hooks/useSearchResults.ts`, find `meiliHitToSearchDocument` (around line 70). Add `export` to its declaration:

```ts
export function meiliHitToSearchDocument(hit: MeilisearchDocumentHit): SearchDocument {
```

Replace the title and summary assignments so plain fields drop the `<mark>` tags and the formatted versions live on `highlighted`:

```ts
function meiliHitToSearchDocument(hit: MeilisearchDocumentHit): SearchDocument {
  const formatted = hit._formatted;
  return {
    document_id: hit.id,
    title: (hit.title || '').trim() || null,
    date_issued: hit.decision_date || null,
    issuing_body: null,
    language: hit.jurisdiction === 'PL' ? 'pl' : hit.jurisdiction === 'UK' ? 'en' : null,
    document_number: hit.case_number || null,
    country: hit.jurisdiction || null,
    full_text: null,
    summary: (hit.summary || '').trim() || null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: hit.keywords || null,
    score: null,
    court_name: hit.court_name || null,
    department_name: null,
    presiding_judge: null,
    judges: hit.judges_flat
      ? hit.judges_flat
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    parties: null,
    outcome: hit.outcome || null,
    legal_bases: hit.cited_legislation || null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    metadata: {
      source_url: hit.source_url || undefined,
      publication_date: hit.publication_date || undefined,
    },
    highlighted: formatted
      ? {
          title: formatted.title ?? null,
          summary: formatted.summary ?? null,
        }
      : null,
  };
}
```

Keep the `export` keyword on the declaration.

- [ ] **Step 4: Propagate `highlighted` through `meiliHitToMetadata`**

In the same file, find `meiliHitToMetadata` (around line 117). Add the field to the returned object:

```ts
function meiliHitToMetadata(
  hit: MeilisearchDocumentHit,
  rankFromTop: number
): LegalDocumentMetadata {
  const score = Math.max(0.0, 1 - rankFromTop * 0.001);
  return {
    uuid: `meili_${hit.id}`,
    document_id: hit.id,
    language: hit.jurisdiction === 'PL' ? 'pl' : hit.jurisdiction === 'UK' ? 'en' : '',
    keywords: hit.keywords || [],
    date_issued: hit.decision_date || null,
    score,
    title: hit.title || null,
    summary: hit.summary || null,
    court_name: hit.court_name || null,
    document_number: hit.case_number || null,
    thesis: null,
    jurisdiction: hit.jurisdiction || null,
    court_level: hit.court_level || null,
    highlighted: hit._formatted
      ? {
          title: hit._formatted.title ?? null,
          summary: hit._formatted.summary ?? null,
        }
      : null,
  };
}
```

- [ ] **Step 5: Propagate `highlighted` through `convertMetadataToSearchDocument`**

In the same file, find `convertMetadataToSearchDocument` (around line 182). Both branches build a `SearchDocument`. Append `highlighted: metadata.highlighted ?? null` to each returned object literal.

In the "have full document" branch (just before line 238 `metadata: metadataObj,`), add the field to the returned object:

```ts
        metadata: metadataObj,
        highlighted: metadata.highlighted ?? null,
      };
```

In the fallback branch (around line 271, just before the closing `};`), add:

```ts
        department_name: null,
        metadata: undefined,
        highlighted: metadata.highlighted ?? null,
      };
```

- [ ] **Step 6: Run test and confirm pass**

```bash
cd frontend && npx jest __tests__/hooks/useSearchResults.test.ts
```

Expected: all useSearchResults tests pass, including the new one.

- [ ] **Step 7: Run full frontend validate**

```bash
cd frontend && npm run validate
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/hooks/useSearchResults.ts frontend/__tests__/hooks/useSearchResults.test.ts
git commit -m "feat(search): populate highlighted on SearchDocument and propagate through metadata"
```

---

## Task 7: Plumb query into `buildDocumentHref` (and fix typo)

**Files:**
- Modify: `frontend/lib/styles/components/document-card.tsx`

- [ ] **Step 1: Audit existing `"from "` (with trailing space) consumers**

```bash
cd frontend && grep -rn '"from "\|from " ' --include='*.ts' --include='*.tsx' .
```

Note any consumer that reads `params.get("from ")` literally. The detail page should be reading `from`; the trailing-space variant currently writes to a key nothing reads. Verify and remove any dead code that depends on the broken key.

- [ ] **Step 2: Update `buildDocumentHref` to accept query and write the correct keys**

In `frontend/lib/styles/components/document-card.tsx`, replace `buildDocumentHref` (lines 22-33):

```tsx
function buildDocumentHref(
  documentId: string,
  from?: string,
  chatId?: string,
  query?: string | null
): string {
  const cleanId = cleanDocumentIdForUrl(documentId);
  const params = new URLSearchParams();
  if (from) {
    params.set("from", from);
  }
  if (chatId) {
    params.set("chatId", chatId);
  }
  if (query && query.trim()) {
    params.set("q", query.trim());
  }
  const suffix = params.toString();
  return suffix ? `/documents/${cleanId}?${suffix}` : `/documents/${cleanId}`;
}
```

- [ ] **Step 3: Extend `DocumentCardProps` and pass `query` through**

In the same file, locate `DocumentCardProps`. Add an optional `query` field:

```tsx
export interface DocumentCardProps {
  // ... existing
  query?: string | null;
}
```

In `DocumentCard`'s destructuring (function body, around line 64), add `query`, and update the `buildDocumentHref` call (around line 75):

```tsx
const href = buildDocumentHref(document.document_id, from, chatId, query);
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/styles/components/document-card.tsx
git commit -m "feat(search): propagate search query to document detail link via ?q"
```

---

## Task 8: Render highlighted title/summary in `DocumentCard`

**Files:**
- Modify: `frontend/lib/styles/components/document-card.tsx`

- [ ] **Step 1: Import `<QueryHighlight>`**

At the top of `frontend/lib/styles/components/document-card.tsx`, add:

```tsx
import { QueryHighlight } from "./query-highlight";
```

- [ ] **Step 2: Replace plain title and summary rendering**

In `DocumentCard` (around lines 83 and 110-112), replace:

```tsx
<CardTitle className="text-sm leading-5">{title}</CardTitle>
```

with:

```tsx
<CardTitle className="text-sm leading-5">
  <QueryHighlight
    text={title}
    serverHtml={document.highlighted?.title ?? null}
    query={query}
  />
</CardTitle>
```

Replace:

```tsx
<p className={showExtended ? "text-sm whitespace-pre-wrap" : "text-sm line-clamp-3"}>
  {summary}
</p>
```

with:

```tsx
<QueryHighlight
  as="p"
  className={showExtended ? "text-sm whitespace-pre-wrap" : "text-sm line-clamp-3"}
  text={summary}
  serverHtml={document.highlighted?.summary ?? null}
  query={query}
/>
```

- [ ] **Step 3: Smoke check existing card consumers**

```bash
cd frontend && grep -rn 'DocumentCard' --include='*.tsx' . | head
```

Confirm non-search callers (chat sources, collection lists, similar docs) still compile — they pass no `query` or `highlighted`, which is fine (both are optional and the component falls back to plain text).

- [ ] **Step 4: Run frontend validate**

```bash
cd frontend && npm run validate
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/styles/components/document-card.tsx
git commit -m "feat(search): render query highlights in DocumentCard title + summary"
```

---

## Task 9: Pass the active query through `SearchDocumentCard`

**Files:**
- Modify: `frontend/lib/styles/components/search-document-card.tsx`

- [ ] **Step 1: Forward `searchQuery` to `DocumentCard`**

In `frontend/lib/styles/components/search-document-card.tsx`, update the `<DocumentCard ... />` call at the bottom (around line 88) to pass the query:

```tsx
<DocumentCard
  document={doc}
  from="search"
  query={searchContextParams?.searchQuery}
/>
```

- [ ] **Step 2: Type-check + run search tests**

```bash
cd frontend && npx tsc --noEmit && npx jest __tests__/components/search
```

Expected: clean and existing search tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/styles/components/search-document-card.tsx
git commit -m "feat(search): forward active search query to DocumentCard for highlights + ?q link"
```

---

## Task 10: Render highlights on the document detail page

**Files:**
- Modify: `frontend/app/documents/[id]/page.tsx`

- [ ] **Step 1: Import `<QueryHighlight>` and derive `q`**

At the top of `frontend/app/documents/[id]/page.tsx`, add:

```tsx
import { QueryHighlight } from "@/lib/styles/components/query-highlight";
```

Inside `DocumentPage` (just below `const searchParams = useSearchParams();` at line 276), add:

```tsx
const queryFromSearch = searchParams.get("q");
```

- [ ] **Step 2: Replace title rendering**

Find the place that renders `headerTitle` for the page heading (search for the `headerTitle` constant defined around line 694 and follow its uses inside JSX — typically inside an `<h1>` near the top of the rendered tree). Replace the plain text rendering with `<QueryHighlight>`:

```tsx
<QueryHighlight
  as="span"
  text={headerTitle}
  query={queryFromSearch}
/>
```

(Wrap inside the existing heading element. If the heading already has classes, keep them on the parent element.)

- [ ] **Step 3: Replace summary rendering**

Find the summary block (around line 985, where `{metadata.summary}` is rendered). Replace:

```tsx
{metadata.summary}
```

with:

```tsx
<QueryHighlight
  as="span"
  text={metadata.summary}
  query={queryFromSearch}
/>
```

If the surrounding element is a `<p>`, keep `as="span"` so we don't nest block elements; otherwise switch to `as="p"` and move the surrounding `<p>` styling onto `className`.

- [ ] **Step 4: Smoke test in the browser**

```bash
cd frontend && npm run dev
```

1. Open `http://localhost:3026/search`, search `"law"` (or any token you know hits results).
2. Click into the first result. URL should include `?from=search&q=law`.
3. Title and summary should render with the gold highlight on matched tokens.
4. Open the detail page directly without `?q=` — title and summary should render plain.

- [ ] **Step 5: Run validate**

```bash
cd frontend && npm run validate
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/documents/[id]/page.tsx
git commit -m "feat(search): render query highlights on document detail page when navigating from search"
```

---

## Task 11: E2E coverage

**Files:**
- Create: `frontend/tests/e2e/search/query-highlights.spec.ts`

- [ ] **Step 1: Inspect an existing e2e test for setup boilerplate**

```bash
cd frontend && sed -n '1,80p' tests/e2e/search/search-flow.spec.ts
```

Note the auth init script, page-object pattern, and dev-server expectations.

- [ ] **Step 2: Write the E2E test**

Create `frontend/tests/e2e/search/query-highlights.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { SearchPage } from '../page-objects/SearchPage';

test.describe('Search query highlights', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    searchPage = new SearchPage(page);
    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: { user: { id: 'test-user-id', email: 'test@example.com' } },
            error: null,
          }),
          getSession: () => Promise.resolve({
            data: { session: { user: { id: 'test-user-id', email: 'test@example.com' } } },
            error: null,
          }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
      };
      // @ts-expect-error test shim
      window.__SUPABASE_TEST_CLIENT__ = mockSupabaseClient;
    });
  });

  test('result cards highlight query matches in title or summary', async ({ page }) => {
    await searchPage.goto();
    await searchPage.search('law');
    await searchPage.waitForResults();

    const firstCard = page.locator('[data-testid="search-result-card"]').first();
    await expect(firstCard.locator('mark').first()).toBeVisible();
  });

  test('detail page carries ?q and highlights title', async ({ page }) => {
    await searchPage.goto();
    await searchPage.search('law');
    await searchPage.waitForResults();

    const firstResult = page.locator('[data-testid="search-result-card"] a').first();
    const href = await firstResult.getAttribute('href');
    expect(href).toContain('q=law');

    await firstResult.click();
    await page.waitForURL(/\/documents\//);

    await expect(page.locator('h1 mark, h1 ~ * mark').first()).toBeVisible();
  });
});
```

If `[data-testid="search-result-card"]` does not exist on cards today, add it to the wrapping `div` in `frontend/lib/styles/components/search-document-card.tsx`:

```tsx
<div className="rounded-xl border p-3" data-testid="search-result-card">
```

- [ ] **Step 3: Run the test**

```bash
cd frontend && npx playwright test tests/e2e/search/query-highlights.spec.ts
```

Expected: both tests pass against a running dev server (Playwright config decides whether it boots one).

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/e2e/search/query-highlights.spec.ts frontend/lib/styles/components/search-document-card.tsx
git commit -m "test(search): e2e coverage for query highlights on cards + detail page"
```

---

## Final verification

- [ ] **Step 1: Run the full validate**

```bash
cd frontend && npm run validate && npx jest
```

Expected: lint, type-check, and full Jest suite pass.

- [ ] **Step 2: Manual sweep**

1. `/search` with `"law"` — cards highlight matches.
2. Click into a result — detail page URL has `?q=law`, title/summary highlight.
3. Open `/collections/<id>` — document cards render plain (no spurious highlights).
4. Open `/chat` — chat source previews render plain.
5. Autocomplete dropdown still highlights matches with the new gold styling.

- [ ] **Step 3: Final commit (only if anything was tweaked)**

If any small fix was needed during manual sweep, commit it:

```bash
git add -p
git commit -m "fix(search): <describe tweak>"
```
