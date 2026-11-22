# Deploying database and API security hardening

The November 2026 hardening closes profile-role escalation and public access to
privileged RPCs. It also moves LangGraph checkpoints and LangChain cache tables
to `juddges_private`, outside the exposed Supabase `public` schema. The tables
are moved with their existing data and indexes, not copied or recreated.

## Rollout

1. Run the database contract suite against a disposable pgvector database. Never
   point `DB_CONTRACT_DATABASE_URL` at the production database.
2. Apply `20261113000001_harden_api_privileges.sql` transactionally and record it
   in `supabase_migrations.schema_migrations`. This migration can be applied
   before deploying the backend: existing backend callers use `service_role`.
3. Build and smoke-test the new production images from merged `main` using the
   repository release process before interrupting running services.
4. Stop the backend, both workers and beat during the private-schema move.
   Include any development backend or worker using the same `DATABASE_URL`.
   Old code must not run library setup while the tables move, because it still
   targets `public`. The frontend may remain up, but backend requests will be
   briefly unavailable.
5. Apply `20261113000002_move_runtime_state_to_private_schema.sql`
   transactionally, recording it in the migration ledger. A five-second lock
   timeout makes a blocked migration fail instead of building a lock queue.
6. Start the new images and verify the backend, workers, beat and frontend are
   healthy. Confirm cache and checkpointer initialization succeeded. Their
   connections use `search_path=juddges_private`; a missing schema fails setup
   rather than creating a new public copy.
7. Verify API roles have no access to the private schema, anonymous requests to
   sensitive RPCs are rejected, and ordinary profile updates still work.

Apply only reviewed migrations. If the production migration ledger is behind
other work on `main`, do not silently apply unrelated migrations as part of this
security rollout.

## Access contracts

- `authenticated` may update presentation and preference columns of its own
  profile; `role`, `id`, email and system timestamps are not client-editable.
- Consent, document-version creation, audit archival and topic-history RPCs are
  backend-only. The backend derives the actor from a verified session.
- Schema rollback permits the authenticated owner or a service-role JWT.
  Missing `auth.uid()` is never treated as proof of a backend caller.
- `PUBLIC`, `anon` and `authenticated` are independent ACL entries. Revoke each
  unwanted grant; revoking `PUBLIC` alone does not remove Supabase's explicit
  role grants. New functions/tables created by `postgres` require explicit
  client grants. Other creators, including managed Supabase roles, must be
  reviewed separately when introducing new objects.
- Checkpoint and cache tables have RLS and no API grants, and their containing
  schema grants no API `USAGE` or `CREATE`.
- Guest conversion requires a verified user and a matching guest-session cookie.
  Client-supplied destination identity cannot replace the authenticated actor.

## Verification

```sh
cd backend
uv run poe check-all
DB_CONTRACT_DATABASE_URL=postgresql://postgres:password@127.0.0.1:55432/postgres \
  uv run pytest tests/db -m db
```

The database tests exercise effective grants, owner/other-user/anonymous
behavior, real library initialization, cache/checkpoint persistence and
preservation of table OIDs and data during the schema move. They also test that
future private library tables and public functions do not inherit API access.

For frontend changes, run `npm ci`, `npm run validate` and unit tests in
`frontend/`, then `bash scripts/verify-frontend-evidence.sh --record` from the
repository root.
Repeat the `unified-security` review after merge, including dependency audits
and live read-only privilege checks. A clean dependency audit does not prove
authorization is correct; the database behavior tests cover that separately.

## Recovery

If private-schema migration fails, its transaction leaves the public tables and
their data in place. Resume the previous backend images while investigating.
If a rollback to old backend code is necessary after a successful move, stop
writers and move the six runtime tables back to `public` in one transaction
before restarting old code. Preserve RLS and the revoked API grants. Do not
disable RLS as a recovery step.

The profile/RPC privilege fix is independent of the private-schema move and
should remain enabled during recovery. Review existing administrator assignments
and retained audit logs separately: closing a permission gap cannot establish
whether earlier access was legitimate.

## Frontend environment boundary

The production frontend has an explicit `environment` allowlist in
`docker-compose.yml`. Do not add `env_file: .env` to this service: it gives the
Next.js process database, Supabase service-role, AI-provider and host release
credentials that it does not need. Compose still reads the host `.env` for
interpolation; backend/worker environment files are independent of this list.

The frontend retains its public Supabase configuration, internal backend URL,
server-only `BACKEND_API_KEY`, trusted-proxy setting and authentication redirect
hosts. Optional contact-mail configuration includes `RESEND_API_KEY` because
that mail is sent by a Next.js server route. Runtime Sentry configuration, log
level, timeouts and changelog location are explicitly listed as well.
`SENTRY_AUTH_TOKEN` belongs to a build process only, not the runtime container.

The Supabase URL/anon key accept the existing non-prefixed aliases but are
passed to the container under their canonical `NEXT_PUBLIC_*` names. The
entrypoint refuses to start if either resolved value is empty. Compose refuses
an empty backend API key, preventing the entrypoint's legacy dummy-key fallback.

Check the boundary without printing secrets:

```sh
docker compose -f docker-compose.yml config --quiet
cd backend
uv run pytest tests/app/test_frontend_compose_environment.py -q
```

These tests render the real frontend environment expressions with synthetic
host secrets, check that those secrets are excluded, preserve authentication,
contact and proxy settings, and verify missing credentials fail closed.

Recreate the frontend to apply environment changes; restarting an existing
container does not replace its environment. Use the deployed image tag when
recreating without a new release. After deployment, check the actual container
environment by variable name only and verify public pages, authentication
configuration, backend proxy requests and the contact-mail configuration.
Do not submit a real contact form as a smoke test: that sends mail.
