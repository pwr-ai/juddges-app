# Pilot pre-release checklist

Run this before every production deploy while the ~15-user pilot is live. It
covers what no automated test covers today: dashboard toggles, manual
env vars, and operational risks a green CI run does not catch. See
`docs/superpowers/plans/2026-09-02-pilot-safety-gate.md` for why each item
exists.

## One-time setup (do before the first pilot user is invited)

These are one-time, not per-deploy, but the pilot is not safe to open until
all three are done.

- [ ] **BLOCKING — Disable public sign-up in the Supabase dashboard.**
      Authentication → Sign In / Providers → turn off "Allow new users to
      sign up". This is the single most important item on this page. The
      invite-gated `/auth/invites/redeem` endpoint (`backend/app/api/invites.py`)
      only protects the app's own sign-up form. The Supabase anon key is
      public by design, so until this toggle is off, anyone can open a
      browser console and call `supabase.auth.signUp()` directly — skipping
      the invite gate, the invite rate limits, and the form entirely. Do
      not treat the invite gate as sufficient on its own; confirm this
      toggle is off, in the dashboard, before inviting anyone.
- [ ] **BLOCKING — Confirm PITR / backups are enabled** on the Supabase
      project (Settings → Database → Backups). There is no `pg_dump`
      automation anywhere in this repo, and the project's own readiness
      checklist has this unchecked:
      `docs/reference/supabase-complete-reference.md:1184` —
      `- [ ] PITR enabled for backups`. This is the only unrecoverable-data-loss
      risk in the pilot — a bad migration or a bug that deletes rows has no
      fallback without it.
- [ ] **Generate invite codes with real entropy**, not a memorable string:
      ```bash
      python -c "import secrets; print(secrets.token_urlsafe(16))"
      ```
      `INVITE_REDEEM_RATE_LIMIT` and `INVITE_REDEEM_EMAIL_RATE_LIMIT` bound
      how much *noise* a guesser can make, not whether a guess succeeds —
      nothing stops someone from trying `PILOT-2026` a handful of times
      across a few hours and getting in. Entropy in the code itself is the
      actual control.

## Before deploying

- [ ] `git log --first-parent main` — confirm what is actually shipping.
- [ ] Confirm no extraction job is running. On the host:
      ```bash
      docker compose exec backend-worker celery -A app.workers inspect active
      ```
      A deploy restarts the workers, and an interrupted extraction job
      restarts from document zero — billing OpenAI a second time for work
      already paid for.
- [ ] `.deploy-history` has at least two lines, otherwise
      `./scripts/deploy_prod.sh --rollback` has nothing to roll back to.
      (`.deploy-history` is created at the repo root by `deploy_prod.sh`
      itself on first deploy; if it doesn't exist yet, the next deploy will
      be the first line and rollback still won't have a target.)

## Environment variables to set (and verify, not just set)

Set these in the production `.env` on the host, then rebuild/redeploy as
noted — do not mark any of these done just because the variable is present
in `.env`.

- [ ] `LLM_RATE_LIMIT` (default `20/hour`) — budget on `/qa`, `/chat`,
      `/enhance_query`, the only OpenAI-billed endpoints. Verify it fires:
      ```bash
      for i in $(seq 1 21); do
        curl -s -o /dev/null -w "%{http_code} " \
          -X POST https://juddges.augustyniak.ai/api/enhance_query \
          -H 'Content-Type: application/json' -d '{"query":"test"}'
      done; echo
      ```
      Expect the run to end in a `429`. (Signed-in requests get their own
      per-user bucket — see `frontend/app/api/enhance_query/route.ts` — so
      run this loop signed out, or expect it to take one signed-in user's
      whole hourly budget rather than the shared container bucket.)
- [ ] `INVITE_REDEEM_RATE_LIMIT` (default `60/hour`) and
      `INVITE_REDEEM_EMAIL_RATE_LIMIT` (default `5/hour`) — the first is a
      SHARED ceiling on `/auth/invites/redeem` keyed on the proxy address,
      not per-client protection; the second is the real per-invitee limit,
      keyed on the normalized email. Both ship with safe defaults — only
      override with a reason.
- [ ] `LLM_NAME` — pin to a dated OpenAI snapshot before the pilot.
      Currently unset, so extraction and chat run on the floating alias
      `"gpt-5"`, which OpenAI can repoint without notice — an extracted
      dataset from before and after that happens is not reproducible.
      **`OPENAI_MODEL` in `.env.example` is read by no code at all** —
      `LLM_NAME` (`backend/packages/juddges_search/juddges_search/llms.py`)
      is the live variable. Do not edit `OPENAI_MODEL` expecting an effect.
- [ ] `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` — Sentry is fully wired
      (`backend/app/sentry.py`, `frontend/sentry.*.config.ts`, including the
      Celery integration and a PII scrubber) but is a silent no-op without
      a DSN. **`NEXT_PUBLIC_SENTRY_DSN` is baked into the JS bundle at
      build time** — setting it on a running container does nothing; the
      frontend image must be rebuilt. Verify the backend side:
      ```bash
      SENTRY_DSN=... ./scripts/test_sentry.sh
      ```
      then confirm a "JUDDGES SENTRY SMOKE TEST" event lands in the Sentry
      project within a minute. For the frontend, trigger a client error in
      the browser after rebuilding and confirm it appears too.
- [ ] Langfuse tracing — set `LANGFUSE_PUBLIC_KEY` and
      `LANGFUSE_SECRET_KEY`. **`ENABLE_LANGFUSE` in `.env.example` is not
      read by any code path** — tracing turns on automatically the moment
      both keys above are non-empty (see
      `backend/packages/juddges_search/juddges_search/chains/callbacks.py`
      and `backend/app/search_telemetry.py`). Verify by running one real
      chat query, then confirming a trace with a cost figure appears in the
      Langfuse project — no trace means the keys did not take.

## After deploying

- [ ] `curl -s -o /dev/null -w '%{http_code}' https://juddges.augustyniak.ai/`
      returns `200`.
- [ ] `/extract` redirects to `/auth/login` when signed out.
- [ ] Sign in as a test user, run one search, open one judgment.
- [ ] Launch a five-document extraction and confirm it reaches COMPLETED.
- [ ] Export the result as CSV and open the file.
- [ ] Sign-up with a bogus/unknown invite code is refused on the deployed
      site (not just in tests).
- [ ] Sentry shows no new unresolved issues from the deploy window.
- [ ] Langfuse shows today's spend below the monthly ceiling.

Note: `post_deploy_validation()` in `scripts/deploy_prod.sh` only **warns**
on failure — it never aborts the deploy and never rolls back automatically.
A green "=== Deployment complete ===" message is not evidence the deploy
worked. This checklist is the evidence.

## Known gaps at pilot launch

Named so nobody mistakes this checklist for full coverage:

- The global rate-limit middleware does not cover routes mounted via
  `include_router` — tracked as #574 (see the comment above
  `app.include_router(...)` in `backend/app/server.py`). The LangServe LLM
  routes are covered separately by `LLM_RATE_LIMIT`
  (`backend/app/llm_rate_limit.py`), but other `include_router` routes are
  not.
- There is no per-user ceiling on extraction spend — the most expensive
  path in the app. `EXTRACTION_SUBMIT_RATE_LIMIT` and
  `MAX_DOCUMENTS_PER_JOB` bound submission rate and job size per request,
  not total spend per user over time.
- There is no Grafana, no metrics endpoint, and no log aggregation (see
  `infra/grafana/README.md` — every dashboard except `search` is a
  placeholder). `docker compose logs` plus Sentry are the only error
  visibility until that lands.
