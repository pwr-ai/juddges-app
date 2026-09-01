# Application status findings — 2026-08-21 snapshot

**Probed:** 2026-08-21, `main` @ `89950f8` · **Corrected:** 2026-09-01 against
`main` @ 34 commits past `prod-v1.4.0`

**This is a dated findings document, not a live status page.** It records what
probing the code, the database and production turned up on 2026-08-21: what is
implemented and working, what is built but hidden, and what is broken. Read
every claim as "true on the stated date". A correction pass on 2026-09-01
removed the findings that had since been fixed or were wrong, and marked what
changed; anything not re-verified on that date still carries the 2026-08-21
date only.

The original document ended with a one-week ship plan and a go/no-go checklist.
Both were removed on 2026-09-01: the plan was largely executed (see §7), and a
merged document that describes finished work as pending is worse than no plan
at all.

Companion references, both narrower, both maintained separately:

- [`guest-access.md`](guest-access.md) — what a signed-out visitor can reach
  after #510, and the metering that is supposed to apply to it.
- [`sidebar-map.md`](sidebar-map.md) — nominally the canonical sidebar map. It
  describes a **6-item** sidebar; `frontend/components/app-sidebar.tsx` renders
  **17 distinct routes**. On that disagreement, `sidebar-map.md` is the stale
  document, not §5b below.

It supersedes [`ROUTES_AUDIT.md`](ROUTES_AUDIT.md) (2026-08-05). That audit's
largest findings — the missing `/judge-fingerprint` and `/reasoning-lines`
proxies, the mock-data blog, the `tiptap-editor` type error — have all been
fixed since. Its per-route table is still useful for detail; treat its verdicts
as stale.

---

## 1. Verdict

The codebase is in better shape than the product is.

Every automated gate is green. The infrastructure is live (health `degraded`
since 2026-09-01 — Meilisearch sync is stale). What is missing is not
engineering quality — it is that a stranger cannot get to the one thing this
app does well.

Two facts blocked handing it to users, and neither was a code-quality problem.
Both have moved since 2026-08-21, and both still bite:

1. **Production is running a build from 2026-08-25.** The newest tag is
   `prod-v1.4.0`; `main` is **34 commits ahead** of it. Smaller than the
   three-month, 532-commit drift this document originally recorded — that gap
   was closed by the `prod-v1.4.0` release — but the shape of the problem is
   unchanged: deploys are manual, and every fix listed below as "already done"
   is done on `main`, not in front of users.
2. **A visitor could not see a single judgment without an account and a
   confirmed email.** `/search`, `/chat`, `/documents/[id]` all 307'd to
   `/auth/login`. This was
   [#510](https://github.com/pwr-ai/juddges-app/issues/510), `priority: critical`.

   **Closed 2026-09-01 by PR
   [#561](https://github.com/pwr-ai/juddges-app/pull/561).** On `main`, `/search`
   and the judgment detail page are anonymous:
   `frontend/lib/supabase/public-route-policy.ts:17` (`'/search'` in
   `EXACT_PUBLIC_PAGES`) and `:71` (`PUBLIC_JUDGMENT_PAGE_PATTERN`).
   `/search/extractions` deliberately stays gated.

   **Production still returns `307` on `/search`** (probed 2026-09-01), because
   it has not been redeployed since. The wall this document argues against is
   gone from the code and still standing in front of users. That is fact 1
   again, with a concrete cost attached.

   And the wall was cosmetic anyway. The `anon` key that production ships inside
   its own landing-page HTML reads all 12,307 judgments and all 329,237 chunks
   directly from Supabase REST — the database carries policies explicitly named
   `"Public read access"`. **The gate blocked the user, not the data** (§4).

Beyond those, the product has one strong, complete spine — search and read over
12,307 judgments, with 40+ structured fields already extracted from every one of
them — wrapped in 63 pages, most of which are furnished rooms with nothing in
them.

**The job is not to build. It is to deploy, unlock, and de-clutter.**

---

## 2. What was measured, and how

Every claim below is from a command run on 2026-08-21, not from documentation.

| Check | Command | Result |
|---|---|---|
| Backend unit tests | `poetry run pytest -q -m unit` | **2367 collected · 2345 passed · 22 skipped · exit 0** |
| Frontend unit tests | `npm test` | **2416 tests / 181 suites, all pass** · 29 snapshots |
| Frontend typecheck | `npm run typecheck` | **exit 0** (the `tiptap-editor` error from the Aug-05 audit is gone) |
| CI on `main` | `gh run list` | **green** |
| Required checks | `gh api .../branches/main/protection` | 7: Backend Lint · Backend Unit Tests · Frontend Lint · Frontend Unit Tests · Frontend E2E Smoke (UI-only) · Database Contract · Frontend Route Contract (Chromium) |
| Production reachability | `curl https://juddges.augustyniak.ai/` | **200** |
| Production dependencies | `GET /api/health/status` | **`status: "degraded"`** — redis · postgresql · supabase · celery · langfuse healthy; **meilisearch degraded**, `"Meilisearch is accessible and healthy (sync stale)"`, `last_completed_at: null`, `last_error: "Event loop is closed"` *(re-probed 2026-09-01)* |
| Data volumes | Supabase REST, `Prefer: count=exact` | see §4 |
| pgvector search RPCs | `POST /rest/v1/rpc/...` | `count_judgments_filtered` → **12307** · `search_judgments_hybrid` → responds |
| Access posture | `pg_class` / `pg_policies` over `DATABASE_URL`, read-only | 43 public tables, **RLS on for all 43** · see §4 |
| Anonymous reachability | production's own browser-shipped `anon` key vs Supabase REST | corpus **fully readable** · see §4 |
| First-page search cost | `select count_judgments_filtered(...)` | **388 ms** |

---

## 3. Delivery and infrastructure

| Item | State |
|---|---|
| Production URL | `https://juddges.augustyniak.ai` — **live** |
| Overall prod health | **`degraded`** — five of six dependencies healthy, Meilisearch reports `sync stale` |
| Newest production tag | `prod-v1.4.0`, **2026-08-25** |
| Commits on `main` since that tag | **34** |
| Version reported by prod health | `"unknown"` — the running image does not know its own version |
| Anonymous `GET /search` in production | **`307`** — `main` opened it (#561), production has not been redeployed |
| Image build | manual, `scripts/build_and_push_prod.sh` (not in CI, by design) |

**Read those rows twice:** the deploy pipeline works and has been used —
`prod-v1.4.0` closed a three-month, 532-commit gap. It then immediately started
opening a new one, and the 34 commits sitting in it include the single change
this document spent the most words arguing for. The highest-value action
available still costs one command.

---

## 4. Data — the real story

Counts pulled live from Supabase:

| Table | Rows | Consequence |
|---|---:|---|
| `judgments` | **12,307** | The corpus. Complete. |
| `document_chunks` | **329,237** | RAG substrate. Complete. |
| judgments with `embedding` | **12,307 / 12,307** | Semantic search covers 100% of the corpus |
| judgments with `full_text` | **12,307 / 12,307** | median ~20,000 chars — real documents, not stubs |
| chunks with `embedding` | **329,237 / 329,237** | |
| `search_analytics` | 1,620 | People have actually searched |
| `profiles` | 8 | Eight accounts exist |
| `collections` | 8 | |
| `extraction_schemas` | **0** | |
| `extraction_jobs` | **0** | |
| `chats` | **0** | |
| `saved_searches` | **0** | |
| `app_events` | **0** | |
| `blog_posts` | **0** | |
| `publications` | **0** | |
| `reasoning_lines` | **0** | |

Corpus composition (n=1,000 sample, and per-jurisdiction n=300–1,000 checks):

- **59% Polish** — `JuDDGES/pl-court-raw`, all Sąd Apelacyjny (Court of Appeal), all criminal
- **41% UK** — `JuDDGES/en-court-raw`, EWCA Criminal Division / Crown Court
- Decision dates span **2003–2024**, clustered on 2013 and 2023
- `base_extraction_status = completed` for **100%** of sampled rows
- `structure_extraction_status = completed` for **99.4%**
- `deep_analysis_status = pending` for **100%** — the deep-analysis pipeline has never run
- `umap_x` is **NULL** for 100% — the topic map has no coordinates

### The asset nobody is showing the user

Every judgment already carries a completed extraction against
`universal_legal_document_base_schema` — 40+ fields, including offender and
victim attributes, offences, sentences, appeal grounds and outcomes. Fill rates
sampled at n=200 per jurisdiction:

| Field | PL | UK |
|---|---:|---:|
| `base_appeal_outcome` | 200/200 | 200/200 |
| `base_offender_gender` | 189/200 | 199/200 |
| `base_convict_offences` | 153/200 | 198/200 |
| `base_sentences_received` | 153/200 | 179/200 |

This is the differentiated product. `/search/extractions` already filters and
facets on it. It is not in the primary call to action anywhere.

### Data defects a legal user will find in the first minute

1. **`title` and `summary` are both the raw first ~200 characters of the
   document.** Not a title, not a summary. Search results currently read:

   ```
   Sygn. akt : II AKa 145/13 WYROK W IMIENIU RZECZYPOSPOLITEJ POLSKIEJ Dnia 6 czerwca…
   Neutral Citation Number: [2022] EWCA Crim 463 Case No: 202102226 B2 and 202103504 B2 IN THE…
   ```

   Meanwhile `base_case_name` is populated corpus-wide and reads:

   ```
   Prokuratura przeciwko S. K.
   Regina v Michael Chang
   R v Mohammed Afahan Hussain
   ```

   The card renders `doc.title` at
   `frontend/lib/styles/components/search-document-card.tsx:28`. `base_case_name`
   is used only as a labelled field inside the extractions view.

2. **Every UK judgment is labelled `case_type = 'Civil'`** (1,000/1,000
   sampled), while the same rows have `base_convict_offences` filled 198/200 and
   case names of the form `R v …`. These are criminal appeals. The facet is
   exposed on `/search` and actively misleads.

3. **`court_level` for UK rows reads `Crown Court`** (887/1,000) for what are
   Court of Appeal (Criminal Division) decisions. Crown Court is the court
   *below*.

4. **Two exposed facets are entirely empty:** `outcome` (NULL for 100%) and
   `cited_legislation` (0/500).

5. **`legal_topics` and `keywords` are Polish-only** — ~80% filled on PL rows,
   **0/300 on UK rows**. The topic facet silently halves the corpus.

### Access posture — verified against the live database

Read-only introspection of `pg_class` and `pg_policies` over `DATABASE_URL`,
plus a reachability test using production's *own* browser-shipped key.

**The good news, and it is substantial:**

- **RLS is enabled on all 43 tables in `public`.** Zero exceptions.
- `judgments` and `document_chunks` each carry an explicitly named policy —
  `"Public read access for judgments"` / `"…for document_chunks"`, `USING (true)`,
  role `public`. **The corpus is world-readable by design, not by accident.**
- `collections`, `chats`, `profiles` are owner-scoped to `authenticated`
  (`auth.uid() = user_id`). Verified by observation too: the `anon` key returns
  0 rows where the service-role key returns 8, 0 and 8 respectively.
- Of the 16 write policies reachable by role `public`, **13 are gated on
  `auth.role() = 'service_role'`** — anon cannot use them.

**The finding that reframes issue #510:**

The `anon`-role JWT is embedded in the production landing page's HTML, as it must
be for any browser Supabase client. Using that key, pulled from
`https://juddges.augustyniak.ai/` and nothing else:

```
judgments        READABLE  → 0-0/12307
document_chunks  READABLE  → 0-0/329237
```

**The login wall on `/search` protects nothing.** Anyone who opens devtools
already has full read access to all 12,307 judgments and all 329,237 chunks,
straight from Supabase REST, bypassing the app entirely. The gate does not
secure the corpus — it only stops legitimate users from reaching the UI built
to read it.

Given the named `"Public read access"` policies, this is almost certainly the
intended posture for public court rulings. It should still be a conscious,
recorded decision rather than an inherited one.

**Two real weaknesses, both low severity, neither blocking — plus one item
the 2026-08-21 pass read backwards:**

1. `contact_submissions` — `INSERT` for `{anon, authenticated}` with
   `WITH CHECK: true`. **Unbounded anonymous insert.** Because the anon key
   reaches PostgREST directly, any rate limiting or validation in the app's
   `/api/contact` handler is bypassable. Same shape on `feature_requests` and
   `search_feedback` (both additionally constrained to
   `user_id IS NULL OR user_id = auth.uid()`, which does not bound volume).
2. **`anon` holds `INSERT`/`UPDATE`/`DELETE` grants on 33 of 43 tables**,
   including `judgments` and `profiles`. No policy currently lets anon use them,
   so nothing is exploitable today — but the grants are the wrong default, and a
   future permissive policy would silently become a write hole. This is the
   pattern already recorded in `supabase-grants-are-not-a-boundary`: revoke at
   the grant layer, do not rely on policy discipline alone.
3. **11 tables have RLS on with zero policies** — deny-all. For eight of them
   the 2026-08-21 pass judged that correct. For the three blog tables it called
   it a trap, and was wrong.

   > **Corrected 2026-09-01.** The original text called the three blog tables a
   > trap, claimed `anon` holds a `SELECT` grant on them, and recommended adding
   > a `SELECT` policy before seeding. **All three parts were wrong, and the
   > recommendation would have punched a hole in a deliberate boundary.**
   >
   > `supabase/migrations/20260804000001_create_blog_tables.sql:190-193` says so
   > verbatim: *"blog_posts / blog_tags / blog_categories: intentionally no anon
   > or authenticated policy or grant. Public reads are served by the backend
   > through the service-role client (which bypasses RLS), matching the
   > service_role-only EXECUTE grants on `list_public_blog_posts` and
   > `get_public_blog_post`."* The grants at `:222-224` are `GRANT ALL … TO
   > service_role` and nothing else — anon holds no `SELECT` grant.
   >
   > The read path is `backend/app/api/blog.py:279` and `:331`, both calling
   > `get_admin_supabase_client().rpc(...)`. **Seeding rows into `blog_posts` is
   > sufficient on its own**; no policy change is needed, and adding an anon
   > `SELECT` policy would expose unpublished drafts that the RPCs filter out.

   `publications` and its three satellite tables are in the same deny-all state
   and return a hard `401 permission denied` to anon. Whether their read path is
   equally service-role-mediated was **not re-verified** on 2026-09-01 — check
   before acting on `/publications`.

### Performance

`count_judgments_filtered` — invoked on the first page of every search to
populate `estimated_total` — takes **388 ms** against the production database.
That sits on the first-page latency budget. It is best-effort and its failures
are swallowed, so it is a candidate for moving off the hot path rather than a
correctness problem.

*(A 12-second `ILIKE` scan also showed up while probing, but that was an ad-hoc
query of mine, not a path the application takes — search goes through
Meilisearch and the tsvector/HNSW indexes. Recorded only so the number is not
mistaken for a product measurement.)*

---

## 5. Feature inventory

63 page routes, 101 Next.js API route handlers, 30 FastAPI routers plus 3
LangServe chains (`/qa`, `/chat`, `/enhance_query`).

### 5a. Working — verified wiring plus real data behind it

| Feature | Route | Evidence |
|---|---|---|
| Keyword search | `/search` (Text mode) | Meilisearch, 12,307 docs indexed, `meilisearch: healthy` in prod |
| Semantic search | `/search` (Vector mode) | pgvector; `search_judgments_hybrid` RPC responds; 100% embedding coverage |
| Structured-field search | `/search/extractions` | base-schema facets/histograms/NL-filter; 100% extraction coverage |
| Document reader | `/documents/[id]` | metadata + HTML + similar + versions endpoints all present |
| Auth | `/auth/*` | Supabase; 8 accounts; login/signup/reset/update all wired |
| Chat / RAG | `/chat`, `/chat/[id]` | LangServe `/chat` + pgvector chunks; fork/export/history routes present — **but see the LLM billing note below** |
| Collections | `/collections`, `/collections/[id]` | 8 rows; full CRUD |
| Admin panel | `/admin/*` | `require_admin` on every backend endpoint; stats/users/system/content |
| Health & status | `/status` | public, polls `/api/health/status`; all six services green |
| Judge fingerprint | `/judge-fingerprint` | reads `judgments`; BFF proxy at `/api/judge-fingerprint/*` **(fixed since Aug-05)** |
| Reasoning lines | `/reasoning-lines` | BFF proxy at `/api/reasoning-lines/[...path]` **(fixed since Aug-05)** |
| Blog | `/blog` | now fetches `/api/blog/posts` **(mock data removed since Aug-05)** |
| Precedents | `/precedents` | LLM-on-demand, no table dependency |
| Argumentation analysis | `/argumentation-analysis` | LLM-on-demand, no table dependency |
| i18n EN/PL | app-wide | 577 keys each, symmetric; 180 of 285 components call `t()` |

> **Wiring is not billing — added 2026-08-25.** Every "working" grade above was
> established by tracing code paths and data, not by making a live LLM call. On
> 2026-08-25 the `prod-v1.4.0` release build failed generating release notes
> with `openai.RateLimitError: 429 … You have no credits remaining`. The
> `OPENAI_API_KEY` in the repo `.env` is exhausted.
>
> If production shares that key, then **chat/RAG, the precedent finder,
> argumentation analysis, schema generation and the extraction pipeline all fail
> at the first request** — and nothing would have shown it, because
> `/api/health/status` does not probe the LLM. All six services report healthy
> while this is true.
>
> Search is unaffected either way: judgment and chunk embeddings are BGE-M3
> served by TEI, and keyword search needs no LLM. Both `/search` modes keep
> working.
>
> Tracked in #546. Treat the four LLM-backed rows in this table as *wired and
> untested end-to-end* until that issue is closed.

### 5b. Hidden — built, reachable, invisible

The sidebar links **17 distinct routes**, two of which (`/auth/login`,
`/auth/sign-up`) show only when signed out — so a signed-in user is offered
**15 destinations**. There are **63 pages**. Forty-six have no navigation entry
at all; they are reachable only by typing a URL or following an in-page link.

The ones that matter, because they represent finished work nobody can find:

| Route | What it is |
|---|---|
| `/extract` | The extraction workbench — pick collection + schema, run a job |
| `/extractions`, `/extractions/[id]` | Job list and result detail |
| `/schemas`, `/schemas/[id]`, `/schema-chat` | Schema library and the LLM schema builder |
| `/reasoning-lines`, `/reasoning-lines/[id]` | Reasoning-line explorer (in the API layer, not the nav) |
| `/statistics` | Corpus statistics |
| `/settings` | Embedding provider, email alerts |
| `/documents/[id]` | The document reader itself — no nav entry |
| `/help`, `/changelog`, `/about`, `/team`, `/ecosystem`, `/use-cases` | Everything a new user would read first |
| `/publications`, `/blog` | Public-facing content surfaces |

`/schemas/base` **is** in the nav, but `/schemas` (the library) is not — so the
one schema route a user can reach is the read-only base definition.

### 5c. Empty — the feature works, there is nothing in it

| Surface | Backing table | Rows |
|---|---|---:|
| `/schemas`, `/schema-chat`, and the schema picker in `/extract` | `extraction_schemas` | 0 |
| `/extractions` | `extraction_jobs` | 0 |
| `/chat` history | `chats` | 0 |
| `/saved-searches` | `saved_searches` | 0 |
| `/blog` | `blog_posts` | 0 |
| `/publications` | `publications` | 0 (page falls back to a static list, masking this) |
| `/reasoning-lines` | `reasoning_lines` | 0 |
| `/topic-modeling` map | `judgments.umap_x` | NULL for all 12,307 |
| Analytics funnel | `app_events` | 0 |

`/blog` deserves a note of its own, because the 2026-08-21 pass got it wrong.
The table is empty and that is the *only* reason the page is empty. Reads go
through service-role RPCs (`backend/app/api/blog.py:279`, `:331`) that bypass
RLS by design, so **seeding rows is sufficient** — no policy or grant change is
needed, and adding one would expose drafts the RPCs filter out. See §4.

`/extract` deserves a specific note: with `extraction_schemas` empty, a user who
finds the extraction workbench has nothing to select. The feature is complete and
unusable at the same time. Issue
[#507](https://github.com/pwr-ai/juddges-app/issues/507) already asks whether the
pipeline still runs end-to-end; the answer from the data is that it has never run
in this environment.

### 5d. Broken or degraded

State on `main` as of 2026-09-01. Rows fixed between the 2026-08-21 probe and
that date are marked inline and kept, because the failure they represent is
still worth recognising; rows with no such marker are still broken.

| Problem | Location | Note |
|---|---|---|
| Anonymous search is unmetered | `backend/app/server.py`, `backend/app/api/search.py:331` | PR [#561](https://github.com/pwr-ai/juddges-app/pull/561) opened `/search` to guests; the rate limit that was supposed to bound it never landed. `SlowAPIMiddleware` is **never registered** in `server.py` — only `app.state.limiter` and the exception handler are — so `DEFAULT_RATE_LIMITS` applies to nothing, and `documents_search` carries no `@limiter.limit` decorator (41 other call sites in `backend/app/` do). Tracked as [#565](https://github.com/pwr-ai/juddges-app/issues/565). This is the successor to the old "guest search is dead code" finding: `frontend/lib/guestMode.ts` was deleted in `0eb91b6c` and replaced by `frontend/lib/guest/session.ts`, a server-authoritative Redis counter on an HttpOnly cookie — the right shape, with the backstop missing. |
| `/search/extractions` links every row to a route that does not exist | `frontend/app/search/extractions/page.tsx:185` | The row `<Link>` targets `/judgments/<row.id>` and there is no `frontend/app/judgments/` directory. **Every result row 404s.** The intended target is `/documents/[id]`. This is the surface §4 calls "the differentiated product": 100% populated, and unclickable. |
| The public landing page invented its own trending searches | `/`, dashboard trending-topics | [#558](https://github.com/pwr-ai/juddges-app/issues/558) — the home page rendered hardcoded query counts as if they were real search activity. Fixed by PR [#564](https://github.com/pwr-ai/juddges-app/pull/564), 2026-09-01, which removed the fabricated data rather than backfilling it. Kept here because it is the same failure mode as the facets below: **production telling the first user something untrue.** |
| Meilisearch hybrid disabled | `docs/how-to/re-enable-hybrid-search.md` | The `bge-m3` embedder is not registered on the live index, so `semantic_ratio > 0` returns 502. The UI option is hidden and persisted `hybrid` is coerced back to `text` to avoid a 502 loop (`frontend/lib/store/searchStore.ts:1143-1146`). **Vector mode via pgvector is unaffected and works.** |
| Search results show boilerplate | `search-document-card.tsx:28` | See §4 defect 1 |
| `base_case_name` ranked last | `meilisearch_config.py` `searchableAttributes` | `title` (boilerplate) is weighted highest; the clean case name is weighted lowest. Searching a party name ranks badly. |
| Prod reports `version: "unknown"` | running image | No way to tell what is deployed from the outside |
| Docs drift | `CLAUDE.md` | States search "uses Supabase pgvector". The `/search` page is Meilisearch-first; pgvector serves Vector mode and RAG. Both are true; the doc reads as if only one exists. |
| 6 backend test files skipped as obsolete | `test_schemas_integration.py`, `test_schemas_validation.py` | "mock `app.schemas.InformationExtractor` which no longer exists" — schema extraction has **no active integration coverage** |
| Unbounded anonymous insert | `contact_submissions` policy `WITH CHECK: true` | Reachable via PostgREST with the browser-shipped key, bypassing `/api/contact` entirely. Same shape on `feature_requests`, `search_feedback`. See §4. |
| `anon` holds write grants on 33 of 43 tables | Supabase grants | Not exploitable today (no permissive policy), but the wrong default — one careless future policy turns it into a write hole. See §4. |
| `/publications` masks an empty table | `publications` — RLS on, zero policies, no anon grant | Anon gets `401 permission denied`, and the page falls back to a static list rather than showing an honest empty state. Whether the intended read path is a service-role RPC (as it demonstrably is for `blog_*`) was **not verified**. See §4. |

### 5e. Known, filed, and correctly deferred

The issues that shaped this snapshot, with their state as of 2026-09-01:

- ~~[#510](https://github.com/pwr-ai/juddges-app/issues/510) `priority: critical`~~
  — landing page promises search, delivers a login form. **Closed**, implemented
  by PR [#561](https://github.com/pwr-ai/juddges-app/pull/561). Not deployed.
- [#565](https://github.com/pwr-ai/juddges-app/issues/565) — **open**, and the
  direct consequence of the above: anonymous search is unmetered because the
  documented rate-limit backstop was never wired up (§5d).
- [#527](https://github.com/pwr-ai/juddges-app/issues/527) — extraction detail page paints without schema/collection metadata
- [#507](https://github.com/pwr-ai/juddges-app/issues/507) — verify the extraction pipeline still runs
- [#506](https://github.com/pwr-ai/juddges-app/issues/506) — GDPR deletion
  requests are **recorded and never processed**, while the API promises erasure
  within 30 days. (The original text described this as "no deletion route",
  which understated it: the route accepted requests and dropped them.)
  **Partly addressed** by PR [#562](https://github.com/pwr-ai/juddges-app/pull/562),
  which wired the deletion processor to an admin queue. Still open for the
  subject-facing route and the admin UI.
- [#546](https://github.com/pwr-ai/juddges-app/issues/546) — **open**; the
  OpenAI key has no credits and no health check would show it (see §5a).
- [#516](https://github.com/pwr-ai/juddges-app/issues/516) — landing runs 28 animations with no `prefers-reduced-motion` guard *(a global guard landed in `c9f0d48`; verify and close)*
- [#518](https://github.com/pwr-ai/juddges-app/issues/518), [#195](https://github.com/pwr-ai/juddges-app/issues/195) — activation-funnel analytics
- [#61](https://github.com/pwr-ai/juddges-app/issues/61), [#60](https://github.com/pwr-ai/juddges-app/issues/60) — Research Assistant, Schema Marketplace (large, deferred, correctly so)

---

## 6. The gap between "code complete" and "usable by a stranger"

Four gaps, in order of how fast a first user hits them.

1. **They hit a login wall before they see anything.** ~~Nothing else matters
   until this changes.~~ **Fixed on `main`** by PR
   [#561](https://github.com/pwr-ai/juddges-app/pull/561) (#510 closed
   2026-09-01) — and **still true in production**, which has not been redeployed
   and answers `307` on `/search`. The gap moved from a product decision to a
   deploy.
2. **If they get in, the results are unreadable.** Ten rows of
   `Sygn. akt : II AKa 145/13 WYROK W IMIENIU…` — when the clean case name is
   already sitting in the same row of the same table.
3. **The nav points at empty rooms and hides the full ones.** `/topics` and
   `/topic-modeling` have no coordinates. Meanwhile `/search/extractions` —
   100% populated, genuinely differentiated — is one unlabelled entry whose
   every result row 404s (§5d), and `/extract` is not in the nav at all.
   *(The `/history` 404 that stood here was fixed by PR
   [#528](https://github.com/pwr-ai/juddges-app/pull/528), merged 2026-08-25.)*
4. **Two facets lie and two are empty.** `case_type: Civil` on criminal appeals,
   `court_level: Crown Court` on Court of Appeal decisions, `outcome` and
   `cited_legislation` empty.

None of these is a rewrite.

---

## 7. Open follow-ups

The original document ended here with a five-day plan. It is deleted, because
most of it shipped and the rest has an issue number:

| Original plan item | State on 2026-09-01 |
|---|---|
| Day 1 — merge #528, deploy, fix `version: "unknown"` | #528 merged 2026-08-25; `prod-v1.4.0` cut 2026-08-25. `version` still reports `"unknown"`. |
| Day 2 — open `/search` and `/documents/[id]` to guests, meter them | Shipped by PR [#561](https://github.com/pwr-ai/juddges-app/pull/561). The metering did not ship — [#565](https://github.com/pwr-ai/juddges-app/issues/565). |
| Day 3 — display `base_case_name`, re-weight Meilisearch, fix the lying facets | Not started. |
| Day 4 — rebuild the sidebar, seed `extraction_schemas`, run one extraction job | Not started. |
| Day 5 — cold-path walkthrough, GDPR deletion path, activation events | GDPR deletion partly shipped by PR [#562](https://github.com/pwr-ai/juddges-app/pull/562). The rest not started. |

What remains from this snapshot with no issue tracking it. Listed as findings,
not as a schedule — each is a one-line description of work someone will have to
file before doing:

- **`version: "unknown"`.** `VERSION` is not plumbed into the image, so there is
  no way to confirm from outside which build is deployed. This is what made the
  532-commit drift invisible for three months.
- **Display title resolution.** One resolver — `base_case_name` → `case_number`
  → `title` — used by `search-document-card.tsx:28`, the document page header
  and the extractions table. The data is already in the row (§4).
- **Meilisearch field weighting.** `searchableAttributes` in
  `backend/app/services/meilisearch_config.py:75` puts `title` (boilerplate)
  first and `base_neutral_citation_number` in the tie-break tail. Searching a
  party name ranks badly.
- **The two lying facets.** `case_type: Civil` and `court_level: Crown Court` on
  UK criminal appeals — a migration plus a reindex, and a `Database Contract`
  test asserting no `jurisdiction = 'UK'` row with non-empty
  `base_convict_offences` is labelled `Civil`.
- **The two empty facets.** `outcome` and `cited_legislation` render empty
  dropdowns; `legal_topics` / `keywords` are Polish-only and silently halve the
  corpus.
- **`/search/extractions` result rows 404** (§5d) — a one-word href fix on the
  surface this document calls the differentiated product.
- **`extraction_schemas` is empty**, which makes `/extract`, `/schemas` and
  `/schema-chat` complete and unusable at the same time.
- **`contact_submissions` accepts unbounded anonymous inserts** via PostgREST,
  bypassing `/api/contact` (§4).
- **`anon` holds write grants on 33 of 43 tables** — not exploitable today, the
  wrong default tomorrow (§4).
- **Sidebar composition.** 17 sidebar routes against 63 pages, with the
  populated surfaces buried and the empty ones promoted (§5b, §5c) — and
  `sidebar-map.md` documenting a sidebar that has not existed for some time.
- **Meilisearch sync is stale in production** (§2) — `last_completed_at: null`,
  `last_error: "Event loop is closed"`.
- **6 backend test files skipped as obsolete**, leaving schema extraction with
  no active integration coverage (§5d).

---

## 8. Explicitly deferred at the time of the snapshot

Naming these so their absence is a decision rather than an oversight.

| Deferred | Why |
|---|---|
| Re-enabling Meilisearch hybrid | Needs a BGE-M3 TEI server, an embedder registration and a full reindex. **Vector mode via pgvector already gives users semantic search.** |
| Deep analysis pipeline | `deep_analysis_status = pending` for all 12,307. A large batch LLM spend with no user-facing surface ready to consume it. |
| UMAP coordinates / topic map | Same shape of cost. Hide the surface instead. |
| Research Assistant ([#61](https://github.com/pwr-ai/juddges-app/issues/61)), Schema Marketplace ([#60](https://github.com/pwr-ai/juddges-app/issues/60)) | Multi-week features. Correctly deferred. |
| Rewriting the 6 obsolete schema test files | Real debt, no immediate user impact. File it. |
| Splitting the 10+ files over 500 lines ([#59](https://github.com/pwr-ai/juddges-app/issues/59)) | Refactoring while shipping trades certainty for tidiness. |
| Grafana dashboards ([#196](https://github.com/pwr-ai/juddges-app/issues/196)) | Sentry and Langfuse are live and sufficient for a first cohort. |
| Major-version Dependabot bumps | Not while shipping. |

---

## 9. Standing risks

- **Manual deploys drift, and they start drifting again immediately.** Three
  months and 532 commits is what "manual, when I remember" produced the first
  time. `prod-v1.4.0` closed that gap on 2026-08-25; by 2026-09-01 the gap was
  34 commits and already contained the #510 fix. Whatever else changes, put a
  calendar trigger or a CI release job behind `build_and_push_prod.sh`.
- **Fixing something on `main` is not fixing it.** Every claim in this document
  about what a user experiences has to be read against the deployed build, not
  the branch. `version: "unknown"` in `/api/health/status` means there is no
  cheap way to tell the two apart from outside.
- **Green tests do not mean working pages.** PR #528's own description makes the
  point precisely: the `/history` unit tests mocked `fetch`, so a missing route
  was invisible. The route-contract suite is the antidote — extend it whenever a
  page gains a BFF call.
- **The corpus is narrower than the landing page implies.** Criminal appellate
  decisions from two jurisdictions, 2003–2024. Say so on `/help` and on the
  landing page. A user who expects Polish civil case law and finds only criminal
  appeals will not come back, and will be right not to.
- **Eight accounts and zero events** means there is no behavioural baseline. The
  first real cohort is the only chance to capture one.
- **An empty page has more than one possible cause and they look identical.**
  Zero rows, a deny-all RLS policy, and a read path that deliberately runs
  through a service-role RPC all render as "nothing here". Whenever a surface is
  empty, read the migration before you read the data — and prefer an explicit
  `REVOKE` over relying on every future policy being written correctly.
- **A deny-all table is not automatically a bug.** The 2026-08-21 pass read the
  three blog tables' zero-policy state as a trap and recommended adding an anon
  `SELECT` policy; the migration that created them says in a comment that the
  absence is deliberate (§4). An audit that only queries `pg_policies` will
  recommend widening a boundary someone closed on purpose. Read the migration.
