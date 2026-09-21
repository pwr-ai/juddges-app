# Bilingual Drug & Crime Search Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three single-language "Popular searches" chips on `/search` with a bilingual drug-crime topic set: 6 PL+EN dual pairs (12 pills) plus 2 single-phrase cross-lingual pills (2 pills) for universal concepts like money laundering and conspiracy — 14 pills total.

**Architecture:** Pure frontend, single component. Swap the `POPULAR_SEARCHES` constant in `frontend/lib/styles/components/search/SearchForm.tsx` for a `SUGGESTED_TOPICS` array of a discriminated-union type — `{ id, kind: "dual", pl: { label }, en: { label } }` for jurisdiction-specific topics and `{ id, kind: "single", label }` for cross-lingual topics. The renderer branches on `kind`: dual entries produce a PL pill + EN pill pair, single entries produce one pill with a `[PL+UK]` mono-font badge prefix. Two thin click handlers — `handleDualClick(label, lang)` for dual pills, `handleSingleClick(label)` for single pills — diverge only on the `selectedLanguages` Set they apply. Delete the orphan `ExampleQueries.tsx` component as a side cleanup.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Jest + React Testing Library, `@testing-library/user-event`.

**Reference spec:** `docs/superpowers/specs/2026-05-12-bilingual-drug-crime-suggestions-design.md` (gitignored — read locally).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/lib/styles/components/search/SearchForm.tsx` | Modify | Replace `POPULAR_SEARCHES`, `PopularSearch` type, `handlePopularSearch`, and the chip-render loop with `SuggestedTopic` (discriminated union), `SUGGESTED_TOPICS` (8 entries: 6 dual + 2 single), `handleDualClick` + `handleSingleClick`, and a renderer that branches on `kind`. |
| `frontend/lib/styles/components/search/ExampleQueries.tsx` | Delete | Orphan — no consumer in `app/`, `components/`, or `lib/`. |
| `frontend/lib/styles/components/search/index.ts` | Modify | Drop the `ExampleQueries` re-export. |
| `frontend/__tests__/components/search/SearchForm.test.tsx` | Modify | Replace the two old-label assertions (`Kredyty frankowe`, `Intellectual property`); add a dual-PL click test, a dual-EN click test, and a single click test. |

No backend changes. No new files. No migrations. No new packages.

---

## Task 1: Update SearchForm tests to express the new contract (TDD red)

**Files:**
- Modify: `frontend/__tests__/components/search/SearchForm.test.tsx:48-54` (existing `'shows popular searches before the first search'` test)
- Modify: `frontend/__tests__/components/search/SearchForm.test.tsx:88-108` (existing `'applies a popular-search preset'` test)

- [ ] **Step 1.1: Rewrite the "shows popular searches" test to assert on the new bilingual chips**

Replace the existing test body (lines 48-54) with the version below. It asserts the heading is still there, plus the first dual pair, a later dual pair, and both single-phrase pills:

```tsx
  it('shows bilingual suggested-topic pills before the first search', () => {
    render(<SearchForm {...defaultProps} />);

    expect(screen.getByText(/Popular searches/i)).toBeInTheDocument();
    // First dual pair — PL pill + EN pill rendered side by side.
    expect(screen.getByRole('button', { name: 'Posiadanie narkotyków' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drug possession' })).toBeInTheDocument();
    // Spot-check a later dual pair so we don't only cover index 0.
    expect(
      screen.getByRole('button', { name: 'Sentencing for drug offences' })
    ).toBeInTheDocument();
    // Both single-phrase cross-lingual pills are rendered. The `[PL+UK]`
    // badge is aria-hidden, so the accessible name is just the topic label.
    expect(
      screen.getByRole('button', { name: 'Money laundering from drug proceeds' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Conspiracy to supply controlled drugs' })
    ).toBeInTheDocument();
  });
```

- [ ] **Step 1.2: Replace the "applies a popular-search preset" test with three click-branch tests (dual PL, dual EN, single)**

Replace lines 88-108 with the three tests below. They cover all three branches of the new click handlers:

```tsx
  it('clicking a dual Polish pill locks language to {"pl"}', async () => {
    const user = userEvent.setup();
    const setQuery = jest.fn();
    const setSearchType = jest.fn();
    const setSelectedLanguages = jest.fn();

    render(
      <SearchForm
        {...defaultProps}
        setQuery={setQuery}
        setSearchType={setSearchType}
        setSelectedLanguages={setSelectedLanguages}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Posiadanie narkotyków' }));

    expect(setQuery).toHaveBeenCalledWith('Posiadanie narkotyków');
    expect(setSearchType).toHaveBeenCalledWith('thinking');
    expect(setSelectedLanguages).toHaveBeenCalledWith(new Set(['pl']));
  });

  it('clicking a dual English pill locks language to {"uk"}', async () => {
    const user = userEvent.setup();
    const setQuery = jest.fn();
    const setSearchType = jest.fn();
    const setSelectedLanguages = jest.fn();

    render(
      <SearchForm
        {...defaultProps}
        setQuery={setQuery}
        setSearchType={setSearchType}
        setSelectedLanguages={setSelectedLanguages}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Drug possession' }));

    expect(setQuery).toHaveBeenCalledWith('Drug possession');
    expect(setSearchType).toHaveBeenCalledWith('thinking');
    expect(setSelectedLanguages).toHaveBeenCalledWith(new Set(['uk']));
  });

  it('clicking a single cross-lingual pill enables both PL and UK', async () => {
    const user = userEvent.setup();
    const setQuery = jest.fn();
    const setSearchType = jest.fn();
    const setSelectedLanguages = jest.fn();

    render(
      <SearchForm
        {...defaultProps}
        setQuery={setQuery}
        setSearchType={setSearchType}
        setSelectedLanguages={setSelectedLanguages}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Money laundering from drug proceeds' })
    );

    expect(setQuery).toHaveBeenCalledWith('Money laundering from drug proceeds');
    expect(setSearchType).toHaveBeenCalledWith('thinking');
    expect(setSelectedLanguages).toHaveBeenCalledWith(new Set(['pl', 'uk']));
  });
```

- [ ] **Step 1.3: Run the test file and verify it fails**

Run: `cd frontend && npm test -- __tests__/components/search/SearchForm.test.tsx`

Expected: the four updated tests FAIL because `SearchForm.tsx` still renders the old `Kredyty frankowe / Intellectual property / Prawo pracy` chips. The TOPICS-section tests (below) should still PASS — they are unrelated.

- [ ] **Step 1.4: Commit the failing tests**

```bash
git add frontend/__tests__/components/search/SearchForm.test.tsx
git commit -m "test(frontend): expect bilingual drug-crime suggested-topic pills"
```

---

## Task 2: Implement bilingual suggestion pills (dual + single) in SearchForm

**Files:**
- Modify: `frontend/lib/styles/components/search/SearchForm.tsx:41-63` (replace `PopularSearch` type + `POPULAR_SEARCHES` constant)
- Modify: `frontend/lib/styles/components/search/SearchForm.tsx:108-113` (replace `handlePopularSearch`)
- Modify: `frontend/lib/styles/components/search/SearchForm.tsx:287-301` (replace the chip-render block)

- [ ] **Step 2.1: Replace `PopularSearch` type + `POPULAR_SEARCHES` with `SuggestedTopic` (discriminated union) + `SUGGESTED_TOPICS`**

Replace lines 41-63 in `frontend/lib/styles/components/search/SearchForm.tsx` with:

```ts
type SuggestedTopic =
  | {
      id: string;
      kind: "dual";
      pl: { label: string };
      en: { label: string };
    }
  | {
      id: string;
      kind: "single";
      label: string;
    };

const SUGGESTED_TOPICS: SuggestedTopic[] = [
  {
    id: "drug-possession",
    kind: "dual",
    pl: { label: "Posiadanie narkotyków" },
    en: { label: "Drug possession" },
  },
  {
    id: "drug-distribution",
    kind: "dual",
    pl: { label: "Wprowadzanie narkotyków do obrotu" },
    en: { label: "Drug supply and distribution" },
  },
  {
    id: "significant-quantity",
    kind: "dual",
    pl: { label: "Znaczna ilość narkotyków" },
    en: { label: "Class A drug offences" },
  },
  {
    id: "supply-to-minors",
    kind: "dual",
    pl: { label: "Udzielanie narkotyków małoletnim" },
    en: { label: "Supplying drugs to minors" },
  },
  {
    id: "sentencing",
    kind: "dual",
    pl: { label: "Wymiar kary za przestępstwa narkotykowe" },
    en: { label: "Sentencing for drug offences" },
  },
  {
    id: "recidivism",
    kind: "dual",
    pl: { label: "Recydywa przy przestępstwach narkotykowych" },
    en: { label: "Sentencing uplift for repeat drug offenders" },
  },
  {
    id: "money-laundering",
    kind: "single",
    label: "Money laundering from drug proceeds",
  },
  {
    id: "conspiracy",
    kind: "single",
    label: "Conspiracy to supply controlled drugs",
  },
];
```

- [ ] **Step 2.2: Replace `handlePopularSearch` with `handleDualClick` + `handleSingleClick`**

Replace lines 108-113 (the current `handlePopularSearch`) with two thin handlers:

```ts
  const handleDualClick = (label: string, lang: "pl" | "uk"): void => {
    setQuery(label);
    setSearchType("thinking");
    setSelectedLanguages(new Set([lang]));
    internalRef.current?.focus();
  };

  const handleSingleClick = (label: string): void => {
    setQuery(label);
    setSearchType("thinking");
    setSelectedLanguages(new Set(["pl", "uk"]));
    internalRef.current?.focus();
  };
```

Mode is hard-coded to `"thinking"` per the spec — same as today, just out of the per-row data. Single-pill click enables both languages so the existing hybrid search path picks up matches in both corpora via bge-m3 cross-lingual embeddings.

- [ ] **Step 2.3: Replace the chip-render block with a kind-branching renderer**

Replace lines 287-301 (the current `{showPopularSearches && ...}` block) with:

```tsx
      {showPopularSearches && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Popular searches</span>
          {SUGGESTED_TOPICS.map((topic) => {
            if (topic.kind === "dual") {
              return (
                <span
                  key={topic.id}
                  className="inline-flex items-center gap-1"
                  aria-label={`Topic: ${topic.en.label}`}
                >
                  <button
                    type="button"
                    onClick={() => handleDualClick(topic.pl.label, "pl")}
                    className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                    aria-label={topic.pl.label}
                  >
                    {topic.pl.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDualClick(topic.en.label, "uk")}
                    className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                    aria-label={topic.en.label}
                  >
                    {topic.en.label}
                  </button>
                </span>
              );
            }
            // topic.kind === "single"
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => handleSingleClick(topic.label)}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                aria-label={topic.label}
                title="Searches Polish and UK judgments"
              >
                <span
                  aria-hidden="true"
                  className="mr-1 font-mono text-[10px] tracking-tight text-muted-foreground"
                >
                  [PL+UK]
                </span>
                {topic.label}
              </button>
            );
          })}
        </div>
      )}
```

Notes:
- The single-pill `[PL+UK]` badge is wrapped in `aria-hidden="true"` so React Testing Library's `getByRole('button', { name: 'Money laundering from drug proceeds' })` matches the topic label alone — the badge is decorative.
- The `title="Searches Polish and UK judgments"` gives sighted users a tooltip explaining the badge.
- TypeScript narrows the union: inside the `if (topic.kind === "dual")` branch, `topic.pl` and `topic.en` are typed; in the fallthrough, `topic.label` is typed. No type assertions needed.

- [ ] **Step 2.4: Run the SearchForm test file and verify all tests pass**

Run: `cd frontend && npm test -- __tests__/components/search/SearchForm.test.tsx`

Expected: all tests in the file PASS, including the three from Task 1. If any TOPICS-section test breaks, do not touch them — investigate why; this change should not affect them.

- [ ] **Step 2.5: Run lint + typecheck to catch unused imports / type drift**

Run: `cd frontend && npm run lint && npm run typecheck`

Expected: both exit 0. The `PopularSearch` type was inline and is now gone; no other file imported it.

- [ ] **Step 2.6: Commit the implementation**

```bash
git add frontend/lib/styles/components/search/SearchForm.tsx
git commit -m "feat(frontend): bilingual drug-crime suggested-topic pills (dual + cross-lingual) on /search"
```

---

## Task 3: Delete the orphan ExampleQueries component

**Files:**
- Delete: `frontend/lib/styles/components/search/ExampleQueries.tsx`
- Modify: `frontend/lib/styles/components/search/index.ts` (remove the `ExampleQueries` re-export)

- [ ] **Step 3.1: Confirm there is still no consumer**

Run from repo root:

```bash
grep -rn "ExampleQueries" frontend/{app,components,lib,__tests__,tests} 2>/dev/null \
  | grep -v node_modules | grep -v ".next"
```

Expected output: only the two self-references — the component definition file and the barrel `index.ts`. If anything else appears, STOP and re-scope; the component is not actually orphan and this task needs revisiting.

- [ ] **Step 3.2: Delete the component file**

```bash
git rm frontend/lib/styles/components/search/ExampleQueries.tsx
```

- [ ] **Step 3.3: Remove the re-export from the barrel**

Open `frontend/lib/styles/components/search/index.ts` and delete the line:

```ts
export { ExampleQueries } from './ExampleQueries';
```

Leave the rest of the barrel intact.

- [ ] **Step 3.4: Run lint + typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`

Expected: both exit 0. If typecheck flags a missing import elsewhere, the grep in Step 3.1 missed it — restore the file and re-investigate.

- [ ] **Step 3.5: Run the full Jest suite for the search area**

Run: `cd frontend && npm test -- __tests__/components/search`

Expected: all tests PASS.

- [ ] **Step 3.6: Commit the deletion**

```bash
git add frontend/lib/styles/components/search/index.ts
git commit -m "chore(frontend): delete orphan ExampleQueries component"
```

---

## Task 4: Manual verification in the dev server

**Files:** none — verification only.

- [ ] **Step 4.1: Start the dev server**

Run: `cd frontend && npm run dev`

Expected: server boots on port 3026.

- [ ] **Step 4.2: Open the search page logged-in and verify the empty-state chips**

In the browser, sign in, visit `http://localhost:3026/search`, and confirm:

1. Fourteen pills render under the search input — 6 dual pairs (12 pills) and 2 single pills (each prefixed with a small `[PL+UK]` mono-font badge).
2. Clicking `Posiadanie narkotyków` fills the input with that text **and** the language toggle shows only Polish selected.
3. Clicking `Drug supply and distribution` fills the input with that text **and** the language toggle shows only UK selected.
4. Clicking `Money laundering from drug proceeds` (the first `[PL+UK]` pill) fills the input with that text **and** the language toggle shows **both** Polish and UK selected.
5. Hovering the `[PL+UK]` pill shows the tooltip "Searches Polish and UK judgments".
6. Submitting each click yields a result list against the corresponding corpus(es): PL-only for the Polish dual pill, UK-only for the English dual pill, and a mix of PL+UK judgments for the single pill.

If any of these fail, stop, take a screenshot, and report back. Do not commit further.

- [ ] **Step 4.3: Stop the dev server**

Ctrl-C the `npm run dev` process.

No commit for this task — it is verification only.

---

## Self-Review Notes

- **Spec coverage:** All 6 locked dual pairs and 2 single-phrase topics map to entries in `SUGGESTED_TOPICS` in Task 2.1, in the same order as the spec's locked-list tables. The discriminated-union data shape matches the spec's `SuggestedTopic` definition. The click behavior in Task 2.2 (`handleDualClick`, `handleSingleClick`) matches the spec's render flow for both kinds. The orphan deletion in Task 3 matches the spec's "Files Touched" table. The test updates in Task 1 cover all five testing-plan items (renders dual pills, renders single pills, click dual PL, click dual EN, click single).
- **Placeholder scan:** No TBD/TODO. No "implement appropriate X". All code blocks are concrete.
- **Type consistency:** `SuggestedTopic` discriminated-union fields (`kind`, `id`, dual's `pl`/`en`, single's `label`) are used consistently in Tasks 1 and 2. Click handlers are `handleDualClick(label, lang)` and `handleSingleClick(label)` throughout. Language Sets are `new Set(["pl"])`, `new Set(["uk"])`, `new Set(["pl", "uk"])` everywhere.
- **Accessibility detail:** Spec says the single pill's `[PL+UK]` badge is `aria-hidden="true"` and the pill carries `title="Searches Polish and UK judgments"`. Implementation in Task 2.3 does exactly that. Dual pairs use the outer `<span aria-label="Topic: ...">` wrapper as in the spec.
