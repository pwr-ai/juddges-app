# Research Flow Epic (question → corpus → schema → sample → full run → export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a researcher go from a collection to an exported `dataset.json + schema.yaml + manifest.json` ZIP in one guided flow: `/collections/{id}` → "Extract" → `/extract?collection=` → sample run (min(20, N), stratified by `jurisdiction`) → `/extractions/{id}` with field completeness + full-run cost estimate → explicit "Run on full collection" → export.

**Architecture:** Everything that must be deterministic, auditable or reusable (sampling, token accounting, completeness, cost estimate, dataset rendering, manifest) lives in the FastAPI backend under `backend/app/extraction_domain/` as pure modules with thin routes; the Celery worker records token usage per document via LangChain's `get_usage_metadata_callback`; the Next.js side adds a run-mode selector on `/extract`, a summary panel + two buttons on `/extractions/[id]`, one button on `/collections/[id]`, and two BFF proxies. One additive migration widens `extraction_jobs`. The PR-gated e2e coverage moves the `/search/extractions` spec into the route-contract harness (the only PR-gated harness that can log a user in) and extends `extraction-path.spec.ts` for the new flow.

**Tech Stack:** FastAPI + Pydantic v2, Supabase (postgrest client), Celery, LangChain core 0.3.86 (`langchain_core.callbacks.get_usage_metadata_callback`), litellm 1.100.1 (`litellm.cost_per_token`), Python `zipfile`/`json`; Next.js 15 App Router, React 19, Zod, Jest + RTL, Playwright 1.63 route-contract harness (`frontend/tests/route-contract-e2e/stub-services.mjs`).

**Spec:** `/tmp/claude-1000/-home-laugustyniak-github-legal-ai-lexgraph/36eb3f04-1cf0-4a2a-b538-497cb47372cc/scratchpad/specs/spec-A.md` (copy it to `docs/superpowers/specs/2026-09-20-research-flow-epic-design.md` in the first commit so it travels with the plan; shared facts in `.../specs/context.md`).

## Global Constraints

- Sample size default: `min(20, N)`; a sample is stratified by `judgments.jurisdiction` (`'PL' | 'UK'`, `NOT NULL` in `supabase/migrations/20260209000001_create_judgments_table.sql:23`) and **deterministic** for a given `(document set, seed)`.
- A full run is never started implicitly — it requires a separate, explicit click after the sample results are visible (spec AC 2).
- Cost estimate formula shown to the user: `sample tokens × N / sample_docs` (spec AC 3); USD conversion is optional and must degrade to `null`, never guess.
- Export ZIP contains exactly `dataset.json`, `schema.yaml`, `manifest.json`. `dataset.json` and `schema.yaml` are **byte-compatible** with `JuDDGES/scripts/label_studio/export_annotated_dataset.py`: `json.dump(rows, f, indent=4, ensure_ascii=False)` where each row is `{"context": <full text>, "output": <compact JSON string>}` (the toolkit writes `model_dump_json()`, i.e. `separators=(",", ":")`, `ensure_ascii=False`), and `schema.yaml` follows `SchemaUtilsMixin.get_schema_string()` (`label_studio_toolkit/schemas/utils.py`): `"\n".join(parts)` with a trailing empty part per field.
- Regression: `/extract`, `/extractions/{id}`, `/collections/{id}` behave as before without query params; `frontend/tests/route-contract-e2e/extraction-path.spec.ts` must keep passing unchanged until Task 19 extends it (for its 2-document collection `min(20, 2) == 2`, so the sample equals the population and the button label stays `Start Extraction (2 documents)`).
- Required CI checks (exact names): `Backend Lint`, `Backend Unit Tests`, `Frontend Lint`, `Frontend Unit Tests`, `Frontend E2E Smoke (UI-only)`, `Database Contract`, `Frontend Route Contract (Chromium)`. New e2e coverage must run inside one of these — that means the route-contract harness.
- Commits: conventional commits, no Claude/co-author footers (`CLAUDE.md`). Backend: `poetry run ruff check app tests && poetry run ruff format app tests`. Frontend: `npm run validate && npm run typecheck`.
- Never log or commit `OPENAI_API_KEY`. No LLM calls in unit tests (the key is dead in this environment — #546).
- Backend unit tests: `@pytest.mark.unit`; DB contract tests: `pytestmark = pytest.mark.db` (run by `poetry run pytest -m db` with `DB_CONTRACT_DATABASE_URL`).

---

## Facts this plan builds on (verified 2026-09-20)

| Fact | Where |
|---|---|
| The BFF `POST /api/extractions` calls backend `POST /extractions/db` | `frontend/app/api/extractions/route.ts:207` |
| `/extractions/db` (simple mode) sets `schema_id=None` on the request before `_insert_job_record` → **job rows have `schema_id NULL`** → `/api/jobs` cannot resolve `schema_name` → `mapExtractionJobs` (filters `job.collection_name && job.schema_name`) drops the job from Recent extractions, and a manifest would have no schema id. Latent bug; fixed in Task 6/7. | `backend/app/extraction_domain/jobs_router.py:745-763`, `shared.py:307-347`, `frontend/app/api/jobs/route.ts:224-238`, `frontend/app/extract/_components/types.ts:150` |
| `?collection=` / `?schema=` preselection on `/extract` **already exists** (validates against fetched lists, toasts if missing) | `frontend/app/extract/_components/useExtract.ts:72-103` |
| No token usage / cost is recorded anywhere for extraction jobs (`grep -n "usage\|tokens\|cost"` in `extraction_domain/`, `workers.py`, `tasks/` finds only comments). `estimate_prompt_cost` in the extractor uses litellm but is unused by the app. | `backend/packages/juddges_search/juddges_search/info_extraction/extractor.py:139` |
| The worker calls `extractor.extract_information_with_structured_output({...})` once per document inside `loop.run_until_complete`, same thread, so a contextvar-based LangChain callback wraps it cleanly | `backend/app/workers.py:751-760` |
| `langchain_core.callbacks.get_usage_metadata_callback` exists (core 0.3.86); `litellm.cost_per_token(model="gpt-5-mini", prompt_tokens=1000, completion_tokens=500) == (0.00025, 0.001)` | verified with `poetry run python` |
| `extraction_jobs` columns today | `supabase/migrations/20260807000001_create_extraction_jobs_table.sql:19-68` |
| `extraction_schemas.text` is the JSON Schema body (JSONB), `schema_version INTEGER` | `supabase/migrations/20260810000002_create_schema_domain_tables.sql:43-64` |
| Judgment full text + jurisdiction fetch: `app.utils.judgment_fetcher.get_documents_by_id(ids)` → `LegalDocument` with `.full_text`, `.document_id`; columns include `jurisdiction` | `backend/app/utils/judgment_fetcher.py:27-33,67` |
| Existing xlsx/csv export endpoint, owner check, filename convention | `backend/app/extraction_domain/results_router.py:37-297` |
| BFF export proxy forwards `format` and backend `Content-Type`/`Content-Disposition` | `frontend/app/api/extractions/[id]/export/route.ts` |
| Detail page SSR snapshot header is capped at 4096 bytes — do **not** add fields to `ExtractionJobSnapshot`; fetch the summary separately | `frontend/lib/extractions/detail-contract.ts:11` |
| `tests/e2e/search/extractions.spec.ts` needs the real-Supabase `authenticatedPage` fixture → runs only in the `chromium` project → `frontend-e2e` job is `workflow_dispatch`-only (#583). The route-contract harness (`Frontend Route Contract (Chromium)`) is PR-gated and logs in with a synthetic `sb-127-auth-token` cookie | `frontend/playwright.config.ts:132-141`, `.github/workflows/ci.yml:333,404,495`, `frontend/tests/route-contract-e2e/extraction-path.spec.ts:97-131` |
| Route-contract stub fails the run on any unrouted request (`unexpected: true`, `afterEach` asserts none) | `stub-services.mjs:576-583`, `extraction-path.spec.ts:139-142` |
| `/search/extractions` calls `POST /api/extractions/base-schema/filter`, `GET .../facets/{field}`, `GET .../filter-options` (`data.fields`, shape `FilterFieldConfig`) | `frontend/lib/hooks/useExtractedDataFilters.ts:180,241,329`, `backend/app/models.py:431-446` |
| Existing worker test pattern: monkeypatch names on `app.workers`, `_ResumeSupabase` column-aware double, `celery_eager` fixture | `backend/tests/app/test_extraction_resume.py:99-240` |
| DB contract fixtures: `conn` (psycopg, autocommit superuser), `make_user(user_id)`, `as_user` | `backend/tests/db/conftest.py:144-207` |

## File Structure

**Backend (create)**
- `backend/app/extraction_domain/sampling.py` — pure `stratified_sample()` + `fetch_jurisdictions()` (Supabase lookup) + `apply_run_kind()` glue.
- `backend/app/extraction_domain/summary.py` — `field_completeness()`, `estimate_full_run()`, `usd_for_tokens()`, `build_job_summary()`.
- `backend/app/extraction_domain/dataset_export.py` — `render_dataset_json()`, `render_schema_yaml()`, `build_manifest()`, `build_dataset_zip()`.
- `backend/tests/app/test_extraction_sampling.py`, `test_extraction_summary.py`, `test_dataset_export.py`
- `backend/tests/db/test_extraction_jobs_research_flow_contract.py`
- `supabase/migrations/20260920000001_extraction_jobs_research_flow.sql`

**Backend (modify)**
- `backend/app/models.py` — `SimpleExtractionRequest` gains `run_kind`, `sample_size`, `sample_seed`, `parent_job_id`; `DocumentExtractionResponse.usage`; new `TokenUsage`, `ExtractionJobSummaryResponse`, `FieldCompleteness`, `FullRunEstimate`.
- `backend/app/extraction_domain/shared.py` — `_insert_job_record` persists new columns + `schema_id`; `build_idempotency_key` includes `run_kind`/`sample_seed`; `prompt_fingerprint()`.
- `backend/app/extraction_domain/jobs_router.py` — `/extractions/db` applies sampling, passes `schema_id`.
- `backend/app/workers.py` — per-document usage capture, job-level token totals.
- `backend/app/extraction_domain/results_router.py` — `format=zip` branch, `GET /{job_id}/summary`.

**Frontend (create)**
- `frontend/app/collections/[id]/_components/ExtractFromCollectionButton.tsx`
- `frontend/app/extract/_components/schema-order.ts`, `run-mode.ts`, `RunModeSelector.tsx`
- `frontend/app/extractions/[id]/_components/SampleSummaryPanel.tsx`, `ExportDatasetButton.tsx`
- `frontend/lib/extractions/summary-contract.ts` (types + fetch), `frontend/lib/extractions/run-full.ts`
- `frontend/app/api/extractions/[id]/summary/route.ts`
- Tests under `frontend/tests/unit/...` (listed per task)
- `frontend/tests/route-contract-e2e/extractions.spec.ts` (moved from `tests/e2e/search/extractions.spec.ts`)

**Frontend (modify)**
- `frontend/app/collections/[id]/client.tsx`, `frontend/app/extract/_components/{ExtractionConfigPanel,useExtract,data,types}.ts(x)`, `frontend/app/extractions/[id]/_components/ExtractionJobClient.tsx`, `frontend/lib/validation/schemas.ts`, `frontend/app/api/extractions/route.ts`, `frontend/app/api/extractions/[id]/export/route.ts`, `frontend/tests/route-contract-e2e/stub-services.mjs`, `frontend/tests/route-contract-e2e/extraction-path.spec.ts`, `frontend/tests/e2e/search/README.md`.

**Docs (modify)** — `docs/tutorials/first-30-minutes.md` (flow), `docs/reference/ROUTES_AUDIT.md` (new endpoints), new `docs/reference/extraction-dataset-export.md` (ZIP/manifest format).

Task dependency order: 1 → 2 (child a) · 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 (child b) · 13 → 14 → 15 (child c, needs 6 for `schema_id`, 8 for usage) · 16 → 17 → 18 → 19 (child d). Tasks 1–2, 3–5, 13 can run in parallel worktrees.

---

## Child issue (a) — `/extract?collection=` + button on the collection page

### Task 1: "Extract" button on `/collections/[id]`

**Files:**
- Create: `frontend/app/collections/[id]/_components/ExtractFromCollectionButton.tsx`
- Create: `frontend/tests/unit/app/collections/ExtractFromCollectionButton.test.tsx`
- Modify: `frontend/app/collections/[id]/client.tsx:111-126` (action bar next to `Edit`)

**Interfaces:**
- Produces: `ExtractFromCollectionButton({ collectionId: string; documentCount: number }): JSX.Element` rendering `<Link href="/extract?collection=<id>">` when `documentCount > 0`, otherwise a disabled button with `title="Add documents before extracting"`.
- Consumes: `useCollection(id, initialCollection).totalDocumentCount` (already returned by the hook in `client.tsx:55`).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/unit/app/collections/ExtractFromCollectionButton.test.tsx
import { render, screen } from "@testing-library/react";
import { ExtractFromCollectionButton } from "@/app/collections/[id]/_components/ExtractFromCollectionButton";

const ID = "50000000-0000-4000-8000-000000000001";

describe("ExtractFromCollectionButton", () => {
  it("links to /extract with the collection preselected when the collection has documents", () => {
    render(<ExtractFromCollectionButton collectionId={ID} documentCount={3} />);
    const link = screen.getByRole("link", { name: /extract/i });
    expect(link).toHaveAttribute("href", `/extract?collection=${ID}`);
  });

  it("is disabled with an explanation when the collection is empty", () => {
    render(<ExtractFromCollectionButton collectionId={ID} documentCount={0} />);
    expect(screen.queryByRole("link")).toBeNull();
    const button = screen.getByRole("button", { name: /extract/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Add documents before extracting");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- tests/unit/app/collections/ExtractFromCollectionButton.test.tsx`
Expected: FAIL — `Cannot find module '@/app/collections/[id]/_components/ExtractFromCollectionButton'`

- [ ] **Step 3: Write the component**

```tsx
// frontend/app/collections/[id]/_components/ExtractFromCollectionButton.tsx
"use client";

import Link from "next/link";
import { FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExtractFromCollectionButtonProps {
  collectionId: string;
  documentCount: number;
}

const CLASS_NAME =
  "rounded-none border-rule text-ink font-mono text-xs hover:border-ink hover:bg-parchment-deep gap-1.5";

/**
 * Entry point of the research flow (research-flow epic, child a): hands the
 * collection to /extract via the `?collection=` param that `useExtract`
 * already validates and preselects.
 */
export function ExtractFromCollectionButton({
  collectionId,
  documentCount,
}: ExtractFromCollectionButtonProps) {
  if (documentCount <= 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Add documents before extracting"
        className={CLASS_NAME}
      >
        <FileCode className="h-3.5 w-3.5" />
        Extract
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className={CLASS_NAME}>
      <Link href={`/extract?collection=${encodeURIComponent(collectionId)}`}>
        <FileCode className="h-3.5 w-3.5" />
        Extract
      </Link>
    </Button>
  );
}
```

If `@/components/ui/button` does not support `asChild` (check the file — shadcn buttons normally do via `@radix-ui/react-slot`), render `<Link className={buttonVariants({variant:"outline", size:"sm"}) + " " + CLASS_NAME}>` instead.

- [ ] **Step 4: Wire it into the action bar**

In `frontend/app/collections/[id]/client.tsx`, add the import and, inside the `{!isEditing && (<div className="flex items-center gap-2">` block (line ~111), render it before the `Edit` button:

```tsx
import { ExtractFromCollectionButton } from "./_components/ExtractFromCollectionButton";
// ...
            <ExtractFromCollectionButton
              collectionId={collection.id}
              documentCount={totalDocumentCount ?? collection.document_count ?? 0}
            />
```

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `cd frontend && npm test -- tests/unit/app/collections/ExtractFromCollectionButton.test.tsx && npm run lint && npm run typecheck`
Expected: PASS, no lint/type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/collections/[id]/_components/ExtractFromCollectionButton.tsx frontend/app/collections/[id]/client.tsx frontend/tests/unit/app/collections/ExtractFromCollectionButton.test.tsx
git commit -m "feat(collections): add Extract button that opens /extract?collection="
```

### Task 2: Schema dropdown shows base schema first, labelled

**Files:**
- Create: `frontend/app/extract/_components/schema-order.ts`
- Create: `frontend/tests/unit/app/extract/schema-order.test.ts`
- Modify: `frontend/app/extract/_components/ExtractionConfigPanel.tsx:129-144` (options builder)

**Interfaces:**
- Produces: `isBaseSchema(schema: ExtractionSchema): boolean` (`type === "base" || category === "base"`), `orderSchemasForDropdown(schemas: ExtractionSchema[]): ExtractionSchema[]` — published (or `status === null`) only, base first, then verified, then original order (stable), and `schemaOptionLabel(schema): string` → `"Base · <formatName(name)>"` for base, `formatName(name)` otherwise.
- Dependency: the base schema row itself is seeded by #537 (`extraction_schemas` is empty in prod). This task only makes the UI honour it; without the seed the list shows extensions only — flag it in the PR.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/app/extract/schema-order.test.ts
import {
  isBaseSchema,
  orderSchemasForDropdown,
  schemaOptionLabel,
} from "@/app/extract/_components/schema-order";
import type { ExtractionSchema } from "@/types/extraction_schemas";

const make = (over: Partial<ExtractionSchema>): ExtractionSchema => ({
  id: over.id ?? "id",
  name: over.name ?? "custom_fields",
  description: null,
  type: over.type ?? "judgment",
  category: over.category ?? "legal",
  text: {},
  dates: {},
  status: over.status === undefined ? "published" : over.status,
  is_verified: over.is_verified ?? false,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  user_id: null,
});

describe("schema-order", () => {
  it("puts the base schema first, then verified, then the rest in original order", () => {
    const ordered = orderSchemasForDropdown([
      make({ id: "c", name: "ext_c" }),
      make({ id: "v", name: "verified", is_verified: true }),
      make({ id: "b", name: "universal_legal_document_base_schema", type: "base" }),
      make({ id: "d", name: "ext_d" }),
      make({ id: "draft", name: "draft", status: "draft" }),
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["b", "v", "c", "d"]);
  });

  it("treats a null status as published (legacy rows)", () => {
    expect(orderSchemasForDropdown([make({ id: "n", status: null })])).toHaveLength(1);
  });

  it("labels the base schema so extensions are distinguishable", () => {
    const base = make({ name: "universal_legal_document_base_schema", category: "base" });
    expect(isBaseSchema(base)).toBe(true);
    expect(schemaOptionLabel(base)).toBe("Base · Universal legal document base schema");
    expect(schemaOptionLabel(make({ name: "drug_crime_ext" }))).toBe("Drug crime ext");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- tests/unit/app/extract/schema-order.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// frontend/app/extract/_components/schema-order.ts
import type { ExtractionSchema } from "@/types/extraction_schemas";
import { formatName } from "./types";

export function isBaseSchema(schema: ExtractionSchema): boolean {
  return schema.type === "base" || schema.category === "base";
}

function rank(schema: ExtractionSchema): number {
  if (isBaseSchema(schema)) return 0;
  if (schema.is_verified) return 1;
  return 2;
}

/** Published schemas only; base first, verified next, otherwise original order. */
export function orderSchemasForDropdown(schemas: ExtractionSchema[]): ExtractionSchema[] {
  return schemas
    .filter((s) => s.status === "published" || s.status === null)
    .map((s, index) => ({ s, index }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.index - b.index)
    .map(({ s }) => s);
}

export function schemaOptionLabel(schema: ExtractionSchema): string {
  const name = formatName(schema.name);
  return isBaseSchema(schema) ? `Base · ${name}` : name;
}
```

Then in `ExtractionConfigPanel.tsx` replace the `options={schemas.filter(...).sort(...).map(...)}` block with:

```tsx
                  options={orderSchemasForDropdown(schemas).map((schema) => ({
                    value: schema.id,
                    label: schemaOptionLabel(schema),
                    description: schema.description ?? undefined,
                    status: schema.status ?? undefined,
                    isVerified: schema.is_verified,
                  }))}
```

and import `{ orderSchemasForDropdown, schemaOptionLabel } from "./schema-order"`.

- [ ] **Step 4: Run tests + route-contract regression**

Run: `cd frontend && npm test -- tests/unit/app/extract/schema-order.test.ts && npm run typecheck && npm run test:e2e:route-contract`
Expected: unit PASS; route-contract PASS (the stub schema is `type: 'judgment'`, label unchanged: `Route contract schema`).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/extract/_components/schema-order.ts frontend/app/extract/_components/ExtractionConfigPanel.tsx frontend/tests/unit/app/extract/schema-order.test.ts
git commit -m "feat(extract): list the base schema first and label it in the schema picker"
```

## Child issue (b) — default sample + cost estimate

### Task 3: Migration — research-flow columns on `extraction_jobs`

**Files:**
- Create: `supabase/migrations/20260920000001_extraction_jobs_research_flow.sql`
- Create: `backend/tests/db/test_extraction_jobs_research_flow_contract.py`

**Interfaces:**
- Produces columns on `public.extraction_jobs`: `run_kind TEXT NOT NULL DEFAULT 'full' CHECK IN ('sample','full')`, `sample_size INTEGER`, `sample_seed TEXT`, `sample_strata JSONB`, `population_size INTEGER`, `parent_job_id TEXT REFERENCES extraction_jobs(job_id) ON DELETE SET NULL`, `llm_name TEXT`, `prompt_version TEXT`, `input_tokens BIGINT NOT NULL DEFAULT 0`, `output_tokens BIGINT NOT NULL DEFAULT 0`.
- Later tasks write/read exactly these names (Task 6 insert, Task 8 worker, Task 9 summary, Task 14 manifest).

- [ ] **Step 1: Write the failing DB contract test**

```python
# backend/tests/db/test_extraction_jobs_research_flow_contract.py
"""extraction_jobs carries the research-flow columns (sample/full lineage,
token totals) and rejects nonsense in them (research-flow epic, child b)."""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.db

USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def _insert_job(conn, user_id: str, **cols):
    base = {"job_id": str(uuid.uuid4()), "user_id": user_id, "status": "PENDING"}
    base.update(cols)
    names = ", ".join(base)
    placeholders = ", ".join(["%s"] * len(base))
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO public.extraction_jobs ({names}) VALUES ({placeholders}) "
            "RETURNING job_id, run_kind, input_tokens, output_tokens",
            tuple(base.values()),
        )
        return cur.fetchone()


def test_defaults_are_a_full_run_with_zero_tokens(conn, make_user) -> None:
    user_id = make_user(USER)
    _job_id, run_kind, in_tok, out_tok = _insert_job(conn, user_id)
    assert (run_kind, in_tok, out_tok) == ("full", 0, 0)


def test_sample_rows_keep_their_lineage(conn, make_user) -> None:
    user_id = make_user(USER)
    parent, *_ = _insert_job(conn, user_id, run_kind="sample", sample_size=20,
                             sample_seed="seed-1", population_size=137,
                             sample_strata='{"PL": 12, "UK": 8}')
    child, run_kind, *_ = _insert_job(conn, user_id, run_kind="full",
                                      parent_job_id=parent, population_size=137)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT parent_job_id, sample_strata->>'PL' FROM public.extraction_jobs "
            "WHERE job_id = %s UNION ALL "
            "SELECT parent_job_id, sample_strata->>'PL' FROM public.extraction_jobs "
            "WHERE job_id = %s ORDER BY 1 NULLS FIRST",
            (parent, child),
        )
        rows = cur.fetchall()
    assert rows == [(None, "12"), (parent, None)]
    assert run_kind == "full"


def test_run_kind_is_constrained(conn, make_user) -> None:
    psycopg = pytest.importorskip("psycopg")
    user_id = make_user(USER)
    with pytest.raises(psycopg.errors.CheckViolation):
        _insert_job(conn, user_id, run_kind="pilot")


def test_deleting_the_parent_keeps_the_child(conn, make_user) -> None:
    user_id = make_user(USER)
    parent, *_ = _insert_job(conn, user_id, run_kind="sample")
    child, *_ = _insert_job(conn, user_id, parent_job_id=parent)
    with conn.cursor() as cur:
        cur.execute("DELETE FROM public.extraction_jobs WHERE job_id = %s", (parent,))
        cur.execute("SELECT parent_job_id FROM public.extraction_jobs WHERE job_id = %s", (child,))
        assert cur.fetchone() == (None,)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres poetry run pytest tests/db/test_extraction_jobs_research_flow_contract.py -v` (start a throwaway `docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17` first; the fixture refuses Supabase hosts).
Expected: FAIL — `column "run_kind" of relation "extraction_jobs" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260920000001_extraction_jobs_research_flow.sql
-- Research flow (question → corpus → schema → sample → full run → export).
--
-- A job is either a stratified *sample* of a collection or the *full* run that
-- follows it; the full run points back at the sample it was estimated from.
-- Token totals are written by the Celery worker after every document so the
-- detail page can estimate the cost of the full run from the sample.
ALTER TABLE public.extraction_jobs
    ADD COLUMN IF NOT EXISTS run_kind TEXT NOT NULL DEFAULT 'full'
        CHECK (run_kind IN ('sample', 'full')),
    ADD COLUMN IF NOT EXISTS sample_size INTEGER
        CHECK (sample_size IS NULL OR sample_size > 0),
    ADD COLUMN IF NOT EXISTS sample_seed TEXT,
    -- {"PL": 12, "UK": 8}: how many sampled documents fell into each jurisdiction.
    ADD COLUMN IF NOT EXISTS sample_strata JSONB,
    -- Size of the document set the sample was drawn from (N in "tokens × N/20").
    ADD COLUMN IF NOT EXISTS population_size INTEGER
        CHECK (population_size IS NULL OR population_size >= 0),
    -- SET NULL, not CASCADE: a full run's results outlive the sample they came from.
    ADD COLUMN IF NOT EXISTS parent_job_id TEXT
        REFERENCES public.extraction_jobs(job_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS llm_name TEXT,
    -- "<prompt_id>@<sha256[:12] of the jinja2 template>" at submit time.
    ADD COLUMN IF NOT EXISTS prompt_version TEXT,
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0
        CHECK (input_tokens >= 0),
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0
        CHECK (output_tokens >= 0);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_parent
    ON public.extraction_jobs(parent_job_id)
    WHERE parent_job_id IS NOT NULL;

COMMENT ON COLUMN public.extraction_jobs.run_kind IS
    'sample = stratified subset (min(20, N)) run first; full = the explicit follow-up run over the whole set.';
COMMENT ON COLUMN public.extraction_jobs.input_tokens IS
    'Sum of LLM prompt tokens over completed documents, written by the worker.';
```

RLS: existing owner policies are row-level, so new columns need no policy change. `service_role` bypasses RLS.

- [ ] **Step 4: Run the DB contract suite**

Run: `cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres poetry run pytest -m db -v`
Expected: all PASS including `test_migration_chain.py` (the chain applies in order).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260920000001_extraction_jobs_research_flow.sql backend/tests/db/test_extraction_jobs_research_flow_contract.py
git commit -m "feat(db): research-flow columns on extraction_jobs (run_kind, sample lineage, token totals)"
```

### Task 4: Deterministic stratified sampler (pure function)

**Why backend, not frontend:** `/collections/{id}/documents` returns only ids (`collections_db.py:340-349`), so the browser does not know jurisdictions; the sample must be identical for the same seed regardless of client, and the NL-filter→collection and PL↔UK compare features will call the same function server-side.

**Files:**
- Create: `backend/app/extraction_domain/sampling.py`
- Create: `backend/tests/app/test_extraction_sampling.py`

**Interfaces:**
- Produces:
  ```python
  DEFAULT_SAMPLE_SIZE = 20
  @dataclass(frozen=True)
  class SampleResult:
      document_ids: list[str]        # in stable (stratum, hash) order
      strata: dict[str, int]         # {"PL": 12, "UK": 8, "unknown": 0} — only non-zero keys
      seed: str
      population_size: int
  def stratified_sample(items: Sequence[tuple[str, str | None]], size: int, seed: str) -> SampleResult
  ```
  `items` = `(document_id, jurisdiction)`; `None`/`""` jurisdiction goes to stratum `"unknown"`. Allocation: proportional with largest remainder; every non-empty stratum gets ≥1 when `size >= number of strata`; `size >= len(items)` returns everything (strata counted). Order inside a stratum: ascending `sha256(f"{seed}:{document_id}")` — independent of input order.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/app/test_extraction_sampling.py
"""The sample is what the researcher extrapolates the full run from, so it must
be reproducible (same seed → same documents) and reflect the corpus mix
(stratified by jurisdiction)."""

from __future__ import annotations

import pytest

from app.extraction_domain.sampling import DEFAULT_SAMPLE_SIZE, stratified_sample

pytestmark = pytest.mark.unit


def _corpus(pl: int, uk: int, unknown: int = 0):
    return (
        [(f"pl-{i}", "PL") for i in range(pl)]
        + [(f"uk-{i}", "UK") for i in range(uk)]
        + [(f"x-{i}", None) for i in range(unknown)]
    )


def test_default_size_is_twenty():
    assert DEFAULT_SAMPLE_SIZE == 20


def test_same_seed_same_sample_regardless_of_input_order():
    corpus = _corpus(60, 40)
    a = stratified_sample(corpus, 20, "seed")
    b = stratified_sample(list(reversed(corpus)), 20, "seed")
    assert a.document_ids == b.document_ids
    assert a.strata == {"PL": 12, "UK": 8}


def test_different_seed_different_sample():
    corpus = _corpus(60, 40)
    assert stratified_sample(corpus, 20, "a").document_ids != stratified_sample(corpus, 20, "b").document_ids


def test_allocation_is_proportional_with_largest_remainder():
    # 137 docs: 100 PL (73%), 37 UK (27%) → 14.6 / 5.4 → 15 / 5
    result = stratified_sample(_corpus(100, 37), 20, "s")
    assert result.strata == {"PL": 15, "UK": 5}
    assert len(result.document_ids) == 20
    assert result.population_size == 137


def test_every_non_empty_stratum_gets_at_least_one_document():
    # 1 UK among 999 PL would round to 0 — but the researcher must see the UK case.
    result = stratified_sample(_corpus(999, 1), 20, "s")
    assert result.strata == {"PL": 19, "UK": 1}


def test_missing_jurisdiction_is_its_own_stratum():
    result = stratified_sample(_corpus(10, 10, 10), 6, "s")
    assert result.strata == {"PL": 2, "UK": 2, "unknown": 2}


def test_sample_larger_than_population_returns_everything():
    corpus = _corpus(2, 1)
    result = stratified_sample(corpus, 20, "s")
    assert sorted(result.document_ids) == sorted(doc for doc, _ in corpus)
    assert result.strata == {"PL": 2, "UK": 1}


def test_no_duplicate_ids_and_all_from_population():
    corpus = _corpus(30, 30)
    result = stratified_sample(corpus, 20, "s")
    assert len(set(result.document_ids)) == 20
    assert set(result.document_ids) <= {doc for doc, _ in corpus}


@pytest.mark.parametrize("size", [0, -1])
def test_non_positive_size_is_rejected(size):
    with pytest.raises(ValueError):
        stratified_sample(_corpus(3, 3), size, "s")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_extraction_sampling.py -v`
Expected: FAIL — `ModuleNotFoundError: app.extraction_domain.sampling`

- [ ] **Step 3: Implement**

```python
# backend/app/extraction_domain/sampling.py
"""Deterministic, jurisdiction-stratified sampling for extraction jobs.

The sample is the basis of the full-run cost estimate and of the researcher's
first look at field quality, so two properties matter more than randomness:
the same (documents, seed) always yields the same sample, and every
jurisdiction present in the corpus is represented.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from loguru import logger

DEFAULT_SAMPLE_SIZE = 20
UNKNOWN_STRATUM = "unknown"


@dataclass(frozen=True)
class SampleResult:
    document_ids: list[str]
    strata: dict[str, int]
    seed: str
    population_size: int


def _rank(seed: str, document_id: str) -> str:
    return hashlib.sha256(f"{seed}:{document_id}".encode()).hexdigest()


def _allocate(counts: dict[str, int], size: int) -> dict[str, int]:
    """Largest-remainder allocation; every non-empty stratum gets >= 1 when size allows."""
    total = sum(counts.values())
    strata = sorted(counts)  # deterministic tie-breaking
    exact = {s: counts[s] * size / total for s in strata}
    alloc = {s: int(exact[s]) for s in strata}
    if size >= len(strata):
        for s in strata:
            alloc[s] = max(alloc[s], 1)
    for s in strata:
        alloc[s] = min(alloc[s], counts[s])
    remaining = size - sum(alloc.values())
    by_remainder = sorted(strata, key=lambda s: (-(exact[s] - int(exact[s])), s))
    while remaining > 0:
        progressed = False
        for s in by_remainder:
            if remaining == 0:
                break
            if alloc[s] < counts[s]:
                alloc[s] += 1
                remaining -= 1
                progressed = True
        if not progressed:
            break
    while remaining < 0:  # the min-1 rule overshot; take back from the largest stratum
        biggest = max(strata, key=lambda s: (alloc[s], s))
        alloc[biggest] -= 1
        remaining += 1
    return alloc


def stratified_sample(
    items: Sequence[tuple[str, str | None]], size: int, seed: str
) -> SampleResult:
    if size <= 0:
        raise ValueError("sample size must be positive")
    by_stratum: dict[str, list[str]] = defaultdict(list)
    for document_id, jurisdiction in items:
        by_stratum[(jurisdiction or "").strip() or UNKNOWN_STRATUM].append(document_id)
    population = sum(len(v) for v in by_stratum.values())
    if population == 0:
        return SampleResult([], {}, seed, 0)

    counts = {s: len(v) for s, v in by_stratum.items()}
    alloc = (
        counts if size >= population else _allocate(counts, size)
    )
    chosen: list[str] = []
    strata: dict[str, int] = {}
    for stratum in sorted(by_stratum):
        ordered = sorted(set(by_stratum[stratum]), key=lambda d: _rank(seed, d))
        picked = ordered[: alloc[stratum]]
        if picked:
            strata[stratum] = len(picked)
            chosen.extend(picked)
    logger.info(f"Stratified sample: {len(chosen)}/{population} documents, strata={strata}")
    return SampleResult(chosen, strata, seed, population)


def fetch_jurisdictions(client, document_ids: Iterable[str]) -> dict[str, str | None]:
    """Look up `judgments.jurisdiction` for the given ids (UUID or source_id).

    `client` is the Supabase client (`app.extraction_domain.shared.supabase`),
    injected so tests pass a double. Unknown ids map to None.
    """
    ids = list(dict.fromkeys(document_ids))
    found: dict[str, str | None] = {doc_id: None for doc_id in ids}
    chunk = 200
    for start in range(0, len(ids), chunk):
        batch = ids[start : start + chunk]
        for column in ("id", "source_id"):
            response = (
                client.table("judgments")
                .select(f"{column}, jurisdiction")
                .in_(column, batch)
                .execute()
            )
            for row in response.data or []:
                key = row.get(column)
                if key in found:
                    found[key] = row.get("jurisdiction")
    return found
```

Note on `_allocate`: the tests pin the behaviour (`{"PL": 15, "UK": 5}`, `{"PL": 19, "UK": 1}`, `{2,2,2}`). If an implementation detail differs, fix the code, not the test.

- [ ] **Step 4: Run tests**

Run: `cd backend && poetry run pytest tests/app/test_extraction_sampling.py -v && poetry run ruff check app/extraction_domain/sampling.py`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/sampling.py backend/tests/app/test_extraction_sampling.py
git commit -m "feat(extraction): deterministic jurisdiction-stratified sampler"
```

### Task 5: `fetch_jurisdictions` + `apply_run_kind` glue (tested with a Supabase double)

**Files:**
- Modify: `backend/app/extraction_domain/sampling.py` (add `apply_run_kind`)
- Modify: `backend/tests/app/test_extraction_sampling.py`

**Interfaces:**
- Produces: `apply_run_kind(document_ids: list[str], *, run_kind: str, sample_size: int | None, sample_seed: str | None, client) -> SampleResult | None` — returns `None` for `run_kind == "full"`; for `"sample"` returns the `SampleResult` (seed defaults to `sha256(sorted ids)[:16]` so the same set re-samples identically; `sample_size` defaults to `DEFAULT_SAMPLE_SIZE`).
- Consumes: `fetch_jurisdictions(client, ids)` from Task 4.

- [ ] **Step 1: Write the failing tests (append)**

```python
from app.extraction_domain.sampling import apply_run_kind, fetch_jurisdictions


class _JudgmentsDouble:
    """Answers `.table("judgments").select(...).in_(col, ids).execute()`."""

    def __init__(self, rows: dict[str, str | None]):
        self._rows = rows
        self._col = None
        self._ids: list[str] = []

    def table(self, _name):
        return self

    def select(self, _cols):
        return self

    def in_(self, col, ids):
        self._col, self._ids = col, list(ids)
        return self

    def execute(self):
        if self._col != "id":
            return type("R", (), {"data": []})()
        data = [{"id": i, "jurisdiction": self._rows[i]} for i in self._ids if i in self._rows]
        return type("R", (), {"data": data})()


def test_fetch_jurisdictions_maps_unknown_ids_to_none():
    client = _JudgmentsDouble({"a": "PL", "b": "UK"})
    assert fetch_jurisdictions(client, ["a", "b", "zzz", "a"]) == {"a": "PL", "b": "UK", "zzz": None}


def test_apply_run_kind_full_is_a_no_op():
    assert apply_run_kind(["a", "b"], run_kind="full", sample_size=None, sample_seed=None, client=None) is None


def test_apply_run_kind_sample_defaults_seed_from_the_document_set():
    ids = [f"d{i}" for i in range(30)]
    client = _JudgmentsDouble({i: ("PL" if int(i[1:]) % 3 else "UK") for i in ids})
    first = apply_run_kind(ids, run_kind="sample", sample_size=None, sample_seed=None, client=client)
    second = apply_run_kind(list(reversed(ids)), run_kind="sample", sample_size=None, sample_seed=None, client=client)
    assert first is not None and second is not None
    assert first.seed == second.seed
    assert first.document_ids == second.document_ids
    assert len(first.document_ids) == 20 and first.population_size == 30
    assert first.strata == {"PL": 13, "UK": 7}


def test_apply_run_kind_rejects_unknown_kind():
    with pytest.raises(ValueError):
        apply_run_kind(["a"], run_kind="pilot", sample_size=None, sample_seed=None, client=None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_extraction_sampling.py -v -k "apply_run_kind or fetch_jurisdictions"`
Expected: FAIL — `ImportError: cannot import name 'apply_run_kind'`

- [ ] **Step 3: Implement (append to sampling.py)**

```python
def default_seed(document_ids: Iterable[str]) -> str:
    """Same document set → same seed → same sample, however the ids arrived."""
    joined = "\n".join(sorted(set(document_ids)))
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


def apply_run_kind(
    document_ids: list[str],
    *,
    run_kind: str,
    sample_size: int | None,
    sample_seed: str | None,
    client,
) -> SampleResult | None:
    if run_kind == "full":
        return None
    if run_kind != "sample":
        raise ValueError(f"unknown run_kind {run_kind!r}")
    seed = sample_seed or default_seed(document_ids)
    jurisdictions = fetch_jurisdictions(client, document_ids)
    items = [(doc_id, jurisdictions.get(doc_id)) for doc_id in document_ids]
    return stratified_sample(items, sample_size or DEFAULT_SAMPLE_SIZE, seed)
```

- [ ] **Step 4: Run tests**

Run: `cd backend && poetry run pytest tests/app/test_extraction_sampling.py -v`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/sampling.py backend/tests/app/test_extraction_sampling.py
git commit -m "feat(extraction): apply_run_kind resolves a sample from judgments.jurisdiction"
```

### Task 6: Request model fields + job row persistence (and the `schema_id NULL` fix)

**Files:**
- Modify: `backend/app/models.py:126-152` (`SimpleExtractionRequest`), `:458-467` (`DocumentExtractionResponse`)
- Modify: `backend/app/extraction_domain/shared.py:255-347,370-400` (`build_idempotency_key`, `_insert_job_record`, `_submit_extraction_task`)
- Test: `backend/tests/app/test_extraction_shared.py` (append a class)

**Interfaces:**
- Produces on `SimpleExtractionRequest` (inherited by `DocumentExtractionRequest`):
  ```python
  run_kind: Literal["sample", "full"] = "full"
  sample_size: int | None = Field(default=None, ge=1, le=1000)
  sample_seed: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")
  parent_job_id: str | None = None   # validated with is_uuid in the router
  ```
- Produces `TokenUsage(BaseModel)`: `input_tokens: int = 0`, `output_tokens: int = 0`, `total_tokens: int = 0`, `model: str | None = None`; `DocumentExtractionResponse.usage: TokenUsage | None = None`.
- Produces `_submit_extraction_task(extraction_request, user_id, *, schema_id: str | None = None, sample: SampleResult | None = None, population_size: int | None = None) -> str` and `_insert_job_record(job_id, user_id, extraction_request, idempotency_key, *, schema_id=None, sample=None, population_size=None)`.
- Produces `prompt_fingerprint(prompt_id: str) -> str` = `f"{prompt_id}@{sha256(template bytes)[:12]}"` or `f"{prompt_id}@unknown"` if the file is unreadable (`get_prompt_file_path` in `shared.py:672`).
- `build_idempotency_key` now also hashes `run_kind` and `sample_seed` (a sample and a full run over the same set are different jobs).

- [ ] **Step 1: Write the failing tests (append to `test_extraction_shared.py`)**

```python
from unittest.mock import MagicMock

from app.extraction_domain import shared
from app.extraction_domain.sampling import SampleResult
from app.models import DocumentExtractionRequest


def _request(**over) -> DocumentExtractionRequest:
    base = dict(
        collection_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        document_ids=["d1", "d2", "d3"],
        extraction_context="ctx",
        user_schema={"type": "object", "description": "d", "required": []},
        prompt_id="info_extraction",
    )
    base.update(over)
    return DocumentExtractionRequest(**base)


class TestResearchFlowJobRecord:
    @pytest.mark.unit
    def test_sample_and_full_runs_have_different_idempotency_keys(self) -> None:
        full = shared.build_idempotency_key(_request(run_kind="full"))
        sample = shared.build_idempotency_key(_request(run_kind="sample", sample_seed="s1"))
        other_seed = shared.build_idempotency_key(_request(run_kind="sample", sample_seed="s2"))
        assert len({full, sample, other_seed}) == 3

    @pytest.mark.unit
    def test_insert_persists_schema_id_and_sample_lineage(self, monkeypatch) -> None:
        supabase = MagicMock()
        monkeypatch.setattr(shared, "supabase", supabase)
        monkeypatch.setattr(shared, "prompt_fingerprint", lambda pid: f"{pid}@abc123def456")
        sample = SampleResult(["d1", "d3"], {"PL": 1, "UK": 1}, "seed-x", 3)

        shared._insert_job_record(
            "job-1",
            "user-1",
            _request(run_kind="sample", sample_seed="seed-x", document_ids=["d1", "d3"]),
            "idem",
            schema_id="dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            sample=sample,
            population_size=3,
        )

        row = supabase.table.return_value.insert.call_args.args[0]
        assert row["schema_id"] == "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        assert row["run_kind"] == "sample"
        assert row["sample_size"] == 2
        assert row["sample_seed"] == "seed-x"
        assert row["sample_strata"] == {"PL": 1, "UK": 1}
        assert row["population_size"] == 3
        assert row["llm_name"] == "gpt-5-mini"
        assert row["prompt_version"] == "info_extraction@abc123def456"
        assert row["document_ids"] == ["d1", "d3"] and row["total_documents"] == 2

    @pytest.mark.unit
    def test_insert_of_a_full_run_records_parent_and_no_sample_fields(self, monkeypatch) -> None:
        supabase = MagicMock()
        monkeypatch.setattr(shared, "supabase", supabase)
        shared._insert_job_record(
            "job-2", "user-1",
            _request(parent_job_id="30000000-0000-4000-8000-000000000007"),
            "idem", population_size=3,
        )
        row = supabase.table.return_value.insert.call_args.args[0]
        assert row["run_kind"] == "full"
        assert row["parent_job_id"] == "30000000-0000-4000-8000-000000000007"
        assert row["sample_size"] is None and row["sample_strata"] is None

    @pytest.mark.unit
    def test_prompt_fingerprint_is_stable_and_named(self) -> None:
        a = shared.prompt_fingerprint("info_extraction")
        assert a == shared.prompt_fingerprint("info_extraction")
        assert a.startswith("info_extraction@") and len(a.split("@")[1]) == 12

    @pytest.mark.unit
    def test_prompt_fingerprint_for_a_missing_prompt(self) -> None:
        assert shared.prompt_fingerprint("no_such_prompt") == "no_such_prompt@unknown"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_extraction_shared.py -k ResearchFlow -v`
Expected: FAIL — `ValidationError: run_kind extra fields not permitted` / `TypeError: unexpected keyword 'schema_id'`.

- [ ] **Step 3: Models**

In `backend/app/models.py`, inside `SimpleExtractionRequest` after `language`:

```python
    run_kind: Literal["sample", "full"] = Field(
        default="full",
        description=(
            "'sample' extracts a deterministic, jurisdiction-stratified subset of "
            "document_ids (min(sample_size, N)); 'full' extracts every document."
        ),
    )
    sample_size: int | None = Field(
        default=None, ge=1, le=1000,  # MAX_DOCUMENTS_PER_JOB lives in shared.py (imports models) — literal avoids the cycle
        description="Sample size for run_kind='sample'; defaults to 20.",
    )
    sample_seed: str | None = Field(
        default=None, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$",
        description="Seed for the sample; defaults to a hash of the document set.",
    )
    parent_job_id: str | None = Field(
        default=None, max_length=64,
        description="For a full run: the sample job it was estimated from.",
    )
```

(`MAX_DOCUMENTS_PER_JOB` is defined in `shared.py:31`, which imports `app.models`, so the literal `1000` is used here; `_enforce_max_documents` remains the authoritative cap at request time.)

Add near `DocumentExtractionResponse`:

```python
class TokenUsage(BaseModel):
    """LLM token accounting for one document (or a job total)."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model: str | None = None


class DocumentExtractionResponse(BaseModel):
    ...
    extracted_data: dict | None = None
    usage: TokenUsage | None = None
```

- [ ] **Step 4: shared.py**

```python
def prompt_fingerprint(prompt_id: str) -> str:
    """`<prompt_id>@<sha256 of the template>[:12]` — recorded on the job and in the
    export manifest so a dataset can be traced to the exact prompt text."""
    try:
        digest = hashlib.sha256(get_prompt_file_path(prompt_id).read_bytes()).hexdigest()[:12]
    except OSError:
        return f"{prompt_id}@unknown"
    return f"{prompt_id}@{digest}"
```

In `build_idempotency_key`, add to `payload`: `"run_kind": extraction_request.run_kind, "sample_seed": extraction_request.sample_seed`.

`_insert_job_record` — new signature and row:

```python
def _insert_job_record(
    job_id: str,
    user_id: str,
    extraction_request: DocumentExtractionRequest,
    idempotency_key: str,
    *,
    schema_id: str | None = None,
    sample: SampleResult | None = None,
    population_size: int | None = None,
) -> None:
    ...
    document_ids = extraction_request.document_ids or []
    supabase.table("extraction_jobs").insert(
        {
            "job_id": job_id,
            "user_id": user_id,
            "collection_id": extraction_request.collection_id,
            # `/extractions/db` clears request.schema_id once it has fetched the
            # schema body, so the caller passes the id it was given explicitly;
            # without it the job row has schema_id NULL and the Recent
            # extractions list drops the job (mapExtractionJobs needs schema_name).
            "schema_id": schema_id or extraction_request.schema_id,
            "status": "PENDING",
            "document_ids": document_ids,
            "total_documents": len(document_ids),
            "completed_documents": 0,
            "language": extraction_request.language or "pl",
            "prompt_id": extraction_request.prompt_id or "info_extraction",
            "extraction_context": extraction_request.extraction_context,
            "idempotency_key": idempotency_key,
            "attempts": 0,
            "run_kind": extraction_request.run_kind,
            "sample_size": len(sample.document_ids) if sample else None,
            "sample_seed": sample.seed if sample else None,
            "sample_strata": sample.strata if sample else None,
            "population_size": population_size,
            "parent_job_id": extraction_request.parent_job_id,
            "llm_name": extraction_request.llm_name,
            "prompt_version": prompt_fingerprint(extraction_request.prompt_id or "info_extraction"),
        }
    ).execute()
```

`_submit_extraction_task(extraction_request, user_id, *, schema_id=None, sample=None, population_size=None)` forwards the three keyword args to `_insert_job_record`. Import `SampleResult` under `TYPE_CHECKING` from `app.extraction_domain.sampling` (sampling imports nothing from shared, so a plain import is also fine).

- [ ] **Step 5: Run the shared tests and the whole extraction unit suite**

Run: `cd backend && poetry run pytest tests/app/test_extraction_shared.py tests/app/test_extraction_jobs_router.py -v -m unit`
Expected: PASS (the router tests patch `_submit_extraction_task`, so the new kwargs are transparent).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/extraction_domain/shared.py backend/tests/app/test_extraction_shared.py
git commit -m "feat(extraction): persist run_kind/sample lineage, llm, prompt version and schema_id on the job row"
```

### Task 7: `/extractions/db` applies sampling and keeps `schema_id`

**Files:**
- Modify: `backend/app/extraction_domain/jobs_router.py:706-826`
- Test: `backend/tests/app/test_extraction_jobs_router.py` (append to the class holding `test_create_db_job_accepts_frontend_payload`, line ~520)

**Interfaces:**
- Consumes: `apply_run_kind` (Task 5), `_submit_extraction_task(..., schema_id=, sample=, population_size=)` (Task 6), `shared.supabase`.
- Produces: unchanged response shape (`{job_id, status:"accepted", message}`); the job row is a sample when `run_kind == "sample"`.

- [ ] **Step 1: Write the failing tests**

```python
    @pytest.mark.unit
    async def test_create_db_job_sample_run_submits_only_the_sample(
        self, client, valid_api_headers, override_user_auth
    ) -> None:
        """AC 2: a sample job runs min(20, N) documents, stratified, and records
        the schema it was given (the row used to end up with schema_id NULL)."""
        override_user_auth("user-1")
        from app.extraction_domain.sampling import SampleResult

        doc_ids = [f"eeeeeeee-eeee-4eee-8eee-eeeeeeeee{i:03d}" for i in range(30)]
        sample = SampleResult(doc_ids[:20], {"PL": 13, "UK": 7}, "seed-1", 30)
        with (
            patch("app.extraction_domain.jobs_router._fetch_schema_from_db",
                  return_value={"name": "S", "description": "", "text": {"a": {"type": "string", "description": "a", "required": True}}}),
            patch("app.extraction_domain.jobs_router.apply_run_kind", return_value=sample) as apply,
            patch("app.extraction_domain.jobs_router._submit_extraction_task", return_value="task-sample") as submit,
        ):
            response = await client.post(
                "/extractions/db",
                json={
                    "collection_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    "schema_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                    "document_ids": doc_ids,
                    "extraction_context": "ctx",
                    "language": "pl",
                    "run_kind": "sample",
                    "sample_seed": "seed-1",
                },
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
        assert response.status_code == 202
        apply.assert_called_once()
        assert apply.call_args.kwargs["run_kind"] == "sample"
        assert apply.call_args.kwargs["sample_seed"] == "seed-1"
        submitted_request = submit.call_args.args[0]
        assert submitted_request.document_ids == doc_ids[:20]
        assert submit.call_args.kwargs["schema_id"] == "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        assert submit.call_args.kwargs["sample"] is sample
        assert submit.call_args.kwargs["population_size"] == 30

    @pytest.mark.unit
    async def test_create_db_job_full_run_passes_all_documents_and_parent(
        self, client, valid_api_headers, override_user_auth
    ) -> None:
        override_user_auth("user-1")
        with (
            patch("app.extraction_domain.jobs_router._fetch_schema_from_db",
                  return_value={"name": "S", "description": "", "text": {"a": {"type": "string", "description": "a", "required": True}}}),
            patch("app.extraction_domain.jobs_router.apply_run_kind", return_value=None),
            patch("app.extraction_domain.jobs_router._submit_extraction_task", return_value="task-full") as submit,
        ):
            response = await client.post(
                "/extractions/db",
                json={
                    "collection_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    "schema_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                    "document_ids": ["eeeeeeee-eeee-4eee-8eee-eeeeeeeee001", "eeeeeeee-eeee-4eee-8eee-eeeeeeeee002"],
                    "extraction_context": "ctx",
                    "parent_job_id": "30000000-0000-4000-8000-000000000007",
                },
                headers={**valid_api_headers, **_BEARER_HEADERS},
            )
        assert response.status_code == 202
        req = submit.call_args.args[0]
        assert len(req.document_ids) == 2
        assert req.parent_job_id == "30000000-0000-4000-8000-000000000007"
        assert submit.call_args.kwargs["sample"] is None
        assert submit.call_args.kwargs["population_size"] == 2

    @pytest.mark.unit
    async def test_create_db_job_rejects_non_uuid_parent(self, client, valid_api_headers, override_user_auth) -> None:
        override_user_auth("user-1")
        response = await client.post(
            "/extractions/db",
            json={
                "collection_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                "schema_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                "document_ids": ["eeeeeeee-eeee-4eee-8eee-eeeeeeeee001"],
                "extraction_context": "ctx",
                "parent_job_id": "not-a-uuid",
            },
            headers={**valid_api_headers, **_BEARER_HEADERS},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "INVALID_PARENT_JOB_ID"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_extraction_jobs_router.py -k "sample_run or full_run_passes or non_uuid_parent" -v`
Expected: FAIL — `AttributeError: module has no attribute 'apply_run_kind'` / unexpected kwargs.

- [ ] **Step 3: Implement in `create_extraction_job_db`**

Import `from app.extraction_domain.sampling import apply_run_kind`. In the simple-mode branch, after `document_ids = _validate_documents(...)` and the schema fetch, build the request as today **plus** `run_kind=payload.run_kind, sample_size=payload.sample_size, sample_seed=payload.sample_seed, parent_job_id=payload.parent_job_id`, and keep `requested_schema_id = payload.schema_id`. For the full-mode branch set `requested_schema_id = payload.schema_id`. Then, replacing the block from `_enforce_max_documents(...)` to `_create_extraction_response(task_id)`:

```python
        if extraction_request.parent_job_id and not is_uuid(extraction_request.parent_job_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "Invalid Parent Job ID",
                    "message": "parent_job_id must be the UUID of the sample job this full run follows.",
                    "code": "INVALID_PARENT_JOB_ID",
                },
            )

        _enforce_max_documents(extraction_request.document_ids, extraction_request.collection_id)
        _validate_collection_id(extraction_request.collection_id)
        if extraction_request.user_schema is None:
            raise HTTPException(...)  # unchanged MISSING_USER_SCHEMA block

        population = list(extraction_request.document_ids or [])
        sample = apply_run_kind(
            population,
            run_kind=extraction_request.run_kind,
            sample_size=extraction_request.sample_size,
            sample_seed=extraction_request.sample_seed,
            client=supabase,
        )
        if sample is not None:
            extraction_request = extraction_request.model_copy(
                update={"document_ids": sample.document_ids}
            )

        task_id = _submit_extraction_task(
            extraction_request,
            user_id=user.id,
            schema_id=requested_schema_id,
            sample=sample,
            population_size=len(population),
        )
```

`model_copy(update=...)` bypasses validators — fine here because the ids were validated already. Apply the same `schema_id=requested_schema_id` pass-through in `create_extraction_job` (legacy `/extractions`) and `create_bulk_extraction` (`schema_id=schema_id`) so all three routes persist it.

- [ ] **Step 4: Run the router suite + ruff**

Run: `cd backend && poetry run pytest tests/app/test_extraction_jobs_router.py -v -m unit && poetry run ruff check app tests && poetry run ruff format --check app tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/jobs_router.py backend/tests/app/test_extraction_jobs_router.py
git commit -m "feat(extraction): sample runs on POST /extractions/db; persist the requested schema_id"
```

### Task 8: Worker records token usage per document and job totals

**Today nothing is recorded.** The extractor's `with_structured_output(...)` chain returns the parsed dict, discarding `AIMessage.usage_metadata`; Langfuse (optional) sees it, the app does not. The least invasive capture is LangChain's contextvar callback `get_usage_metadata_callback()` wrapped around the per-document call — no change to `InformationExtractor`'s signature, so `tests/app/test_extraction_resume.py` (whose mock side-effect takes one positional arg) keeps working.

**Files:**
- Modify: `backend/app/workers.py:221-297` (`_update_job_results_in_supabase`), `:745-800` (per-document loop), `:872-880` (final update)
- Test: `backend/tests/app/test_extraction_worker_usage.py` (create)

**Interfaces:**
- Produces: each completed result dict carries `"usage": {"input_tokens", "output_tokens", "total_tokens", "model"}`; `_update_job_results_in_supabase(..., input_tokens: int | None = None, output_tokens: int | None = None)` writes the totals when given; `_sum_usage(results: list[dict]) -> tuple[int, int]`.
- Consumes: `TokenUsage` (Task 6), columns `input_tokens`/`output_tokens` (Task 3).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/app/test_extraction_worker_usage.py
"""The cost estimate for a full run is `sample tokens × N / sample_docs`, so the
worker must record what each document actually cost in tokens (research-flow
epic, child b). Before this, no token count survived the LLM call."""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from tests.app.test_extraction_resume import _ResumeSupabase, _resolved

pytestmark = pytest.mark.unit


class _RecordingSupabase(_ResumeSupabase):
    def __init__(self):
        super().__init__(stored_results=[])
        self.updates: list[dict] = []

    def update(self, payload):
        self.updates.append(payload)
        return super().update(payload)


def test_each_document_and_the_job_carry_token_usage(monkeypatch, celery_eager):
    from app import workers
    from app.models import DocumentExtractionRequest

    def _docs(ids):
        return _resolved(
            [type("Doc", (), {"full_text": f"text-{i}", "document_id": i})() for i in ids]
        )

    monkeypatch.setattr(workers, "get_documents_by_id", _docs)
    monkeypatch.setattr(workers, "get_llm", MagicMock())
    monkeypatch.setattr(workers, "prepare_schema_from_db", MagicMock())
    monkeypatch.setattr(workers, "_cancellation_requested", lambda _job_id: False)

    calls = iter([(1000, 50), (1500, 70)])

    @contextmanager
    def _fake_usage_callback():
        handler = MagicMock()
        prompt, completion = next(calls)
        handler.usage_metadata = {
            "gpt-5-mini": {
                "input_tokens": prompt,
                "output_tokens": completion,
                "total_tokens": prompt + completion,
            }
        }
        yield handler

    monkeypatch.setattr(workers, "get_usage_metadata_callback", _fake_usage_callback)

    extractor = MagicMock()
    extractor.extract_information_with_structured_output.side_effect = (
        lambda _payload: _resolved({"case_number": "X"})
    )
    monkeypatch.setattr(workers, "InformationExtractor", MagicMock(return_value=extractor))
    supabase = _RecordingSupabase()
    monkeypatch.setattr(workers, "supabase_client", supabase)

    request = DocumentExtractionRequest(
        collection_id="col-1",
        document_ids=["d1", "d2"],
        extraction_context="ctx",
        user_schema={"type": "object", "description": "d", "required": []},
        prompt_id="p",
    )
    outcome = workers.extract_information_from_documents_task.apply(kwargs={"request": request})
    assert outcome.successful()

    by_id = {row["document_id"]: row for row in outcome.result}
    assert by_id["d1"]["usage"] == {"input_tokens": 1000, "output_tokens": 50, "total_tokens": 1050, "model": "gpt-5-mini"}
    assert by_id["d2"]["usage"]["input_tokens"] == 1500

    final = supabase.updates[-1]
    assert final["status"] == "SUCCESS"
    assert (final["input_tokens"], final["output_tokens"]) == (2500, 120)


def test_sum_usage_ignores_rows_without_usage():
    from app.workers import _sum_usage

    rows = [
        {"usage": {"input_tokens": 10, "output_tokens": 2}},
        {"status": "failed"},
        {"usage": None},
        {"usage": {"input_tokens": 5, "output_tokens": 1}},
    ]
    assert _sum_usage(rows) == (15, 3)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_extraction_worker_usage.py -v`
Expected: FAIL — `AttributeError: module 'app.workers' has no attribute 'get_usage_metadata_callback'`.

- [ ] **Step 3: Implement in `workers.py`**

Imports:

```python
from langchain_core.callbacks import get_usage_metadata_callback
from app.models import TokenUsage  # add to the existing `from app.models import (...)`
```

Helper (near `_update_job_results_in_supabase`):

```python
def _usage_from_handler(handler, fallback_model: str | None) -> TokenUsage | None:
    """Collapse `UsageMetadataCallbackHandler.usage_metadata` ({model: {...}}) into one row."""
    metadata = getattr(handler, "usage_metadata", None) or {}
    if not metadata:
        return None
    input_tokens = sum(int(m.get("input_tokens", 0) or 0) for m in metadata.values())
    output_tokens = sum(int(m.get("output_tokens", 0) or 0) for m in metadata.values())
    model = next(iter(metadata), None) or fallback_model
    return TokenUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        model=model,
    )


def _sum_usage(results: list[dict[str, Any]]) -> tuple[int, int]:
    input_total = output_total = 0
    for row in results:
        usage = row.get("usage") if isinstance(row, dict) else None
        if not isinstance(usage, dict):
            continue
        input_total += int(usage.get("input_tokens", 0) or 0)
        output_total += int(usage.get("output_tokens", 0) or 0)
    return input_total, output_total
```

`_update_job_results_in_supabase(..., input_tokens: int | None = None, output_tokens: int | None = None)`: after building `update_data`, add

```python
        if input_tokens is not None:
            update_data["input_tokens"] = input_tokens
        if output_tokens is not None:
            update_data["output_tokens"] = output_tokens
```

Per-document call (replace the `extracted_data = loop.run_until_complete(...)` statement):

```python
                    with get_usage_metadata_callback() as usage_handler:
                        extracted_data = loop.run_until_complete(
                            extractor.extract_information_with_structured_output(
                                {
                                    "extraction_context": request.extraction_context,
                                    "additional_instructions": combined_instructions,
                                    "language": request.language,
                                    "full_text": doc.full_text,
                                }
                            )
                        )
                    usage = _usage_from_handler(usage_handler, request.llm_name)
```

and pass `usage=usage` into the COMPLETED `DocumentExtractionResponse(...)`. Every `_update_job_results_in_supabase(...)` call in the loop and the final SUCCESS call gets `input_tokens, output_tokens = _sum_usage(results)` passed through (compute once per iteration just before the call).

Why the context manager works here: `get_usage_metadata_callback` registers the handler in a contextvar; `loop.run_until_complete` runs the coroutine on the same thread, so `ChatOpenAI`'s `on_llm_end` reaches it and populates `usage_metadata`. If `LLM_BASE_URL` points at a server that omits `usage` in the response, the handler stays empty → `usage: null`, and the estimate reports `documents_with_usage < sample_docs` (Task 9) instead of inventing numbers.

- [ ] **Step 4: Run the worker suites**

Run: `cd backend && poetry run pytest tests/app/test_extraction_worker_usage.py tests/app/test_extraction_resume.py tests/app/test_extraction_job_lifecycle.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/workers.py backend/tests/app/test_extraction_worker_usage.py
git commit -m "feat(worker): record LLM token usage per document and job totals"
```

### Task 9: Job summary endpoint — field completeness + full-run cost estimate

**Files:**
- Create: `backend/app/extraction_domain/summary.py`
- Create: `backend/tests/app/test_extraction_summary.py`
- Modify: `backend/app/models.py` (response models), `backend/app/extraction_domain/results_router.py` (route `GET /{job_id}/summary`, placed **before** the generic export handler's module end; the `/{job_id}/export` route already exists so path ordering is not an issue)

**Interfaces:**
- Produces (models.py):
  ```python
  class FieldCompleteness(BaseModel):
      field: str; filled: int; empty: int; empty_ratio: float   # 0..1, empty/(filled+empty)
  class FullRunEstimate(BaseModel):
      population_size: int; sample_documents: int; documents_with_usage: int
      sample_input_tokens: int; sample_output_tokens: int
      estimated_input_tokens: int; estimated_output_tokens: int; estimated_total_tokens: int
      estimated_cost_usd: float | None; method: str   # "sample_tokens * population_size / sample_documents"
  class ExtractionJobSummaryResponse(BaseModel):
      job_id: str; run_kind: Literal["sample","full"]; status: str
      collection_id: str | None; schema_id: str | None; language: str; llm_name: str | None
      sample_seed: str | None; sample_strata: dict[str, int] | None; parent_job_id: str | None
      usage: TokenUsage; fields: list[FieldCompleteness]; full_run: FullRunEstimate | None
  ```
- Produces (summary.py):
  ```python
  EMPTY_MARKERS = {"", "n/a", "na", "not available", "none", "null", "unknown", "brak", "brak danych", "nie dotyczy", "not applicable"}
  def is_empty_value(value) -> bool
  def flatten(obj: dict, prefix="") -> dict[str, object]   # same "a.b" keys as results_router.flatten_dict / ExtractionJobClient.flattenObject
  def field_completeness(results: list[dict]) -> list[FieldCompleteness]   # completed rows only; sorted by empty_ratio desc, then field
  def usd_for_tokens(model: str | None, input_tokens: int, output_tokens: int) -> float | None   # litellm.cost_per_token; None on any exception / unknown model
  def estimate_full_run(*, population_size: int | None, results: list[dict], model: str | None) -> FullRunEstimate | None
  def build_job_summary(job_row: dict) -> ExtractionJobSummaryResponse
  ```

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/app/test_extraction_summary.py
from __future__ import annotations

import pytest

from app.extraction_domain import summary

pytestmark = pytest.mark.unit


def _row(doc, data, status="completed", usage=None):
    return {"document_id": doc, "status": status, "extracted_data": data, "usage": usage}


class TestFieldCompleteness:
    def test_counts_empty_markers_and_nested_fields(self):
        rows = [
            _row("d1", {"court": "SA Warszawa", "outcome": "not available", "party": {"name": ""}}),
            _row("d2", {"court": "", "outcome": "acquitted", "party": {"name": "Kowalski"}}),
            _row("d3", {"court": None, "outcome": [], "party": {"name": "n/a"}}),
            _row("d4", {"court": "x"}, status="failed"),  # ignored
        ]
        result = {f.field: f for f in summary.field_completeness(rows)}
        assert set(result) == {"court", "outcome", "party.name"}
        assert (result["court"].filled, result["court"].empty) == (1, 2)
        assert result["outcome"].empty_ratio == pytest.approx(2 / 3)
        assert result["party.name"].empty == 2

    def test_sorted_by_emptiest_first(self):
        rows = [_row("d1", {"a": "", "b": "x"}), _row("d2", {"a": "", "b": ""})]
        assert [f.field for f in summary.field_completeness(rows)] == ["a", "b"]

    @pytest.mark.parametrize("value", ["", "  ", "N/A", "Not Available", "brak danych", None, [], {}])
    def test_empty_markers(self, value):
        assert summary.is_empty_value(value)

    @pytest.mark.parametrize("value", [0, False, "0", ["x"], "Nie dotyczy sprawy"])
    def test_non_empty_values(self, value):
        assert not summary.is_empty_value(value)


class TestEstimate:
    def test_scales_sample_tokens_to_the_population(self, monkeypatch):
        monkeypatch.setattr(summary, "usd_for_tokens", lambda model, i, o: 0.5)
        rows = [
            _row("d1", {"a": 1}, usage={"input_tokens": 1000, "output_tokens": 100}),
            _row("d2", {"a": 1}, usage={"input_tokens": 3000, "output_tokens": 300}),
        ]
        est = summary.estimate_full_run(population_size=137, results=rows, model="gpt-5-mini")
        assert est is not None
        assert (est.sample_documents, est.documents_with_usage) == (2, 2)
        assert est.estimated_input_tokens == 4000 * 137 // 2
        assert est.estimated_output_tokens == 400 * 137 // 2
        assert est.estimated_total_tokens == est.estimated_input_tokens + est.estimated_output_tokens
        assert est.estimated_cost_usd == 0.5
        assert est.method == "sample_tokens * population_size / sample_documents"

    def test_rows_without_usage_do_not_dilute_the_average(self):
        rows = [
            _row("d1", {"a": 1}, usage={"input_tokens": 1000, "output_tokens": 100}),
            _row("d2", {"a": 1}, usage=None),
        ]
        est = summary.estimate_full_run(population_size=10, results=rows, model=None)
        assert est.documents_with_usage == 1
        assert est.estimated_input_tokens == 1000 * 10  # per-doc average uses documents_with_usage
        assert est.estimated_cost_usd is None  # unknown model → no price

    def test_no_usage_at_all_returns_none(self):
        assert summary.estimate_full_run(population_size=10, results=[_row("d1", {"a": 1})], model="gpt-5-mini") is None

    def test_no_population_returns_none(self):
        rows = [_row("d1", {"a": 1}, usage={"input_tokens": 1, "output_tokens": 1})]
        assert summary.estimate_full_run(population_size=None, results=rows, model="gpt-5-mini") is None


def test_usd_for_tokens_uses_litellm_and_degrades_to_none():
    assert summary.usd_for_tokens("gpt-5-mini", 1000, 500) == pytest.approx(0.00125)
    assert summary.usd_for_tokens("model-that-does-not-exist-xyz", 1, 1) is None
    assert summary.usd_for_tokens(None, 1, 1) is None


def test_build_job_summary_from_a_row():
    row = {
        "job_id": "j", "run_kind": "sample", "status": "SUCCESS", "collection_id": "c",
        "schema_id": "s", "language": "pl", "llm_name": "gpt-5-mini", "sample_seed": "seed",
        "sample_strata": {"PL": 1}, "parent_job_id": None, "population_size": 4,
        "input_tokens": 100, "output_tokens": 10,
        "results": [_row("d1", {"a": ""}, usage={"input_tokens": 100, "output_tokens": 10})],
    }
    out = summary.build_job_summary(row)
    assert out.usage.total_tokens == 110
    assert out.fields[0].field == "a" and out.fields[0].empty == 1
    assert out.full_run is not None and out.full_run.estimated_input_tokens == 400
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_extraction_summary.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `summary.py`**

```python
"""Sample-job summary: which fields came back empty, and what the full run would cost."""

from __future__ import annotations

from typing import Any

import litellm
from loguru import logger

from app.models import (
    ExtractionJobSummaryResponse,
    FieldCompleteness,
    FullRunEstimate,
    TokenUsage,
)

_COMPLETED = {"completed", "success", "partially_completed"}
EMPTY_MARKERS = {
    "", "n/a", "na", "not available", "none", "null", "unknown",
    "brak", "brak danych", "nie dotyczy", "not applicable",
}


def is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in EMPTY_MARKERS
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def flatten(obj: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    items: dict[str, Any] = {}
    for key, value in obj.items():
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict) and value:
            items.update(flatten(value, name))
        else:
            items[name] = value
    return items


def field_completeness(results: list[dict[str, Any]]) -> list[FieldCompleteness]:
    # field -> [filled, empty]
    counts: dict[str, list[int]] = {}
    for row in results:
        if str(row.get("status", "")).lower() not in _COMPLETED:
            continue
        data = row.get("extracted_data") or {}
        for field, value in flatten(data).items():
            pair = counts.setdefault(field, [0, 0])
            pair[1 if is_empty_value(value) else 0] += 1
    out = [
        FieldCompleteness(field=f, filled=c[0], empty=c[1], empty_ratio=c[1] / (c[0] + c[1]))
        for f, c in counts.items()
    ]
    return sorted(out, key=lambda f: (-f.empty_ratio, f.field))


def usd_for_tokens(model: str | None, input_tokens: int, output_tokens: int) -> float | None:
    if not model:
        return None
    try:
        prompt_cost, completion_cost = litellm.cost_per_token(
            model=model, prompt_tokens=input_tokens, completion_tokens=output_tokens
        )
    except Exception as error:  # litellm raises for unknown models; the estimate stays honest
        logger.info(f"No price for model {model!r}: {error}")
        return None
    return round(float(prompt_cost) + float(completion_cost), 6)


def estimate_full_run(
    *, population_size: int | None, results: list[dict[str, Any]], model: str | None
) -> FullRunEstimate | None:
    if not population_size:
        return None
    usages = [r.get("usage") for r in results if isinstance(r.get("usage"), dict)]
    if not usages:
        return None
    sample_documents = sum(1 for r in results if str(r.get("status", "")).lower() in _COMPLETED) or len(results)
    in_tokens = sum(int(u.get("input_tokens", 0) or 0) for u in usages)
    out_tokens = sum(int(u.get("output_tokens", 0) or 0) for u in usages)
    n = len(usages)
    est_in = in_tokens * population_size // n
    est_out = out_tokens * population_size // n
    return FullRunEstimate(
        population_size=population_size,
        sample_documents=sample_documents,
        documents_with_usage=n,
        sample_input_tokens=in_tokens,
        sample_output_tokens=out_tokens,
        estimated_input_tokens=est_in,
        estimated_output_tokens=est_out,
        estimated_total_tokens=est_in + est_out,
        estimated_cost_usd=usd_for_tokens(model, est_in, est_out),
        method="sample_tokens * population_size / sample_documents",
    )


def build_job_summary(job_row: dict[str, Any]) -> ExtractionJobSummaryResponse:
    results = job_row.get("results") or []
    if isinstance(results, str):
        import json
        results = json.loads(results)
    input_tokens = int(job_row.get("input_tokens") or 0)
    output_tokens = int(job_row.get("output_tokens") or 0)
    return ExtractionJobSummaryResponse(
        job_id=job_row["job_id"],
        run_kind=job_row.get("run_kind") or "full",
        status=job_row.get("status") or "PENDING",
        collection_id=job_row.get("collection_id"),
        schema_id=job_row.get("schema_id"),
        language=job_row.get("language") or "pl",
        llm_name=job_row.get("llm_name"),
        sample_seed=job_row.get("sample_seed"),
        sample_strata=job_row.get("sample_strata"),
        parent_job_id=job_row.get("parent_job_id"),
        usage=TokenUsage(input_tokens=input_tokens, output_tokens=output_tokens,
                         total_tokens=input_tokens + output_tokens, model=job_row.get("llm_name")),
        fields=field_completeness(results),
        full_run=estimate_full_run(
            population_size=job_row.get("population_size"),
            results=results,
            model=job_row.get("llm_name"),
        ),
    )
```

- [ ] **Step 4: Route in `results_router.py`**

```python
_SUMMARY_FIELDS = (
    "job_id, user_id, status, run_kind, collection_id, schema_id, language, llm_name, "
    "sample_seed, sample_strata, parent_job_id, population_size, input_tokens, output_tokens, results"
)


@router.get(
    "/{job_id}/summary",
    response_model=ExtractionJobSummaryResponse,
    summary="Field completeness and full-run cost estimate for an extraction job",
)
async def get_extraction_job_summary(
    job_id: str = Path(..., description="Extraction job ID"),
    user: AuthenticatedUser = Depends(get_current_user),
) -> ExtractionJobSummaryResponse:
    if not supabase:
        raise HTTPException(status_code=503, detail={"error": "Service Unavailable", "message": "Database service is unavailable", "code": "DATABASE_UNAVAILABLE"})
    response = (
        supabase.table("extraction_jobs").select(_SUMMARY_FIELDS).eq("job_id", job_id).single().execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail={"error": "Job Not Found", "message": f"Extraction job '{job_id}' was not found", "code": "JOB_NOT_FOUND"})
    if response.data.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail={"error": "Access Denied", "message": "You do not have permission to view this job", "code": "ACCESS_DENIED"})
    return build_job_summary(response.data)
```

Add a router test in `backend/tests/app/test_extraction_results_router.py` mirroring `TestExportExtractionResults.test_access_denied_returns_403` for `/extractions/job-1/summary` (403 for `_USER_099`, 200 with `fields` and `full_run` for the owner using a mock row like the one in `test_build_job_summary_from_a_row`).

- [ ] **Step 5: Run tests + ruff**

Run: `cd backend && poetry run pytest tests/app/test_extraction_summary.py tests/app/test_extraction_results_router.py -v -m unit && poetry run ruff check app tests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/extraction_domain/summary.py backend/app/extraction_domain/results_router.py backend/app/models.py backend/tests/app/test_extraction_summary.py backend/tests/app/test_extraction_results_router.py
git commit -m "feat(extraction): GET /extractions/{id}/summary with field completeness and full-run cost estimate"
```

### Task 10: BFF — request schema fields pass-through + summary proxy

**Files:**
- Modify: `frontend/lib/validation/schemas.ts:23-43` (`extractionRequestSchema`)
- Modify: `frontend/app/api/extractions/route.ts:75-80` (destructure) and `:180-205` (`backendPayload`)
- Create: `frontend/app/api/extractions/[id]/summary/route.ts`
- Create: `frontend/lib/extractions/summary-contract.ts`
- Create: `frontend/tests/unit/lib/validation/extraction-request-schema.test.ts`, `frontend/tests/unit/lib/extractions/summary-contract.test.ts`

**Interfaces:**
- Produces Zod fields: `run_kind: z.enum(['sample','full']).default('full')`, `sample_size: z.number().int().min(1).max(1000).optional()`, `sample_seed: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/).optional()`, `parent_job_id: uuidSchema.optional()`. Schema stays `.strict()`.
- Produces TS types mirroring Task 9 models: `ExtractionJobSummary`, `FieldCompleteness`, `FullRunEstimate`, `TokenUsage`, plus `normalizeJobSummary(payload: unknown): ExtractionJobSummary | null` and `fetchJobSummary(jobId: string, init?: RequestInit): Promise<ExtractionJobSummary | null>` (GET `/api/extractions/${jobId}/summary`).
- Produces BFF route `GET /api/extractions/[id]/summary` → backend `GET /extractions/{id}/summary` with `X-API-Key` + `Authorization: Bearer` exactly as `[id]/export/route.ts` does; returns backend JSON/status unchanged, 401 without session.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/lib/validation/extraction-request-schema.test.ts
import { extractionRequestSchema } from "@/lib/validation/schemas";

const base = {
  collection_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  schema_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  extraction_context: "ctx",
};

describe("extractionRequestSchema research-flow fields", () => {
  it("defaults run_kind to full", () => {
    expect(extractionRequestSchema.parse(base).run_kind).toBe("full");
  });
  it("accepts a sample run with seed and parent", () => {
    const parsed = extractionRequestSchema.parse({
      ...base, run_kind: "sample", sample_size: 20, sample_seed: "seed-1",
      parent_job_id: "30000000-0000-4000-8000-000000000007",
    });
    expect(parsed).toMatchObject({ run_kind: "sample", sample_size: 20, sample_seed: "seed-1" });
  });
  it.each([
    { run_kind: "pilot" },
    { sample_size: 0 },
    { sample_seed: "has spaces" },
    { parent_job_id: "nope" },
  ])("rejects %o", (bad) => {
    expect(() => extractionRequestSchema.parse({ ...base, ...bad })).toThrow();
  });
});
```

```ts
// frontend/tests/unit/lib/extractions/summary-contract.test.ts
import { normalizeJobSummary } from "@/lib/extractions/summary-contract";

const valid = {
  job_id: "30000000-0000-4000-8000-000000000007", run_kind: "sample", status: "SUCCESS",
  collection_id: "c", schema_id: "s", language: "pl", llm_name: "gpt-5-mini",
  sample_seed: "seed", sample_strata: { PL: 12, UK: 8 }, parent_job_id: null,
  usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110, model: "gpt-5-mini" },
  fields: [{ field: "outcome", filled: 2, empty: 18, empty_ratio: 0.9 }],
  full_run: {
    population_size: 137, sample_documents: 20, documents_with_usage: 20,
    sample_input_tokens: 100, sample_output_tokens: 10,
    estimated_input_tokens: 685, estimated_output_tokens: 68, estimated_total_tokens: 753,
    estimated_cost_usd: 0.01, method: "sample_tokens * population_size / sample_documents",
  },
};

describe("normalizeJobSummary", () => {
  it("accepts the backend shape", () => {
    expect(normalizeJobSummary(valid)?.full_run?.population_size).toBe(137);
  });
  it("accepts a full run without an estimate", () => {
    expect(normalizeJobSummary({ ...valid, run_kind: "full", full_run: null })?.full_run).toBeNull();
  });
  it.each([null, "x", { ...valid, run_kind: "pilot" }, { ...valid, fields: "no" }, { ...valid, usage: {} }])(
    "rejects %p", (bad) => { expect(normalizeJobSummary(bad)).toBeNull(); });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- tests/unit/lib/validation/extraction-request-schema.test.ts tests/unit/lib/extractions/summary-contract.test.ts`
Expected: FAIL (`run_kind` unrecognized key under `.strict()`; module not found).

- [ ] **Step 3: Zod + BFF pass-through**

In `schemas.ts` add to `extractionRequestSchema` before `.strict()`:

```ts
  run_kind: z.enum(['sample', 'full']).default('full')
    .describe('sample = deterministic jurisdiction-stratified subset (default 20); full = every document'),
  sample_size: z.number().int().min(1).max(1000).optional(),
  sample_seed: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'Seed may contain letters, digits, _ . : -').optional(),
  parent_job_id: uuidSchema.optional().describe('For a full run, the sample job it was estimated from'),
```

In `route.ts` POST: destructure `run_kind, sample_size, sample_seed, parent_job_id` from `validateRequestBody(...)`; extend `backendPayload`'s type with `run_kind: string; sample_size?: number; sample_seed?: string; parent_job_id?: string;` and set `run_kind` always, the others only when defined.

- [ ] **Step 4: summary-contract.ts and the proxy route**

```ts
// frontend/lib/extractions/summary-contract.ts
export interface TokenUsage { input_tokens: number; output_tokens: number; total_tokens: number; model: string | null }
export interface FieldCompleteness { field: string; filled: number; empty: number; empty_ratio: number }
export interface FullRunEstimate {
  population_size: number; sample_documents: number; documents_with_usage: number;
  sample_input_tokens: number; sample_output_tokens: number;
  estimated_input_tokens: number; estimated_output_tokens: number; estimated_total_tokens: number;
  estimated_cost_usd: number | null; method: string;
}
export interface ExtractionJobSummary {
  job_id: string; run_kind: "sample" | "full"; status: string;
  collection_id: string | null; schema_id: string | null; language: string; llm_name: string | null;
  sample_seed: string | null; sample_strata: Record<string, number> | null; parent_job_id: string | null;
  usage: TokenUsage; fields: FieldCompleteness[]; full_run: FullRunEstimate | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

export function normalizeJobSummary(payload: unknown): ExtractionJobSummary | null {
  if (!isRecord(payload)) return null;
  const p = payload;
  if (typeof p.job_id !== "string" || (p.run_kind !== "sample" && p.run_kind !== "full")) return null;
  if (!isRecord(p.usage) || !isInt(p.usage.input_tokens) || !isInt(p.usage.output_tokens)) return null;
  if (!Array.isArray(p.fields) || !p.fields.every((f) => isRecord(f) && typeof f.field === "string" && isInt(f.filled) && isInt(f.empty))) return null;
  if (p.full_run !== null && p.full_run !== undefined && !(isRecord(p.full_run) && isInt(p.full_run.population_size))) return null;
  return p as unknown as ExtractionJobSummary;
}

export async function fetchJobSummary(jobId: string, init?: RequestInit): Promise<ExtractionJobSummary | null> {
  const response = await fetch(`/api/extractions/${encodeURIComponent(jobId)}/summary`, { cache: "no-store", ...init });
  if (!response.ok) return null;
  return normalizeJobSummary(await response.json().catch(() => null));
}
```

`frontend/app/api/extractions/[id]/summary/route.ts`: copy `[id]/export/route.ts`'s auth block verbatim, then

```ts
    const response = await fetch(`${API_BASE_URL}/extractions/${encodeURIComponent(jobId)}/summary`, {
      cache: 'no-store',
      headers: { 'X-API-Key': API_KEY, 'Authorization': `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
```

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `cd frontend && npm test -- tests/unit/lib/validation tests/unit/lib/extractions && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/validation/schemas.ts frontend/app/api/extractions/route.ts frontend/app/api/extractions/[id]/summary/route.ts frontend/lib/extractions/summary-contract.ts frontend/tests/unit/lib/validation/extraction-request-schema.test.ts frontend/tests/unit/lib/extractions/summary-contract.test.ts
git commit -m "feat(bff): pass run_kind/sample fields to the backend and proxy the job summary"
```

### Task 11: `/extract` — run mode selector, sample by default

**Files:**
- Create: `frontend/app/extract/_components/run-mode.ts`, `frontend/app/extract/_components/RunModeSelector.tsx`
- Create: `frontend/tests/unit/app/extract/run-mode.test.ts`, `frontend/tests/unit/app/extract/RunModeSelector.test.tsx`
- Modify: `frontend/app/extract/_components/data.ts:83-140` (`SubmitExtractionParams`, request body), `useExtract.ts` (state + `handleExtract`), `ExtractionConfigPanel.tsx` (render selector, button label), `frontend/app/extract/page.tsx` (props)

**Interfaces:**
- Produces:
  ```ts
  export type RunMode = "sample" | "full";
  export const DEFAULT_SAMPLE_SIZE = 20;
  export interface RunPlan { run_kind: RunMode; documents: number; sample_size?: number; label: string; explanation: string }
  export function resolveRunPlan(selectedCount: number, mode: RunMode): RunPlan
  ```
  Rules: `mode === "sample"` and `selectedCount > 20` → `{run_kind:"sample", documents:20, sample_size:20, label:"Start Sample Extraction (20 of N documents)", explanation:"Stratified by jurisdiction. Run the full set from the results page once you have checked the sample."}`; otherwise (`selectedCount <= 20` or mode full) → `{run_kind:"full", documents:selectedCount, label: "Start Extraction (N document|documents)", explanation: selectedCount<=20 ? "20 or fewer documents — the sample is the whole selection." : "Every selected document."}`. Keeps the existing label for N ≤ 20 (route-contract regression).
- `SubmitExtractionParams` gains `runKind: RunMode; sampleSize?: number`; body gets `run_kind` and `sample_size`.
- `RunModeSelector({ value, onChange, selectedCount, disabled })` — two radio inputs (`role="radio"`, labels `Sample first (recommended)` / `Full run`), `aria-describedby` explanation, `data-testid="run-mode-selector"`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/app/extract/run-mode.test.ts
import { resolveRunPlan } from "@/app/extract/_components/run-mode";

describe("resolveRunPlan", () => {
  it("defaults to a 20-document sample for large selections", () => {
    const plan = resolveRunPlan(137, "sample");
    expect(plan).toMatchObject({ run_kind: "sample", documents: 20, sample_size: 20 });
    expect(plan.label).toBe("Start Sample Extraction (20 of 137 documents)");
  });
  it("is a full run when the selection is 20 or fewer, keeping the old label", () => {
    expect(resolveRunPlan(2, "sample").label).toBe("Start Extraction (2 documents)");
    expect(resolveRunPlan(1, "sample").label).toBe("Start Extraction (1 document)");
    expect(resolveRunPlan(20, "sample").run_kind).toBe("full");
  });
  it("honours an explicit full run", () => {
    expect(resolveRunPlan(137, "full")).toMatchObject({ run_kind: "full", documents: 137 });
  });
});
```

```tsx
// frontend/tests/unit/app/extract/RunModeSelector.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { RunModeSelector } from "@/app/extract/_components/RunModeSelector";

describe("RunModeSelector", () => {
  it("shows sample as the default and explains it", () => {
    render(<RunModeSelector value="sample" onChange={() => {}} selectedCount={137} />);
    expect(screen.getByRole("radio", { name: /sample first/i })).toBeChecked();
    expect(screen.getByText(/20 of 137/)).toBeInTheDocument();
    expect(screen.getByText(/stratified by jurisdiction/i)).toBeInTheDocument();
  });
  it("lets the user opt into a full run explicitly", () => {
    const onChange = jest.fn();
    render(<RunModeSelector value="sample" onChange={onChange} selectedCount={137} />);
    fireEvent.click(screen.getByRole("radio", { name: /full run/i }));
    expect(onChange).toHaveBeenCalledWith("full");
  });
  it("is hidden for 20 or fewer documents (nothing to sample)", () => {
    const { container } = render(<RunModeSelector value="sample" onChange={() => {}} selectedCount={12} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- tests/unit/app/extract/run-mode.test.ts tests/unit/app/extract/RunModeSelector.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `run-mode.ts`**

```ts
export type RunMode = "sample" | "full";
export const DEFAULT_SAMPLE_SIZE = 20;

export interface RunPlan {
  run_kind: RunMode;
  documents: number;
  sample_size?: number;
  label: string;
  explanation: string;
}

const plural = (n: number) => `${n} ${n === 1 ? "document" : "documents"}`;

export function resolveRunPlan(selectedCount: number, mode: RunMode): RunPlan {
  if (mode === "sample" && selectedCount > DEFAULT_SAMPLE_SIZE) {
    return {
      run_kind: "sample",
      documents: DEFAULT_SAMPLE_SIZE,
      sample_size: DEFAULT_SAMPLE_SIZE,
      label: `Start Sample Extraction (${DEFAULT_SAMPLE_SIZE} of ${selectedCount} documents)`,
      explanation:
        "Stratified by jurisdiction. Run the full set from the results page once you have checked the sample.",
    };
  }
  return {
    run_kind: "full",
    documents: selectedCount,
    label: `Start Extraction (${plural(selectedCount)})`,
    explanation:
      selectedCount <= DEFAULT_SAMPLE_SIZE
        ? "20 or fewer documents — the sample is the whole selection."
        : "Every selected document.",
  };
}
```

`RunModeSelector.tsx`: render `null` when `selectedCount <= DEFAULT_SAMPLE_SIZE`; otherwise a `<fieldset data-testid="run-mode-selector">` with `<legend>Run mode</legend>` and two `<label><input type="radio" name="run-mode" value="sample|full" checked onChange/> …</label>` rows using editorial tokens (`border-rule`, `text-ink-soft`, `font-mono` eyebrow) — no new card motifs (see `docs/reference/DESIGN.md`). Under the sample option print `resolveRunPlan(selectedCount, "sample").explanation` prefixed with `20 of ${selectedCount} documents`.

- [ ] **Step 4: Wire state and submission**

`useExtract.ts`: `const [runMode, setRunMode] = useState<RunMode>("sample");` reset to `"sample"` when `selectedCollection` changes (inside the documents effect); in `handleExtract` compute `const plan = resolveRunPlan(selectedDocuments.size, runMode);` and call `submitExtraction({ ..., runKind: plan.run_kind, sampleSize: plan.sample_size })`; on success toast `plan.run_kind === "sample" ? "Sample extraction started (20 documents). Open it from Recent extractions to review fields and run the full set." : <existing text>`. Return `runMode, setRunMode` from the hook.

`data.ts`: extend `SubmitExtractionParams` and the request body (`run_kind: params.runKind`, `...(params.sampleSize ? { sample_size: params.sampleSize } : {})`).

`ExtractionConfigPanel.tsx`: new props `runMode: RunMode; onSelectRunMode: (m: RunMode) => void;` render `<RunModeSelector value={runMode} onChange={onSelectRunMode} selectedCount={selectedDocuments.size} disabled={isLoading} />` above the buttons; the primary button label becomes `resolveRunPlan(selectedDocuments.size, runMode).label` (in the non-loading branch). `page.tsx` passes the two new props.

- [ ] **Step 5: Run unit tests, typecheck, and the unchanged route-contract spec**

Run: `cd frontend && npm test -- tests/unit/app/extract && npm run typecheck && npm run test:e2e:route-contract`
Expected: PASS; `extraction-path.spec.ts` still finds `Start Extraction (2 documents)` (N=2 ≤ 20) and the stub receives `run_kind: "full"` (ignored by the stub, no unexpected requests).

- [ ] **Step 6: Commit**

```bash
git add frontend/app/extract frontend/tests/unit/app/extract
git commit -m "feat(extract): sample-first run mode (min(20, N), stratified) with explicit full-run opt-in"
```

### Task 12: `/extractions/[id]` — completeness table, cost estimate, "Run on full collection"

**Files:**
- Create: `frontend/app/extractions/[id]/_components/SampleSummaryPanel.tsx`
- Create: `frontend/lib/extractions/run-full.ts`, `frontend/lib/extractions/format-estimate.ts`
- Create: `frontend/tests/unit/lib/extractions/format-estimate.test.ts`, `frontend/tests/unit/app/extractions/SampleSummaryPanel.test.tsx`
- Modify: `frontend/app/extractions/[id]/_components/ExtractionJobClient.tsx` (render the panel under the job header card when `isTerminalExtractionStatus(jobData.status)`)

**Interfaces:**
- Consumes: `fetchJobSummary` (Task 10), `submitExtraction`-like POST — implemented here as `runFullExtraction({ collectionId, schemaId, language, parentJobId }): Promise<{ ok: true; jobId: string } | { ok: false; message: string }>` posting `{ collection_id, schema_id, extraction_context: 'Extract structured information from legal documents using the provided schema.', language, run_kind: 'full', parent_job_id }` to `/api/extractions` (no `document_ids` → BFF fetches the whole collection, `route.ts:104-150`).
- Produces: `formatTokens(n: number): string` (`"1,234"` / `"1.2M"` for ≥ 1e6), `formatUsd(v: number | null): string` (`"≈ $0.42"` / `"price unavailable for this model"`), `percent(ratio): string`.
- Panel behaviour: loads once when the job is terminal; renders (1) `Fields × documents` table: field, filled, empty, `% empty` with a `StatusBadge`-style warning when `empty_ratio ≥ 0.5`; (2) `Full run estimate` block: `≈ {estimated_total_tokens} tokens for {population_size} documents ({method})`, USD line, and `Based on {documents_with_usage} of {sample_documents} sampled documents` — when `documents_with_usage < sample_documents` add "some documents reported no usage"; (3) primary button `Run on full collection ({population_size} documents)` shown only when `run_kind === "sample" && full_run && collection_id && schema_id`; on click → `runFullExtraction` → `router.push('/extractions/' + jobId)`; (4) for `run_kind === "full"` with `parent_job_id`: a link `Estimated from sample job` → `/extractions/{parent_job_id}`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/lib/extractions/format-estimate.test.ts
import { formatTokens, formatUsd, percent } from "@/lib/extractions/format-estimate";

describe("format-estimate", () => {
  it("formats tokens", () => {
    expect(formatTokens(1234)).toBe("1,234");
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });
  it("formats usd or says it is unavailable", () => {
    expect(formatUsd(0.4236)).toBe("≈ $0.42");
    expect(formatUsd(null)).toBe("price unavailable for this model");
  });
  it("formats percentages", () => {
    expect(percent(0.9)).toBe("90%");
  });
});
```

```tsx
// frontend/tests/unit/app/extractions/SampleSummaryPanel.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SampleSummaryPanel } from "@/app/extractions/[id]/_components/SampleSummaryPanel";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const summary = {
  job_id: "30000000-0000-4000-8000-000000000007", run_kind: "sample", status: "SUCCESS",
  collection_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", schema_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  language: "pl", llm_name: "gpt-5-mini", sample_seed: "seed", sample_strata: { PL: 12, UK: 8 }, parent_job_id: null,
  usage: { input_tokens: 40000, output_tokens: 4000, total_tokens: 44000, model: "gpt-5-mini" },
  fields: [
    { field: "outcome", filled: 2, empty: 18, empty_ratio: 0.9 },
    { field: "court", filled: 20, empty: 0, empty_ratio: 0 },
  ],
  full_run: {
    population_size: 137, sample_documents: 20, documents_with_usage: 20,
    sample_input_tokens: 40000, sample_output_tokens: 4000,
    estimated_input_tokens: 274000, estimated_output_tokens: 27400, estimated_total_tokens: 301400,
    estimated_cost_usd: 0.42, method: "sample_tokens * population_size / sample_documents",
  },
};

function mockFetch(responses: Array<{ url: RegExp; body: unknown; status?: number }>) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = responses.find((r) => r.url.test(url));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("SampleSummaryPanel", () => {
  beforeEach(() => push.mockReset());

  it("shows completeness, the estimate and the full-run button for a sample job", async () => {
    mockFetch([{ url: /\/api\/extractions\/.*\/summary$/, body: summary }]);
    render(<SampleSummaryPanel jobId={summary.job_id} />);
    expect(await screen.findByRole("cell", { name: "outcome" })).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText(/301,400 tokens for 137 documents/)).toBeInTheDocument();
    expect(screen.getByText(/≈ \$0\.42/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run on full collection (137 documents)" })).toBeEnabled();
  });

  it("starts the full run with parent_job_id and navigates to the new job", async () => {
    mockFetch([
      { url: /\/summary$/, body: summary },
      { url: /\/api\/extractions$/, body: { job_id: "30000000-0000-4000-8000-000000000008", status: "accepted" }, status: 202 },
    ]);
    render(<SampleSummaryPanel jobId={summary.job_id} />);
    fireEvent.click(await screen.findByRole("button", { name: /Run on full collection/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/extractions/30000000-0000-4000-8000-000000000008"));
    const postCall = (global.fetch as jest.Mock).mock.calls.find(([u]) => /\/api\/extractions$/.test(String(u)));
    expect(JSON.parse(postCall[1].body)).toMatchObject({
      run_kind: "full", parent_job_id: summary.job_id,
      collection_id: summary.collection_id, schema_id: summary.schema_id, language: "pl",
    });
  });

  it("hides the button for a full run and links back to the sample", async () => {
    mockFetch([{ url: /\/summary$/, body: { ...summary, run_kind: "full", full_run: null, parent_job_id: "30000000-0000-4000-8000-000000000001" } }]);
    render(<SampleSummaryPanel jobId={summary.job_id} />);
    expect(await screen.findByRole("link", { name: /estimated from sample job/i })).toHaveAttribute("href", "/extractions/30000000-0000-4000-8000-000000000001");
    expect(screen.queryByRole("button", { name: /Run on full collection/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- tests/unit/lib/extractions/format-estimate.test.ts tests/unit/app/extractions/SampleSummaryPanel.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement helpers**

```ts
// frontend/lib/extractions/format-estimate.ts
export function formatTokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n.toLocaleString("en-US");
}
export function formatUsd(value: number | null): string {
  return value === null ? "price unavailable for this model" : `≈ $${value.toFixed(2)}`;
}
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
```

```ts
// frontend/lib/extractions/run-full.ts
export interface RunFullParams { collectionId: string; schemaId: string; language: string; parentJobId: string }
export type RunFullResult = { ok: true; jobId: string } | { ok: false; message: string };

export async function runFullExtraction(p: RunFullParams): Promise<RunFullResult> {
  const response = await fetch("/api/extractions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collection_id: p.collectionId,
      schema_id: p.schemaId,
      extraction_context: "Extract structured information from legal documents using the provided schema.",
      language: p.language,
      run_kind: "full",
      parent_job_id: p.parentJobId,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, message: data?.message || data?.error || `Request failed (${response.status})` };
  if (typeof data?.job_id !== "string") return { ok: false, message: "The server did not return a job ID." };
  return { ok: true, jobId: data.job_id };
}
```

- [ ] **Step 4: Implement the panel and mount it**

`SampleSummaryPanel({ jobId }: { jobId: string })`: `useEffect` → `fetchJobSummary(jobId)` into state (`loading | error | summary`); `EditorialCard` with eyebrow `Sample review`; table via `frontend/components/ui/table` (or a plain `<table>` styled with `border-rule`/`font-mono` numerals); estimate block; button `VariantButton intent="primary"` disabled while submitting; error → `toast.error(message)` (sonner, as in `useExtract`). Mount in `ExtractionJobClient.tsx` right after the job header `EditorialCard` (the one at line ~392 with `Extraction - <date>`), guarded by `isTerminalExtractionStatus(jobData.status)`:

```tsx
{isTerminalExtractionStatus(jobData.status) && <SampleSummaryPanel jobId={jobId} />}
```

- [ ] **Step 5: Run unit tests, lint, typecheck, route-contract**

Run: `cd frontend && npm test -- tests/unit/app/extractions/SampleSummaryPanel.test.tsx tests/unit/lib/extractions && npm run lint && npm run typecheck && npm run test:e2e:route-contract`
Expected: unit PASS. Route-contract: `extraction-path.spec.ts` will now trigger `GET /extractions/<sequenced>/summary` on the stub → **unexpected request → FAIL**. Add to `stub-services.mjs` (before the generic `extractionMatch`):

```js
const summaryMatch = url.pathname.match(/^\/extractions\/([^/]+)\/summary$/);
if (request.method === 'GET' && summaryMatch) {
  logRequest(request, url);
  sendJson(response, 200, {
    job_id: decodeURIComponent(summaryMatch[1]),
    run_kind: 'full', status: 'SUCCESS',
    collection_id: EXTRACTABLE_COLLECTION_ID, schema_id: IDS.schema.known, language: 'pl', llm_name: 'gpt-5-mini',
    sample_seed: null, sample_strata: null, parent_job_id: null,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, model: 'gpt-5-mini' },
    fields: [], full_run: null,
  });
  return;
}
```

Re-run; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/extractions/[id]/_components frontend/lib/extractions/run-full.ts frontend/lib/extractions/format-estimate.ts frontend/tests/unit/app/extractions/SampleSummaryPanel.test.tsx frontend/tests/unit/lib/extractions/format-estimate.test.ts frontend/tests/route-contract-e2e/stub-services.mjs
git commit -m "feat(extractions): sample review panel with field completeness, cost estimate and explicit full run"
```

## Child issue (c) — ZIP export (`dataset.json` + `schema.yaml` + `manifest.json`)

### Task 13: `dataset_export.py` — byte-compatible renderers + manifest + zip

**Byte compatibility contract** (from `JuDDGES/scripts/label_studio/export_annotated_dataset.py` and `label_studio_toolkit/schemas/utils.py:get_schema_string`):
- `dataset.json` = `json.dumps(rows, indent=4, ensure_ascii=False)` where `rows = [{"context": <full_text>, "output": <str>}]` and `output = json.dumps(extracted_data, ensure_ascii=False, separators=(",", ":"))` (what `model_dump_json()` emits for plain values). File written with `"w"` → no trailing newline.
- `schema.yaml` = `"\n".join(parts)` where for each field, in schema order: `"<name>:"`, `"  type: <string|integer|enum|list>"`, for enum `"  choices: <python list repr>"`, for list `"  items:"` + `"    type: <enum|string|integer>"` (+ `"    choices: [...]"` for enum), then `'  description: "<description>"'` (raw, unescaped — as the toolkit does), then `"  required: false"` only when optional, then `""`. The string therefore ends with `"\n"`.
- Types the toolkit cannot express (`number`, `boolean`, `object`, arrays of objects) are emitted with their JSON type name and reported back so the manifest can flag them.

**Files:**
- Create: `backend/app/extraction_domain/dataset_export.py`
- Create: `backend/tests/app/test_dataset_export.py`

**Interfaces:**
```python
@dataclass(frozen=True)
class DatasetRow: document_id: str; context: str; output: dict[str, Any]
def dataset_rows(results: list[dict], full_text_by_id: dict[str, str]) -> tuple[list[DatasetRow], list[str]]
    # completed rows with non-empty extracted_data and known text; second item = document ids skipped (failed / no text)
def render_dataset_json(rows: list[DatasetRow]) -> str
def schema_fields(schema_text: dict) -> list[tuple[str, dict, bool]]   # (name, property, required) — handles {name: {type,..., required: bool}} and JSON Schema {properties, required}
def render_schema_yaml(schema_text: dict) -> tuple[str, list[str]]     # (yaml, unsupported_field_names)
def build_manifest(*, job: dict, collection_name: str | None, schema_row: dict | None, rows: list[DatasetRow], skipped: list[str], unsupported: list[str], schema_yaml: str, dataset_json: str, generated_at: datetime) -> dict
def build_dataset_zip(dataset_json: str, schema_yaml: str, manifest: dict) -> bytes
```

**Manifest schema (`manifest.json`, `format_version: 1`):**

| Key | Type | Source |
|---|---|---|
| `format_version` | `1` | constant |
| `generated_at` | ISO-8601 UTC | now |
| `generator` | `{"name": "juddges-app", "compatible_with": "JuDDGES/label_studio_toolkit export_annotated_dataset"}` | constant |
| `job` | `{id, run_kind, parent_job_id, status, created_at, completed_at, language, extraction_context}` | `extraction_jobs` |
| `collection` | `{id, name}` | `extraction_jobs.collection_id`, `collections.name` |
| `schema` | `{id, name, version, text_sha256, unsupported_fields: [..]}` | `extraction_schemas` (`schema_version`), sha256 of `json.dumps(text, sort_keys=True)` |
| `prompt` | `{id, version}` | `extraction_jobs.prompt_id`, `prompt_version` (`<id>@<sha12>`) |
| `model` | `{name}` | `extraction_jobs.llm_name` |
| `documents` | `{count, ids: [...], skipped: [...], population_size}` | dataset rows / job |
| `sample` | `{seed, strata}` or `null` | job row (`run_kind == "sample"`) |
| `usage` | `{input_tokens, output_tokens, total_tokens}` | job row |
| `cost_usd` | number or `null` | `summary.usd_for_tokens(llm_name, input, output)` |
| `files` | `{"dataset.json": {"sha256", "bytes", "rows"}, "schema.yaml": {"sha256", "bytes"}}` | computed |

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/app/test_dataset_export.py
"""dataset.json / schema.yaml must be byte-identical to what
JuDDGES/scripts/label_studio/export_annotated_dataset.py writes, so a dataset
exported here can be loaded by the research tooling without conversion."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime

import pytest

from app.extraction_domain import dataset_export as dx

pytestmark = pytest.mark.unit

RESULTS = [
    {"document_id": "d1", "status": "completed", "extracted_data": {"court": "Sąd Okręgowy", "articles": ["23 KC", "24 KC"], "fine": 500}},
    {"document_id": "d2", "status": "failed", "extracted_data": None},
    {"document_id": "d3", "status": "completed", "extracted_data": {"court": "SA", "articles": [], "fine": None}},
    {"document_id": "d4", "status": "completed", "extracted_data": {"court": "x"}},  # no text → skipped
]
TEXTS = {"d1": "Sąd Okręgowy w Warszawie …", "d3": "Sąd Apelacyjny …"}


def test_dataset_rows_keep_completed_documents_with_text_in_order():
    rows, skipped = dx.dataset_rows(RESULTS, TEXTS)
    assert [r.document_id for r in rows] == ["d1", "d3"]
    assert skipped == ["d2", "d4"]


def test_dataset_json_matches_the_toolkit_bytes():
    rows, _ = dx.dataset_rows(RESULTS, TEXTS)
    rendered = dx.render_dataset_json(rows)
    expected_rows = [
        {"context": TEXTS["d1"], "output": '{"court":"Sąd Okręgowy","articles":["23 KC","24 KC"],"fine":500}'},
        {"context": TEXTS["d3"], "output": '{"court":"SA","articles":[],"fine":null}'},
    ]
    assert rendered == json.dumps(expected_rows, indent=4, ensure_ascii=False)
    assert "\\u" not in rendered  # ensure_ascii=False, like the toolkit
    assert not rendered.endswith("\n")
    for row in json.loads(rendered):
        json.loads(row["output"])  # `output` is a JSON *string*, loadable back into the schema


SIMPLE_SCHEMA = {
    "naruszenie": {"type": "string", "description": "Czy naruszono dobra osobiste", "required": True, "enum": ["Tak", "Nie"]},
    "podstawa_prawna": {"type": "array", "description": "Przepisy", "required": False, "items": {"type": "string"}},
    "kwota": {"type": "integer", "description": "Zadośćuczynienie w PLN", "required": False},
    "sad": {"type": "string", "description": "Nazwa sądu", "required": True},
}

EXPECTED_YAML = (
    "naruszenie:\n"
    "  type: enum\n"
    "  choices: ['Tak', 'Nie']\n"
    '  description: "Czy naruszono dobra osobiste"\n'
    "\n"
    "podstawa_prawna:\n"
    "  type: list\n"
    "  items:\n"
    "    type: string\n"
    '  description: "Przepisy"\n'
    "  required: false\n"
    "\n"
    "kwota:\n"
    "  type: integer\n"
    '  description: "Zadośćuczynienie w PLN"\n'
    "  required: false\n"
    "\n"
    "sad:\n"
    "  type: string\n"
    '  description: "Nazwa sądu"\n'
    "\n"
)


def test_schema_yaml_matches_get_schema_string_format():
    yaml_text, unsupported = dx.render_schema_yaml(SIMPLE_SCHEMA)
    assert yaml_text == EXPECTED_YAML
    assert unsupported == []


def test_schema_yaml_from_json_schema_shape_and_list_of_enums():
    schema = {
        "type": "object",
        "properties": {
            "outcome": {"type": "array", "description": "Outcomes", "items": {"type": "string", "enum": ["allowed", "dismissed"]}},
            "score": {"type": "number", "description": "Confidence"},
            "won": {"type": "boolean", "description": "Won?"},
        },
        "required": ["outcome"],
    }
    yaml_text, unsupported = dx.render_schema_yaml(schema)
    assert yaml_text.startswith(
        "outcome:\n  type: list\n  items:\n    type: enum\n    choices: ['allowed', 'dismissed']\n  description: \"Outcomes\"\n\n"
    )
    assert "score:\n  type: number\n" in yaml_text and "  required: false\n" in yaml_text
    assert unsupported == ["score", "won"]


def test_manifest_lists_provenance_and_file_digests():
    rows, skipped = dx.dataset_rows(RESULTS, TEXTS)
    dataset_json = dx.render_dataset_json(rows)
    schema_yaml, unsupported = dx.render_schema_yaml(SIMPLE_SCHEMA)
    job = {
        "job_id": "j1", "run_kind": "sample", "parent_job_id": None, "status": "SUCCESS",
        "created_at": "2026-09-20T10:00:00+00:00", "completed_at": "2026-09-20T10:05:00+00:00",
        "language": "pl", "extraction_context": "ctx", "collection_id": "c1", "schema_id": "s1",
        "prompt_id": "info_extraction", "prompt_version": "info_extraction@abc123def456",
        "llm_name": "gpt-5-mini", "sample_seed": "seed", "sample_strata": {"PL": 2}, "population_size": 40,
        "input_tokens": 1000, "output_tokens": 100, "document_ids": ["d1", "d2", "d3", "d4"],
    }
    manifest = dx.build_manifest(
        job=job, collection_name="Dobra osobiste", schema_row={"id": "s1", "name": "personal_rights", "schema_version": 3, "text": SIMPLE_SCHEMA},
        rows=rows, skipped=skipped, unsupported=unsupported, schema_yaml=schema_yaml, dataset_json=dataset_json,
        generated_at=datetime(2026, 9, 20, 12, 0, tzinfo=UTC),
    )
    assert manifest["format_version"] == 1
    assert manifest["generated_at"] == "2026-09-20T12:00:00+00:00"
    assert manifest["job"] == {"id": "j1", "run_kind": "sample", "parent_job_id": None, "status": "SUCCESS",
                               "created_at": job["created_at"], "completed_at": job["completed_at"],
                               "language": "pl", "extraction_context": "ctx"}
    assert manifest["collection"] == {"id": "c1", "name": "Dobra osobiste"}
    assert manifest["schema"]["id"] == "s1" and manifest["schema"]["version"] == 3
    assert len(manifest["schema"]["text_sha256"]) == 64 and manifest["schema"]["unsupported_fields"] == []
    assert manifest["prompt"] == {"id": "info_extraction", "version": "info_extraction@abc123def456"}
    assert manifest["model"] == {"name": "gpt-5-mini"}
    assert manifest["documents"] == {"count": 2, "ids": ["d1", "d3"], "skipped": ["d2", "d4"], "population_size": 40}
    assert manifest["sample"] == {"seed": "seed", "strata": {"PL": 2}}
    assert manifest["usage"] == {"input_tokens": 1000, "output_tokens": 100, "total_tokens": 1100}
    assert manifest["cost_usd"] == pytest.approx(0.00045)  # litellm gpt-5-mini price for 1000/100
    assert manifest["files"]["dataset.json"]["rows"] == 2
    assert manifest["files"]["schema.yaml"]["bytes"] == len(schema_yaml.encode("utf-8"))


def test_zip_contains_exactly_three_files_with_the_rendered_bytes():
    blob = dx.build_dataset_zip('[]', "a:\n  type: string\n  description: \"d\"\n\n", {"format_version": 1})
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        assert sorted(zf.namelist()) == ["dataset.json", "manifest.json", "schema.yaml"]
        assert zf.read("dataset.json") == b"[]"
        assert json.loads(zf.read("manifest.json")) == {"format_version": 1}
        assert zf.getinfo("schema.yaml").compress_type == zipfile.ZIP_DEFLATED
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_dataset_export.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```python
# backend/app/extraction_domain/dataset_export.py
"""Research dataset export: dataset.json + schema.yaml (byte-compatible with
JuDDGES/label_studio_toolkit) + manifest.json (provenance)."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.extraction_domain.summary import usd_for_tokens

_COMPLETED = {"completed", "success", "partially_completed"}
_SCALAR_TYPES = {"string", "integer"}


@dataclass(frozen=True)
class DatasetRow:
    document_id: str
    context: str
    output: dict[str, Any]


def dataset_rows(results: list[dict[str, Any]], full_text_by_id: dict[str, str]) -> tuple[list[DatasetRow], list[str]]:
    rows: list[DatasetRow] = []
    skipped: list[str] = []
    for result in results:
        doc_id = str(result.get("document_id", ""))
        data = result.get("extracted_data")
        text = full_text_by_id.get(doc_id)
        if str(result.get("status", "")).lower() not in _COMPLETED or not data or not text:
            skipped.append(doc_id)
            continue
        rows.append(DatasetRow(doc_id, text, data))
    return rows, skipped


def render_dataset_json(rows: list[DatasetRow]) -> str:
    payload = [
        {"context": r.context, "output": json.dumps(r.output, ensure_ascii=False, separators=(",", ":"))}
        for r in rows
    ]
    return json.dumps(payload, indent=4, ensure_ascii=False)


def schema_fields(schema_text: dict[str, Any]) -> list[tuple[str, dict[str, Any], bool]]:
    if isinstance(schema_text.get("properties"), dict):  # JSON Schema shape
        required = set(schema_text.get("required") or [])
        return [(name, prop or {}, name in required) for name, prop in schema_text["properties"].items()]
    out = []
    for name, prop in schema_text.items():  # {field: {type, description, required}}
        if isinstance(prop, str):
            prop = {"type": "string", "description": prop, "required": True}
        prop = prop or {}
        out.append((name, prop, bool(prop.get("required", True))))
    return out


def render_schema_yaml(schema_text: dict[str, Any]) -> tuple[str, list[str]]:
    parts: list[str] = []
    unsupported: list[str] = []
    for name, prop, required in schema_fields(schema_text):
        ftype = prop.get("type", "string")
        description = prop.get("description", "") or ""
        parts.append(f"{name}:")
        if ftype == "array":
            items = prop.get("items") or {}
            parts.append("  type: list")
            parts.append("  items:")
            if items.get("enum"):
                parts.append("    type: enum")
                parts.append(f"    choices: {list(items['enum'])!r}")
            elif items.get("type") in _SCALAR_TYPES:
                parts.append(f"    type: {items['type']}")
            else:
                parts.append(f"    type: {items.get('type', 'object')}")
                unsupported.append(name)
        elif prop.get("enum"):
            parts.append("  type: enum")
            parts.append(f"  choices: {list(prop['enum'])!r}")
        elif ftype in _SCALAR_TYPES:
            parts.append(f"  type: {ftype}")
        else:
            parts.append(f"  type: {ftype}")
            unsupported.append(name)
        parts.append(f'  description: "{description}"')
        if not required:
            parts.append("  required: false")
        parts.append("")
    return "\n".join(parts), unsupported


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_manifest(*, job, collection_name, schema_row, rows, skipped, unsupported, schema_yaml, dataset_json, generated_at: datetime) -> dict[str, Any]:
    input_tokens = int(job.get("input_tokens") or 0)
    output_tokens = int(job.get("output_tokens") or 0)
    schema_text = (schema_row or {}).get("text")
    return {
        "format_version": 1,
        "generated_at": generated_at.isoformat(),
        "generator": {"name": "juddges-app", "compatible_with": "JuDDGES/label_studio_toolkit export_annotated_dataset"},
        "job": {k: job.get(k) for k in ("run_kind", "parent_job_id", "status", "created_at", "completed_at", "language", "extraction_context")} | {"id": job["job_id"]},
        "collection": {"id": job.get("collection_id"), "name": collection_name},
        "schema": {
            "id": (schema_row or {}).get("id") or job.get("schema_id"),
            "name": (schema_row or {}).get("name"),
            "version": (schema_row or {}).get("schema_version"),
            "text_sha256": _sha256(json.dumps(schema_text, sort_keys=True, ensure_ascii=False)) if schema_text is not None else None,
            "unsupported_fields": unsupported,
        },
        "prompt": {"id": job.get("prompt_id"), "version": job.get("prompt_version")},
        "model": {"name": job.get("llm_name")},
        "documents": {"count": len(rows), "ids": [r.document_id for r in rows], "skipped": skipped, "population_size": job.get("population_size")},
        "sample": {"seed": job.get("sample_seed"), "strata": job.get("sample_strata")} if job.get("run_kind") == "sample" else None,
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": input_tokens + output_tokens},
        "cost_usd": usd_for_tokens(job.get("llm_name"), input_tokens, output_tokens),
        "files": {
            "dataset.json": {"sha256": _sha256(dataset_json), "bytes": len(dataset_json.encode("utf-8")), "rows": len(rows)},
            "schema.yaml": {"sha256": _sha256(schema_yaml), "bytes": len(schema_yaml.encode("utf-8"))},
        },
    }


def build_dataset_zip(dataset_json: str, schema_yaml: str, manifest: dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("dataset.json", dataset_json.encode("utf-8"))
        zf.writestr("schema.yaml", schema_yaml.encode("utf-8"))
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8"))
    return buffer.getvalue()
```

The `manifest["job"]` dict-merge order puts `id` last; the test compares dict equality so key order is irrelevant. Sort `"job"` keys explicitly if you prefer `id` first.

- [ ] **Step 4: Run tests + ruff**

Run: `cd backend && poetry run pytest tests/app/test_dataset_export.py -v && poetry run ruff check app/extraction_domain/dataset_export.py`
Expected: PASS. If the `cost_usd` approx differs, confirm with `poetry run python -c "import litellm; print(litellm.cost_per_token(model='gpt-5-mini', prompt_tokens=1000, completion_tokens=100))"` and pin the test to that sum — the pricing table is litellm's, not ours.

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/dataset_export.py backend/tests/app/test_dataset_export.py
git commit -m "feat(extraction): dataset.json/schema.yaml renderers byte-compatible with label_studio_toolkit, plus manifest"
```

### Task 14: `GET /extractions/{job_id}/export?format=zip`

**Files:**
- Modify: `backend/app/extraction_domain/results_router.py:37-297`
- Test: `backend/tests/app/test_extraction_results_router.py` (append `TestExportDatasetZip`)

**Interfaces:**
- Consumes: Task 13 functions; `app.utils.judgment_fetcher.get_documents_by_id(ids)` (async → `LegalDocument.document_id`, `.full_text`); `_SUMMARY_FIELDS`-style select.
- Produces: `StreamingResponse` `application/zip`, `Content-Disposition: attachment; filename="<collection>_<schema>_<YYYY-MM-DD>_dataset.zip"`, headers `X-Rows-Count`, `X-Skipped-Count`. Errors reuse the existing codes (`INVALID_FORMAT`, `NO_RESULTS`, `NO_COMPLETED_RESULTS`, `ACCESS_DENIED`, `JOB_NOT_FOUND`).

- [ ] **Step 1: Write the failing tests**

```python
class TestExportDatasetZip:
    _JOB = {
        "job_id": "job-1", "user_id": _USER_001, "collection_id": "c1", "schema_id": "s1", "status": "SUCCESS",
        "run_kind": "sample", "parent_job_id": None, "language": "pl", "extraction_context": "ctx",
        "prompt_id": "info_extraction", "prompt_version": "info_extraction@abc", "llm_name": "gpt-5-mini",
        "sample_seed": "seed", "sample_strata": {"PL": 1}, "population_size": 5, "input_tokens": 10, "output_tokens": 1,
        "document_ids": ["d1", "d2"], "created_at": "2026-09-20T10:00:00+00:00", "completed_at": "2026-09-20T10:05:00+00:00",
        "results": [
            {"document_id": "d1", "status": "completed", "extracted_data": {"sad": "SO Warszawa"}},
            {"document_id": "d2", "status": "failed", "extracted_data": None},
        ],
    }

    def _supabase(self):
        def table(name):
            t = MagicMock()
            data = {
                "extraction_jobs": self._JOB,
                "collections": {"name": "Dobra osobiste"},
                "extraction_schemas": {"id": "s1", "name": "personal_rights", "schema_version": 2,
                                       "text": {"sad": {"type": "string", "description": "Sąd", "required": True}}},
            }[name]
            t.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(data=data)
            return t
        sb = MagicMock()
        sb.table.side_effect = table
        return sb

    @pytest.mark.unit
    async def test_zip_export_streams_three_files(self, client, valid_api_headers) -> None:
        import io, json, zipfile
        _install_jwt_user_override(_USER_001)
        docs = [type("Doc", (), {"document_id": "d1", "full_text": "Treść wyroku"})()]
        with (
            patch("app.extraction_domain.results_router.supabase", self._supabase()),
            patch("app.extraction_domain.results_router.get_documents_by_id", AsyncMock(return_value=docs)),
        ):
            response = await client.get("/extractions/job-1/export?format=zip", headers={**valid_api_headers, **_BEARER_HEADERS})
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        assert response.headers["content-disposition"].endswith('_dataset.zip"')
        assert response.headers["x-rows-count"] == "1" and response.headers["x-skipped-count"] == "1"
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            assert sorted(zf.namelist()) == ["dataset.json", "manifest.json", "schema.yaml"]
            dataset = json.loads(zf.read("dataset.json"))
            assert dataset == [{"context": "Treść wyroku", "output": '{"sad":"SO Warszawa"}'}]
            assert zf.read("schema.yaml").decode() == 'sad:\n  type: string\n  description: "Sąd"\n\n'
            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["schema"] == {"id": "s1", "name": "personal_rights", "version": 2, "text_sha256": manifest["schema"]["text_sha256"], "unsupported_fields": []}
            assert manifest["documents"]["skipped"] == ["d2"]
            assert manifest["sample"] == {"seed": "seed", "strata": {"PL": 1}}

    @pytest.mark.unit
    async def test_zip_export_denies_other_users(self, client, valid_api_headers) -> None:
        _install_jwt_user_override(_USER_099)
        with patch("app.extraction_domain.results_router.supabase", self._supabase()):
            response = await client.get("/extractions/job-1/export?format=zip", headers={**valid_api_headers, **_BEARER_HEADERS})
        assert response.status_code == 403
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_extraction_results_router.py -k Zip -v`
Expected: FAIL — 400 `INVALID_FORMAT`.

- [ ] **Step 3: Implement**

In `export_extraction_results`: allow `format in ("xlsx", "csv", "zip")`; widen the job select to `"job_id, user_id, collection_id, schema_id, results, status, run_kind, parent_job_id, language, extraction_context, prompt_id, prompt_version, llm_name, sample_seed, sample_strata, population_size, input_tokens, output_tokens, document_ids, created_at, completed_at"`; after the ownership + `NO_RESULTS` checks and the collection-name lookup, branch:

```python
        if format == "zip":
            return await _export_dataset_zip(job_data, results, collection_name)
```

and add (module level, import `from app.utils.judgment_fetcher import get_documents_by_id` and the Task 13 functions):

```python
async def _export_dataset_zip(job_data: dict, results: list[dict], collection_name: str) -> StreamingResponse:
    schema_row = None
    if job_data.get("schema_id"):
        try:
            schema_response = (
                supabase.table("extraction_schemas").select("id, name, schema_version, text")
                .eq("id", job_data["schema_id"]).single().execute()
            )
            schema_row = schema_response.data or None
        except Exception as e:
            logger.warning(f"Schema lookup failed for export manifest: {e}")

    completed_ids = [r["document_id"] for r in results if str(r.get("status", "")).lower() in ("completed", "success", "partially_completed")]
    documents = await get_documents_by_id(completed_ids) if completed_ids else []
    texts = {doc.document_id: doc.full_text for doc in documents}

    rows, skipped = dataset_rows(results, texts)
    if not rows:
        raise HTTPException(status_code=400, detail={"error": "No Completed Results", "message": "No completed results with data available to export", "code": "NO_COMPLETED_RESULTS"})
    dataset_json = render_dataset_json(rows)
    schema_yaml, unsupported = render_schema_yaml((schema_row or {}).get("text") or {})
    manifest = build_manifest(job=job_data, collection_name=collection_name, schema_row=schema_row, rows=rows,
                              skipped=skipped, unsupported=unsupported, schema_yaml=schema_yaml,
                              dataset_json=dataset_json, generated_at=datetime.now(UTC))
    blob = build_dataset_zip(dataset_json, schema_yaml, manifest)

    safe = lambda s: "".join(c if c.isalnum() or c in "-_" else "-" for c in s)
    parts = [safe(collection_name), safe((schema_row or {}).get("name") or ""), datetime.now(UTC).strftime("%Y-%m-%d"), "dataset"]
    filename = "_".join(p for p in parts if p) + ".zip"
    return StreamingResponse(BytesIO(blob), media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Rows-Count": str(len(rows)), "X-Skipped-Count": str(len(skipped)),
    })
```

(Move `from io import BytesIO` / `StreamingResponse` imports to module level; ruff will flag the lambda — use a small `def _safe(s)` instead.)

- [ ] **Step 4: Run tests + ruff + existing export tests**

Run: `cd backend && poetry run pytest tests/app/test_extraction_results_router.py -v -m unit && poetry run ruff check app tests && poetry run ruff format --check app tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/results_router.py backend/tests/app/test_extraction_results_router.py
git commit -m "feat(extraction): ZIP dataset export (dataset.json, schema.yaml, manifest.json)"
```

### Task 15: Frontend — "Export dataset (ZIP)" button + BFF content type

**Files:**
- Create: `frontend/app/extractions/[id]/_components/ExportDatasetButton.tsx`
- Create: `frontend/tests/unit/app/extractions/ExportDatasetButton.test.tsx`
- Modify: `frontend/app/api/extractions/[id]/export/route.ts:90-93` (zip fallback content type), `frontend/app/extractions/[id]/_components/ExtractionJobClient.tsx` (mount next to the header card actions, terminal jobs only)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { ExportDatasetButton } from "@/app/extractions/[id]/_components/ExportDatasetButton";

describe("ExportDatasetButton", () => {
  it("links to the zip export for the job", () => {
    render(<ExportDatasetButton jobId="30000000-0000-4000-8000-000000000007" disabled={false} />);
    const link = screen.getByRole("link", { name: /export dataset \(zip\)/i });
    expect(link).toHaveAttribute("href", "/api/extractions/30000000-0000-4000-8000-000000000007/export?format=zip");
    expect(link).toHaveAttribute("download");
  });
  it("renders a disabled control while the job is still running", () => {
    render(<ExportDatasetButton jobId="x" disabled />);
    expect(screen.getByRole("button", { name: /export dataset/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npm test -- tests/unit/app/extractions/ExportDatasetButton.test.tsx` → module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportDatasetButton({ jobId, disabled }: { jobId: string; disabled: boolean }) {
  const href = `/api/extractions/${encodeURIComponent(jobId)}/export?format=zip`;
  const className = "rounded-none border-rule text-ink font-mono text-xs hover:border-ink hover:bg-parchment-deep gap-1.5";
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled className={className} title="Available once the job has finished">
        <Archive className="h-3.5 w-3.5" /> Export dataset (ZIP)
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <a href={href} download title="dataset.json + schema.yaml + manifest.json (label_studio_toolkit format)">
        <Archive className="h-3.5 w-3.5" /> Export dataset (ZIP)
      </a>
    </Button>
  );
}
```

Mount in `ExtractionJobClient.tsx` inside the header card next to the title (`<h3 className="editorial-display ...">Extraction - …</h3>` → wrap in a `flex items-center justify-between` row) with `disabled={!isTerminalExtractionStatus(jobData.status)}`.

In `[id]/export/route.ts` the content-type fallback becomes:

```ts
      (format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : format === 'zip'
          ? 'application/zip'
          : 'text/csv; charset=utf-8');
```

and forward `X-Skipped-Count` alongside `X-Rows-Count`.

- [ ] **Step 4: Run tests, lint, typecheck** — `cd frontend && npm test -- tests/unit/app/extractions && npm run lint && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/extractions/[id]/_components/ExportDatasetButton.tsx frontend/app/extractions/[id]/_components/ExtractionJobClient.tsx frontend/app/api/extractions/[id]/export/route.ts frontend/tests/unit/app/extractions/ExportDatasetButton.test.tsx
git commit -m "feat(extractions): Export dataset (ZIP) button and zip passthrough in the BFF"
```

## Child issue (d) — `extractions.spec.ts` into the required CI checks (#583)

**Decision.** The spec needs a logged-in user. The only PR-gated harness that can log one in without a real Supabase project is the route-contract harness (`Frontend Route Contract (Chromium)`, required by branch protection), which boots the standalone Next server against `stub-services.mjs` and sets a synthetic `sb-127-auth-token` cookie. So the spec **moves** to `frontend/tests/route-contract-e2e/extractions.spec.ts`; the browser-level `page.route` mocks it already uses keep working there (they intercept before the request reaches the stub). This is the same reasoning recorded at the top of `extraction-path.spec.ts` (#579). Adding a second authenticated Playwright project with real Supabase secrets to CI was rejected: it would put production credentials in PR runs from forks and make the check flaky on Supabase availability.

### Task 16: Move `/search/extractions` spec into the route-contract harness

**Files:**
- Move: `frontend/tests/e2e/search/extractions.spec.ts` → `frontend/tests/route-contract-e2e/extractions.spec.ts` (`git mv`)
- Create: `frontend/tests/route-contract-e2e/synthetic-session.ts` (extracted from `extraction-path.spec.ts:97-131`)
- Modify: the moved file (fixture + mocks), `frontend/tests/route-contract-e2e/extraction-path.spec.ts` (import the helper), `frontend/tests/e2e/search/README.md` (new location, `npm run test:e2e:route-contract`)

**Interfaces:**
- `synthetic-session.ts` exports `setSyntheticSession(context: BrowserContext): Promise<void>`, `APP_BASE_URL`, `ADAPTER_BASE_URL`, `USER_ID` — body copied verbatim from `extraction-path.spec.ts`. `lint:route-contract-harness` lints the whole directory, so it is covered automatically.
- Browser-level mock for `**/api/extractions/base-schema/filter-options` (the page loads it at mount; the real backend used to answer it and the stub must never see it):

```ts
const FILTER_OPTIONS_API = '**/api/extractions/base-schema/filter-options';
const FILTER_OPTIONS = {
  fields: [
    { field: 'offender_gender', type: 'string', filter_type: 'facet', label: 'Gender', order: 1, description: '', enum_values: ['gender_female', 'gender_male'] },
    { field: 'co_def_acc_num', type: 'number', filter_type: 'range', label: 'Co-defendants count', order: 2, description: '', enum_values: null },
  ],
};
```

- [ ] **Step 1: Move the file and switch the fixture**

```bash
cd frontend && git mv tests/e2e/search/extractions.spec.ts tests/route-contract-e2e/extractions.spec.ts
```

In the moved file: replace `import { test, expect } from '../helpers/auth-fixture';` with `import { test, expect } from '@playwright/test';` and `import { setSyntheticSession, ADAPTER_BASE_URL } from './synthetic-session';`; fix the type import to `'../../types/base-schema-filter'`; add a helper

```ts
async function openPage(context: BrowserContext): Promise<Page> {
  await setSyntheticSession(context);
  const page = await context.newPage();
  await mockExtractionApis(page);
  return page;
}
```

and change every test signature from `async ({ authenticatedPage: page })` to `async ({ context }) => { const page = await openPage(context); ...` (remove the `beforeEach` that called `mockExtractionApis(authenticatedPage)`). Add the `FILTER_OPTIONS_API` route (`route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FILTER_OPTIONS) })`) inside `mockExtractionApis`.

- [ ] **Step 2: Run it and read the adapter log for anything unmocked**

Run: `cd frontend && npm run test:e2e:route-contract -- tests/route-contract-e2e/extractions.spec.ts`
Expected first run: may FAIL on drawer control labels if the real backend's `filter-options` labels differ from `FILTER_OPTIONS` (`Gender`, `Co-defendants count minimum` come from `FilterFieldConfig.label` — fix `FILTER_OPTIONS`, never the assertions), or on an unexpected stub request. For the latter, while the harness is up (`npx playwright test --config=playwright.route-contract.config.ts --debug`): `curl -s http://127.0.0.1:4311/__route-contract/requests | jq '.requests[] | select(.unexpected)'`, then add either a `page.route` mock in the spec (page-specific data) or a stub route in `stub-services.mjs` (cross-page infrastructure such as `/rest/v1/profiles`). Re-run until green.

- [ ] **Step 3: Add the afterEach guard and README**

Append inside the `describe`:

```ts
  test.afterEach(async ({ request }) => {
    const response = await request.get(`${ADAPTER_BASE_URL}/__route-contract/requests`);
    const { requests } = (await response.json()) as { requests: Array<{ unexpected?: boolean }> };
    expect(requests.filter((r) => r.unexpected)).toEqual([]);
  });
```

Update `frontend/tests/e2e/search/README.md` lines 3, 34, 58: the spec now lives in `tests/route-contract-e2e/extractions.spec.ts`, runs on every PR via `Frontend Route Contract (Chromium)`, command `npm run test:e2e:route-contract`.

- [ ] **Step 4: Run the whole route-contract suite + harness lint**

Run: `cd frontend && npm run lint:route-contract-harness && npm run test:e2e:route-contract`
Expected: PASS (route-status, extraction-path, extractions).

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/route-contract-e2e frontend/tests/e2e/search/README.md
git commit -m "test(e2e): run the /search/extractions spec in the PR-gated route-contract harness (#583)"
```

### Task 17: Extend `extraction-path.spec.ts` with the research flow

**Files:**
- Modify: `frontend/tests/route-contract-e2e/extraction-path.spec.ts`, `frontend/tests/route-contract-e2e/stub-services.mjs`

**Stub additions (`stub-services.mjs`):**
- `collectionResponse`: when `collectionId === EXTRACTABLE_COLLECTION_ID` answer `name: 'Route contract extraction collection'`, `document_count: EXTRACTABLE_DOCUMENT_IDS.length`, `documents: EXTRACTABLE_DOCUMENT_IDS` (the detail page's server loader calls `GET /collections/{id}?limit=20`, `lib/server/collection-detail.ts:121`).
- A second, sampleable collection: `SAMPLEABLE_COLLECTION_ID = '50000000-0000-4000-8000-000000000002'` with 25 ids `route-contract-sample-document-${i}`; add it to `collectionListResponse` and `collectionResponse`, and make `collectionDocumentsResponse(collectionId)` return the matching list.
- `GET /extractions/{id}/export` with `format=zip`: respond `200`, headers `content-type: application/zip`, `content-disposition: attachment; filename="Route-contract-extraction-collection_Route-contract-schema_2026-09-20_dataset.zip"`, body `Buffer.from([0x50, 0x4b, 0x03, 0x04])` (the spec asserts the download's suggested filename, not the archive). Add `'format'` to `LOGGABLE_QUERY_KEYS`.
- `GET /extractions/{sequenced}/summary` (added in Task 12) → return `run_kind: 'sample'`, `fields: [{ field: 'ruling_summary', filled: 2, empty: 0, empty_ratio: 0 }]`, `full_run: { population_size: 2, sample_documents: 2, documents_with_usage: 2, sample_input_tokens: 2000, sample_output_tokens: 200, estimated_input_tokens: 2000, estimated_output_tokens: 200, estimated_total_tokens: 2200, estimated_cost_usd: 0.01, method: 'sample_tokens * population_size / sample_documents' }` so the panel renders the estimate.

- [ ] **Step 1: Write the failing tests (append inside the serial describe)**

```ts
const SAMPLEABLE_COLLECTION_ID = '50000000-0000-4000-8000-000000000002'; // mirrors stub-services.mjs

  test('the collection page hands the collection to /extract', async ({ context }) => {
    await setSyntheticSession(context);
    const page = await context.newPage();
    await page.goto(`/collections/${EXTRACTABLE_COLLECTION_ID}`);
    await page.getByRole('link', { name: 'Extract' }).click();
    await expect(page).toHaveURL(new RegExp(`/extract\\?collection=${EXTRACTABLE_COLLECTION_ID}$`));
    // Preselected: the collection button shows the name instead of the placeholder.
    await expect(page.getByRole('button', { name: COLLECTION_NAME })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select a collection' })).toHaveCount(0);
    await page.close();
  });

  test('a large collection defaults to a 20-document sample and posts run_kind=sample', async ({ context }) => {
    await setSyntheticSession(context);
    const page = await context.newPage();
    await page.goto(`/extract?collection=${SAMPLEABLE_COLLECTION_ID}`);
    await page.getByRole('button', { name: 'Select a schema' }).click();
    await page.getByRole('option', { name: SCHEMA_NAME }).click();
    await expect(page.getByRole('radio', { name: /sample first/i })).toBeChecked();
    await expect(page.getByText('20 of 25 documents')).toBeVisible();
    const submission = page.waitForRequest(
      (req) => req.url() === `${APP_BASE_URL}/api/extractions` && req.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Start Sample Extraction (20 of 25 documents)' }).click();
    const body = (await submission).postDataJSON() as { run_kind: string; sample_size: number; document_ids: string[] };
    expect(body.run_kind).toBe('sample');
    expect(body.sample_size).toBe(20);
    expect(body.document_ids).toHaveLength(25); // the backend samples; the browser sends the population
    await page.close();
  });

  test('a finished job shows the sample review and exports a dataset zip', async ({ context }) => {
    await setSyntheticSession(context);
    const page = await context.newPage();
    await page.goto(`/extractions/${SEQUENCED_JOB_ID}`);
    await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('cell', { name: 'ruling_summary' })).toBeVisible();
    await expect(page.getByText(/2,200 tokens for 2 documents/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run on full collection (2 documents)' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: /export dataset \(zip\)/i }).click();
    expect((await download).suggestedFilename()).toMatch(/_dataset\.zip$/);
    await page.close();
  });
```

Note: the first existing test consumes the sequenced job's steps; `resetAdapter` in `beforeEach` resets `sequencedPolls`, so the third test above sees the sequence from PENDING again — hence the 30 s timeout on `COMPLETED`.

- [ ] **Step 2: Run to verify they fail** — `cd frontend && npm run test:e2e:route-contract -- tests/route-contract-e2e/extraction-path.spec.ts` → FAIL (no Extract link / unexpected stub requests).

- [ ] **Step 3: Implement the stub additions listed above**, then re-run until PASS. The `afterEach` "no unexpected request" guard names the stub route that is still missing.

- [ ] **Step 4: Full suite** — `cd frontend && npm run lint:route-contract-harness && npm test -- tests/unit/test-harness && npm run test:e2e:route-contract` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/route-contract-e2e
git commit -m "test(e2e): cover collection → sample → review → zip export on every PR"
```

### Task 18: Documentation

**Files:**
- Modify: `docs/tutorials/first-30-minutes.md` — the "build the collection first, then point an extraction job at it" passage becomes the guided flow: Extract button → sample first → review completeness + estimate → Run on full collection → Export dataset (ZIP).
- Create: `docs/reference/extraction-dataset-export.md` — ZIP contents; byte-compat statement linking `JuDDGES/label_studio_toolkit/docs/export.md`; the manifest table from Task 13; `unsupported_fields` semantics; `GET /extractions/{job_id}/export?format=zip`; `GET /extractions/{job_id}/summary` response; new request fields (`run_kind`, `sample_size`, `sample_seed`, `parent_job_id`); the sampling rule (deterministic, stratified by `jurisdiction`, seed = sha256 of the sorted document set unless given).
- Modify: `docs/reference/ROUTES_AUDIT.md` — add `GET /api/extractions/[id]/summary`, `format=zip` on export.
- Modify: `docs/reference/supabase-complete-reference.md` — the ten new `extraction_jobs` columns (only if the file documents that table).

- [ ] **Step 1: Write the docs.** Check `.github/workflows/docs.yml` for the markdown linter it runs and run the same command locally.
- [ ] **Step 2: Commit** — `git commit -m "docs: research flow (sample → review → full run → dataset export)"`.

### Task 19: Final verification and PR

- [ ] `cd backend && poetry run poe check-all` — green.
- [ ] `cd frontend && npm ci && npm run validate && npm run typecheck && npm test && npm run test:e2e:route-contract && npm run test:e2e:smoke` — green.
- [ ] `docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17`, then `cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres poetry run pytest -m db` — green.
- [ ] Manual smoke against the dev stack (`docker compose -f docker-compose.dev.yml up -d backend-dev backend-worker-dev`) needs a funded LLM key (#546). If unavailable, state in the PR that the worker usage path is verified by unit tests only and open a follow-up to run one 2-document sample (this is #507 option C).
- [ ] One PR per child issue, or one epic PR with `Closes #<a> #<b> #<c> #<d>` and `Refs #583 #575 #537 #507 #546`. Merge with `gh pr merge <n> --merge --delete-branch`.

---

## Risks, unknowns, and issues to link

| # | Risk / unknown | Mitigation in this plan |
|---|---|---|
| 1 | **`extraction_schemas` is empty in prod (#537)** — AC 1 "base + extensions" cannot show a base schema row that does not exist; the base schema lives in code (`BaseSchemaExtractor.universal_legal_document_base_schema`). | Task 2 only orders/labels; the seed row is #537's deliverable. Link #537 as a dependency of child (a); do not block the epic on it. |
| 2 | **OpenAI key is dead / `LLM_BASE_URL` may point at Ollama (#546)** — no end-to-end sample run can be verified here; a non-OpenAI server may omit `usage` → `usage: null`. | Token capture is unit-tested with a fake handler (Task 8); the estimate reports `documents_with_usage` and degrades to `null` cost instead of inventing numbers (Task 9). Follow-up per #507 option C once a key is funded. |
| 3 | **Pipeline not exercised since the Next 16 / pytest-asyncio upgrades (#507)** | The plan does not change the LLM call itself; the first real sample run answers #507. |
| 4 | **Latent `schema_id NULL` on `/extractions/db` jobs** — `extraction_jobs = 0` in prod today, so no backfill; new rows carry it (Tasks 6–7). Recent-extractions will start listing jobs that were previously filtered out. | Covered by tests in Tasks 6–7; call it out as a bug fix in the PR. |
| 5 | **USD comes from litellm's pricing table** (`gpt-5-*`), not from OpenAI billing; meaningless when `LLM_BASE_URL` points elsewhere. | Show "≈", print `method`, `null` when litellm has no price. |
| 6 | **`schema.yaml` for types the toolkit cannot express** (`number`, `boolean`, `object`, arrays of objects); descriptions are written unescaped exactly like the toolkit (a `"` inside breaks YAML there too). | Emit JSON type names and list them in `manifest.schema.unsupported_fields` (Task 13); document it. |
| 7 | **`get_documents_by_id` on export** loads up to 1000 full texts in one request. | Acceptable for v1 (`MAX_DOCUMENTS_PER_JOB`); chunk by 100 in `_export_dataset_zip` if it bites. |
| 8 | **Drawer labels in the moved `extractions.spec.ts`** now come from a browser mock, so a backend `filter-options` label change no longer fails this spec — it becomes a UI contract. | Say so in the spec header; `tests/e2e/search/README.md` keeps the real-backend recipe for the dispatch-only suite. |
| 9 | **Inert assertions in `schema-extraction-flow.spec.ts` (#575)** still look like extraction coverage. | Out of scope; Task 17 provides real PR-gated coverage. Link #575 and propose deleting that spec in its own PR. |
| 10 | **20 documents may show a legitimately rare field as 100 % empty.** | UI copy says "empty in the sample"; strata are shown. Not a code fix. |
| 11 | **Contextvar callback and Celery prefork**: `get_usage_metadata_callback` relies on the LLM call running in the same thread as the `with` block; `loop.run_until_complete` guarantees that here, but a future move to `asyncio.to_thread` would silently drop usage. | Task 8's test fails if `usage` disappears from results — keep it. |
| 12 | **Idempotency key change** (Task 6): a sample and a full run over the same set are distinct jobs; a re-submitted sample with the same seed still collapses onto the in-flight job. | Tested in Task 6. |

Issues to link: **#537** (seed base schema — dependency of AC 1), **#507** (pipeline verification — the first real sample run is its option C), **#546** (dead LLM key — blocks manual verification), **#583** (closed by Task 16), **#575** (referenced; the inert spec is not deleted here).

---

## Shared building blocks

Modules this plan introduces that the NL-filter→collection feature (`/search/extractions` → "Save as collection") and the PL↔UK compare page (paired collections) could reuse, with an honest note on how shareable each really is.

| Building block | Interface sketch | Reuse potential |
|---|---|---|
| `backend/app/extraction_domain/sampling.py` — `stratified_sample(items: Sequence[tuple[str, str \| None]], size: int, seed: str) -> SampleResult` | Pure; `items = (document_id, stratum)`; deterministic per seed; proportional + min-1 per stratum. | **Genuinely shared.** NL-filter→collection can sample a filter result before saving; the compare page can draw *paired* samples by calling it once per jurisdiction (or pass `stratum = f"{jurisdiction}:{year}"` for finer pairing). Knows nothing about extraction jobs. |
| `sampling.fetch_jurisdictions(client, ids) -> dict[str, str \| None]` | Supabase lookup by `id`/`source_id`, chunked. | **Shared** — anything with ids that needs jurisdictions (compare page: split a mixed collection into PL/UK halves). |
| `sampling.apply_run_kind(document_ids, *, run_kind, sample_size, sample_seed, client) -> SampleResult \| None` | Glue for the submit path. | **Feature-specific** (extraction submit); others call `stratified_sample` directly. |
| Migration `20260920000001_extraction_jobs_research_flow.sql` — `run_kind`, `parent_job_id`, `population_size`, `sample_*`, `llm_name`, `prompt_version`, `input_tokens`, `output_tokens` | Additive columns on `extraction_jobs`. | **Partly shared.** Token totals and `llm_name`/`prompt_version` serve any per-job cost/provenance display. `parent_job_id` is a single parent link, *not* a pairing — the compare page should add its own `comparison_id`/join table rather than overload it. |
| `backend/app/extraction_domain/summary.py` — `field_completeness(results) -> list[FieldCompleteness]`, `flatten(obj)`, `is_empty_value(v)`, `EMPTY_MARKERS` | Pure over a list of result dicts. | **Genuinely shared.** The compare page's core table (field × jurisdiction completeness) is `field_completeness(pl_results)` vs `field_completeness(uk_results)`. `EMPTY_MARKERS` also matches the known data defects (`APP_STATUS_2026-08-21.md §4`: empty `outcome`, `cited_legislation`). |
| `summary.usd_for_tokens(model, input_tokens, output_tokens) -> float \| None`; `summary.estimate_full_run(...)` | litellm price lookup with `None` fallback; sample→population extrapolation. | `usd_for_tokens` **shared** (any cost display); `estimate_full_run` **feature-specific**. |
| `GET /extractions/{job_id}/summary` → `ExtractionJobSummaryResponse` | Owner-scoped; completeness + estimate + lineage. | **Shared read model** — the compare page fetches two and diffs `fields`; NL-filter does not need it. |
| `backend/app/extraction_domain/dataset_export.py` — `render_dataset_json(rows)`, `render_schema_yaml(schema_text) -> (yaml, unsupported)`, `build_manifest(...)`, `build_dataset_zip(...)` | Pure renderers, toolkit-byte-compatible. | **Genuinely shared.** A compare export = two `render_dataset_json` calls (`dataset_pl.json`, `dataset_uk.json` — adding a jurisdiction key inside `output` would break byte-compat) + one `schema.yaml`; `build_manifest` takes `job` as a plain dict, so a comparison manifest can wrap two. |
| `shared.prompt_fingerprint(prompt_id) -> str` | `<id>@<sha12>` of the jinja2 template. | **Shared** — any feature that must record which prompt produced a result (NL-filter generation can fingerprint its own prompt). |
| Request fields `run_kind`, `sample_size`, `sample_seed`, `parent_job_id` on `SimpleExtractionRequest` + Zod `extractionRequestSchema` | Validated end-to-end. | **Shared** by anything that submits extraction jobs ("save as collection and extract a sample now"). |
| `frontend/app/extract/_components/run-mode.ts` — `resolveRunPlan(selectedCount, mode) -> RunPlan`; `RunModeSelector` | Pure plan/label logic + radio group. | **Shared UI** for any surface that launches an extraction (a "Save as collection and extract" dialog on `/search/extractions`). |
| `frontend/lib/extractions/summary-contract.ts` — types, `normalizeJobSummary`, `fetchJobSummary(jobId)` | Client contract for the summary endpoint. | **Shared** with the compare page (fetch two). |
| `frontend/lib/extractions/format-estimate.ts` — `formatTokens`, `formatUsd`, `percent` | Formatting only. | **Shared**, trivially. |
| `frontend/lib/extractions/run-full.ts` — `runFullExtraction({collectionId, schemaId, language, parentJobId})` | POST helper. | **Feature-specific** (`parent_job_id` semantics); a generic `submitExtraction` already exists in `frontend/app/extract/_components/data.ts` — the compare page should use that one. |
| `frontend/app/collections/[id]/_components/ExtractFromCollectionButton.tsx` | `{collectionId, documentCount}` → link to `/extract?collection=`. | **Shared** — the NL-filter→collection flow ends on `/collections/{id}` and gets this button for free; a compare page listing two collections renders it twice. |
| `frontend/tests/route-contract-e2e/synthetic-session.ts` — `setSyntheticSession(context)`, base URLs, `USER_ID` | Test helper extracted from `extraction-path.spec.ts`. | **Shared test infrastructure** for every future authenticated PR-gated spec (both other features need it). |
| Stub fixtures in `stub-services.mjs`: `SAMPLEABLE_COLLECTION_ID` (25 docs), `GET /extractions/{id}/summary`, `GET /extractions/{id}/export?format=zip`, per-id `collectionResponse` | Deterministic backend doubles. | **Shared test infrastructure**; the compare page will want a second jurisdiction-tagged collection — extend `collectionDocumentsResponse(collectionId)` rather than add a parallel mechanism. |

Not shareable / deliberately not built: a generic "job pairing" model (the compare page needs its own), a Hugging Face push (out of scope), per-field HITL (out of scope), a schema marketplace (#60).
