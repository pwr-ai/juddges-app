# Search language selector — design

**Date:** 2026-05-11
**Scope:** `/search` page only
**Surface area:** one component (`SearchForm.tsx`) + its test file

## Problem

The `/search` page already filters by language end-to-end: the store
(`searchStore.selectedLanguages: Set<string>`, seeded `{"pl", "uk"}`),
URL sync, and the `searchChunks` API call all carry a `languages` value.
However the user has **no way to change it** from the search form. The
only mutation paths today are:

1. A "Popular searches" chip preset (e.g. clicking *Kredyty frankowe*
   forces `{"pl"}`).
2. Loading a saved search.
3. Manually editing the URL.

`SearchForm` declares `selectedLanguages`, `toggleLanguage`, and
`setSelectedLanguages` in its `SearchFormProps` interface, but the
function body destructures only `setSelectedLanguages` (used by the
popular-search handler) and silently drops the other two. There is no
visible control bound to them.

## Goal

Add a visible 3-state **segmented control** inside the search form so
that a user can choose:

- **All** — search both Polish and UK judgments
- **Polish** — `pl` only
- **English (UK)** — `uk` only

## Non-goals

- Adding languages beyond `pl` and `uk`.
- Changing the store default, URL-sync logic, or backend contract.
- Reworking the `searchType` (thinking/rabbit) plumbing (which is
  similarly unused inside this form — separate concern).
- Rendering a language control anywhere other than `SearchForm`.

## Design

### Files touched

| File | Change |
|---|---|
| `frontend/lib/styles/components/search/SearchForm.tsx` | Destructure `selectedLanguages`; render the segmented control below the input row. |
| `frontend/__tests__/components/search/SearchForm.test.tsx` | Add tests for initial state mapping and click handlers. |

No store, API, or page-level changes.

### State mapping (Set ↔ segment)

The segmented control derives its current value from the
`selectedLanguages` Set passed by the parent:

| `selectedLanguages` contents | Active segment |
|---|---|
| Contains **both** `pl` and `uk` | **All** |
| Contains only `pl` | **Polish** |
| Contains only `uk` | **English (UK)** |
| Anything else (empty, exotic) | falls back to **All** |

Click → write back a deterministic Set:

| Click | `setSelectedLanguages` argument |
|---|---|
| All | `new Set(["pl", "uk"])` |
| Polish | `new Set(["pl"])` |
| English (UK) | `new Set(["uk"])` |

Because every click sets a non-empty Set, the user cannot land in a
"zero languages selected" state via this control. The store's existing
rehydration guard (`searchStore.ts:495-496`) remains as a safety net for
URL/storage-restore paths.

### Accessibility

- The outer wrapper is `role="radiogroup"` with
  `aria-label="Filter by language"`.
- Each segment is a `<button type="button" role="radio">` with
  `aria-checked` reflecting active state and `tabIndex` set to `0` on
  the active option and `-1` on the others (standard radiogroup
  pattern — only the selected option is in the tab order).
- Left/Right and Home/End arrow keys move selection.

### Styling

Matches the existing chip aesthetic already used elsewhere in this
form (Popular searches): `rounded-full border px-2.5 py-1 text-xs`,
but rendered as a 3-button row using `--ink`/`--parchment` from the
Editorial Jurisprudence design tokens:

- Active segment: `bg-[var(--ink)] text-[var(--parchment)]`,
  `border-[var(--ink)]`.
- Inactive segments: `bg-transparent text-[var(--ink-soft)]`,
  `border-[var(--rule)]`, hover → `bg-muted`.
- Group container: `inline-flex items-center gap-1` (gap-1 keeps the
  three pills visually grouped without joining them into a single
  rounded bar).

### Placement inside `SearchForm`

```
<form>
  <div>[ Input ][ Search button ]</div>
  <CharCounter />
  <Autocomplete suggestions />
  +── NEW: Language segmented control ──+
  <Popular searches chips />
</form>
```

The new row sits between the autocomplete suggestions panel and the
"Popular searches" row so it is always visible (matching the user's
chosen "inline" placement) without competing with the autocomplete
overlay.

### Test cases (extends existing `SearchForm.test.tsx`)

1. Renders three options labelled "All", "Polish", "English (UK)".
2. With `selectedLanguages = new Set(["pl", "uk"])`, "All" has
   `aria-checked="true"` and the other two `"false"`.
3. With `selectedLanguages = new Set(["pl"])`, "Polish" is active.
4. With `selectedLanguages = new Set(["uk"])`, "English (UK)" is
   active.
5. With `selectedLanguages = new Set([])` (edge), "All" is active
   (fallback).
6. Clicking "Polish" calls `setSelectedLanguages` with a Set
   containing exactly `pl`.
7. Clicking "All" calls `setSelectedLanguages` with a Set containing
   both `pl` and `uk`.

## Risks / open questions

- **Visual density.** The form already shows: input row, char counter,
  autocomplete (when active), popular searches. Adding a fourth row
  in the expanded (landing) view is the largest visual change. The
  compact (results) view is denser still — the segmented row will
  sit between the input and the small results header. Acceptable
  per the chosen design; revisit if it crowds the compact view.
- **`toggleLanguage` prop becomes unused inside the form.** Leaving
  the prop in the interface keeps `page.tsx` callers compiling. It
  can be removed in a follow-up cleanup once nothing depends on it.
- **`searchType` UI is also missing.** Out of scope; flagged here
  for a future task.

## Acceptance criteria

- The 3-segment control is visible inside `SearchForm` in both
  landing (expanded) and results (compact) layouts.
- Selecting a segment updates `selectedLanguages` and triggers the
  page's existing URL-sync + auto-search behaviour without further
  code changes.
- Clicking a "Popular searches" chip (which sets a language Set)
  visually updates the segmented control on the next render.
- All seven test cases above pass; existing `SearchForm.test.tsx`
  cases remain green.
- `npm run validate` (lint + typecheck) is clean.
