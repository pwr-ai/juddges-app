# Pytest tiers

- Tests that require Supabase, Redis, OpenAI, Meilisearch, or another live service
  must declare `@pytest.mark.integration` explicitly.
- Tests without an explicit tier default to `unit`; `unit` tests must not require
  live services. Test names and file paths do not affect tier selection.
- Live end-to-end tests use the dedicated `e2e` tier.
- A test must carry exactly one of `unit`, `integration`, or `e2e`. Collection
  fails if tiers conflict, and `--strict-markers` makes unknown markers fail.
- Labels such as `api`, `auth`, `search`, and `slow` describe a test but do not
  change its tier.

Inspect the deterministic unit boundary without running tests:

```bash
poetry run pytest --collect-only -q -m unit
poetry run pytest --collect-only -q -m integration
poetry run pytest --collect-only -q -m e2e
```
