# Application status and one-week ship plan

**Snapshot date:** 2026-08-21 · **Repo state:** `main` @ `89950f8` · **Version file:** `1.3.0`

This document answers four questions: what is implemented and working, what is
hidden, what needs work, and what a one-week plan to hand the app to real users
looks like.

It supersedes [`ROUTES_AUDIT.md`](ROUTES_AUDIT.md) (2026-08-05) as the current
state-of-the-app reference. That audit's largest findings — the missing
`/judge-fingerprint` and `/reasoning-lines` proxies, the mock-data blog, the
`tiptap-editor` type error — have all been fixed since. Its per-route table is
still useful for detail; treat its verdicts as stale.

---

## 1. Verdict

The codebase is in better shape than the product is.

Every automated gate is green. The infrastructure is live and healthy. What is
missing is not engineering quality — it is that a stranger cannot get to the
one thing this app does well.

Two facts block handing it to users, and neither is a code-quality problem:

1. **Production is running a build from 2026-05-15.** `main` is **532 commits
   ahead** of the newest `prod-v*` tag. Three months of fixes — including every
   fix listed in this document as "already done" — are not deployed.
2. **A visitor cannot see a single judgment without an account and a confirmed
   email.** `/search`, `/chat`, `/documents/[id]` all 307 to `/auth/login` in
   production today. This is [#510](https://github.com/pwr-ai/juddges-app/issues/510),
   filed as `priority: critical`.

   And the wall is cosmetic. The `anon` key that production ships inside its own
   landing-page HTML reads all 12,307 judgments and all 329,237 chunks directly
   from Supabase REST — the database carries policies explicitly named
   `"Public read access"`. **The gate blocks the user, not the data** (§4).
   That removes the main risk from opening it, and removes most of the argument
   for keeping it shut.

Beyond those, the product has one strong, complete spine — search and read over
12,307 judgments, with 40+ structured fields already extracted from every one of
them — wrapped in 63 pages, most of which are furnished rooms with nothing in
them.

**The week's job is not to build. It is to deploy, unlock, and de-clutter.**

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
| Production dependencies | `GET /api/health/status` | redis · postgresql · supabase · celery · langfuse · meilisearch — **all healthy** |
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
| All six backend dependencies | **healthy** (Redis, PostgreSQL, Supabase, Celery worker, Langfuse, Meilisearch) |
| Newest production tag | `prod-v1.3.0`, **2026-05-15** |
| Commits on `main` since that tag | **532** |
| Version reported by prod health | `"unknown"` — the running image does not know its own version |
| Image build | manual, `scripts/build_and_push_prod.sh` (not in CI, by design) |
| Open PRs | 1 real ([#528](https://github.com/pwr-ai/juddges-app/issues/528)) + 9 Dependabot |
| Open issues | 17 |
| Active worktrees | 2 (`fix-228-history-bff`, a stale `.kangentic` one) |

**Read this row twice:** the deploy pipeline works, has been used before, and
simply has not been run in three months. The single highest-value action
available this week costs one command.

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

**Three real weaknesses, all low severity, none blocking:**

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
   that is correct. For **`blog_posts`, `blog_categories`, `blog_tags`** it is a
   trap: `anon` holds a `SELECT` grant, so PostgREST answers `200` with an empty
   array rather than an error. `publications` and its three satellite tables have
   no grant either and return a hard `401 permission denied`.

   **This changes the Day 4 plan:** seeding rows into `blog_posts` or
   `publications` will *not* make those pages work. They need a `SELECT` policy
   first. The empty page has two independent causes, and fixing one leaves it
   empty.

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

`/extract` deserves a specific note: with `extraction_schemas` empty, a user who
finds the extraction workbench has nothing to select. The feature is complete and
unusable at the same time. Issue
[#507](https://github.com/pwr-ai/juddges-app/issues/507) already asks whether the
pipeline still runs end-to-end; the answer from the data is that it has never run
in this environment.

### 5d. Broken or degraded on `main` right now

| Problem | Location | Note |
|---|---|---|
| `/history` 404s | missing `frontend/app/api/search/analytics/history/route.ts` | Regression from #525. **PR [#528](https://github.com/pwr-ai/juddges-app/pull/528) fixes it and is open.** `/history` is in the sidebar. |
| Guest search is dead code | `frontend/lib/guestMode.ts` (69 lines) | Implements a 5-search localStorage allowance. **Imported by nothing.** The backend half (`backend/app/guest_sessions.py`, public router) is live. |
| Meilisearch hybrid disabled | `#200`, `docs/how-to/re-enable-hybrid-search.md` | The `bge-m3` embedder is not registered on the live index, so `semantic_ratio > 0` returns 502. The UI option is hidden and persisted `hybrid` is migrated back to `text` to avoid a 502 loop (`searchStore.ts:1136`). **Vector mode via pgvector is unaffected and works.** |
| Search results show boilerplate | `search-document-card.tsx:28` | See §4 defect 1 |
| `base_case_name` ranked last | `meilisearch_config.py` `searchableAttributes` | `title` (boilerplate) is weighted highest; the clean case name is weighted lowest. Searching a party name ranks badly. |
| Prod reports `version: "unknown"` | running image | No way to tell what is deployed from the outside |
| Docs drift | `CLAUDE.md` | States search "uses Supabase pgvector". The `/search` page is Meilisearch-first; pgvector serves Vector mode and RAG. Both are true; the doc reads as if only one exists. |
| 6 backend test files skipped as obsolete | `test_schemas_integration.py`, `test_schemas_validation.py` | "mock `app.schemas.InformationExtractor` which no longer exists" — schema extraction has **no active integration coverage** |
| Unbounded anonymous insert | `contact_submissions` policy `WITH CHECK: true` | Reachable via PostgREST with the browser-shipped key, bypassing `/api/contact` entirely. Same shape on `feature_requests`, `search_feedback`. See §4. |
| `anon` holds write grants on 33 of 43 tables | Supabase grants | Not exploitable today (no permissive policy), but the wrong default — one careless future policy turns it into a write hole. See §4. |
| `blog_posts` / `publications` deny-all | RLS on, **zero policies** | `/blog` and `/publications` would stay empty even after seeding rows. `blog_posts` answers `200 []`; `publications` answers `401`. See §4. |

### 5e. Known, filed, and correctly deferred

17 open issues. The ones that shape the week:

- **[#510](https://github.com/pwr-ai/juddges-app/issues/510) `priority: critical`** — landing page promises search, delivers a login form. Blocked on a product decision. **This is the week's decision.**
- [#528](https://github.com/pwr-ai/juddges-app/pull/528) — the `/history` fix, ready
- [#527](https://github.com/pwr-ai/juddges-app/issues/527) — extraction detail page paints without schema/collection metadata
- [#507](https://github.com/pwr-ai/juddges-app/issues/507) — verify the extraction pipeline still runs
- [#506](https://github.com/pwr-ai/juddges-app/issues/506) — no subject-facing GDPR deletion route
- [#516](https://github.com/pwr-ai/juddges-app/issues/516) — landing runs 28 animations with no `prefers-reduced-motion` guard *(a global guard landed in `c9f0d48`; verify and close)*
- [#518](https://github.com/pwr-ai/juddges-app/issues/518), [#195](https://github.com/pwr-ai/juddges-app/issues/195) — activation-funnel analytics
- [#61](https://github.com/pwr-ai/juddges-app/issues/61), [#60](https://github.com/pwr-ai/juddges-app/issues/60) — Research Assistant, Schema Marketplace (large, deferred, correctly so)

---

## 6. The gap between "code complete" and "usable by a stranger"

Four gaps, in order of how fast a first user hits them.

1. **They hit a login wall before they see anything.** Nothing else matters until
   this changes.
2. **If they get in, the results are unreadable.** Ten rows of
   `Sygn. akt : II AKa 145/13 WYROK W IMIENIU…` — when the clean case name is
   already sitting in the same row of the same table.
3. **The nav points at empty rooms and hides the full ones.** `/history` 404s.
   `/topics` and `/topic-modeling` have no coordinates. Meanwhile
   `/search/extractions` — 100% populated, genuinely differentiated — is one
   unlabelled entry, and `/extract` is not in the nav at all.
4. **Two facets lie and two are empty.** `case_type: Civil` on criminal appeals,
   `court_level: Crown Court` on Court of Appeal decisions, `outcome` and
   `cited_legislation` empty.

None of these is a rewrite. All four are reachable in five days.

---

## 7. One-week plan

**Assumptions.** One developer, five working days. Scope is *ship what exists*,
not *build what is missing*. Every change goes through the normal branch → PR →
7-green-checks → merge flow.

**One decision is required before Day 2**, and it is the only thing in this plan
that is not mine to make — see the box at the end of this section.

### Day 1 — Deploy what already exists, and stop lying about the version

Three months of merged fixes are sitting undeployed. Nothing else this week is
worth doing until production and `main` are the same software.

- [ ] Merge PR **#528** (`/history` BFF route). A sidebar entry currently 404s.
- [ ] Triage the 9 Dependabot PRs: merge the two grouped minor/patch bumps
      (#495, #500) if CI is green; close or defer the 7 majors — a major
      `framer-motion` / `react-table` / `dnd-kit` bump is not a ship-week change.
- [ ] Run `./scripts/build_and_push_prod.sh minor` → `prod-v1.4.0`, then
      `./scripts/deploy_prod.sh`.
- [ ] Fix `version: "unknown"` in `/api/health/status` — plumb `VERSION` into the
      image. Without it there is no way to confirm a deploy landed.
- [ ] Re-run the §2 production probes against the new build and confirm the
      routes now public in `public-route-policy.ts` (`/privacy`, `/terms`,
      `/blog`, `/publications`, `/legal/*`) actually return 200. **Today they
      307 to login in production — that is how we know prod is stale.**

*Exit criterion: `curl /api/health/status` reports `1.4.0`, and `/privacy`
returns 200 without a cookie.*

### Day 2 — Open the front door (#510)

The one feature change of the week. Implement the decision from the box below.

- [ ] Add `/search`, `/documents/[id]`, and the search BFF routes they need to
      the public set in `frontend/lib/supabase/public-route-policy.ts`.
- [ ] Wire `frontend/lib/guestMode.ts` — it is written, tested-shaped, and
      imported by nothing. Enforce the allowance **server-side** in the search
      BFF, not just in localStorage; the client copy is for the UI counter only.
- [ ] Rate-limit anonymous search. `backend/app/rate_limiter.py` exists. Bind the
      limit to the `guest_session_id` cookie that `backend/app/guest_sessions.py`
      already issues. Document the number in the issue.
- [ ] Keep behind auth, explicitly: collections, saved searches, history,
      extraction, chat, settings, admin.
- [ ] ~~Verify RLS for the anon role~~ — **already done, see §4.** The data layer
      implements exactly this posture today: `judgments` and `document_chunks`
      carry named `"Public read access"` policies, and `collections` / `chats` /
      `profiles` are owner-scoped and verified to return 0 rows to anon. **No
      RLS change is needed for Day 2, and opening `/search` adds no new data
      exposure** — the corpus is already readable by anyone holding the key that
      production ships in its own HTML.
- [ ] Add route-contract E2E cases: anonymous `/search` → 200, anonymous
      `/collections` → 307. The existing suite is the right home for this.
- [ ] While in this area, close the one real hole: `contact_submissions` accepts
      unbounded anonymous inserts (`WITH CHECK: true`) directly via PostgREST,
      bypassing the app handler. Bound it — a per-session cap, or revoke the
      grant and route inserts through the service-role backend.

*Exit criterion: a cold browser reaches search results and opens a judgment
without an account.*

### Day 3 — Make results readable

Highest ratio of perceived quality to effort in the whole plan. No new data
needed; everything is already in the row.

- [ ] Display title: `base_case_name` → `case_number` → `title`. One resolver
      function, used by `search-document-card.tsx:28`, the document page header,
      and the extractions table.
- [ ] Re-weight Meilisearch `searchableAttributes`: `base_case_name` and
      `base_neutral_citation_number` move to the top, `title` drops below them.
      Reindex (the 8-hourly full-sync beat task already exists — trigger it
      rather than hand-rolling).
- [ ] Replace the `summary` column in the result card with a query-relevant
      snippet from `full_text`. Meilisearch `_formatted` / crop already supports
      this; `summary` is a duplicate of `title` and carries no information.
- [ ] Fix the two lying facets. `case_type` for UK rows → `Criminal`;
      `court_level` for EWCA Crim rows → `Court of Appeal`. A single migration
      plus a reindex. Add a `Database Contract` test asserting that no
      `jurisdiction = 'UK'` row with `base_convict_offences` non-empty is
      labelled `Civil`.
- [ ] Hide the two empty facets (`outcome`, `cited_legislation`) rather than
      rendering an empty dropdown. Label `legal_topics` / `keywords` as
      Polish-corpus-only, or hide them when the UK filter is active.

*Exit criterion: ten search results, read aloud, sound like case law.*

### Day 4 — De-clutter, then seed

Stop pointing users at empty rooms; start pointing them at full ones.

- [ ] **Rebuild the sidebar around what works.** Promote `/search/extractions`
      (the differentiated feature, 100% populated) with a name that says what it
      does. Add `/extract`, `/statistics`, `/help`, `/settings`. Remove or move
      to a clearly-marked "Experimental" group: `/topic-modeling` and `/topics`
      (no UMAP coordinates), `/judge-fingerprint`, `/dataset-comparison`,
      `/argumentation-analysis`, `/precedents`.
- [ ] **Seed `extraction_schemas`.** It is empty, which makes `/extract`,
      `/schemas` and `/schema-chat` unusable. Three or four curated schemas —
      the base schema plus a PL criminal-appeal and a UK sentencing variant.
      `backend/judges_schemas_pl.json` and `lawyer_schemas*.json` are sitting in
      the repo already.
- [ ] **Run one extraction job end-to-end** against a seeded schema and a real
      collection. This closes [#507](https://github.com/pwr-ai/juddges-app/issues/507)
      with evidence and puts a non-zero row in `extraction_jobs`, which is also
      the only way `/extractions` and `/extractions/[id]` become demonstrable.
- [ ] **Before seeding anything into `blog_posts` or `publications`, add the
      missing `SELECT` policies.** Both tables have RLS on with **zero
      policies** (§4). `blog_posts` additionally holds an `anon` `SELECT` grant,
      so PostgREST returns `200 []` rather than an error — seeding rows would
      leave the page just as empty, with no error to explain why.
- [ ] Then either seed 2–3 `publications` rows or remove `/publications` from
      the public surface. The static fallback currently hides an empty table,
      which is worse than an honest empty state.
- [ ] Write the `/help` page content for the first-run path: what the corpus is
      (12,307 judgments, PL Court of Appeal criminal + UK EWCA Crim, 2003–2024),
      what it is not, and what the extracted fields mean.

*Exit criterion: every sidebar entry leads somewhere with content in it.*

### Day 5 — Verify as a stranger, then hand over

- [ ] **Cold-path walkthrough**, incognito, no cookies, on production: land →
      run a demo query → open a judgment → hit the guest limit → sign up →
      confirm email → land somewhere useful. Record it. Every step that
      surprises you is a bug for the list.
- [ ] Run the full E2E suite against the deployed build, not just the 7 required
      CI checks. Note per `route-contract-e2e-local-traps`: use the npm script,
      not `npx`, and confirm the serial run did not silently skip.
- [ ] Close [#516](https://github.com/pwr-ai/juddges-app/issues/516) with
      evidence — the global `prefers-reduced-motion` guard landed in `c9f0d48`
      but the issue is still open.
- [ ] Ship the minimum GDPR surface
      ([#506](https://github.com/pwr-ai/juddges-app/issues/506)): a deletion
      request path. With real users this becomes a legal obligation, not a
      backlog item. If a full self-serve flow does not fit, a documented mailto
      on `/privacy` with a stated SLA is a defensible interim — but say so
      explicitly rather than shipping silence.
- [ ] Add the six activation events from
      [#518](https://github.com/pwr-ai/juddges-app/issues/518). `app_events` has
      0 rows; without them the first cohort's behaviour is unrecoverable, and a
      first cohort only happens once.
- [ ] Cut `prod-v1.5.0`, deploy, re-probe, and send the link.

*Exit criterion: you have watched a person who is not you find a judgment.*

---

### The one decision that is not mine

Issue #510 is filed as "blocked on product decision" with four open questions.
Here is what I would do; it needs your sign-off before Day 2 starts.

| Question | Recommendation | Why |
|---|---|---|
| Anonymous search? | **Yes**, 10 queries per guest session | The corpus is public court rulings — and per §4, the database already says so out loud, with policies literally named `"Public read access"`. The wall is not protecting it. |
| `/documents/[id]` anonymous? | **Yes, in full** | A truncated judgment is worse than no judgment — a lawyer will not trust a source that hides text. |
| Where does the sign-up prompt go? | On the 11th query, and on any save/collect/extract action | Ask for the account when the user wants something an account is genuinely required for. |
| Rate limit | Per `guest_session_id` cookie, server-enforced | The cookie plumbing already exists in `guest_sessions.py`. Embedding cost per anonymous query is bounded and small at this volume. |

**The §4 finding makes the alternative hard to defend.** Keeping the wall up
does not keep anyone out: the `anon` key shipped in production's own HTML reads
all 12,307 judgments directly from Supabase REST. The wall stops the lawyer you
want and not the scraper you do not.

If you still want it kept — a deliberate "not ready for the public yet" call is
legitimate — then Day 2 becomes **"make the login wall honest"**: the landing
page must stop advertising search it will not deliver, the demo query chips must
go, and the `"Public read access"` policies should be narrowed to match, so the
stated posture and the enforced one finally agree.

---

## 8. Explicitly not in this week

Naming these so their absence is a decision rather than an oversight.

| Deferred | Why |
|---|---|
| Re-enabling Meilisearch hybrid ([#200](https://github.com/pwr-ai/juddges-app/issues/200)) | Needs a BGE-M3 TEI server, an embedder registration and a full reindex. **Vector mode via pgvector already gives users semantic search.** |
| Deep analysis pipeline | `deep_analysis_status = pending` for all 12,307. A large batch LLM spend with no user-facing surface ready to consume it. |
| UMAP coordinates / topic map | Same shape of cost. Hide the surface this week instead. |
| Research Assistant ([#61](https://github.com/pwr-ai/juddges-app/issues/61)), Schema Marketplace ([#60](https://github.com/pwr-ai/juddges-app/issues/60)) | Multi-week features. Correctly deferred. |
| Rewriting the 6 obsolete schema test files | Real debt, no user impact this week. File it. |
| Splitting the 10+ files over 500 lines ([#59](https://github.com/pwr-ai/juddges-app/issues/59)) | Refactoring during a ship week trades certainty for tidiness. |
| Grafana dashboards ([#196](https://github.com/pwr-ai/juddges-app/issues/196)) | Sentry and Langfuse are live and sufficient for a first cohort. |
| Major-version Dependabot bumps | Seven of them. Not during a ship week. |

---

## 9. Go / no-go checklist

Ship when every line is true. Each is checkable in under a minute.

- [ ] `GET /api/health/status` reports the version just built, not `"unknown"`
- [ ] All six dependencies report `healthy`
- [ ] A cookie-less `GET /search?q=<something>` returns results, not a 307
- [ ] A cookie-less `GET /documents/<real-id>` returns the judgment
- [ ] `GET /collections` still 307s without a session
- [ ] The first ten search results show case names, not `Sygn. akt :` boilerplate
- [ ] No sidebar entry 404s or leads to a zero-row page
- [ ] No facet offers a value that contradicts the document (`Civil` on `R v …`)
- [ ] `extraction_schemas` is non-empty and `/extract` can run a job
- [ ] `app_events` receives rows from a real browser session
- [ ] A deletion-request path exists and is reachable from `/privacy`
- [ ] The full E2E suite passed against the deployed build, with no silent skips
- [ ] `contact_submissions` no longer accepts unbounded anonymous inserts
- [ ] Every page shown in the nav has a `SELECT` policy on the table behind it —
      not merely rows in it
- [ ] A real chat message gets a real answer in production — not a 429 (#546)

---

## 10. Standing risks

- **Manual deploys drift.** Three months and 532 commits is what "manual, when I
  remember" produces. Whatever else changes, put a calendar trigger or a CI
  release job behind `build_and_push_prod.sh`.
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
- **An empty page has two possible causes and they look identical.** Zero rows
  and a deny-all RLS policy both render as "nothing here". Three tables in this
  app are in the second state while looking like the first. Whenever a surface
  is empty, check the policy before you check the data — and prefer an explicit
  `REVOKE` over relying on every future policy being written correctly.
