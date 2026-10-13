# Extraction Path Usable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a pilot user find the extraction feature, run a 500-document job, survive a worker restart without paying OpenAI twice, and have that whole path guarded by a test that runs on every pull request.

**Architecture:** Four changes in dependency order. First stop the task's outer exception handler from destroying completed per-document results, because everything else builds on those results being durable. Then rehydrate them at task start and skip documents already `COMPLETED`, which turns a redelivered task from a full replay into a resume. Then surface that resumption in the UI so an interrupted job reads as recovery rather than as a bug. Finally close the discovery dead end with an empty-state call to action, and put one end-to-end test over the whole path in the required CI set.

**Tech Stack:** Celery + Redis, FastAPI, Supabase (Postgres), Next.js 15 App Router, pytest, Jest, Playwright.

**Spec:** The "Audit findings" section below. Every row was verified directly against the code on 2026-09-02/03 with a `file:line` citation. There is no separate spec document.

## Global Constraints

- Branch from `origin/main`. Branch name `fix/<issue>-<slug>` or `feat/<issue>-<slug>`; the issue number is mandatory — create the GitHub issue first if one does not exist.
- All work happens in a git worktree under `.worktrees/`, never in the main checkout.
- Conventional Commits, `<type>(<scope>): <subject>`, imperative, lowercase, no trailing period, subject ≤72 chars, `Refs #<issue>` in the footer. No Claude/co-author footers.
- Backend tests must be marked `@pytest.mark.unit` or `@pytest.mark.integration`. Only `-m unit` runs in the required `Backend Unit Tests` check.
- Backend lint/format is Ruff. Frontend is TypeScript strict mode.
- **`poetry` lives in `/home/laugustyniak/miniconda3/bin` and is not always on `PATH`.** Prepend that directory rather than concluding poetry is missing.
- **The backend unit suite takes ~610s and the Bash tool hard-caps at 600000ms.** Run it with `run_in_background` and wait for the completion notification. Never poll with Monitor or a sleep loop.
- **`pytest` output hides success.** `addopts=-q` plus `console_output_style=count` swallows the final "N passed" line in a non-tty run. The exit code is the only reliable signal; `-m unit` collects ~2425.
- A fresh worktree has no `node_modules` and no virtualenv. Run `npm ci` in `frontend/` and `poetry install` in `backend/` before the first code commit.
- Adding a backend endpoint drifts the OpenAPI snapshot. This plan adds no endpoint, but if that changes, run `./scripts/regen_openapi_types.sh` and commit both regenerated files.
- Merge with `gh pr merge <n> --merge --delete-branch`. Squash and rebase are disabled repo-side.

---

## Audit findings this plan implements

| ID | Finding | Evidence |
|---|---|---|
| B1 | The task's outer exception handler builds a `FAILED` entry for **every** `request.document_ids` and overwrites the whole `results` column with it. A worker restart followed by an early failure in the redelivered attempt destroys every completed result from the previous attempt. | `backend/app/workers.py:771-773` (loop over all `document_ids`), `:794-797` (overwriting write) |
| B2 | Per-document results **are** durable — `_update_job_results_in_supabase` is called inside the loop after every document, not only at the end. | `backend/app/workers.py:694-701`, write body at `:251-260` |
| B3 | The in-memory `results` list is initialised empty and **never rehydrated** from Supabase. A redelivered task therefore restarts at document zero and re-bills OpenAI for work already done. | `backend/app/workers.py:604`; `grep 'select("results")' backend/app/workers.py` → no hits |
| B4 | The stored shape is a JSON array of objects each carrying `document_id` and `status` (`completed` / `failed`), which is sufficient to determine what to skip. | `supabase/migrations/20260807000001_create_extraction_jobs_table.sql:44`; `backend/app/models.py:458-467`, status enum at `:107-108` |
| B5 | `_claim_job` bumps `attempts` and resets `heartbeat_at`/`status` but does not read `results` or filter `document_ids`. `completed_documents` survives a redelivery but nothing reads it back. | `backend/app/workers.py:299-343` |
| B6 | `_try_resubmit_job` rebuilds the request from `job_data["document_ids"]` — the full, unfiltered original list. | `backend/app/extraction_domain/jobs_router.py:363-431` |
| B7 | The sidebar's own docstring lists "Extraction" as a primary action, but the only extraction item is `navigation.searchExtractedData` → `/search/extractions`, which *searches already-extracted data*. There is no navigation path to `/extract`, which *produces* it. | `frontend/components/app-sidebar.tsx:3-14` (philosophy), `:289-295` (the item) |
| B8 | The empty state on `/search/extractions` explains that extraction must happen first and offers no way to start one. | `frontend/app/search/extractions/page.tsx:236-250` |
| B9 | No test at any layer launches an extraction job. `frontend/tests/e2e/schemas/schema-extraction-flow.spec.ts` mocks `/api/schemas/schema-1/extract`, a route that does not exist, and guards its 7 `expect()` calls behind 28 `.catch(() => false)`. The whole `frontend-e2e` job is `workflow_dispatch`-only. | tracked in issue #575 |

**Decisions taken during grilling, not to be relitigated:**

- Discovery is fixed with an empty-state call to action, **not** a new sidebar item. The sidebar was deliberately cut from 23 items and that decision stands.
- On resume, documents recorded `COMPLETED` are skipped; documents recorded `FAILED` are **retried**, because a failure may have been transient.
- Resumption is shown to the user explicitly, not handled silently.
- CI gets a narrow, PR-gated end-to-end test covering the extraction path only. Repairing the rest of the Playwright suite is issue #575's scope, not this plan's.

**Out of scope** (Plan C): extraction provenance columns, publishable export with a datasheet and JSONL, and human validation of extracted values.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/app/workers.py` (modify) | Three separate concerns: stop the outer handler destroying results (Task 1); rehydrate and skip on resume (Task 2); record what was skipped so the API can report it (Task 2). |
| `backend/tests/app/test_extraction_resume.py` (create) | The resume contract: what is skipped, what is retried, and that a late failure cannot erase completed work. |
| `frontend/app/extractions/[id]/_components/ExtractionJobClient.tsx` (modify) | Shows the resumption notice. |
| `frontend/__tests__/app/extractions/resume-notice.test.tsx` (create) | Proves the notice appears with real numbers and stays absent on a first run. |
| `frontend/app/search/extractions/page.tsx` (modify) | Empty state gains a call to action to `/extract`. |
| `frontend/__tests__/app/search/extractions-empty-state.test.tsx` (create) | Proves the CTA appears only when there are no rows and no active filters. |
| `frontend/tests/e2e/extraction/extraction-path.spec.ts` (create) | The end-to-end path, written to fail when the flow is broken. |
| `.github/workflows/ci.yml` (modify) | Runs that one spec on pull requests. |

---

### Task 1: Stop the outer handler destroying completed results

**Files:**
- Modify: `backend/app/workers.py:765-800`
- Create: `backend/tests/app/test_extraction_resume.py`

**Interfaces:**
- Consumes: `_update_job_results_in_supabase(job_id, results, completed_documents, status)` (`workers.py:221-296`), unchanged.
- Produces: nothing importable. The deliverable is that a late failure preserves what succeeded.

**Why first:** Tasks 2 and 3 read the stored results to decide what to skip and what to report. If this handler can wipe them, resumption would silently resume from zero and the UI would report a number that is not true.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app/test_extraction_resume.py`:

```python
"""Resume semantics for the extraction task.

An interrupted job must not pay OpenAI twice for work it already finished,
and a failure late in the task must not erase what succeeded before it.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


@pytest.mark.unit
def test_a_late_failure_preserves_completed_results():
    """A failure after some documents succeeded must not overwrite them.

    Regression guard for workers.py:771-797, which built a FAILED entry for
    every requested document and overwrote the whole results column with it.
    """
    from app.workers import _merge_failure_into_results

    already_done = [
        {"document_id": "doc-1", "status": "completed", "extracted_data": {"a": 1}},
        {"document_id": "doc-2", "status": "completed", "extracted_data": {"a": 2}},
    ]
    merged = _merge_failure_into_results(
        existing=already_done,
        document_ids=["doc-1", "doc-2", "doc-3"],
        collection_id="col-1",
        error_message="RuntimeError: llm unavailable",
    )

    by_id = {row["document_id"]: row for row in merged}
    assert by_id["doc-1"]["status"] == "completed"
    assert by_id["doc-1"]["extracted_data"] == {"a": 1}
    assert by_id["doc-2"]["status"] == "completed"
    assert by_id["doc-3"]["status"] == "failed"
    assert by_id["doc-3"]["error_message"] == "RuntimeError: llm unavailable"


@pytest.mark.unit
def test_a_failure_with_nothing_done_marks_everything_failed():
    from app.workers import _merge_failure_into_results

    merged = _merge_failure_into_results(
        existing=[],
        document_ids=["doc-1", "doc-2"],
        collection_id="col-1",
        error_message="RuntimeError: boom",
    )

    assert {row["document_id"] for row in merged} == {"doc-1", "doc-2"}
    assert all(row["status"] == "failed" for row in merged)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_extraction_resume.py -v
```

Expected: FAIL — `ImportError: cannot import name '_merge_failure_into_results'`.

- [ ] **Step 3: Write the helper**

Add to `backend/app/workers.py`, near the other module-level helpers:

```python
def _merge_failure_into_results(
    existing: list[dict[str, Any]],
    document_ids: list[str],
    collection_id: str,
    error_message: str,
) -> list[dict[str, Any]]:
    """Mark unfinished documents failed while preserving finished ones.

    The previous behaviour built a FAILED entry for every requested document
    and overwrote the whole results column, so a worker restart followed by an
    early failure in the redelivered attempt destroyed everything the earlier
    attempt had completed and paid for.
    """
    done = {row["document_id"]: row for row in existing}
    now = datetime.now(UTC).isoformat()
    merged: list[dict[str, Any]] = []
    for doc_id in document_ids:
        finished = done.get(doc_id)
        if finished is not None and finished.get("status") == (
            DocumentProcessingStatus.COMPLETED.value
        ):
            merged.append(finished)
            continue
        merged.append(
            DocumentExtractionResponse(
                collection_id=collection_id,
                document_id=doc_id,
                status=DocumentProcessingStatus.FAILED,
                created_at=now,
                updated_at=now,
                started_at=now,
                completed_at=now,
                error_message=error_message,
                extracted_data=None,
            ).model_dump(mode="json")
        )
    return merged
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && poetry run pytest tests/app/test_extraction_resume.py -v
```

Expected: PASS, 2 passed.

- [ ] **Step 5: Use the helper in the exception path**

In `backend/app/workers.py`, replace the block at `:771-783` that builds `failed_results` by looping over `request.document_ids`, and the write at `:794-797`, so the handler merges instead of overwriting. The accumulated `results` list from the loop is in scope in the exception handler only if the failure happened after the loop started — read the surrounding code and use whatever accumulated list is available, falling back to an empty list. Keep the existing comment about not calling `update_state()`; it is still true and still load-bearing.

- [ ] **Step 6: Run the full unit suite**

```bash
cd backend && poetry run pytest -m unit -q
```

Run this with `run_in_background` and wait for the notification. Exit code 0 is the pass signal.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && poetry run ruff format --check . && poetry run ruff check .
git add backend/app/workers.py backend/tests/app/test_extraction_resume.py
git commit -m "fix(workers): keep completed results when a job fails late

Refs #<issue>"
```

---

### Task 2: Resume from what is already done

**Files:**
- Modify: `backend/app/workers.py:604` and the loop that follows
- Modify: `backend/tests/app/test_extraction_resume.py`

**Interfaces:**
- Consumes: `_merge_failure_into_results` from Task 1.
- Produces: `_load_completed_results(job_id) -> list[dict]`, reading `extraction_jobs.results` and returning only entries whose `status` is `completed`. Task 3's UI reads the `completed_documents` and `attempts` columns that already exist; this task does not add columns.

**The semantics, decided and not open:** documents recorded `completed` are skipped. Documents recorded `failed` are retried, because the failure may have been transient. This is why the loader filters on status rather than merely on presence.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/app/test_extraction_resume.py`:

```python
@pytest.mark.unit
def test_loader_returns_only_completed_entries(monkeypatch):
    """Failed documents must come back for another attempt, completed ones must not."""
    from app import workers

    stored = [
        {"document_id": "doc-1", "status": "completed", "extracted_data": {"a": 1}},
        {"document_id": "doc-2", "status": "failed", "error_message": "timeout"},
    ]
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"results": stored}]
    )
    monkeypatch.setattr(workers, "supabase_client", supabase)

    completed = workers._load_completed_results("job-1")

    assert [row["document_id"] for row in completed] == ["doc-1"]


@pytest.mark.unit
def test_loader_is_empty_when_the_job_has_no_results(monkeypatch):
    from app import workers

    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"results": None}]
    )
    monkeypatch.setattr(workers, "supabase_client", supabase)

    assert workers._load_completed_results("job-1") == []


@pytest.mark.unit
def test_loader_survives_a_missing_supabase_client(monkeypatch):
    """A resume must degrade to a full run, never crash the task."""
    from app import workers

    monkeypatch.setattr(workers, "supabase_client", None)
    assert workers._load_completed_results("job-1") == []
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && poetry run pytest tests/app/test_extraction_resume.py -v
```

Expected: FAIL — `_load_completed_results` does not exist.

- [ ] **Step 3: Write the loader**

```python
def _load_completed_results(job_id: str) -> list[dict[str, Any]]:
    """Return the already-COMPLETED per-document results for a job.

    Redelivery replays the original task message, so without this the task
    restarts at document zero and re-bills OpenAI for work already paid for.
    FAILED entries are deliberately not returned: a failure may have been
    transient and is worth another attempt.
    """
    if not supabase_client:
        return []
    try:
        response = (
            supabase_client.table("extraction_jobs")
            .select("results")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        stored = (rows[0].get("results") or []) if rows else []
        return [
            row
            for row in stored
            if row.get("status") == DocumentProcessingStatus.COMPLETED.value
        ]
    except Exception as load_error:
        # Never fail the job over bookkeeping — a lost resume costs money,
        # a crashed task costs the whole job.
        logger.warning(f"Could not load prior results for job {job_id}: {load_error}")
        return []
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd backend && poetry run pytest tests/app/test_extraction_resume.py -v
```

Expected: PASS, 5 passed.

- [ ] **Step 5: Seed the loop from the loader and skip completed documents**

At `backend/app/workers.py:604`, replace `results: list[DocumentExtractionResponse] = []` so the list starts from the loader's output, and skip any document whose id is already present. Read the surrounding loop before editing — `total_documents`, the progress write at `:694-701` and the cancellation check at `:706-723` all use `idx`, and a skipped document must still advance the reported progress rather than making the bar go backwards. Log once, at info level, how many documents were skipped and why.

- [ ] **Step 6: Write the test that proves the skip actually happens**

Add a test that runs the task in Celery eager mode with the extractor mocked (follow the existing pattern in `backend/tests/app/test_extraction_job_lifecycle.py:395-456`, which already does this for cancellation), seeds `extraction_jobs.results` with one `completed` document out of three, and asserts the mocked extractor was called for exactly the two remaining documents. Asserting only the final `completed_documents` count would pass even if all three were re-extracted — the call count is the assertion that matters.

- [ ] **Step 7: Full suite, lint, commit**

```bash
cd backend && poetry run pytest -m unit -q   # via run_in_background
cd backend && poetry run ruff format --check . && poetry run ruff check .
git add backend/app/workers.py backend/tests/app/test_extraction_resume.py
git commit -m "feat(workers): resume extraction from already-completed documents

Refs #<issue>"
```

---

### Task 3: Tell the user their job resumed

**Files:**
- Modify: `frontend/app/extractions/[id]/_components/ExtractionJobClient.tsx`
- Create: `frontend/__tests__/app/extractions/resume-notice.test.tsx`

**Interfaces:**
- Consumes: the job payload the detail page already polls, which carries `attempts`, `completed_documents` and `total_documents` (columns confirmed present at `supabase/migrations/20260807000001_create_extraction_jobs_table.sql:38,59`).
- Produces: nothing importable.

**The rule:** show the notice when `attempts > 1`. A first run must not show it. Read the component before editing — it polls every 3 seconds and already handles a 503 by keeping the last verified data, so the notice must not flicker between polls.

- [ ] **Step 1: Write the failing test**

Create `frontend/__tests__/app/extractions/resume-notice.test.tsx`. It must assert the rendered text contains both real numbers, not merely that some element exists:

```tsx
it('tells the user the job resumed and how much was already done', async () => {
  renderJob({ attempts: 2, completed_documents: 300, total_documents: 500 });

  expect(await screen.findByText(/resumed/i)).toBeInTheDocument();
  expect(await screen.findByText(/300/)).toBeInTheDocument();
  expect(await screen.findByText(/500/)).toBeInTheDocument();
});

it('shows no resume notice on a first attempt', async () => {
  renderJob({ attempts: 1, completed_documents: 12, total_documents: 500 });

  expect(screen.queryByText(/resumed/i)).not.toBeInTheDocument();
});
```

Write `renderJob` to mock `global.fetch` with the job payload, following the existing setup in `frontend/__tests__/app/extractions/detail-client.test.tsx:41-229`.

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx jest __tests__/app/extractions/resume-notice.test.tsx
```

- [ ] **Step 3: Add the notice**

Render it above the progress bar, using the editorial primitives from `@/components/editorial` rather than introducing a new card style. Wording should state plainly what happened and that no work was lost — something the reader can act on, for example: "This job was interrupted and resumed. 300 of 500 documents were already finished and were not re-processed."

- [ ] **Step 4: Run to verify it passes, then validate**

```bash
cd frontend && npx jest __tests__/app/extractions/resume-notice.test.tsx
cd frontend && npm run typecheck && npm run validate
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/extractions/\[id\]/_components/ExtractionJobClient.tsx \
        frontend/__tests__/app/extractions/resume-notice.test.tsx
git commit -m "feat(extractions): show when a job resumed after an interruption

Refs #<issue>"
```

---

### Task 4: Close the discovery dead end

**Files:**
- Modify: `frontend/app/search/extractions/page.tsx:236-250`
- Create: `frontend/__tests__/app/search/extractions-empty-state.test.tsx`

**Interfaces:** none. Self-contained UI change.

**The problem, precisely:** the sidebar's only extraction item points at `/search/extractions`, which *searches* extracted data. A user who has never run an extraction lands there, reads that extraction must happen first, and has no way to start one. `/extract` exists and works but is reachable only through Cmd+K or a typed URL.

**Not a new sidebar item.** The sidebar was cut from 23 items deliberately (`frontend/components/app-sidebar.tsx:3-14`) and that decision stands.

- [ ] **Step 1: Write the failing test**

```tsx
it('offers a way to start an extraction when nothing has been extracted yet', () => {
  renderTable({ rows: [], hasActiveFilters: false });

  const cta = screen.getByRole('link', { name: /extract/i });
  expect(cta).toHaveAttribute('href', '/extract');
});

it('does not offer it when the emptiness is caused by filters', () => {
  renderTable({ rows: [], hasActiveFilters: true });

  expect(screen.queryByRole('link', { name: /extract/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
});
```

The distinction matters: with filters active the user's problem is the filters, and pointing them at a fresh extraction would be wrong advice.

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx jest __tests__/app/search/extractions-empty-state.test.tsx
```

- [ ] **Step 3: Add the call to action**

In the `rows.length === 0` branch, keep the existing copy and add, in the `!hasActiveFilters` case only, a link to `/extract` styled as the primary action, matching the existing `Button` usage in that same block.

- [ ] **Step 4: Verify and commit**

```bash
cd frontend && npx jest __tests__/app/search/extractions-empty-state.test.tsx
cd frontend && npm run typecheck && npm run validate
git add frontend/app/search/extractions/page.tsx \
        frontend/__tests__/app/search/extractions-empty-state.test.tsx
git commit -m "feat(search): offer to run an extraction from the empty state

Refs #<issue>"
```

---

### Task 5: One end-to-end test that runs on every pull request

**Files:**
- Create: `frontend/tests/e2e/extraction/extraction-path.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:** none.

**Why this task is different from the rest:** this repo already contains a spec that *appears* to cover extraction and does not — `frontend/tests/e2e/schemas/schema-extraction-flow.spec.ts` mocks `/api/schemas/schema-1/extract`, a route that does not exist, and wraps its assertions in `.catch(() => false)` so they evaporate when a selector misses. Do not copy any pattern from that file. Issue #575 tracks repairing it; this task adds a new spec that is written to fail.

**Non-negotiable properties of the new spec:**
- No `.catch(() => false)` anywhere. If a selector does not match, the test must fail.
- No `expect(x || y || true)`. Every assertion must be able to fail.
- Every mocked route must be one the app actually calls. Verify each by grepping `frontend/app/api/` before writing the mock. The real routes are `/api/extractions`, `/api/extractions/bulk`, `/api/jobs`, `/api/extractions/[id]/export`.
- The final assertion is an observable outcome — a result visible on the page or a completed download — not "the page did not crash".

- [ ] **Step 1: Write the spec**

Cover: sign in, reach `/extract`, choose a collection and a schema, submit, observe the job page progressing, and see a completed result. Mock the backend at the BFF boundary so the test needs no OpenAI key and no Celery worker, following the stub approach already used by `frontend/tests/route-contract-e2e/route-status.spec.ts:384-457`, which polls a real page against a stub adapter.

- [ ] **Step 2: Prove the spec fails when the flow is broken**

Temporarily break the flow — for example remove the submit handler's fetch call — run the spec, and confirm it FAILS. Restore, run again, confirm it PASSES. Paste both outputs into the report. A spec that has never been seen failing is not evidence of anything, which is precisely how this repo acquired the specs in issue #575.

```bash
cd frontend && npx playwright test tests/e2e/extraction/extraction-path.spec.ts
```

- [ ] **Step 3: Add a PR-gated CI job**

In `.github/workflows/ci.yml`, add a job that runs only this spec on pull requests. Do **not** re-enable the whole `frontend-e2e` job — it is 22 specs across 5 browser projects, several of which assert nothing, and turning it on would flood the gate with pre-existing failures. Model the new job on `frontend-e2e-smoke` (`ci.yml:403-492`), which already runs Playwright on PRs without a backend. Give it a distinct check name.

- [ ] **Step 4: Note the branch-protection follow-up**

Adding the job does not make it required — that is a repository setting. State in the PR description that the new check must be added to branch protection to actually gate merges, and that until then it is advisory. Do not claim the path is protected before that switch is flipped.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e/extraction/extraction-path.spec.ts .github/workflows/ci.yml
git commit -m "test(e2e): cover the extraction path on pull requests

Refs #<issue>"
```

---

## Definition of done

- [ ] A test proves a late failure preserves completed results, output quoted.
- [ ] A test proves a resumed job calls the extractor only for unfinished documents, asserted on the call count, output quoted.
- [ ] The job page shows the resume notice with real numbers on `attempts > 1` and nothing on a first run.
- [ ] `/search/extractions` offers a route to `/extract` when empty and unfiltered, and does not when filters are active.
- [ ] The new e2e spec has been seen FAILING with the flow broken and PASSING with it intact, both outputs quoted.
- [ ] `poetry run pytest -m unit -q` exit 0; `npm run validate` and `npm test` clean.

## What this plan deliberately does not fix

- Extraction still has no per-user spend ceiling. A pilot user can queue 10 jobs a minute at up to 1000 documents each. The invite gate from #573 is what stands between open registration and that queue.
- `_try_resubmit_job` (`jobs_router.py:363-431`) still rebuilds a request without `llm_name`, so a recovered job silently switches to the Pydantic default model. That is a provenance defect and belongs to Plan C.
- The rest of the Playwright suite stays disabled and still contains assertions that cannot fail — issue #575.
- The base-schema extraction path (`results_router.py:305-444`) is crash-safe per document but not skip-aware; re-sending the same ids re-bills every one. Out of scope here because the pilot's core job uses custom schemas.
