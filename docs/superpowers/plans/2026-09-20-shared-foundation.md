# Shared Foundation (wspólna baza planów A/B/C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować raz — przed planami A (research flow), B (NL → filtr → kolekcja) i C (porównanie PL ↔ UK) — te klocki, które wszystkie trzy plany implementowałyby na trzy różne sposoby: jeden RPC zwracający zbiór dopasowań filtra `(id, jurisdiction)` (z kluczami `jurisdiction`, `decision_date`, `collection_ids` w `p_filters`), jeden moduł „kolekcja z filtra" z jednym endpointem, jedną definicję „pustej wartości" i statusów ukończonych, jeden rejestr pól rdzeniowych + adapter drawera + kodek URL po stronie frontendu, jeden helper proxy BFF oraz wspólny helper sesji dla testów route-contract.

**Architecture:** Warstwa SQL: 300-liniowe `WHERE` z `filter_documents_by_extracted_data` przenosi się dosłownie do `list_extracted_filter_matches(p_filters, p_text_query) → (id, jurisdiction)`, a stary RPC staje się cienkim wrapperem o **niezmienionej sygnaturze** (PostgREST dopasowuje po nazwach argumentów; drugi overload = HTTP 300 dla każdego wywołania). Backend: `extraction_domain/filter_ids.py` woła nowy RPC raz (bez stronicowania, bez przenoszenia `extracted_data`), `collections_from_filter.py` tworzy kolekcję z listy id (chunki 1000, limit 5000) i wystawia `POST /collections/from-filter` z odpowiedzią listową (`collections: [...]`), którą plan C rozszerza o `split_by_jurisdiction` zamiast pisać własną ścieżkę. `extraction_domain/completeness.py` trzyma `EMPTY_MARKERS`/`is_empty_value`/`COMPLETED_STATUSES`/`coverage_ratio` dla A (`summary.py`) i C (`layout.py`, `schema_tally.py`). Frontend: typy `Jurisdiction`/`decision_date`, rejestr `CORE_FILTER_FIELDS`, `drawer-adapter.ts` z poprawką epoch↔ISO, kodek `buildFilterSearchParams`/`buildFilterHref` obok `encodeFilters`, helper `proxyToBackend` dla tras BFF. Testy: `synthetic-session.ts` wyciągnięty z `extraction-path.spec.ts`.

**Tech Stack:** Postgres/plpgsql (Supabase), FastAPI + Pydantic v2, supabase-py, pytest (`unit`, `db`), Next.js 15 App Router, TypeScript strict, Jest + RTL, Playwright route-contract harness.

**Spec:** Ten plan syntetyzuje trzy plany: `docs/superpowers/plans/2026-09-20-research-flow-epic.md` (A), `docs/superpowers/plans/2026-09-20-nl-filter-to-collection.md` (B), `docs/superpowers/plans/2026-09-20-pl-uk-compare.md` (C) oraz wspólne fakty ze `scratchpad/specs/context.md`. Sekcja „Zmiany w planach A/B/C" na końcu mówi, które zadania tamtych planów znikają.

## Global Constraints

- Gałąź: `git switch -c feat/shared-foundation origin/main`; PR do `main`; merge `gh pr merge <n> --merge --delete-branch` (squash wyłączony repo-side).
- Wymagane checki CI (dokładne nazwy): `Backend Lint`, `Backend Unit Tests`, `Frontend Lint`, `Frontend Unit Tests`, `Frontend E2E Smoke (UI-only)`, `Database Contract`, `Frontend Route Contract (Chromium)`.
- Conventional commits, **bez** stopek Claude/co-author (`CLAUDE.md`).
- Backend: Python 3.12, Poetry; `poetry run poe check-all` (= ruff + format-check + `pytest -m unit`). Testy `@pytest.mark.unit` albo `pytestmark = pytest.mark.db`. Tier `db`: `DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres poetry run pytest -m db -q` na jednorazowym `docker run -d --rm --name juddges-dbc -e POSTGRES_PASSWORD=postgres -p 55432:5432 pgvector/pgvector:pg17`.
- Frontend: `npm run validate` (lint + tsc), `npx jest <ścieżka>`; TypeScript strict; prymitywy `@/components/editorial`, tokeny `--pwr-*`/aliasy; żadnych nowych gradientów/glass cards.
- Każde nowe `.rpc("…")`/`.table("…")` musi lądować w tym samym PR co migracja, która je deklaruje (`backend/tests/app/test_db_contract_static.py`). Odwrotnie też: RPC z migracji, którego nikt nie woła, jest martwy — Foundation woła `list_extracted_filter_matches` z `filter_ids.py`.
- Sygnatura `filter_documents_by_extracted_data(p_filters JSONB, p_text_query TEXT, p_limit INT, p_offset INT)` jest kontraktem sieciowym i **nie zmienia się**. Nowe klucze wędrują w `p_filters`.
- Wartości `jurisdiction` to dokładnie `'PL'` / `'UK'` (CHECK w `supabase/migrations/20260209000001_create_judgments_table.sql:23`). `case_type`/`court_level` nie wchodzą do żadnego filtra (defekt danych, `docs/reference/APP_STATUS_2026-08-21.md` §4).
- Limit zapisu kolekcji z filtra: **5 000** dokumentów na kolekcję (`SAVE_FROM_FILTER_MAX_DOCUMENTS`, env). Limit HTTP `POST /collections/{id}/documents/batch` zostaje **100** (`tests/app/test_collections_batch_cap.py`).
- `BaseFiltersDrawer`, `QuickFilters`, `get_extracted_facet_counts`: bez zmian zachowania; `tests/app/test_base_schema_route_regressions.py` zielony.
- `docs/superpowers/` jest w `.gitignore:161` — patrz „Ryzyka". Dokumentacja produktowa → `docs/` (Diátaxis); notatki robocze → `.context/`.

---

## Co jest wspólne

Kryterium: blok trafia do Foundation tylko, gdy potrzebują go **co najmniej dwa** plany w wersji v1 (nie „follow-up", nie „mogłby").

| Blok | Kto potrzebuje | Decyzja (wariant, uzasadnienie) | Interfejs |
|---|---|---|---|
| Rozwiązanie „wszystkie id pasujące do filtra" | B (zapis kolekcji), C (para kolekcji, facety), A (pośrednio: `collection_ids`) | **Wygrywa C**: RPC `list_extracted_filter_matches` + wrapper. B stronicuje `filter_documents_by_extracted_data` po 500 i przenosi 10–20 MB `extracted_data` na jeden zapis; C zwraca same `(id, jurisdiction)` w jednym wywołaniu i daje za darmo podział PL/UK, którego C i tak potrzebuje. Zachowujemy z B **moduł** `filter_ids.py` i wyjątek `FilterTooLargeError` (kształt API), ale bez stronicowania. | `public.list_extracted_filter_matches(p_filters JSONB DEFAULT '{}', p_text_query TEXT DEFAULT NULL) RETURNS TABLE (id UUID, jurisdiction TEXT)`; Python `resolve_filter_ids(client, filters, text_query) -> FilterIdsResult(ids, by_jurisdiction)`, `check_cap(result, cap, *, per_jurisdiction=False)` → `FilterTooLargeError(total, cap, jurisdiction)` |
| Klucze `jurisdiction`, `decision_date` w `p_filters` | B (AC1), C (zakłada z B), A (nie w v1) | **Wygrywa B** (semantyka: `= ANY`, zakres `{"from","to"}`/`{"min","max"}`/skalar ISO) — ale zaimplementowane **raz** w ciele `list_extracted_filter_matches`, nie w osobnej migracji B, żeby 300 linii nie było kopiowane dwa razy (B → własna kopia, potem C → kolejna). | JSON: `"jurisdiction": ["PL","UK"]`, `"decision_date": {"from":"2015-01-01","to":"2024-12-31"} \| {"min","max"} \| "YYYY-MM-DD"` |
| Klucz `collection_ids` w `p_filters` | C (`/compare/{pairId}`), A (facety/coverage „w tej kolekcji" — potencjał), B (nie) | **Wygrywa C**; wchodzi do tej samej migracji, bo to jedno `AND (...)` w tym samym `WHERE`. Uwaga: filtr widzi tylko `base_extraction_status = 'completed'` — A **nie** używa go do populacji próbki (patrz „NIE wspólne"). | `"collection_ids": ["<uuid>", …]` → `EXISTS (SELECT 1 FROM collection_judgments cj WHERE cj.collection_id = ANY(v_collection_ids) AND cj.judgment_id = j.id::text)` |
| Migracja i Database Contract | A, B, C (każdy proponował `20260920000001_*`) | Foundation zabiera prefiks `20260920`; pozostałe numery przypisane niżej („Migracje — numeracja końcowa"). Test kontraktu = suma B (klucze rdzeniowe, jeden overload) i C (wspólna funkcja, wrapper, `collection_ids`) w **jednym** pliku. | `supabase/migrations/20260920000001_shared_extracted_filter_matches.sql`; `backend/tests/db/test_extracted_filter_contract.py`; `EXPECTED_RPC_ARGS` + `test_rpc_has_exactly_one_overload` w `test_migration_chain.py` |
| Kolekcja z filtra (serwis + endpoint) | B (`POST /collections/from-filter`), C (`create_pair` z `_matching_ids` i sugestia `collections_from_filter.py`) | **Jeden moduł + jeden endpoint**: `backend/app/collections_from_filter.py`. Odpowiedź od razu **listowa** (`collections: [...]`, `pair_id: null`), żeby C dodał `split_by_jurisdiction: true` + wiersz `collection_pairs` do tego samego endpointu zamiast drugiej ścieżki tworzenia. Chunk 1000 (`bulk_add_documents` nie ma własnego limitu), limit 5000 na kolekcję, 400 `FILTER_EMPTY`, 413 `FILTER_TOO_LARGE`. Router rejestrowany **przed** `collections_router` (catch-all `/{collection_id}`). | `create_collection_from_ids(db, *, user_id, name, description, ids) -> tuple[dict, int]`; `POST /collections/from-filter {name, description?, filters, text_query?} → 201 {collections: [{jurisdiction: null, collection, added_count}], total_matched, pair_id: null}` |
| Definicja „pusta wartość" i „wiersz ukończony" | A (`summary.EMPTY_MARKERS`, `is_empty_value`, `_COMPLETED`; `dataset_export._COMPLETED`), C (`schema_tally._filled`, `_OK_STATUSES`; `layout.coverage_ratio`) | **Jedna definicja w Pythonie, wariant A** (markery „n/a", „brak danych", „unknown"… liczą się jako puste) — bo A i C liczą to nad **tymi samymi** danymi (`extraction_jobs.results[].extracted_data`, wolny tekst LLM). SQL-owe `covered` w RPC facetowym C zostaje przy `NULL`/`''` (kolumny `base_*` są kodowane enumami, markery tam nie występują) — różnica opisana w docstringu. Statusy ukończone były skopiowane **trzy razy** → jedna stała. | `backend/app/extraction_domain/completeness.py`: `COMPLETED_STATUSES`, `EMPTY_MARKERS`, `is_empty_value(value) -> bool`, `flatten(obj, prefix="") -> dict`, `completed_rows(results) -> list[dict]`, `coverage_ratio(covered, total) -> float \| None` |
| `Jurisdiction` (backend) | B (`nl_filter_generator.Jurisdiction`), C (`compare.models.Jurisdiction`) | Jedna definicja w `app/models.py` (moduł wspólny obu). | `Jurisdiction = Literal["PL", "UK"]`, `JURISDICTIONS: tuple[Jurisdiction, ...] = ("PL", "UK")` |
| Typy TS `Jurisdiction`, `BaseSchemaFilters.jurisdiction/decision_date` + rejestr pól rdzeniowych + chipsy | B (UI), C („Interface assumed from Spec B", `lib/compare/types.ts` definiuje własny `Jurisdiction`) | **Wygrywa B** (`CORE_FILTER_FIELDS` obok, nie w `FILTER_FIELDS` → drawer/quick/Meili nietknięte). `ActiveFilterChips` rozwiązuje etykiety przez `ALL_FILTER_FIELD_BY_NAME` — C też renderuje chipsy (`decision_date` może przyjść z NL). | `frontend/types/base-schema-filter.ts`: `Jurisdiction`, pola opcjonalne; `frontend/lib/extractions/base-schema-filter-config.ts`: `CORE_FILTER_FIELDS`, `CORE_FILTER_FIELD_BY_NAME`, `ALL_FILTER_FIELD_BY_NAME`, `isCoreFilterField(field)` |
| `lib/extractions/drawer-adapter.ts` | B (Task 5, z poprawką epoch↔ISO i pomijaniem pól rdzeniowych), C (Task 16, „verbatim move") | **Wygrywa B**: wersja C przenosi błąd (`'1735689600'::DATE` w Postgresie), wersja B go naprawia i zna pola rdzeniowe. | `toDrawerFilters(s) -> BaseFilters`, `applyDrawerChange(s, field, value) -> BaseSchemaFilters`, `coreToDrawerValue`, `applyCoreChange`, `isoToEpochSeconds`, `epochSecondsToIso` |
| Kodek URL filtra / permalink | B (`buildSearchParams` + `?nl=`), C (`lib/compare/permalink.ts`) | **Jeden kodek obok `encodeFilters`** (ten sam plik — unika cyklu importów z hookiem). `nl` jest opcjonalnym polem stanu, bo `writeUrl` hooka musi je emitować, a kodek jest jedynym miejscem, które pisze parametry. C: `buildComparePermalink = buildFilterHref('/compare', …)`. | `frontend/lib/extractions/use-extracted-data-filters.ts`: `FilterUrlState { filters; textQuery?; page?; nlQuestion? }`, `buildFilterSearchParams(state) -> URLSearchParams`, `buildFilterHref(pathname, state, origin?) -> string` |
| Helper proxy BFF | B (1 trasa), A (1 trasa), C (5 tras) — wszystkie kopiują blok auth z `api/extractions/base-schema/facets/[field]/route.ts` | Jeden helper; **odpowiedzi błędów przechodzą bez spłaszczania** (wariant A/C); klient rozpakowuje `detail` (B miał spłaszczać w trasie — zmiana miejsca, nie treści). Istniejące trasy nie są ruszane. | `frontend/app/api/utils/backend-proxy.ts`: `proxyToBackend({ path, method?, body?, passthroughHeaders?, timeoutMs? }) -> Promise<NextResponse>` |
| Klient `createCollectionFromFilter` + typy odpowiedzi | B (dialog), C (`createCollectionPair` → ten sam endpoint ze `split_by_jurisdiction`) | Jeden klient w `lib/api/collections.ts`, błąd `CollectionFromFilterError {code, total?, cap?, status}`. | `createCollectionFromFilter(req: CreateCollectionFromFilterRequest): Promise<CollectionFromFilterResponse>` |
| Fake `supabase.rpc(...)` w testach | B (`_FakeRpc`), C (`_FakeClient`), A (`_JudgmentsDouble` — inny kształt, `.table()`) | Jeden fake dla `.rpc()` (B+C); `.table()` z A zostaje w A (inny protokół). | `backend/tests/app/_fakes.py::FakeRpcClient(handlers)` z `.calls` |
| Helper sesji route-contract | A (Task 16 wyciąga `synthetic-session.ts`), B/C (każdy uwierzytelniony spec PR-gated go potrzebuje) | Wyciągnięcie **tylko** helpera (+ strażnik „brak nieoczekiwanych żądań"). Przenoszenie `extractions.spec.ts` (#583) i fixtures stubu zostają w A. | `frontend/tests/route-contract-e2e/synthetic-session.ts`: `APP_BASE_URL`, `ADAPTER_BASE_URL`, `USER_ID`, `setSyntheticSession(context)`, `expectNoUnexpectedStubRequests(request)` |

## Co NIE jest wspólne

Wymienione wprost, żeby nikt nie abstrahował na siłę:

- **`get_extracted_facet_counts_by_jurisdiction`** — potrzebuje go tylko C (v1). B wymienia „filtered facets" jako follow-up, A nie. **Sygnatura ustalona** (żeby B nie budował drugiego RPC później): `(p_filters JSONB, field_path TEXT, p_text_query TEXT) → (jurisdiction, value, count, total, covered, coverage)`; B, gdy będzie chciał globalnych filtrowanych liczników, sumuje po `jurisdiction`. Wariant B `get_extracted_facet_counts_filtered(field_path, p_filters, p_text_query)` **skreślony**. Zostaje w C jako migracja `20260921000001`.
- **`stratified_sample`, `fetch_jurisdictions`, `apply_run_kind`** (A) — B i C nie samplują w v1. Zostają w A. Uwaga: A **nie** może zastąpić `fetch_jurisdictions` wywołaniem `list_extracted_filter_matches({"collection_ids":[id]})`, bo to zwraca tylko wiersze z `base_extraction_status='completed'` — próbka po cichu straciłaby dokumenty bez ekstrakcji bazowej.
- **`layout.py` (`LOW_COVERAGE_THRESHOLD`, `share`, `tier_for`, `build_field`)**, `fields.py`, `service.py`, `schema_tally.py`, `csv_export.py`, `collection_pairs` (tabela, DB, `GET/DELETE /collections/pairs*`), `/compare*` — C. `coverage_ratio` C importuje z `completeness.py`.
- **`summary.field_completeness`, `estimate_full_run`, `usd_for_tokens`, `prompt_fingerprint`, `dataset_export.*`, migracja `extraction_jobs`** — A. Importują z `completeness.py`, nic więcej.
- **`SYSTEM_PROMPT` reguły 8–9, `BaseSchemaFilter.jurisdiction/decision_date`, `NL_EXCLUDED_CORE_FIELDS`** — B (Task 1–2). To backendowa część NL; C jej używa przez `NlFilterDialog`, ale nie modyfikuje.
- **`ScopeFilters`, `?nl=` + `setNlQuestion`, `buildDocumentHref`, `filter-match.ts`, `KeyInformation.highlightKeys`, `SaveAsCollectionDialog`** — B. C w swoim planie nie używa `ScopeFilters` (ma `CompareFilterBar`), więc nie wchodzi do Foundation mimo notki B „drop-in".
- **i18n** — `/search/extractions` nie ma `t()` (0 wystąpień), C ma przestrzeń `compare.*`. Nie retrofitujemy i18n na stronie B w tym epiku; przestrzeń C zostaje w C.
- **Zod** — A rozszerza `extractionRequestSchema`; B/C przyjmują `filters: dict[str, Any]` bez Zod. Nic do współdzielenia.
- **Fixtures stubu route-contract** (`SAMPLEABLE_COLLECTION_ID`, `GET /extractions/{id}/summary`, `format=zip`) i przeniesienie `extractions.spec.ts` — A (child d, #583).
- **`ExtractFromCollectionButton`, `BivariateBarChart` → `components/charts/`** — odpowiednio A i C (jeden konsument każdy).

## Struktura plików

Backend (create)
- `supabase/migrations/20260920000001_shared_extracted_filter_matches.sql`
- `backend/app/extraction_domain/filter_ids.py`
- `backend/app/extraction_domain/completeness.py`
- `backend/app/collections_from_filter.py`
- `backend/tests/db/test_extracted_filter_contract.py`
- `backend/tests/app/_fakes.py`, `backend/tests/app/test_filter_ids.py`, `backend/tests/app/test_completeness.py`, `backend/tests/app/test_collections_from_filter.py`

Backend (modify)
- `backend/app/models.py` — `Jurisdiction`, `JURISDICTIONS`
- `backend/app/server.py` — rejestracja `collections_from_filter_router` przed `collections_router`
- `backend/tests/db/test_migration_chain.py` — `EXPECTED_RPC_ARGS`, `test_rpc_has_exactly_one_overload`

Frontend (create)
- `frontend/lib/extractions/drawer-adapter.ts`
- `frontend/app/api/utils/backend-proxy.ts`
- `frontend/app/api/collections/from-filter/route.ts`
- `frontend/tests/route-contract-e2e/synthetic-session.ts`
- Testy: `frontend/__tests__/lib/extractions/drawer-adapter.test.ts`, `frontend/__tests__/components/filters/active-filter-chips.test.tsx`, `frontend/tests/unit/api/collections/from-filter.route.test.ts`, `frontend/__tests__/lib/api/collections-from-filter.test.ts`

Frontend (modify)
- `frontend/types/base-schema-filter.ts`, `frontend/lib/extractions/base-schema-filter-config.ts`, `frontend/components/filters/extracted-search-filters.tsx`, `frontend/lib/extractions/use-extracted-data-filters.ts`, `frontend/app/search/extractions/page.tsx`, `frontend/lib/api/collections.ts`, `frontend/tests/route-contract-e2e/extraction-path.spec.ts`, `frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts`, `frontend/__tests__/lib/extractions/use-extracted-data-filters.test.ts`

Docs
- `docs/reference/base-schema-filter-api.md` (nowy; B rozszerza go o NL i `?nl=`)

## Migracje — numeracja końcowa

| Plik | Plan | Treść |
|---|---|---|
| `20260920000001_shared_extracted_filter_matches.sql` | **Foundation** | `list_extracted_filter_matches` (+ `jurisdiction`, `decision_date`, `collection_ids`), wrapper `filter_documents_by_extracted_data` |
| `20260921000001_facet_counts_by_jurisdiction.sql` | C (dawne 20260921000002) | `get_extracted_facet_counts_by_jurisdiction` |
| `20260921000002_create_collection_pairs.sql` | C (dawne 20260921000003) | tabela `collection_pairs` + RLS |
| `20260922000001_extraction_jobs_research_flow.sql` | A (dawne 20260920000001) | kolumny `run_kind`, `sample_*`, `population_size`, `parent_job_id`, `llm_name`, `prompt_version`, `input_tokens`, `output_tokens` |
| — | B | **brak migracji** (klucze rdzeniowe są w Foundation) |

Pliki A i C są od siebie niezależne (A: `ALTER TABLE extraction_jobs`; C: nowe funkcje + nowa tabela), więc kolejność merge'u między A i C nie ma znaczenia; oba wymagają Foundation. Przed utworzeniem pliku zawsze `ls supabase/migrations | tail -3`.

---

### Task 0: Gałąź i notatka o `.gitignore`

**Files:**
- (brak zmian w kodzie)

- [ ] **Step 1: Gałąź**

```bash
cd /home/laugustyniak/github/legal-ai/juddges-project/juddges-app
git fetch origin && git switch -c feat/shared-foundation origin/main
ls supabase/migrations | tail -3   # ostatnia: 20260902000001_create_invite_codes.sql — prefiks 20260920 jest wolny
```

- [ ] **Step 2: Plany są lokalne**

`docs/superpowers/` jest w `.gitignore:161`. Ten plan i trzy plany źródłowe nie wchodzą do commitów tej gałęzi. Jeśli zespół chce je wersjonować, to osobnym PR-em: usunąć linię 161 z `.gitignore` i `git add docs/superpowers/plans/2026-09-20-*.md` (do tego czasu ewentualnie `git add -f`). Decyzja poza zakresem Foundation — patrz „Ryzyka".

---

### Task 1: Migracja — wspólna funkcja filtra + wrapper + Database Contract

**Files:**
- Create: `supabase/migrations/20260920000001_shared_extracted_filter_matches.sql`
- Create: `backend/tests/db/test_extracted_filter_contract.py`
- Modify: `backend/tests/db/test_migration_chain.py:93-135` (`EXPECTED_RPC_ARGS`, nowy test)
- Reference (kopiuj z): `supabase/migrations/20260505000001_extend_base_schema_filterable_searchable.sql` — DECLARE `:160-232`, blok parsujący `:234-324`, predykaty WHERE `:337-436`

**Interfaces:**
- Produces: `public.list_extracted_filter_matches(p_filters JSONB DEFAULT '{}'::jsonb, p_text_query TEXT DEFAULT NULL) RETURNS TABLE (id UUID, jurisdiction TEXT)` — wszystkie dotychczasowe klucze `p_filters` + `jurisdiction` (tablica `'PL'|'UK'`), `decision_date` (`{"from","to"}` / `{"min","max"}` / skalar ISO), `collection_ids` (tablica UUID jako tekst).
- Keeps: `public.filter_documents_by_extracted_data(p_filters, p_text_query, p_limit, p_offset)` — ta sama sygnatura, te same kolumny wyniku, ten sam `ORDER BY j.decision_date DESC NULLS LAST, j.id`.

- [ ] **Step 1: Napisz testy kontraktowe (czerwone)**

`backend/tests/db/test_extracted_filter_contract.py`:

```python
"""Shared filter set (Foundation): list_extracted_filter_matches + wrapper.

Behavioural, not structural: argument names are pinned in test_migration_chain.py;
here we prove (a) the shared function returns (id, jurisdiction) for every match,
(b) the three Foundation keys (jurisdiction, decision_date, collection_ids) filter,
(c) filter_documents_by_extracted_data is a behaviour-preserving wrapper.
Seeds are isolated by a per-test keyword token because the scratch DB is shared.
"""

from __future__ import annotations

import json
import uuid

import pytest

pytestmark = pytest.mark.db


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def _seed(conn, token: str, jurisdiction: str, decision_date: str, **base) -> str:
    jid = str(uuid.uuid4())
    columns = ["id", "case_number", "jurisdiction", "decision_date", "full_text",
               "base_extraction_status", "base_keywords"]
    values: list = [jid, f"FND/{jid[:8]}", jurisdiction, decision_date, "contract fixture",
                    "completed", [token]]
    # explicit casts: psycopg sends str params with unknown OID; be explicit for uuid/date
    placeholders = ["%s::uuid", "%s", "%s", "%s::date", "%s", "%s", "%s::text[]"]
    for col, val in base.items():
        columns.append(f"base_{col}")
        values.append(val)
        placeholders.append("%s")
    _exec(conn, f"INSERT INTO public.judgments ({', '.join(columns)}) VALUES ({', '.join(placeholders)})",
          tuple(values))
    return jid


@pytest.fixture
def corpus(conn):
    """2 PL (2016, 2019) + 2 UK (2021, 2023); uk_a is gender_female."""
    token = f"fnd-{uuid.uuid4()}"
    ids = {
        "pl_a": _seed(conn, token, "PL", "2016-03-01"),
        "pl_b": _seed(conn, token, "PL", "2019-11-30"),
        "uk_a": _seed(conn, token, "UK", "2021-07-15", offender_gender=["gender_female"]),
        "uk_b": _seed(conn, token, "UK", "2023-01-02"),
    }
    yield token, ids
    _exec(conn, "DELETE FROM public.judgments WHERE id = ANY(%s::uuid[])", (list(ids.values()),))


def _matches(conn, filters: dict, text_query: str | None = None) -> set[tuple[str, str]]:
    rows = _exec(conn,
                 "SELECT id::text, jurisdiction FROM public.list_extracted_filter_matches(%s::jsonb, %s)",
                 (json.dumps(filters), text_query))
    return {(r[0], r[1]) for r in rows}


def _ids(conn, filters: dict) -> set[str]:
    return {m[0] for m in _matches(conn, filters)}


def test_shared_function_returns_id_and_jurisdiction_for_every_match(conn, corpus):
    token, ids = corpus
    assert _matches(conn, {"keywords": [token]}) == {
        (ids["pl_a"], "PL"), (ids["pl_b"], "PL"), (ids["uk_a"], "UK"), (ids["uk_b"], "UK"),
    }


def test_jurisdiction_filters_to_named_countries(conn, corpus):
    token, ids = corpus
    assert _ids(conn, {"keywords": [token], "jurisdiction": ["UK"]}) == {ids["uk_a"], ids["uk_b"]}
    assert _ids(conn, {"keywords": [token], "jurisdiction": ["PL", "UK"]}) == set(ids.values())


def test_decision_date_range_is_inclusive(conn, corpus):
    token, ids = corpus
    assert _ids(conn, {"keywords": [token], "decision_date": {"from": "2019-01-01"}}) == {
        ids["pl_b"], ids["uk_a"], ids["uk_b"]}
    assert _ids(conn, {"keywords": [token],
                       "decision_date": {"from": "2016-03-01", "to": "2016-03-01"}}) == {ids["pl_a"]}


def test_decision_date_accepts_min_max_aliases_and_scalar(conn, corpus):
    token, ids = corpus
    assert _ids(conn, {"keywords": [token],
                       "decision_date": {"min": "2016-01-01", "max": "2016-12-31"}}) == {ids["pl_a"]}
    assert _ids(conn, {"keywords": [token], "decision_date": "2021-07-15"}) == {ids["uk_a"]}


def test_core_keys_combine_with_base_filters(conn, corpus):
    token, ids = corpus
    assert _ids(conn, {"keywords": [token], "jurisdiction": ["UK"],
                       "offender_gender": ["gender_female"],
                       "decision_date": {"from": "2020-01-01"}}) == {ids["uk_a"]}


def test_collection_ids_key_restricts_to_membership(conn, corpus, make_user):
    token, ids = corpus
    user = make_user(str(uuid.uuid4()))
    cid = str(uuid.uuid4())
    _exec(conn, "INSERT INTO public.collections (id, user_id, name) VALUES (%s, %s, 'fnd')", (cid, user))
    _exec(conn, "INSERT INTO public.collection_judgments (collection_id, judgment_id) VALUES (%s, %s)",
          (cid, ids["pl_a"]))
    assert _matches(conn, {"keywords": [token], "collection_ids": [cid]}) == {(ids["pl_a"], "PL")}
    _exec(conn, "DELETE FROM public.collections WHERE id = %s", (cid,))


def test_wrapper_returns_the_same_rows_and_total_as_the_shared_function(conn, corpus):
    token, ids = corpus
    rows = _exec(conn,
                 "SELECT id::text, jurisdiction, decision_date, total_count FROM "
                 "public.filter_documents_by_extracted_data(%s::jsonb, NULL, 50, 0)",
                 (json.dumps({"keywords": [token]}),))
    assert {r[0] for r in rows} == _ids(conn, {"keywords": [token]})
    assert {r[3] for r in rows} == {4}
    dates = [r[2] for r in rows]
    assert dates == sorted(dates, reverse=True), "ORDER BY decision_date DESC must be preserved"


def test_wrapper_pagination_is_unchanged(conn, corpus):
    token, _ = corpus
    f = json.dumps({"keywords": [token]})
    page1 = _exec(conn, "SELECT id::text FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 3, 0)", (f,))
    page2 = _exec(conn, "SELECT id::text FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 3, 3)", (f,))
    assert len(page1) == 3 and len(page2) == 1
    assert not ({r[0] for r in page1} & {r[0] for r in page2})
```

W `backend/tests/db/test_migration_chain.py` dodaj do `EXPECTED_RPC_ARGS`:

```python
    # backend/app/extraction_domain/results_router.py:483 — jurisdiction/decision_date/
    # collection_ids travel INSIDE p_filters, so this list must never grow (a second
    # overload makes PostgREST answer 300 for every caller).
    "filter_documents_by_extracted_data": ["p_filters", "p_text_query", "p_limit", "p_offset"],
    # backend/app/extraction_domain/filter_ids.py
    "list_extracted_filter_matches": ["p_filters", "p_text_query"],
```

i po `test_rpc_exists_with_the_argument_names_postgrest_matches_by`:

```python
@pytest.mark.parametrize("function", sorted(EXPECTED_RPC_ARGS))
def test_rpc_has_exactly_one_overload(conn, function: str) -> None:
    """CREATE OR REPLACE with a changed parameter list adds an overload instead of
    replacing the function; PostgREST then cannot pick one and answers 300."""
    count = _scalar(
        conn,
        "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'public' AND p.proname = %s",
        (function,),
    )
    assert count == 1, f"{function} has {count} overloads; expected exactly 1"
```

- [ ] **Step 2: Uruchom — musi być czerwone**

```bash
docker run -d --rm --name juddges-dbc -e POSTGRES_PASSWORD=postgres -p 55432:5432 pgvector/pgvector:pg17 && sleep 5
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
  poetry run pytest -m db tests/db/test_extracted_filter_contract.py tests/db/test_migration_chain.py -q
```
Expected: FAIL — `function public.list_extracted_filter_matches(jsonb, unknown) does not exist`; `test_rpc_exists_with_the_argument_names_postgrest_matches_by[list_extracted_filter_matches]` FAIL; testy wrappera i overloadu dla `filter_documents_by_extracted_data` PASS (jeden overload już jest).

- [ ] **Step 3: Napisz migrację**

`supabase/migrations/20260920000001_shared_extracted_filter_matches.sql`. Trzy regiony „verbatim" kopiujesz **poleceniem**, nie z pamięci:

```bash
f=supabase/migrations/20260505000001_extend_base_schema_filterable_searchable.sql
sed -n '160,232p' $f > /tmp/fnd_declare.sql   # DECLARE body (bez słowa DECLARE)
sed -n '234,324p' $f > /tmp/fnd_parse.sql     # blok parsujący (bez BEGIN, bez RETURN QUERY)
sed -n '337,436p' $f > /tmp/fnd_where.sql     # predykaty AND (...) po base_extraction_status
```

Plik migracji:

```sql
-- =============================================================================
-- Migration: shared base-schema filter set + thin wrapper (Foundation for A/B/C)
-- =============================================================================
-- filter_documents_by_extracted_data carried a ~300-line WHERE clause that the
-- PL/UK comparison and "save filter as collection" also need. It moves, verbatim,
-- into list_extracted_filter_matches, which returns the matching (id, jurisdiction)
-- set; the original RPC becomes a wrapper with an UNCHANGED signature and result
-- shape (a new parameter would create a PostgREST overload → HTTP 300).
--
-- New keys read from p_filters:
--   jurisdiction   JSON array of 'PL' | 'UK'                      → j.jurisdiction = ANY(...)
--   decision_date  {"from","to"} | {"min","max"} | "YYYY-MM-DD"    → j.decision_date range / equality
--   collection_ids JSON array of collection UUIDs                 → membership in collection_judgments
-- The corpus is ~12k rows, so materialising the id set per call is cheap.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_extracted_filter_matches(
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_text_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    jurisdiction TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- === BEGIN verbatim copy: 20260505000001:160-232 (/tmp/fnd_declare.sql)
    -- (wklej tu zawartość /tmp/fnd_declare.sql)
    -- === END verbatim copy
    -- core judgment columns (Foundation; Spec B)
    v_jurisdiction TEXT[] := public._jsonb_to_text_array(p_filters -> 'jurisdiction');
    v_decision_date_eq DATE := NULL;
    v_decision_date_from DATE := NULL;
    v_decision_date_to DATE := NULL;
    -- collection membership (Foundation; Spec C). collection_judgments.judgment_id is TEXT,
    -- collection_id is UUID — cast the filter once, not the column per row.
    v_collection_ids UUID[] := (
        SELECT array_agg(x::uuid)
        FROM unnest(public._jsonb_to_text_array(p_filters -> 'collection_ids')) AS x
    );
BEGIN
    -- === BEGIN verbatim copy: 20260505000001:234-324 (/tmp/fnd_parse.sql)
    -- (wklej tu zawartość /tmp/fnd_parse.sql)
    -- === END verbatim copy
    IF p_filters ? 'decision_date' THEN
        IF jsonb_typeof(p_filters -> 'decision_date') = 'object' THEN
            IF (p_filters -> 'decision_date') ? 'from' THEN
                v_decision_date_from := (p_filters -> 'decision_date' ->> 'from')::DATE;
            ELSIF (p_filters -> 'decision_date') ? 'min' THEN
                v_decision_date_from := (p_filters -> 'decision_date' ->> 'min')::DATE;
            END IF;
            IF (p_filters -> 'decision_date') ? 'to' THEN
                v_decision_date_to := (p_filters -> 'decision_date' ->> 'to')::DATE;
            ELSIF (p_filters -> 'decision_date') ? 'max' THEN
                v_decision_date_to := (p_filters -> 'decision_date' ->> 'max')::DATE;
            END IF;
        ELSE
            v_decision_date_eq := (p_filters ->> 'decision_date')::DATE;
        END IF;
    END IF;

    RETURN QUERY
    SELECT j.id, j.jurisdiction
    FROM public.judgments j
    WHERE
        j.base_extraction_status = 'completed'
        -- === BEGIN verbatim copy: 20260505000001:337-436 (/tmp/fnd_where.sql)
        -- (wklej tu zawartość /tmp/fnd_where.sql)
        -- === END verbatim copy
        -- core judgment columns (Foundation)
        AND (v_jurisdiction IS NULL OR j.jurisdiction = ANY(v_jurisdiction))
        AND (v_decision_date_eq IS NULL OR j.decision_date = v_decision_date_eq)
        AND (v_decision_date_from IS NULL OR j.decision_date >= v_decision_date_from)
        AND (v_decision_date_to IS NULL OR j.decision_date <= v_decision_date_to)
        -- collection membership (Foundation)
        AND (v_collection_ids IS NULL OR EXISTS (
            SELECT 1 FROM public.collection_judgments cj
            WHERE cj.collection_id = ANY(v_collection_ids)
              AND cj.judgment_id = j.id::text
        ));
END;
$$;

-- Thin wrapper: identical signature, result columns, ORDER BY, LIMIT/OFFSET.
CREATE OR REPLACE FUNCTION public.filter_documents_by_extracted_data(
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_text_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    case_number TEXT,
    title TEXT,
    jurisdiction TEXT,
    decision_date DATE,
    extracted_data JSONB,
    total_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.jurisdiction,
        j.decision_date,
        COALESCE(j.base_raw_extraction, '{}'::jsonb) AS extracted_data,
        COUNT(*) OVER()::BIGINT AS total_count
    FROM public.list_extracted_filter_matches(p_filters, p_text_query) m
    JOIN public.judgments j ON j.id = m.id
    ORDER BY j.decision_date DESC NULLS LAST, j.id
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_extracted_filter_matches(JSONB, TEXT)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.filter_documents_by_extracted_data(JSONB, TEXT, INT, INT)
    TO anon, authenticated, service_role;
```

Wklej trzy regiony w miejsce linii „(wklej tu …)" (usuń te linie-placeholdery), potem sprawdź, że nie ma dryfu:

```bash
m=supabase/migrations/20260920000001_shared_extracted_filter_matches.sql
grep -c "wklej tu" $m   # musi być 0
diff <(sed -n '/BEGIN verbatim copy: 20260505000001:160-232/,/END verbatim copy/p' $m | sed '1d;$d') /tmp/fnd_declare.sql
diff <(sed -n '/BEGIN verbatim copy: 20260505000001:234-324/,/END verbatim copy/p' $m | sed '1d;$d') /tmp/fnd_parse.sql
diff <(sed -n '/BEGIN verbatim copy: 20260505000001:337-436/,/END verbatim copy/p' $m | sed '1d;$d') /tmp/fnd_where.sql
```
Expected: trzy puste diffy (wcięcia predykatów WHERE są o 4 spacje głębsze niż w nowej funkcji — to kosmetyka, `diff` ich nie zobaczy, bo porównujesz z tym samym `sed`; SQL na wcięcia nie patrzy). Nie dodawaj `ANALYZE` (brak nowego indeksu; `idx_judgments_jurisdiction_date` z 20260209000001 obsługuje oba klucze rdzeniowe).

- [ ] **Step 4: Uruchom cały tier `db`**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres poetry run pytest -m db -q
```
Expected: PASS (w tym stare testy łańcucha migracji i RLS). Dodatkowo sanity planu zapytania na scratch DB:

```bash
psql postgresql://postgres:postgres@localhost:55432/postgres -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT * FROM public.filter_documents_by_extracted_data('{\"jurisdiction\":[\"PL\"]}'::jsonb, NULL, 50, 0);"
```
Expected: wykonuje się; zanotuj czas w opisie PR (baza scratch jest pusta — to tylko dowód, że wrapper działa; realny pomiar na dev DB z 12k wierszy w kroku weryfikacji PR).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260920000001_shared_extracted_filter_matches.sql backend/tests/db/test_extracted_filter_contract.py backend/tests/db/test_migration_chain.py
git commit -m "feat(db): shared list_extracted_filter_matches with jurisdiction/decision_date/collection_ids; filter RPC becomes a wrapper"
```

---

### Task 2: `Jurisdiction` w `app/models.py` + `filter_ids.py` (ids z jednego RPC) + fake RPC do testów

**Files:**
- Modify: `backend/app/models.py` (obok innych `Literal`/stałych u góry pliku)
- Create: `backend/app/extraction_domain/filter_ids.py`
- Create: `backend/tests/app/_fakes.py`
- Create: `backend/tests/app/test_filter_ids.py`

**Interfaces:**
- Produces (`app/models.py`): `Jurisdiction = Literal["PL", "UK"]`, `JURISDICTIONS: tuple[Jurisdiction, ...] = ("PL", "UK")`.
- Produces (`filter_ids.py`):

```python
FILTER_IDS_RPC = "list_extracted_filter_matches"
SAVE_FROM_FILTER_MAX_DOCUMENTS: int = int(os.getenv("SAVE_FROM_FILTER_MAX_DOCUMENTS", "5000"))

class FilterTooLargeError(Exception):
    total: int; cap: int; jurisdiction: str | None

@dataclass(frozen=True)
class FilterIdsResult:
    ids: list[str]                          # RPC order
    by_jurisdiction: dict[str, list[str]]   # {"PL": [...], "UK": [...]} — always both keys
    @property
    def total(self) -> int

def resolve_filter_ids(client, filters: dict[str, Any], text_query: str | None) -> FilterIdsResult
def check_cap(result: FilterIdsResult, cap: int = SAVE_FROM_FILTER_MAX_DOCUMENTS, *, per_jurisdiction: bool = False) -> None
```
`client` = obiekt z `.rpc(name, params).execute()` zwracającym `.data: list[dict]` (kształt supabase-py jak w `results_router.py:482-490`).
- Produces (`tests/app/_fakes.py`): `FakeRpcClient(handlers: dict[str, list[dict] | Callable[[dict], list[dict]]])` z `.rpc(name, params)` i `.calls: list[tuple[str, dict]]`.

- [ ] **Step 1: Testy (czerwone)**

`backend/tests/app/_fakes.py`:

```python
"""Test doubles shared by backend unit tests (Foundation)."""

from __future__ import annotations

from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

RpcHandler = list[dict[str, Any]] | Callable[[dict[str, Any]], list[dict[str, Any]]]


class FakeRpcClient:
    """Answers `client.rpc(name, params).execute().data` from canned rows.

    `handlers[name]` is either a list of rows or a callable (params) -> rows.
    Unknown RPC names raise, so a typo in production code cannot pass a test.
    """

    def __init__(self, handlers: dict[str, RpcHandler]):
        self.handlers = handlers
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]):
        if name not in self.handlers:
            raise AssertionError(f"unexpected rpc({name!r}); known: {sorted(self.handlers)}")
        self.calls.append((name, params))
        handler = self.handlers[name]
        rows = handler(params) if callable(handler) else handler
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=list(rows)))
```

`backend/tests/app/test_filter_ids.py`:

```python
"""resolve_filter_ids asks list_extracted_filter_matches once and groups by jurisdiction."""

from __future__ import annotations

import pytest

from app.extraction_domain.filter_ids import (
    FILTER_IDS_RPC,
    FilterIdsResult,
    FilterTooLargeError,
    check_cap,
    resolve_filter_ids,
)
from app.models import JURISDICTIONS
from tests.app._fakes import FakeRpcClient

pytestmark = pytest.mark.unit


def _rows(pl: int, uk: int) -> list[dict]:
    return [{"id": f"pl-{i}", "jurisdiction": "PL"} for i in range(pl)] + \
           [{"id": f"uk-{i}", "jurisdiction": "UK"} for i in range(uk)]


def test_jurisdictions_constant_matches_the_check_constraint():
    assert JURISDICTIONS == ("PL", "UK")


def test_resolve_calls_the_rpc_once_and_groups_ids():
    client = FakeRpcClient({FILTER_IDS_RPC: _rows(3, 2)})
    result = resolve_filter_ids(client, {"jurisdiction": ["PL", "UK"]}, "knife")
    assert isinstance(result, FilterIdsResult)
    assert client.calls == [(FILTER_IDS_RPC, {"p_filters": {"jurisdiction": ["PL", "UK"]}, "p_text_query": "knife"})]
    assert result.ids == ["pl-0", "pl-1", "pl-2", "uk-0", "uk-1"]
    assert result.by_jurisdiction == {"PL": ["pl-0", "pl-1", "pl-2"], "UK": ["uk-0", "uk-1"]}
    assert result.total == 5


def test_resolve_with_no_matches_keeps_both_jurisdiction_keys():
    client = FakeRpcClient({FILTER_IDS_RPC: []})
    result = resolve_filter_ids(client, {}, None)
    assert result.ids == [] and result.total == 0
    assert result.by_jurisdiction == {"PL": [], "UK": []}


def test_resolve_ignores_rows_with_unknown_jurisdiction_but_keeps_their_ids():
    client = FakeRpcClient({FILTER_IDS_RPC: [{"id": "x", "jurisdiction": "DE"}] + _rows(1, 0)})
    result = resolve_filter_ids(client, {}, None)
    assert result.ids == ["x", "pl-0"]
    assert result.by_jurisdiction == {"PL": ["pl-0"], "UK": []}


def test_check_cap_total():
    result = resolve_filter_ids(FakeRpcClient({FILTER_IDS_RPC: _rows(3, 3)}), {}, None)
    check_cap(result, cap=6)
    with pytest.raises(FilterTooLargeError) as exc:
        check_cap(result, cap=5)
    assert (exc.value.total, exc.value.cap, exc.value.jurisdiction) == (6, 5, None)


def test_check_cap_per_jurisdiction_names_the_offending_side():
    result = resolve_filter_ids(FakeRpcClient({FILTER_IDS_RPC: _rows(6, 1)}), {}, None)
    check_cap(result, cap=6, per_jurisdiction=True)
    with pytest.raises(FilterTooLargeError) as exc:
        check_cap(result, cap=5, per_jurisdiction=True)
    assert (exc.value.total, exc.value.cap, exc.value.jurisdiction) == (6, 5, "PL")
```

- [ ] **Step 2: Uruchom — czerwone**

```bash
cd backend && poetry run pytest tests/app/test_filter_ids.py -q
```
Expected: FAIL — `ModuleNotFoundError: app.extraction_domain.filter_ids` / `ImportError: JURISDICTIONS`.

- [ ] **Step 3: Implementacja**

W `backend/app/models.py`, obok pierwszych definicji typów (przed klasami Pydantic):

```python
# Core judgments.jurisdiction — mirrors the CHECK constraint in
# supabase/migrations/20260209000001_create_judgments_table.sql:23.
Jurisdiction = Literal["PL", "UK"]
JURISDICTIONS: tuple[Jurisdiction, ...] = ("PL", "UK")
```
(upewnij się, że `Literal` jest już importowany z `typing`).

`backend/app/extraction_domain/filter_ids.py`:

```python
"""Resolve a base-schema filter to judgment ids, server-side, in one RPC call.

`list_extracted_filter_matches` (migration 20260920000001) returns every
matching (id, jurisdiction) without `extracted_data`, so callers that only need
ids — save-as-collection, PL/UK pairs, "which documents match" — do not page
`filter_documents_by_extracted_data` and do not move 10-20 MB per request.
The corpus is ~12k rows; if it ever grows past that, add p_limit/p_offset to
the RPC here, not at the call sites.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from loguru import logger

from app.models import JURISDICTIONS

FILTER_IDS_RPC = "list_extracted_filter_matches"
SAVE_FROM_FILTER_MAX_DOCUMENTS: int = int(os.getenv("SAVE_FROM_FILTER_MAX_DOCUMENTS", "5000"))


class FilterTooLargeError(Exception):
    """The filter matches more rows than one collection may hold."""

    def __init__(self, total: int, cap: int, jurisdiction: str | None = None) -> None:
        side = f" ({jurisdiction})" if jurisdiction else ""
        super().__init__(f"filter matches {total} documents{side}; cap is {cap}")
        self.total = total
        self.cap = cap
        self.jurisdiction = jurisdiction


@dataclass(frozen=True)
class FilterIdsResult:
    ids: list[str]
    by_jurisdiction: dict[str, list[str]]

    @property
    def total(self) -> int:
        return len(self.ids)


def resolve_filter_ids(client: Any, filters: dict[str, Any], text_query: str | None) -> FilterIdsResult:
    """Every matching judgment id (RPC order) plus the PL/UK split."""
    response = client.rpc(FILTER_IDS_RPC, {"p_filters": filters, "p_text_query": text_query}).execute()
    rows = list(response.data or [])
    ids = [str(row["id"]) for row in rows]
    by_jurisdiction: dict[str, list[str]] = {j: [] for j in JURISDICTIONS}
    for row in rows:
        side = row.get("jurisdiction")
        if side in by_jurisdiction:
            by_jurisdiction[side].append(str(row["id"]))
    logger.info("resolve_filter_ids: {} ids ({})", len(ids),
                ", ".join(f"{j}={len(v)}" for j, v in by_jurisdiction.items()))
    return FilterIdsResult(ids=ids, by_jurisdiction=by_jurisdiction)


def check_cap(
    result: FilterIdsResult,
    cap: int = SAVE_FROM_FILTER_MAX_DOCUMENTS,
    *,
    per_jurisdiction: bool = False,
) -> None:
    """Raise FilterTooLargeError when the whole set (or, for pairs, one side) exceeds `cap`."""
    if per_jurisdiction:
        for side in JURISDICTIONS:
            n = len(result.by_jurisdiction.get(side, []))
            if n > cap:
                raise FilterTooLargeError(total=n, cap=cap, jurisdiction=side)
        return
    if result.total > cap:
        raise FilterTooLargeError(total=result.total, cap=cap)
```

- [ ] **Step 4: Testy + lint + kontrakt statyczny RPC**

```bash
cd backend && poetry run pytest tests/app/test_filter_ids.py tests/app/test_db_contract_static.py -q && poetry run ruff check app tests && poetry run ruff format --check app tests
```
Expected: PASS (`list_extracted_filter_matches` jest zadeklarowany w migracji z Task 1 i wołany tutaj).

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/extraction_domain/filter_ids.py backend/tests/app/_fakes.py backend/tests/app/test_filter_ids.py
git commit -m "feat(extraction): resolve_filter_ids over list_extracted_filter_matches; shared Jurisdiction literal"
```

---

### Task 3: `collections_from_filter.py` — serwis + `POST /collections/from-filter`

**Files:**
- Create: `backend/app/collections_from_filter.py`
- Modify: `backend/app/server.py:41` (import), `:686-690` (`API_KEY_PROTECTED_ROUTERS`)
- Create: `backend/tests/app/test_collections_from_filter.py`

**Interfaces:**
- Consumes: `resolve_filter_ids`, `check_cap`, `FilterTooLargeError`, `SAVE_FROM_FILTER_MAX_DOCUMENTS` (Task 2); `get_collections_db().create_collection(user_id, name, description)` / `.bulk_add_documents(collection_id, judgment_ids, user_id)` (`collections_db.py:158,251`); `app.core.supabase.supabase_client`; `app.collections.Collection`; `log_audit_background`.
- Produces:

```python
BULK_ADD_CHUNK = 1000

class CreateCollectionFromFilterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = Field(default=None, max_length=1000)

class CreatedCollection(BaseModel):
    jurisdiction: Jurisdiction | None = None   # None for a single collection; set by Spec C's split
    collection: Collection
    added_count: int

class CollectionFromFilterResponse(BaseModel):
    collections: list[CreatedCollection]
    total_matched: int
    pair_id: str | None = None                 # filled by Spec C when split_by_jurisdiction=true

async def create_collection_from_ids(db, *, user_id: str, name: str, description: str | None, ids: list[str]) -> tuple[dict, int]
POST /collections/from-filter → 201 CollectionFromFilterResponse
```
Błędy: 400 `{"error":"Empty Result","code":"FILTER_EMPTY"}`; 413 `{"error":"Too Many Documents","code":"FILTER_TOO_LARGE","total","cap","jurisdiction"}`; 503 `DATABASE_UNAVAILABLE`. Kształt `detail` jak w `results_router.py`.

- [ ] **Step 1: Testy (czerwone)**

`backend/tests/app/test_collections_from_filter.py`:

```python
"""POST /collections/from-filter — save every judgment matching a filter as a collection.

Same stub style as test_collections_batch_cap.py; resolve_filter_ids is
monkeypatched so no RPC is touched.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_collections_db

import app.collections_from_filter as cff
from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.extraction_domain.filter_ids import FilterIdsResult
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

_HEADERS = {"X-API-Key": "test-api-key-12345"}
_COLLECTION_ID = "00000000-0000-4000-a000-000000000001"


class _StubDb:
    def __init__(self):
        self.bulk_calls: list[list[str]] = []
        self.created: list[dict] = []

    async def create_collection(self, user_id, name, description=None):
        row = {"id": _COLLECTION_ID, "user_id": user_id, "name": name, "description": description,
               "created_at": "2026-09-20T00:00:00Z", "updated_at": "2026-09-20T00:00:00Z"}
        self.created.append(row)
        return row

    async def bulk_add_documents(self, collection_id, judgment_ids, user_id):
        self.bulk_calls.append(list(judgment_ids))
        return {"added": list(judgment_ids), "failed": []}


def _ids(n: int) -> list[str]:
    return [f"00000000-0000-4000-a000-{i:012x}" for i in range(n)]


def _result(n: int) -> FilterIdsResult:
    ids = _ids(n)
    return FilterIdsResult(ids=ids, by_jurisdiction={"PL": ids, "UK": []})


@pytest.fixture
def stub_db():
    return _StubDb()


@pytest.fixture
def override_deps(stub_db, monkeypatch):
    user = AuthenticatedUser(
        user_data={"id": "00000000-0000-4000-a000-000000000abc", "email": "x@example.com", "role": "authenticated"},
        access_token="fake",
    )

    async def _user():
        return user

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collections_db] = lambda: stub_db
    monkeypatch.setattr(cff, "supabase_client", object())  # "available"
    try:
        yield user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)
        app.dependency_overrides.pop(get_collections_db, None)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def test_creates_collection_and_bulk_adds_in_chunks(client, override_deps, stub_db, monkeypatch):
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(2500))
    resp = await client.post(
        "/collections/from-filter",
        json={"name": "kobiety skazane za oszustwo, PL i UK, 2015–2024",
              "filters": {"jurisdiction": ["PL", "UK"]}, "text_query": None},
        headers=_HEADERS,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_matched"] == 2500 and body["pair_id"] is None
    assert len(body["collections"]) == 1
    created = body["collections"][0]
    assert created["jurisdiction"] is None
    assert created["collection"]["id"] == _COLLECTION_ID and created["added_count"] == 2500
    assert [len(c) for c in stub_db.bulk_calls] == [1000, 1000, 500]
    assert stub_db.created[0]["name"].startswith("kobiety")


async def test_empty_result_is_400_and_creates_nothing(client, override_deps, stub_db, monkeypatch):
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(0))
    resp = await client.post("/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS)
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "FILTER_EMPTY"
    assert stub_db.created == []


async def test_too_large_is_413_with_total_and_cap(client, override_deps, stub_db, monkeypatch):
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(5001))
    resp = await client.post("/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS)
    assert resp.status_code == 413
    detail = resp.json()["detail"]
    assert detail["code"] == "FILTER_TOO_LARGE" and detail["total"] == 5001 and detail["cap"] == 5000
    assert detail["jurisdiction"] is None
    assert stub_db.created == []


async def test_name_is_required_and_bounded(client, override_deps):
    assert (await client.post("/collections/from-filter", json={"name": "", "filters": {}}, headers=_HEADERS)).status_code == 422
    assert (await client.post("/collections/from-filter", json={"name": "a" * 256, "filters": {}}, headers=_HEADERS)).status_code == 422


async def test_503_without_database(client, override_deps, monkeypatch):
    monkeypatch.setattr(cff, "supabase_client", None)
    resp = await client.post("/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS)
    assert resp.status_code == 503


async def test_batch_cap_of_100_on_documents_batch_is_untouched(client, override_deps):
    """Guard: from-filter must not have loosened AddDocumentsRequest (#166)."""
    resp = await client.post(f"/collections/{_COLLECTION_ID}/documents/batch",
                             json={"document_ids": _ids(101)}, headers=_HEADERS)
    assert resp.status_code == 422


async def test_create_collection_from_ids_is_reusable_without_http(stub_db):
    collection, added = await cff.create_collection_from_ids(
        stub_db, user_id="u", name="n", description=None, ids=_ids(1500))
    assert collection["id"] == _COLLECTION_ID and added == 1500
    assert [len(c) for c in stub_db.bulk_calls] == [1000, 500]
```

- [ ] **Step 2: Uruchom — czerwone**

```bash
cd backend && poetry run pytest tests/app/test_collections_from_filter.py -q
```
Expected: FAIL — `ModuleNotFoundError: app.collections_from_filter`.

- [ ] **Step 3: Implementacja**

`backend/app/collections_from_filter.py`:

```python
"""Create collections from a base-schema filter, server-side (Foundation for B and C).

One endpoint, list-shaped response: a single collection today (Spec B), and
Spec C extends the same request with `split_by_jurisdiction` to create a PL/UK
pair and fill `pair_id` — no second creation path. The 100-id cap on
POST /collections/{id}/documents/batch protects a browser-driven loop; here the
server owns the loop, so it bulk-inserts in chunks of 1 000 up to the
SAVE_FROM_FILTER_MAX_DOCUMENTS cap (5 000 per collection).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from juddges_search.db.supabase_db import get_collections_db
from loguru import logger
from pydantic import BaseModel, Field

from app.collections import Collection
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.core.supabase import supabase_client
from app.extraction_domain.filter_ids import (
    SAVE_FROM_FILTER_MAX_DOCUMENTS,
    FilterTooLargeError,
    check_cap,
    resolve_filter_ids,
)
from app.models import Jurisdiction
from app.services.audit_service import log_audit_background

# Registered BEFORE collections_router in server.py: /collections/{collection_id}
# would otherwise capture literal segments such as "from-filter" (and Spec C's "pairs").
router = APIRouter(prefix="/collections", tags=["collections"])

BULK_ADD_CHUNK = 1000


class CreateCollectionFromFilterRequest(BaseModel):
    """Same `filters`/`text_query` shape as POST /extractions/base-schema/filter."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = Field(default=None, max_length=1000)


class CreatedCollection(BaseModel):
    jurisdiction: Jurisdiction | None = None
    collection: Collection
    added_count: int


class CollectionFromFilterResponse(BaseModel):
    collections: list[CreatedCollection]
    total_matched: int
    pair_id: str | None = None


def _db_unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"error": "Database Unavailable", "message": "Database connection not available.",
                "code": "DATABASE_UNAVAILABLE"},
    )


async def create_collection_from_ids(
    db: Any, *, user_id: str, name: str, description: str | None, ids: list[str]
) -> tuple[dict[str, Any], int]:
    """Create one collection and bulk-add `ids` in chunks. Returns (collection row, added count)."""
    collection = await db.create_collection(user_id, name, description)
    added = 0
    for start in range(0, len(ids), BULK_ADD_CHUNK):
        result = await db.bulk_add_documents(collection["id"], ids[start : start + BULK_ADD_CHUNK], user_id)
        added += len(result["added"])
    logger.info("collection {} created with {} of {} judgments", collection["id"], added, len(ids))
    return collection, added


@router.post(
    "/from-filter",
    response_model=CollectionFromFilterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a collection from a base-schema filter result",
)
async def create_collection_from_filter(
    request: CreateCollectionFromFilterRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_collections_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CollectionFromFilterResponse:
    if not supabase_client:
        raise _db_unavailable()
    resolved = resolve_filter_ids(supabase_client, request.filters, request.text_query)
    if resolved.total == 0:
        raise HTTPException(
            status_code=400,
            detail={"error": "Empty Result", "message": "The filter matches no judgments.", "code": "FILTER_EMPTY"},
        )
    try:
        check_cap(resolved, SAVE_FROM_FILTER_MAX_DOCUMENTS)
    except FilterTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "error": "Too Many Documents",
                "message": f"The filter matches {exc.total} judgments; a collection may hold at most {exc.cap}. Narrow the filter.",
                "code": "FILTER_TOO_LARGE",
                "total": exc.total,
                "cap": exc.cap,
                "jurisdiction": exc.jurisdiction,
            },
        ) from exc

    collection, added = await create_collection_from_ids(
        db, user_id=user.id, name=request.name, description=request.description, ids=resolved.ids
    )
    log_audit_background(background_tasks, user_id=user.id, action_type="collection_created",
                         resource_type="collection", resource_id=collection["id"])
    log_audit_background(
        background_tasks, user_id=user.id, action_type="collection_document_added",
        input_data={"source": "base_schema_filter", "count": added, "filters": request.filters},
        resource_type="collection", resource_id=collection["id"],
    )
    return CollectionFromFilterResponse(
        collections=[CreatedCollection(collection=Collection(**collection), added_count=added)],
        total_matched=resolved.total,
    )
```

(Jeśli zainstalowany Starlette nie ma `status.HTTP_413_CONTENT_TOO_LARGE`, użyj `status.HTTP_413_REQUEST_ENTITY_TOO_LARGE`.)

`backend/app/server.py`: obok `from app.collections import router as collections_router` dodaj `from app.collections_from_filter import router as collections_from_filter_router`; w `API_KEY_PROTECTED_ROUTERS` wstaw `collections_from_filter_router,` **bezpośrednio przed** `collections_router,` z komentarzem: `# literal /collections/<segment> routes must register before the /{collection_id} catch-all`.

- [ ] **Step 4: Testy + regresje kolekcji + lint**

```bash
cd backend && poetry run pytest tests/app/test_collections_from_filter.py tests/app/test_collections_batch_cap.py tests/app/test_collections_bearer_auth.py tests/app/test_base_schema_route_regressions.py -q && poetry run ruff check app tests && poetry run ruff format --check app tests
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/collections_from_filter.py backend/app/server.py backend/tests/app/test_collections_from_filter.py
git commit -m "feat(collections): POST /collections/from-filter (list-shaped, cap 5000, chunked bulk add)"
```

---

### Task 4: `completeness.py` — jedna definicja „puste" i „ukończone"

**Files:**
- Create: `backend/app/extraction_domain/completeness.py`
- Create: `backend/tests/app/test_completeness.py`

**Interfaces:**
- Produces:

```python
COMPLETED_STATUSES: frozenset[str] = frozenset({"completed", "success", "partially_completed"})
EMPTY_MARKERS: frozenset[str] = frozenset({"", "n/a", "na", "not available", "none", "null", "unknown",
                                           "brak", "brak danych", "nie dotyczy", "not applicable"})
def is_empty_value(value: Any) -> bool          # None, marker string (strip+lower), empty list/dict; 0/False are NOT empty
def flatten(obj: dict, prefix: str = "") -> dict[str, Any]   # "a.b" keys, same as results_router.flatten_dict
def completed_rows(results: list[dict]) -> list[dict]        # rows whose lower(status) in COMPLETED_STATUSES
def coverage_ratio(covered: int, total: int) -> float | None # round(covered/total, 4); None when total == 0
```
- Konsumenci: A `summary.py` (`field_completeness`), A `dataset_export.py` (`dataset_rows`), A `results_router._export_dataset_zip`, C `layout.py` (`coverage_ratio`), C `schema_tally.py` (`_filled` → `not is_empty_value`, `_OK_STATUSES` → `COMPLETED_STATUSES`).
- Uwaga w docstringu: SQL-owe `covered` w `get_extracted_facet_counts_by_jurisdiction` (plan C) używa tylko `NULL`/`''`, bo kolumny `base_*` są kodowane enumami; markery dotyczą wolnego tekstu LLM w `extraction_jobs.results`.

- [ ] **Step 1: Testy (czerwone)**

`backend/tests/app/test_completeness.py`:

```python
"""One definition of "empty" and "completed" for extraction results (Foundation).

Used by the research-flow summary (field completeness), the dataset export and
the PL/UK schema tally — three consumers that previously carried three copies.
"""

from __future__ import annotations

import pytest

from app.extraction_domain.completeness import (
    COMPLETED_STATUSES,
    EMPTY_MARKERS,
    completed_rows,
    coverage_ratio,
    flatten,
    is_empty_value,
)

pytestmark = pytest.mark.unit


def test_completed_statuses_are_the_three_worker_values():
    assert COMPLETED_STATUSES == {"completed", "success", "partially_completed"}


@pytest.mark.parametrize("value", ["", "  ", "N/A", "Not Available", "brak danych", "UNKNOWN", None, [], {}])
def test_empty_markers(value):
    assert is_empty_value(value)


@pytest.mark.parametrize("value", [0, False, "0", ["x"], {"a": 1}, "Nie dotyczy sprawy", "gender_unknown"])
def test_non_empty_values(value):
    assert not is_empty_value(value)


def test_markers_are_lowercase_and_stripped_so_matching_is_exact():
    assert all(m == m.strip().lower() for m in EMPTY_MARKERS)


def test_flatten_uses_dotted_keys_and_keeps_empty_dicts_as_values():
    assert flatten({"a": 1, "b": {"c": "x", "d": {"e": None}}, "f": {}}) == {
        "a": 1, "b.c": "x", "b.d.e": None, "f": {},
    }


def test_completed_rows_is_case_insensitive_and_skips_failed():
    rows = [{"status": "completed"}, {"status": "SUCCESS"}, {"status": "failed"}, {"status": None}, {}]
    assert completed_rows(rows) == [{"status": "completed"}, {"status": "SUCCESS"}]


def test_coverage_ratio():
    assert coverage_ratio(0, 0) is None
    assert coverage_ratio(3, 4) == 0.75
    assert coverage_ratio(153, 200) == 0.765
    assert coverage_ratio(2, 3) == 0.6667
```

- [ ] **Step 2: Uruchom — czerwone**

```bash
cd backend && poetry run pytest tests/app/test_completeness.py -q
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementacja**

```python
"""What counts as an empty extracted value, and which result rows are "done".

Shared by: extraction_domain/summary.py (field completeness, plan A),
extraction_domain/dataset_export.py (plan A), compare/layout.py and
compare/schema_tally.py (plan C). One home so the sample review, the dataset
export and the PL/UK comparison cannot disagree about a "n/a".

Scope note: these markers apply to free-text LLM output in
extraction_jobs.results. The SQL `covered` in
get_extracted_facet_counts_by_jurisdiction treats only NULL / '' as empty,
because base_* columns are enum-coded and cannot contain "n/a".
"""

from __future__ import annotations

from typing import Any

COMPLETED_STATUSES: frozenset[str] = frozenset({"completed", "success", "partially_completed"})

EMPTY_MARKERS: frozenset[str] = frozenset({
    "", "n/a", "na", "not available", "none", "null", "unknown",
    "brak", "brak danych", "nie dotyczy", "not applicable",
})


def is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in EMPTY_MARKERS
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def flatten(obj: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    """Nested dicts → dotted keys; an empty dict stays a (empty) value."""
    items: dict[str, Any] = {}
    for key, value in obj.items():
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict) and value:
            items.update(flatten(value, name))
        else:
            items[name] = value
    return items


def completed_rows(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in results if str(r.get("status") or "").lower() in COMPLETED_STATUSES]


def coverage_ratio(covered: int, total: int) -> float | None:
    return None if total == 0 else round(covered / total, 4)
```

- [ ] **Step 4: Testy + lint**

```bash
cd backend && poetry run pytest tests/app/test_completeness.py -q && poetry run ruff check app/extraction_domain/completeness.py tests/app/test_completeness.py
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/completeness.py backend/tests/app/test_completeness.py
git commit -m "feat(extraction): shared completeness helpers (empty markers, completed statuses, coverage ratio)"
```

---

### Task 5: Frontend — typy `Jurisdiction`/`decision_date`, rejestr pól rdzeniowych, chipsy

**Files:**
- Modify: `frontend/types/base-schema-filter.ts` (po `AppealOutcome`, w `BaseSchemaFilters`)
- Modify: `frontend/lib/extractions/base-schema-filter-config.ts` (po `FILTER_FIELD_BY_NAME` ~484; `formatEnumLabel` ~526)
- Modify: `frontend/components/filters/extracted-search-filters.tsx:594-660` (`ActiveFilterChips`, `describeActive`)
- Modify: `frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts`
- Create: `frontend/__tests__/components/filters/active-filter-chips.test.tsx`

**Interfaces:**
- Produces (types): `export type Jurisdiction = "PL" | "UK"`; `BaseSchemaFilters.jurisdiction?: Jurisdiction[]`; `BaseSchemaFilters.decision_date?: string | DateRange`.
- Produces (config): `CORE_FILTER_FIELDS: readonly FilterFieldConfig[]` (dwa wpisy, `group: "court_date"`), `CORE_FILTER_FIELD_BY_NAME`, `ALL_FILTER_FIELD_BY_NAME`, `isCoreFilterField(field: string): boolean`. **`FILTER_FIELDS` nietknięte** → `FIELDS_BY_GROUP`, drawer, quick filters, mapa Meili bez zmian.
- Konsumenci: B (`ScopeFilters`, `filter-match`), C (`lib/compare/types.ts` importuje `Jurisdiction` zamiast definiować własny; `CompareFilterBar` renderuje `ActiveFilterChips`).

- [ ] **Step 1: Testy (czerwone)**

W `frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts`: dodaj `jurisdiction: true, decision_date: true` do `REQUIRED_KEYS` (TypeScript wymusi to po zmianie typu), zmień pierwszy test i dodaj blok rejestru rdzeniowego:

```ts
import {
  CORE_FILTER_FIELDS,
  CORE_FILTER_FIELD_BY_NAME,
  ALL_FILTER_FIELD_BY_NAME,
  isCoreFilterField,
  formatEnumLabel,
  // ...istniejące importy (FILTER_FIELDS, FILTER_FIELD_BY_NAME, …)
} from "@/lib/extractions/base-schema-filter-config";

// Core judgments.* columns filtered by the RPC (migration 20260920000001) but kept
// OUT of FILTER_FIELDS so BaseFiltersDrawer / QuickFilters / Meili mapping stay as
// they are. They get chips (+ Spec B's ScopeFilters strip) instead.
const CORE_KEYS = new Set<string>(["jurisdiction", "decision_date"]);

  it("covers every BaseSchemaFilters key (registry may be a superset)", () => {
    const fields = new Set(FILTER_FIELDS.map((c) => c.field));
    const required = new Set(Object.keys(REQUIRED_KEYS).filter((k) => !CORE_KEYS.has(k)));
    // ...reszta bez zmian
  });

describe("core filter fields (jurisdiction, decision_date)", () => {
  it("are registered separately and never leak into FILTER_FIELDS", () => {
    expect(CORE_FILTER_FIELDS.map((c) => c.field).sort()).toEqual(["decision_date", "jurisdiction"]);
    for (const c of CORE_FILTER_FIELDS) {
      expect(FILTER_FIELD_BY_NAME[c.field]).toBeUndefined();
      expect(CORE_FILTER_FIELD_BY_NAME[c.field]).toBe(c);
      expect(ALL_FILTER_FIELD_BY_NAME[c.field]).toBe(c);
      expect(isCoreFilterField(c.field)).toBe(true);
    }
    expect(isCoreFilterField("offender_gender")).toBe(false);
  });

  it("jurisdiction is an enum_multi over exactly PL and UK", () => {
    const cfg = CORE_FILTER_FIELD_BY_NAME.jurisdiction;
    expect(cfg.control).toBe("enum_multi");
    expect([...(cfg.enumValues ?? [])].sort()).toEqual(["PL", "UK"]);
  });

  it("decision_date is a date_range", () => {
    expect(CORE_FILTER_FIELD_BY_NAME.decision_date.control).toBe("date_range");
  });

  it("ALL_FILTER_FIELD_BY_NAME still resolves every FILTER_FIELDS entry", () => {
    for (const c of FILTER_FIELDS) expect(ALL_FILTER_FIELD_BY_NAME[c.field]).toBe(c);
  });

  it("formatEnumLabel leaves two-letter country codes alone", () => {
    expect(formatEnumLabel("PL")).toBe("PL");
    expect(formatEnumLabel("gender_female")).not.toBe("gender_female");
  });
});
```

`frontend/__tests__/components/filters/active-filter-chips.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

import { ActiveFilterChips } from "@/components/filters/extracted-search-filters";

describe("ActiveFilterChips — core fields", () => {
  it("renders jurisdiction and decision_date as removable chips", () => {
    const onRemove = jest.fn();
    render(
      <ActiveFilterChips
        filters={{
          jurisdiction: ["PL", "UK"],
          decision_date: { from: "2015-01-01", to: "2024-12-31" },
          offender_gender: ["gender_female"],
        }}
        textQuery=""
        onRemove={onRemove}
        onClearText={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText("Jurisdiction:")).toBeInTheDocument();
    expect(screen.getByText("PL, UK")).toBeInTheDocument();
    expect(screen.getByText("Decision date:")).toBeInTheDocument();
    expect(screen.getByText("2015-01-01→2024-12-31")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Jurisdiction" }));
    expect(onRemove).toHaveBeenCalledWith("jurisdiction");
  });
});
```

- [ ] **Step 2: Uruchom — czerwone**

```bash
cd frontend && npx jest __tests__/lib/extractions/base-schema-filter-config.test.ts __tests__/components/filters/active-filter-chips.test.tsx
```
Expected: FAIL — brak eksportów; test chipsów nie znajduje „Jurisdiction:" (nieznane pole → `config` undefined → chip pominięty, `extracted-search-filters.tsx:640-642`).

- [ ] **Step 3: Typy**

W `frontend/types/base-schema-filter.ts` po `export type AppealOutcome = ...`:

```ts
/** Core `judgments.jurisdiction` — CHECK (jurisdiction IN ('PL','UK')). */
export type Jurisdiction = "PL" | "UK";
```

Na początku `BaseSchemaFilters`:

```ts
  // core judgment columns (judgments.jurisdiction / judgments.decision_date;
  // read by list_extracted_filter_matches since 20260920000001). Not base_* fields.
  jurisdiction?: Jurisdiction[];
  decision_date?: string | DateRange;
```

- [ ] **Step 4: Rejestr**

W `base-schema-filter-config.ts`, po `FILTER_FIELD_BY_NAME`:

```ts
// -----------------------------------------------------------------------------
// Core judgment columns (judgments.jurisdiction, judgments.decision_date).
//
// Filtered by the RPC since 20260920000001, but kept OUT of FILTER_FIELDS on
// purpose: FIELDS_BY_GROUP drives BaseFiltersDrawer and filter-fields-map.ts
// (Meili `base_*` columns), and neither applies to these two. They are
// surfaced by ActiveFilterChips + the URL blob (+ Spec B's ScopeFilters) only.
// -----------------------------------------------------------------------------

const JURISDICTIONS = ["PL", "UK"] as const;

export const CORE_FILTER_FIELDS: readonly FilterFieldConfig[] = [
  {
    field: "jurisdiction",
    label: "Jurisdiction",
    help: "Country of the court.",
    group: "court_date",
    control: "enum_multi",
    enumValues: JURISDICTIONS,
  },
  {
    field: "decision_date",
    label: "Decision date",
    help: "Date the judgment was handed down (both jurisdictions).",
    group: "court_date",
    control: "date_range",
  },
] as const;

export const CORE_FILTER_FIELD_BY_NAME: Record<string, FilterFieldConfig> =
  Object.fromEntries(CORE_FILTER_FIELDS.map((c) => [c.field, c]));

/** Every field the RPC accepts: base_* registry + core columns. */
export const ALL_FILTER_FIELD_BY_NAME: Record<string, FilterFieldConfig> = {
  ...FILTER_FIELD_BY_NAME,
  ...CORE_FILTER_FIELD_BY_NAME,
};

export function isCoreFilterField(field: string): boolean {
  return field in CORE_FILTER_FIELD_BY_NAME;
}
```

Na początku `formatEnumLabel` dodaj: `if (/^[A-Z]{2}$/.test(value)) return value;` (chip mówi `PL`, nie `Pl`).

- [ ] **Step 5: Chipsy przez mapę-sumę**

W `extracted-search-filters.tsx`: importuj `ALL_FILTER_FIELD_BY_NAME` obok `FILTER_FIELD_BY_NAME`; w `ActiveFilterChips` zamień `const config = FILTER_FIELD_BY_NAME[field];` na `const config = ALL_FILTER_FIELD_BY_NAME[field];`. W `describeActive` gałąź `Array.isArray(value)` zamień na:

```ts
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (config.control === "enum_multi" && value.length <= 3) {
      return value.map((v) => formatEnumLabel(String(v))).join(", ");
    }
    return `${value.length}`;
  }
```

- [ ] **Step 6: Testy + validate**

```bash
cd frontend && npx jest __tests__/lib/extractions __tests__/components/filters __tests__/components/search && npm run validate
```
Expected: PASS; tsc czysty.

- [ ] **Step 7: Commit**

```bash
git add frontend/types/base-schema-filter.ts frontend/lib/extractions/base-schema-filter-config.ts frontend/components/filters/extracted-search-filters.tsx frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts frontend/__tests__/components/filters/active-filter-chips.test.tsx
git commit -m "feat(extractions-search): core filter fields (jurisdiction, decision_date) with chips"
```

---

### Task 6: Frontend — `drawer-adapter.ts` (poprawka epoch↔ISO) + kodek URL `buildFilterSearchParams`/`buildFilterHref`

**Files:**
- Create: `frontend/lib/extractions/drawer-adapter.ts`
- Modify: `frontend/app/search/extractions/page.tsx:33-122` (usuń lokalne `toDrawerFilters`/`applyDrawerChange`, importuj)
- Modify: `frontend/lib/extractions/use-extracted-data-filters.ts` (nowe eksporty; `writeUrl` używa kodeka)
- Create: `frontend/__tests__/lib/extractions/drawer-adapter.test.ts`
- Modify: `frontend/__tests__/lib/extractions/use-extracted-data-filters.test.ts`

Dlaczego adapter tu i w tej wersji: `page.tsx:66-72` mapuje ISO `{from,to}` z RPC do `min/max`, ale `DateRangeControl` (`components/search/controls/DateRangeControl.tsx:4-13`) oczekuje i emituje **sekundy epoki**, które `applyDrawerChange` (`page.tsx:110-115`) zapisuje z powrotem do `from/to` → RPC rzutuje `'1735689600'::DATE` i błąd. C planował przenieść ten kod „verbatim" (razem z błędem); B go naprawia. `decision_date` potrzebuje tego samego adaptera.

**Interfaces:**
- Produces (`drawer-adapter.ts`): `toDrawerFilters(s: BaseSchemaFilters): BaseFilters` (pomija pola substring **i rdzeniowe**), `applyDrawerChange(s, field, value: BaseFilterValue | undefined): BaseSchemaFilters`, `isoToEpochSeconds(iso?: string): number | undefined`, `epochSecondsToIso(s?: number): string | undefined`, `coreToDrawerValue(field, value): BaseFilterValue | undefined`, `applyCoreChange` (= `applyDrawerChange`, dla czytelności call-site'ów B).
- Produces (`use-extracted-data-filters.ts`): `export interface FilterUrlState { filters: BaseSchemaFilters; textQuery?: string; page?: number; nlQuestion?: string }`, `export function buildFilterSearchParams(state: FilterUrlState): URLSearchParams` (pisze `f`, `q`, `page` (> 1), `nl` (obcięte do 255) — tylko gdy ustawione), `export function buildFilterHref(pathname: string, state: FilterUrlState, origin?: string): string`.
- Konsumenci: B (`ScopeFilters`, `?nl=` — dopisuje `nlQuestion` do `FilterState` hooka i podaje je do `buildFilterSearchParams`; `buildDocumentHref` = `buildFilterHref('/documents/<id>', {filters}) + '#base-fields'`), C (`CompareContent` używa `applyDrawerChange`; `buildComparePermalink(filters, text, origin) = buildFilterHref('/compare', { filters, textQuery: text }, origin)`).

- [ ] **Step 1: Testy (czerwone)**

`frontend/__tests__/lib/extractions/drawer-adapter.test.ts`:

```ts
import {
  applyCoreChange,
  applyDrawerChange,
  coreToDrawerValue,
  epochSecondsToIso,
  isoToEpochSeconds,
  toDrawerFilters,
} from "@/lib/extractions/drawer-adapter";

describe("drawer-adapter dates", () => {
  it("maps ISO from/to into epoch-second min/max for DateRangeControl", () => {
    const out = toDrawerFilters({ date_of_appeal_court_judgment: { from: "2025-01-01", to: "2025-12-31" } });
    expect(out.date_of_appeal_court_judgment).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2025-01-01"), max: isoToEpochSeconds("2025-12-31") },
    });
  });

  it("writes epoch seconds back as ISO from/to (never raw numbers)", () => {
    const next = applyDrawerChange({}, "date_of_appeal_court_judgment", {
      kind: "date_range",
      range: { min: isoToEpochSeconds("2024-06-01") },
    });
    expect(next.date_of_appeal_court_judgment).toEqual({ from: "2024-06-01", to: undefined });
  });

  it("round-trips epoch <-> iso", () => {
    expect(epochSecondsToIso(isoToEpochSeconds("2015-01-01"))).toBe("2015-01-01");
    expect(isoToEpochSeconds(undefined)).toBeUndefined();
    expect(epochSecondsToIso(undefined)).toBeUndefined();
  });
});

describe("drawer-adapter core fields", () => {
  it("keeps jurisdiction and decision_date OUT of the drawer state", () => {
    const out = toDrawerFilters({
      jurisdiction: ["PL"],
      decision_date: { from: "2015-01-01" },
      offender_gender: ["gender_female"],
    });
    expect(Object.keys(out)).toEqual(["offender_gender"]);
  });

  it("exposes them through coreToDrawerValue/applyCoreChange", () => {
    expect(coreToDrawerValue("jurisdiction", ["PL", "UK"])).toEqual({ kind: "enum_multi", values: ["PL", "UK"] });
    expect(coreToDrawerValue("decision_date", { from: "2015-01-01", to: "2024-12-31" })).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2015-01-01"), max: isoToEpochSeconds("2024-12-31") },
    });
    const next = applyCoreChange({ offender_gender: ["gender_female"] }, "jurisdiction", { kind: "enum_multi", values: ["UK"] });
    expect(next).toEqual({ offender_gender: ["gender_female"], jurisdiction: ["UK"] });
    expect(applyCoreChange(next, "jurisdiction", undefined)).toEqual({ offender_gender: ["gender_female"] });
  });

  it("keeps numeric and boolean behaviour identical to the old page adapter", () => {
    expect(toDrawerFilters({ num_victims: 3 }).num_victims).toEqual({ kind: "numeric_range", range: { min: 3, max: 3 } });
    expect(applyDrawerChange({}, "did_offender_confess", { kind: "boolean_tri", value: false })).toEqual({ did_offender_confess: false });
    expect(applyDrawerChange({}, "co_def_acc_num", { kind: "numeric_range", range: { min: 2, max: 2 } })).toEqual({ co_def_acc_num: 2 });
  });
});
```

Dopisz do `frontend/__tests__/lib/extractions/use-extracted-data-filters.test.ts`:

```ts
import { buildFilterHref, buildFilterSearchParams, decodeFilters, encodeFilters } from "@/lib/extractions/use-extracted-data-filters";

describe("core fields round-trip through the opaque blob unchanged", () => {
  it("keeps jurisdiction and decision_date", () => {
    const filters = { jurisdiction: ["PL", "UK"] as ("PL" | "UK")[], decision_date: { from: "2015-01-01", to: "2024-12-31" } };
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });
});

describe("buildFilterSearchParams / buildFilterHref (one codec for every filter-bearing page)", () => {
  it("writes f, q, page and nl only when set", () => {
    const params = buildFilterSearchParams({
      filters: { jurisdiction: ["PL"] },
      textQuery: "fraud",
      page: 2,
      nlQuestion: "kobiety skazane za oszustwo, PL, 2015–2024",
    });
    expect(params.get("f")).toBe(encodeFilters({ jurisdiction: ["PL"] }));
    expect(params.get("q")).toBe("fraud");
    expect(params.get("page")).toBe("2");
    expect(params.get("nl")).toBe("kobiety skazane za oszustwo, PL, 2015–2024");
  });

  it("omits empty values and page 1", () => {
    expect(buildFilterSearchParams({ filters: {}, textQuery: "  ", page: 1, nlQuestion: "" }).toString()).toBe("");
  });

  it("builds hrefs for /search/extractions, /compare and /documents alike", () => {
    const filters = { appellant: ["offender" as const] };
    expect(buildFilterHref("/compare", { filters, textQuery: "fraud" }, "https://juddges.com"))
      .toBe(`https://juddges.com/compare?f=${encodeFilters(filters)}&q=fraud`);
    expect(buildFilterHref("/compare", { filters: {} }, "https://juddges.com")).toBe("https://juddges.com/compare");
    expect(buildFilterHref("/documents/a%20b", { filters })).toBe(`/documents/a%20b?f=${encodeFilters(filters)}`);
  });
});
```

- [ ] **Step 2: Uruchom — czerwone**

```bash
cd frontend && npx jest __tests__/lib/extractions/drawer-adapter.test.ts __tests__/lib/extractions/use-extracted-data-filters.test.ts
```
Expected: FAIL — module not found / `buildFilterSearchParams is not a function`.

- [ ] **Step 3: `drawer-adapter.ts`**

```ts
// =============================================================================
// Adapter: BaseSchemaFilters (RPC JSON) <-> BaseFilters (drawer/control union).
//
// Lifted out of app/search/extractions/page.tsx so /search/extractions,
// /compare (Spec C) and Spec B's ScopeFilters share ONE conversion. Dates: the
// RPC speaks ISO `{from,to}`; the controls speak epoch-second `{min,max}`
// (DateRangeControl.tsx). The old page adapter passed strings through and
// produced `'1735689600'::DATE` casts in Postgres.
// =============================================================================

import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

import { isCoreFilterField } from "./base-schema-filter-config";

const SUBSTRING_FIELDS = new Set([
  "case_name",
  "neutral_citation_number",
  "appeal_court_judges_names",
  "offender_representative_name",
]);

export function isoToEpochSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

export function epochSecondsToIso(s: number | undefined): string | undefined {
  if (typeof s !== "number" || !Number.isFinite(s)) return undefined;
  return new Date(s * 1000).toISOString().slice(0, 10);
}

function toDrawerValue(value: unknown): BaseFilterValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.length === 0 ? undefined : { kind: "tag_array", values: value as string[] };
  }
  if (typeof value === "boolean") return { kind: "boolean_tri", value };
  if (typeof value === "number") return { kind: "numeric_range", range: { min: value, max: value } };
  if (typeof value === "string") {
    const epoch = isoToEpochSeconds(value); // scalar ISO date (RPC accepts "YYYY-MM-DD")
    return epoch === undefined ? undefined : { kind: "date_range", range: { min: epoch, max: epoch } };
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("from" in v || "to" in v) {
      return {
        kind: "date_range",
        range: { min: isoToEpochSeconds(v.from as string | undefined), max: isoToEpochSeconds(v.to as string | undefined) },
      };
    }
    if ("min" in v || "max" in v) {
      return { kind: "numeric_range", range: { min: v.min as number | undefined, max: v.max as number | undefined } };
    }
  }
  return undefined;
}

/** Non-substring, non-core fields → drawer union. */
export function toDrawerFilters(s: BaseSchemaFilters): BaseFilters {
  const out: BaseFilters = {};
  for (const [field, value] of Object.entries(s)) {
    if (SUBSTRING_FIELDS.has(field) || isCoreFilterField(field)) continue;
    const v = toDrawerValue(value);
    if (v) out[field] = v;
  }
  return out;
}

/** Core field (jurisdiction / decision_date) → control value. */
export function coreToDrawerValue(field: string, value: unknown): BaseFilterValue | undefined {
  const v = toDrawerValue(value);
  if (v?.kind === "tag_array" && field === "jurisdiction") return { kind: "enum_multi", values: v.values };
  return v;
}

function fromDrawerValue(value: BaseFilterValue): unknown {
  switch (value.kind) {
    case "tag_array":
    case "enum_multi":
      return value.values;
    case "boolean_tri":
      return value.value;
    case "numeric_range":
      return value.range.min === value.range.max && value.range.min !== undefined
        ? value.range.min
        : { min: value.range.min, max: value.range.max };
    case "date_range":
      return { from: epochSecondsToIso(value.range.min), to: epochSecondsToIso(value.range.max) };
  }
}

export function applyDrawerChange(
  s: BaseSchemaFilters,
  field: string,
  value: BaseFilterValue | undefined,
): BaseSchemaFilters {
  const next = { ...s } as Record<string, unknown>;
  if (value === undefined) delete next[field];
  else next[field] = fromDrawerValue(value);
  return next as BaseSchemaFilters;
}

/** Same as applyDrawerChange; named separately so call sites read clearly. */
export const applyCoreChange = applyDrawerChange;
```

W `page.tsx`: usuń lokalne `toDrawerFilters`/`applyDrawerChange` (linie 33–122), dodaj `import { applyDrawerChange, toDrawerFilters } from "@/lib/extractions/drawer-adapter";` i `import { isCoreFilterField } from "@/lib/extractions/base-schema-filter-config";`. W `resetDrawerFilters` rozszerz predykat o `&& !isCoreFilterField(field)`, żeby reset drawera nie kasował pól rdzeniowych. Usuń nieużywany import `BaseFilters`, jeśli lint krzyczy.

- [ ] **Step 4: Kodek w `use-extracted-data-filters.ts`**

W nagłówku komentarza dopisz linię `//   ?nl=<text>          — optional: the natural-language question a filter came from (Spec B)`. Przed hookiem (po `countActive`) dodaj:

```ts
// -----------------------------------------------------------------------------
// URL codec — the ONE place that writes ?f / ?q / ?page / ?nl. Used by this
// hook (/search/extractions and any page mounting it, e.g. /compare) and by
// href builders (document links, compare permalinks).
// -----------------------------------------------------------------------------

export interface FilterUrlState {
  filters: BaseSchemaFilters;
  textQuery?: string;
  page?: number;
  nlQuestion?: string;
}

export function buildFilterSearchParams(state: FilterUrlState): URLSearchParams {
  const params = new URLSearchParams();
  const blob = encodeFilters(state.filters);
  if (blob) params.set("f", blob);
  const q = (state.textQuery ?? "").trim();
  if (q !== "") params.set("q", q);
  if ((state.page ?? 1) > 1) params.set("page", String(state.page));
  const nl = (state.nlQuestion ?? "").trim();
  if (nl !== "") params.set("nl", nl.slice(0, 255));
  return params;
}

export function buildFilterHref(pathname: string, state: FilterUrlState, origin = ""): string {
  const qs = buildFilterSearchParams(state).toString();
  return `${origin}${pathname}${qs ? `?${qs}` : ""}`;
}
```

W `writeUrl` zamień budowanie parametrów na:

```ts
      const queryString = buildFilterSearchParams(next).toString();
```
(`FilterState` ma `filters`, `textQuery`, `page` — jest strukturalnie zgodny z `FilterUrlState`; B dopisze `nlQuestion`).

- [ ] **Step 5: Testy + validate**

```bash
cd frontend && npx jest __tests__/lib/extractions __tests__/app/search && npm run validate
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/extractions/drawer-adapter.ts frontend/lib/extractions/use-extracted-data-filters.ts frontend/app/search/extractions/page.tsx frontend/__tests__/lib/extractions/drawer-adapter.test.ts frontend/__tests__/lib/extractions/use-extracted-data-filters.test.ts
git commit -m "fix(extractions-search): shared drawer adapter (ISO<->epoch) and one URL codec for filter pages"
```

---

### Task 7: Frontend — helper `proxyToBackend`, trasa `/api/collections/from-filter`, klient

**Files:**
- Create: `frontend/app/api/utils/backend-proxy.ts`
- Create: `frontend/app/api/collections/from-filter/route.ts`
- Modify: `frontend/types/base-schema-filter.ts` (typy request/response)
- Modify: `frontend/lib/api/collections.ts` (dopisz `createCollectionFromFilter`, `CollectionFromFilterError`)
- Create: `frontend/tests/unit/api/collections/from-filter.route.test.ts`
- Create: `frontend/__tests__/lib/api/collections-from-filter.test.ts`

**Interfaces:**
- Produces (`backend-proxy.ts`):

```ts
export interface ProxyToBackendOptions {
  path: string;                         // "/collections/from-filter"
  method?: "GET" | "POST" | "DELETE";   // default GET
  body?: unknown;                       // JSON-encoded when defined
  passthroughHeaders?: readonly string[]; // when set: stream response.body and copy these headers (CSV/ZIP)
  timeoutMs?: number;                   // default 30_000
}
export async function proxyToBackend(opts: ProxyToBackendOptions): Promise<NextResponse>
```
Zachowanie: brak sesji → `401 {"error":"Authentication required"}` bez dotykania backendu; nagłówki `X-API-Key`, `Authorization: Bearer <access_token>`, `Content-Type: application/json` gdy jest body; **status i JSON upstreamu przechodzą bez zmian** (także `detail` z FastAPI); 204 → puste body; wyjątek → `500 {"error": message}`.
- Produces (types): `CreateCollectionFromFilterRequest { name; description?; filters: BaseSchemaFilters; text_query?: string | null }`, `CreatedCollection { jurisdiction: Jurisdiction | null; collection: {...}; added_count }`, `CollectionFromFilterResponse { collections: CreatedCollection[]; total_matched; pair_id: string | null }`, `SAVE_FROM_FILTER_MAX_DOCUMENTS = 5000`.
- Produces (client): `createCollectionFromFilter(req): Promise<CollectionFromFilterResponse>`; `CollectionFromFilterError extends Error { code: string; status: number; total?: number; cap?: number; jurisdiction?: string | null }` — rozpakowuje `body.detail ?? body`.
- Konsumenci: B (`SaveAsCollectionDialog` czyta `result.collections[0].collection.id`), C (`createCollectionPair` = ten klient ze `split_by_jurisdiction: true`, czyta `pair_id`), A (`/api/extractions/[id]/summary` = `proxyToBackend({ path, method: 'GET' })`), C (5 tras BFF).

- [ ] **Step 1: Testy (czerwone)**

`frontend/tests/unit/api/collections/from-filter.route.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser, getSession: mockGetSession } })),
}));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  logger: { error: jest.fn(), info: jest.fn() },
  default: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })) },
}));

global.fetch = jest.fn();

import { POST } from "@/app/api/collections/from-filter/route";

const body = { name: "fraud PL 2015–2024", filters: { jurisdiction: ["PL"] }, text_query: null };

function req() {
  return new NextRequest("http://localhost:3026/api/collections/from-filter", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/collections/from-filter (via proxyToBackend)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("401s without a session and never calls the backend", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(req())).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards body with bearer + api key and returns the 201 body unchanged", async () => {
    const upstream = { collections: [{ jurisdiction: null, collection: { id: "c1" }, added_count: 3 }], total_matched: 3, pair_id: null };
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 201, headers: { "content-type": "application/json" } }));
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(upstream);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/collections/from-filter");
    expect(init.headers.Authorization).toBe("Bearer jwt");
    expect(init.headers["X-API-Key"]).toBe("k");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("passes a FastAPI 413 detail through untouched (the client unwraps it)", async () => {
    const detail = { error: "Too Many Documents", code: "FILTER_TOO_LARGE", total: 7321, cap: 5000, jurisdiction: null, message: "…" };
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ detail }), { status: 413, headers: { "content-type": "application/json" } }));
    const res = await POST(req());
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail });
  });
});
```

`frontend/__tests__/lib/api/collections-from-filter.test.ts`:

```ts
import { CollectionFromFilterError, createCollectionFromFilter } from "@/lib/api/collections";

jest.mock("@/lib/analytics/track", () => ({ track: jest.fn() }));

const ok = { collections: [{ jurisdiction: null, collection: { id: "c9" }, added_count: 42 }], total_matched: 42, pair_id: null };

describe("createCollectionFromFilter", () => {
  beforeEach(() => { global.fetch = jest.fn(); });

  it("posts to the BFF route and returns the list-shaped response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(ok), { status: 201 }));
    const result = await createCollectionFromFilter({ name: "n", filters: { jurisdiction: ["PL"] }, text_query: "fraud" });
    expect(result.collections[0].collection.id).toBe("c9");
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/collections/from-filter");
    expect(JSON.parse(init.body)).toEqual({ name: "n", filters: { jurisdiction: ["PL"] }, text_query: "fraud" });
  });

  it("unwraps FastAPI `detail` into a typed error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(
      JSON.stringify({ detail: { message: "too big", code: "FILTER_TOO_LARGE", total: 7000, cap: 5000, jurisdiction: "PL" } }),
      { status: 413 },
    ));
    await expect(createCollectionFromFilter({ name: "n", filters: {} })).rejects.toMatchObject({
      name: "CollectionFromFilterError", message: "too big", code: "FILTER_TOO_LARGE", status: 413, total: 7000, cap: 5000, jurisdiction: "PL",
    });
  });

  it("also understands the BFF's own flat 401 body", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }));
    await expect(createCollectionFromFilter({ name: "n", filters: {} })).rejects.toBeInstanceOf(CollectionFromFilterError);
  });
});
```

- [ ] **Step 2: Uruchom — czerwone**

```bash
cd frontend && npx jest tests/unit/api/collections/from-filter.route.test.ts __tests__/lib/api/collections-from-filter.test.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Helper proxy**

`frontend/app/api/utils/backend-proxy.ts`:

```ts
import { NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const apiLogger = logger.child("backend-proxy");

export interface ProxyToBackendOptions {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  passthroughHeaders?: readonly string[];
  timeoutMs?: number;
}

/**
 * Authenticated BFF → FastAPI forwarder (Foundation for /collections/from-filter,
 * /extractions/{id}/summary, /compare/*, /collections/pairs/*).
 *
 * Upstream status and body pass through unchanged — including FastAPI's
 * `{"detail": {...}}` error envelope — so clients unwrap errors in ONE place
 * (see lib/api/collections.ts::CollectionFromFilterError). Existing routes are
 * not migrated; new routes must use this instead of copying the auth block.
 */
export async function proxyToBackend(opts: ProxyToBackendOptions): Promise<NextResponse> {
  const { path, method = "GET", body, passthroughHeaders, timeoutMs = 30_000 } = opts;
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const headers: Record<string, string> = {
      "X-API-Key": process.env.BACKEND_API_KEY as string,
      Authorization: `Bearer ${accessToken}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${getBackendUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 204) return new NextResponse(null, { status: 204 });

    if (passthroughHeaders && response.ok) {
      const picked = new Headers();
      for (const name of passthroughHeaders) {
        const value = response.headers.get(name);
        if (value) picked.set(name, value);
      }
      return new NextResponse(response.body, { status: response.status, headers: picked });
    }

    const text = await response.text();
    if (!response.ok) apiLogger.error(`backend ${method} ${path} → ${response.status}`, { body: text.slice(0, 500) });
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    apiLogger.error(`proxyToBackend ${method} ${path} failed`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
```

(Sprawdź w `@/lib/logger`, czy `logger.child` istnieje — tak używa go `facets/[field]/route.ts`; jeśli eksport domyślny jest inny, dopasuj import, nie helper.)

`frontend/app/api/collections/from-filter/route.ts`:

```ts
import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/** POST /api/collections/from-filter → backend POST /collections/from-filter (Foundation). */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend({ path: "/collections/from-filter", method: "POST", body });
}
```

- [ ] **Step 4: Typy + klient**

W `frontend/types/base-schema-filter.ts` dopisz na końcu:

```ts
// -----------------------------------------------------------------------------
// Save-as-collection (POST /api/collections/from-filter). List-shaped so Spec C
// can add `split_by_jurisdiction` and return two collections + pair_id.
// -----------------------------------------------------------------------------

export interface CreateCollectionFromFilterRequest {
  name: string;
  description?: string;
  filters: BaseSchemaFilters;
  text_query?: string | null;
}

export interface CreatedCollection {
  jurisdiction: Jurisdiction | null;
  collection: { id: string; user_id: string; name: string; description?: string | null; created_at: string; updated_at: string };
  added_count: number;
}

export interface CollectionFromFilterResponse {
  collections: CreatedCollection[];
  total_matched: number;
  pair_id: string | null;
}

/** Max documents per collection created from a filter (mirrors backend SAVE_FROM_FILTER_MAX_DOCUMENTS). */
export const SAVE_FROM_FILTER_MAX_DOCUMENTS = 5000;
```

W `frontend/lib/api/collections.ts` dopisz:

```ts
import type {
  CollectionFromFilterResponse,
  CreateCollectionFromFilterRequest,
} from "@/types/base-schema-filter";

export class CollectionFromFilterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly total?: number,
    public readonly cap?: number,
    public readonly jurisdiction?: string | null,
  ) {
    super(message);
    this.name = "CollectionFromFilterError";
  }
}

/** Unwraps FastAPI's `{detail: {...}}` or the BFF's flat `{error}` into one error type. */
async function throwCollectionFromFilterError(response: Response): Promise<never> {
  const data = await response.json().catch(() => ({}));
  const d = (data && typeof data === "object" && "detail" in data && data.detail && typeof data.detail === "object")
    ? (data.detail as Record<string, unknown>)
    : (data as Record<string, unknown>);
  throw new CollectionFromFilterError(
    String(d.message ?? d.error ?? "Failed to save collection"),
    String(d.code ?? "COLLECTION_FROM_FILTER_FAILED"),
    response.status,
    typeof d.total === "number" ? d.total : undefined,
    typeof d.cap === "number" ? d.cap : undefined,
    typeof d.jurisdiction === "string" || d.jurisdiction === null ? (d.jurisdiction as string | null) : undefined,
  );
}

export async function createCollectionFromFilter(
  request: CreateCollectionFromFilterRequest,
): Promise<CollectionFromFilterResponse> {
  const response = await fetch("/api/collections/from-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) await throwCollectionFromFilterError(response);
  const result = (await response.json()) as CollectionFromFilterResponse;
  for (const created of result.collections) {
    track("collection_created", { collection_id: created.collection.id, source: "base_schema_filter", count: created.added_count });
  }
  return result;
}
```

- [ ] **Step 5: Testy + validate**

```bash
cd frontend && npx jest tests/unit/api/collections __tests__/lib/api && npm run validate
```
Expected: PASS. (`route-reachability.test.ts` skanuje tylko `app/**/page.tsx` — trasa API nie potrzebuje wpisu.)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/utils/backend-proxy.ts frontend/app/api/collections/from-filter/route.ts frontend/types/base-schema-filter.ts frontend/lib/api/collections.ts frontend/tests/unit/api/collections/from-filter.route.test.ts frontend/__tests__/lib/api/collections-from-filter.test.ts
git commit -m "feat(bff): proxyToBackend helper, /api/collections/from-filter route and typed client"
```

---

### Task 8: Test infra — `synthetic-session.ts` + strażnik „brak nieoczekiwanych żądań"

**Files:**
- Create: `frontend/tests/route-contract-e2e/synthetic-session.ts`
- Modify: `frontend/tests/route-contract-e2e/extraction-path.spec.ts:33-35, 62-76, 97-131, 139-142` (import zamiast lokalnych definicji)

**Interfaces:**
- Produces: `export const APP_BASE_URL = 'http://127.0.0.1:3006'`, `export const ADAPTER_BASE_URL = 'http://127.0.0.1:4311'`, `export const USER_ID = '11111111-1111-4111-8111-111111111111'`, `export async function setSyntheticSession(context: BrowserContext): Promise<void>` (ciało **dosłownie** z `extraction-path.spec.ts:97-131`), `export async function expectNoUnexpectedStubRequests(request: APIRequestContext): Promise<void>` (GET `${ADAPTER_BASE_URL}/__route-contract/requests`, `expect(requests.filter(r => r.unexpected)).toEqual([])`).
- Konsumenci: A (Task 16 przenoszony `extractions.spec.ts`, Task 17), każdy przyszły uwierzytelniony spec B/C. `lint:route-contract-harness` lintuje cały katalog, więc plik jest objęty automatycznie.

- [ ] **Step 1: „Czerwony" krok — spec importuje nieistniejący moduł**

W `extraction-path.spec.ts` zamień lokalne `const APP_BASE_URL`, `ADAPTER_BASE_URL`, `USER_ID` (linie 33–35) i funkcję `setSyntheticSession` (97–131) na:

```ts
import {
  ADAPTER_BASE_URL,
  APP_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';
```
(zostaw `SEQUENCED_JOB_ID`, `COLLECTION_NAME`, `SCHEMA_NAME`, `resetAdapter`, `adapterRequests`, `extractionSequence` — są specyficzne dla tego specu). W `afterEach` (139–142) zamień asercję na `await expectNoUnexpectedStubRequests(request);`, jeśli obecna asercja jest równoważna (sprawdź: filtr `unexpected` → pusta lista); w przeciwnym razie zostaw obie.

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep synthetic-session
```
Expected: `Cannot find module './synthetic-session'`.

- [ ] **Step 2: Utwórz helper**

`frontend/tests/route-contract-e2e/synthetic-session.ts`:

```ts
/**
 * Shared session helper for the PR-gated route-contract harness (Foundation).
 *
 * The harness boots the standalone Next server against stub-services.mjs and
 * logs a user in with a synthetic `sb-127-auth-token` cookie — the only way a
 * PR-gated Playwright spec can be authenticated without a real Supabase project.
 * Body of setSyntheticSession is the one that lived in extraction-path.spec.ts.
 */
import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test';

export const APP_BASE_URL = 'http://127.0.0.1:3006';
export const ADAPTER_BASE_URL = 'http://127.0.0.1:4311';
export const USER_ID = '11111111-1111-4111-8111-111111111111';

export async function setSyntheticSession(context: BrowserContext): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;
  const session = {
    access_token: 'route-contract-valid',
    refresh_token: 'route-contract-valid-refresh',
    expires_in: 3_600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'route-contract@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-08-06T00:00:00.000Z',
    },
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString('base64url');

  await context.clearCookies();
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${encoded}`,
      url: APP_BASE_URL,
      expires: expiresAt,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

/** The stub marks any unrouted request `unexpected: true`; a spec must leave none behind. */
export async function expectNoUnexpectedStubRequests(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${ADAPTER_BASE_URL}/__route-contract/requests`);
  const { requests } = (await response.json()) as { requests: Array<{ unexpected?: boolean; method?: string; url?: string }> };
  expect(requests.filter((r) => r.unexpected)).toEqual([]);
}
```

Przed zapisem porównaj ciało z oryginałem: `sed -n '97,131p' frontend/tests/route-contract-e2e/extraction-path.spec.ts` (w stanie z `git show HEAD:…`) — musi być identyczne poza `export`.

- [ ] **Step 3: Lint harnessu + pełny route-contract**

```bash
cd frontend && npm run lint:route-contract-harness && npm run typecheck && npm run test:e2e:route-contract
```
Expected: PASS (`route-status`, `extraction-path`) — zero zmian zachowania.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/route-contract-e2e/synthetic-session.ts frontend/tests/route-contract-e2e/extraction-path.spec.ts
git commit -m "test(route-contract): extract synthetic-session helper and unexpected-request guard"
```

---

### Task 9: Dokumentacja referencyjna + pełna regresja + PR

**Files:**
- Create: `docs/reference/base-schema-filter-api.md`

- [ ] **Step 1: Reference (B rozszerzy o NL i `?nl=`, C o RPC facetowy i `/compare`)**

```markdown
# Base-schema filter API (reference)

## RPC `public.list_extracted_filter_matches(p_filters JSONB, p_text_query TEXT)`

Returns every judgment matching `p_filters`/`p_text_query` as `(id UUID, jurisdiction TEXT)`.
Always restricted to `base_extraction_status = 'completed'`. Since `20260920000001`.

| Key in `p_filters` | Type | Semantics |
|---|---|---|
| `jurisdiction` | `["PL" \| "UK", …]` | `judgments.jurisdiction = ANY(...)` |
| `decision_date` | `{"from","to"}` / `{"min","max"}` / `"YYYY-MM-DD"` | inclusive range / equality on `judgments.decision_date` |
| `collection_ids` | `["<uuid>", …]` | membership in `collection_judgments` (any of the ids) |
| 42 `base_*` keys | see `frontend/lib/extractions/base-schema-filter-config.ts` | unchanged (20260226000001, 20260505000001) |

## RPC `public.filter_documents_by_extracted_data(p_filters, p_text_query, p_limit, p_offset)`

Thin wrapper over `list_extracted_filter_matches` — same signature and columns as before
(`id, case_number, title, jurisdiction, decision_date, extracted_data, total_count`), same
`ORDER BY decision_date DESC NULLS LAST, id`. The signature is a wire contract: PostgREST matches
by argument names, and a second overload answers HTTP 300. Pinned by
`backend/tests/db/test_migration_chain.py` (`EXPECTED_RPC_ARGS`, `test_rpc_has_exactly_one_overload`).

## `POST /collections/from-filter`

Body `{name (1–255), description?, filters, text_query?}` →
`201 {collections: [{jurisdiction: null, collection, added_count}], total_matched, pair_id: null}`.
Errors: `400 FILTER_EMPTY`, `413 FILTER_TOO_LARGE {total, cap, jurisdiction}`, `503 DATABASE_UNAVAILABLE`.
Cap `SAVE_FROM_FILTER_MAX_DOCUMENTS` (env, default 5000) per collection; the server resolves ids with
`list_extracted_filter_matches` and upserts `collection_judgments` in chunks of 1000. The 100-id cap on
`POST /collections/{id}/documents/batch` is unchanged. The response is list-shaped so the PL/UK
comparison can extend the same endpoint with `split_by_jurisdiction` (two collections + `pair_id`).

BFF: `POST /api/collections/from-filter` (`frontend/app/api/utils/backend-proxy.ts::proxyToBackend`
passes upstream status/body through; `lib/api/collections.ts::createCollectionFromFilter` unwraps `detail`).

## Frontend URL state

`?f=<base64url JSON of BaseSchemaFilters>` · `?q=<text_query>` · `?page=<n>` · `?nl=<question>` (optional).
One codec: `buildFilterSearchParams` / `buildFilterHref` in `frontend/lib/extractions/use-extracted-data-filters.ts`.
Core fields `jurisdiction`/`decision_date` are registered in `CORE_FILTER_FIELDS` (not `FILTER_FIELDS`), so
`BaseFiltersDrawer`/`QuickFilters` are unchanged; chips resolve labels via `ALL_FILTER_FIELD_BY_NAME`.

## Completeness helpers (backend)

`backend/app/extraction_domain/completeness.py`: `COMPLETED_STATUSES`, `EMPTY_MARKERS`, `is_empty_value`,
`flatten`, `completed_rows`, `coverage_ratio`. Python-side "empty" includes LLM markers (`n/a`, `brak danych`…);
SQL-side `covered` in facet RPCs treats only `NULL`/`''` as empty (enum-coded `base_*` columns).
```

- [ ] **Step 2: Pełna regresja**

```bash
cd backend && poetry run poe check-all
cd ../frontend && npm run validate && npm test -- --silent && npm run test:e2e:route-contract
docker run -d --rm --name juddges-dbc -e POSTGRES_PASSWORD=postgres -p 55432:5432 pgvector/pgvector:pg17 && sleep 5
cd ../backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres poetry run pytest -m db -q; docker stop juddges-dbc
```
Expected: wszystko zielone, w tym `tests/app/test_base_schema_route_regressions.py`, `tests/app/test_collections_batch_cap.py`, `tests/app/test_db_contract_static.py`.

- [ ] **Step 3: Pomiar wrappera na dev DB (jeśli dostępna)**

```bash
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT * FROM public.filter_documents_by_extracted_data('{}'::jsonb, NULL, 25, 0);"
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT count(*) FROM public.list_extracted_filter_matches('{\"jurisdiction\":[\"UK\"]}'::jsonb, NULL);"
```
Expected: rząd wielkości jak przed migracją (pusty filtr materializuje ~12k `(uuid, text)`); zapisz czasy w PR.

- [ ] **Step 4: Commit, push, PR**

```bash
git add docs/reference/base-schema-filter-api.md
git commit -m "docs: base-schema filter API reference (shared filter RPC, from-filter endpoint, URL codec)"
git push -u origin feat/shared-foundation
gh pr create --base main --title "feat: shared foundation for NL-filter, research-flow and PL/UK compare" \
  --body "$(cat <<'BODY'
Foundation shared by three planned features (NL question → filter → collection; research flow; PL ↔ UK compare):

- db: list_extracted_filter_matches(p_filters, p_text_query) → (id, jurisdiction); filter_documents_by_extracted_data is now a wrapper (signature unchanged, one overload — pinned in Database Contract). New p_filters keys: jurisdiction, decision_date, collection_ids.
- backend: extraction_domain/filter_ids.py (resolve_filter_ids, check_cap), collections_from_filter.py (POST /collections/from-filter, list-shaped, cap 5000, chunks 1000), extraction_domain/completeness.py, Jurisdiction in app/models.py.
- frontend: core filter fields (jurisdiction, decision_date) + chips; drawer-adapter.ts with the ISO↔epoch fix for date ranges; one URL codec (buildFilterSearchParams/buildFilterHref); proxyToBackend BFF helper; /api/collections/from-filter + client.
- tests: route-contract synthetic-session.ts helper.

No user-visible feature yet except: date-range drawer filters now produce valid ISO dates (previously '<epoch>'::DATE errors), and enum chips with ≤ 3 values list them.
Refs #536 #537 #583.
BODY
)"
```

---

## Zmiany w planach A/B/C

### Plan B — `2026-09-20-nl-filter-to-collection.md`

| Zadanie B | Los | Zamiennik z Foundation |
|---|---|---|
| Task 0 (branch + spec) | zostaje | — |
| Task 1 (`BaseSchemaFilter.jurisdiction/decision_date`, `NL_EXCLUDED_CORE_FIELDS`) | zostaje; `Jurisdiction` **importuj** z `app.models` zamiast definiować | `from app.models import Jurisdiction` |
| Task 2 (prompt) | zostaje | — |
| Task 3 (migracja + kontrakt) | **USUŃ** | Foundation Task 1 (klucze w `list_extracted_filter_matches`); testy „Query 11/12" w `docs/how-to/test-base-schema-filter-queries.md` B dopisuje nadal |
| Task 4 (typy, rejestr, chipsy) | **USUŃ** | Foundation Task 5 |
| Task 5 (drawer adapter) | **USUŃ** | Foundation Task 6 |
| Task 6 (`ScopeFilters`) | zostaje | importuje `coreToDrawerValue`, `applyCoreChange`, `CORE_FILTER_FIELD_BY_NAME` z Foundation |
| Task 7 (`?nl=`) | **zawęź**: dopisz `nlQuestion` do `FilterState` hooka, `setNlQuestion`, `clearAll`, `initial` z `?nl=`; `NlFilterDialog.onApply(filters, textQuery, question)`; usuń własne `buildSearchParams` | `buildFilterSearchParams` już czyta `nlQuestion` |
| Task 8 (`buildDocumentHref`) | zostaje; implementacja: `` `${buildFilterHref(`/documents/${encodeURIComponent(id)}`, { filters })}${encodeFilters(filters) ? `#${BASE_FIELDS_ANCHOR}` : ""}` `` | Foundation Task 6 |
| Task 9 (`filter-match.ts`), Task 10 (highlight) | zostają | — |
| Task 11 (`collect_filter_ids`) | **USUŃ** | Foundation Task 2 (`resolve_filter_ids` + `check_cap`) |
| Task 12 (`POST /collections/from-filter`) | **USUŃ** | Foundation Task 3 — odpowiedź jest **listowa**: `collections[0].collection.id` |
| Task 13 (proxy + klient) | **USUŃ** | Foundation Task 7 |
| Task 14 (`SaveAsCollectionDialog`) | zostaje; `router.push(`/collections/${result.collections[0].collection.id}`)`; test mockuje `createCollectionFromFilter` zwracając kształt listowy; błąd: `e instanceof CollectionFromFilterError` (ma `status`) | — |
| Task 15 (docs) | zostaje; `docs/reference/base-schema-filter-api.md` **rozszerz** (sekcje NL i `?nl=`), nie twórz od nowa | Foundation Task 9 |
| „Decision record: RPC migration strategy" | zaktualizuj: ta sama decyzja (klucze w `p_filters`), realizacja w Foundation | — |
| Ryzyko „Payload size on save" | **usuń** (ids-only RPC załatwia) | — |

### Plan A — `2026-09-20-research-flow-epic.md`

| Zadanie A | Los | Zamiennik z Foundation |
|---|---|---|
| Task 3 (migracja) | zostaje; **przenumeruj** na `20260922000001_extraction_jobs_research_flow.sql` | — |
| Task 4–5 (`sampling.py`) | zostają bez zmian (nie foundation); **nie** zastępuj `fetch_jurisdictions` przez `collection_ids` (patrz „NIE wspólne") | — |
| Task 6–8 | zostają | — |
| Task 9 (`summary.py`) | zostaje; **usuń** lokalne `EMPTY_MARKERS`, `is_empty_value`, `flatten`, `_COMPLETED`; importuj z `app.extraction_domain.completeness`; `field_completeness` iteruje `completed_rows(results)`; testy `TestFieldCompleteness.test_empty_markers/test_non_empty_values` przenieś do `test_completeness.py` (już tam są) i usuń duplikaty | Foundation Task 4 |
| Task 10 (BFF summary) | trasa `GET /api/extractions/[id]/summary` = `proxyToBackend({ path: `/extractions/${encodeURIComponent(jobId)}/summary`, timeoutMs: 10_000 })` | Foundation Task 7 |
| Task 13 (`dataset_export.py`) | `_COMPLETED` → `COMPLETED_STATUSES`; `dataset_rows` używa `completed_rows` | Foundation Task 4 |
| Task 14 (`_export_dataset_zip`) | `completed_ids = [r["document_id"] for r in completed_rows(results)]` | Foundation Task 4 |
| Task 16 (przeniesienie `extractions.spec.ts`) | zostaje; **usuń** krok „Create `synthetic-session.ts`"; importuj `setSyntheticSession`, `ADAPTER_BASE_URL`, `expectNoUnexpectedStubRequests`; `afterEach` = `expectNoUnexpectedStubRequests(request)` | Foundation Task 8 |
| Task 17 (fixtures stubu) | zostaje | — |
| „Shared building blocks" | wiersz `synthetic-session.ts` → „dostarczone przez Foundation"; wiersz `summary.py` → „`EMPTY_MARKERS`/`is_empty_value`/`flatten` w Foundation `completeness.py`; `field_completeness` zostaje w A" | — |

### Plan C — `2026-09-20-pl-uk-compare.md`

| Zadanie C | Los | Zamiennik z Foundation |
|---|---|---|
| „Interface assumed from Spec B" | **zastąp** tabelą kontraktu Foundation (RPC, `filter_ids.py`, `collections_from_filter.py`, typy TS, kodek, adapter, `proxyToBackend`) + z B: `BaseSchemaFilter.jurisdiction/decision_date` w NL | — |
| Task 1 (shared fn + wrapper) | **USUŃ** (łącznie z `collection_ids`) | Foundation Task 1; testy `test_compare_rpcs_contract.py` zaczynają od facetów |
| Task 2 (facet RPC) | zostaje; plik `20260921000001_facet_counts_by_jurisdiction.sql`; `EXPECTED_RPC_ARGS` dopisuje **tylko** `get_extracted_facet_counts_by_jurisdiction` (wpis `list_extracted_filter_matches` już jest) | — |
| Task 3 (`collection_pairs`) | zostaje; plik `20260921000002_create_collection_pairs.sql` | — |
| Task 4 (`layout.py`) | zostaje; `coverage_ratio` **importuj** z `completeness` (usuń lokalną); `Jurisdiction` w `compare/models.py` importuj z `app.models` | Foundation Task 4, 2 |
| Task 5, 7, 8 | zostają | — |
| Task 6 (`service.py`) | zostaje; test `_FakeClient` → `from tests.app._fakes import FakeRpcClient` (handler callable po `field_path`) | Foundation Task 2 |
| Task 9 (pary) | **przepisz**: zamiast `POST /collections/pairs` z własnym `_matching_ids`/`MAX_PAIR_SIDE`/`BULK_CHUNK` — rozszerz `collections_from_filter.py`: `CreateCollectionFromFilterRequest.split_by_jurisdiction: bool = False`; gdy `True`: `filters, ignored = strip_ignored(...)`, `check_cap(resolved, per_jurisdiction=True)`, dwa razy `create_collection_from_ids(name=f"{name} — {j}", ids=resolved.by_jurisdiction[j])`, `pairs_db.create_pair(...)`, odpowiedź `collections=[PL, UK]` z `jurisdiction`, `pair_id=row["id"]`. `CollectionPairsDB` + `GET /collections/pairs`, `GET/DELETE /collections/pairs/{id}` zostają w `collection_pairs.py` (router rejestrowany przed `collections_router`, jak Foundation). Testy: `_StubCollectionsDb` zostaje; asercje na `body["collections"]` | Foundation Task 3 |
| Task 10 (`pair` w `GET /collections`) | zostaje | — |
| Task 11 (`schema_tally.py`) | `_filled(v)` → `not is_empty_value(v)`; `_OK_STATUSES` → `COMPLETED_STATUSES`; `coverage_ratio` z `completeness` | Foundation Task 4 |
| Task 12 (`BivariateBarChart`) | zostaje | — |
| Task 13 (`lib/compare`) | `types.ts`: `Jurisdiction` importuj z `@/types/base-schema-filter`; `permalink.ts`: `buildComparePermalink(filters, textQuery, origin) = buildFilterHref('/compare', { filters, textQuery }, origin ?? windowOrigin())` (zostaw `buildPairPermalink`); `api.ts`: `createCollectionPair(body)` → `createCollectionFromFilter({ ...body, split_by_jurisdiction: true })` z `lib/api/collections.ts` (usuń lokalną implementację; `postJson` zostaje dla `/compare/*`) | Foundation Task 6, 7 |
| Task 14 (5 tras BFF) | każda trasa = jedno wywołanie `proxyToBackend(...)`; export: `passthroughHeaders: ['content-type', 'content-disposition', 'x-rows-count']`; test `compare-bff.test.ts` zostaje (asercje na URL/nagłówki/status są zgodne z helperem; `text_query: null` domyślne dopisuje trasa przed `proxyToBackend`) | Foundation Task 7 |
| Task 15 (i18n) | zostaje | — |
| Task 16 | **usuń Step 1–2** (ekstrakcja adaptera); `CompareContent` importuje `applyDrawerChange` z Foundation; `CompareFilterBar` przekazuje do `BaseFiltersDrawer` `toDrawerFilters(filters)` (pola rdzeniowe są już pomijane — nie trzeba ręcznie ukrywać `jurisdiction`) | Foundation Task 6 |
| Task 17 (`SavePairDialog`) | używa `createCollectionFromFilter(..., split_by_jurisdiction: true)`; 413 rozpoznaje po `CollectionFromFilterError.status === 413` (i `jurisdiction` do komunikatu) | Foundation Task 7 |
| Task 18–20 | zostają; `API_REFERENCE.md` linkuje `docs/reference/base-schema-filter-api.md` zamiast powtarzać opis RPC | — |
| Global Constraints „Migrations sort after Spec B's: prefix 20260921" | zaktualizuj: B nie ma migracji; C = `20260921000001`, `20260921000002`; Foundation = `20260920000001` | — |

### Rekomendowana kolejność

**Foundation → B → C → A**, przy czym A można zacząć w osobnym worktree zaraz po merge'u Foundation.

1. **Foundation pierwsze** — zawiera migrację, na której stoją B (klucze rdzeniowe) i C (`list_extracted_filter_matches`, `collection_ids`), oraz `completeness.py`, którego C potrzebuje przed A (inaczej C musiałby importować z modułu A, którego jeszcze nie ma).
2. **B po Foundation** — po odjęciu Tasków 3, 4, 5, 11, 12, 13 zostaje: model + prompt NL, `ScopeFilters`, `?nl=`, link do dokumentu + podświetlenie, dialog zapisu, docs. Najcieńszy plan, a odblokowuje C.
3. **C po B** — twarda zależność na Foundation (RPC, `from-filter`, adapter, kodek); **miękka na B**: `NlFilterDialog` na `/compare` wyprodukuje `decision_date`/`jurisdiction` tylko z promptem B (C strippuje `jurisdiction`, ale zakres dat z pytania NL wymaga Task 1–2 B). Bez B `/compare` działa z chipsów, ale AC1 („NL lub chipsy") jest połowiczne.
4. **A ostatnie / równolegle** — jedyne punkty styku to `completeness.py` i `synthetic-session.ts` (oba w Foundation). A nie zależy od B ani C. Jego zewnętrzne blokery (#537 seed schematów dla AC1, #546 martwy klucz LLM dla weryfikacji ręcznej) nie mają terminu, więc trzymanie A na końcu pojedynczej ścieżki nic nie kosztuje, a w drugim worktree może iść od razu.

Numeracja migracji jest przypisana per plan (C `20260921*`, A `20260922*`) i **nie** zależy od kolejności merge'u — pliki są od siebie niezależne, zależą tylko od `20260920000001`.

## Ryzyka

| # | Ryzyko | Mitigacja |
|---|---|---|
| 1 | **`docs/superpowers/` w `.gitignore:161`** — cztery plany (Foundation, A, B, C) i specyfikacje nie wchodzą do repo; wykonawcy w innych worktree/maszynach ich nie zobaczą, a `superpowers:subagent-driven-development` czyta plan z pliku. | Decyzja zespołu, osobnym PR-em: (a) usunąć linię 161 i `git add docs/superpowers/plans/2026-09-20-*.md docs/superpowers/specs/…`, albo (b) świadomie trzymać lokalnie i przekazywać PR body jako kontrakt (jak robi B). Do czasu decyzji: `git add -f` **tylko** jeśli zespół wybrał (a); nie mieszać planów do PR-a Foundation. |
| 2 | **PostgREST overload** — `CREATE OR REPLACE FUNCTION filter_documents_by_extracted_data` z inną listą parametrów tworzy drugi overload → HTTP 300 dla `results_router.py:483` i frontendu. | Sygnatura wrappera skopiowana 1:1 (4 parametry, te same DEFAULT-y, ten sam `RETURNS TABLE`); `test_rpc_has_exactly_one_overload` w Database Contract; `EXPECTED_RPC_ARGS` pinuje nazwy. |
| 3 | **Refaktor wrappera zmienia zachowanie `/search/extractions`** (kolejność, `total_count`, wydajność — plpgsql nie jest inlinowany, planner nie wpycha `LIMIT` do funkcji zbioru). | Ten sam `ORDER BY`/`LIMIT`/`OFFSET`; testy `test_wrapper_returns_the_same_rows_and_total_as_the_shared_function`, `test_wrapper_pagination_is_unchanged`; `test_base_schema_route_regressions.py`; `EXPLAIN ANALYZE` na dev DB w Task 9 (korpus 12 307 wierszy → materializacja ≤ 12k krotek `(uuid,text)`). Jeśli czasy rosną > 2×, plan awaryjny: wrapper wraca do CTE z 20260505 (kopia), a `list_extracted_filter_matches` zostaje osobno — kosztem duplikacji SQL, bez zmiany API. |
| 4 | **Database Contract wymaga aktualizacji w tym PR**: `EXPECTED_RPC_ARGS` (2 wpisy), nowy test overloadu, nowy plik `test_extracted_filter_contract.py`; `test_db_contract_static` wymaga, by `list_extracted_filter_matches` był wołany (jest — `filter_ids.py`). Plany A i C dopisują swoje wpisy (A: brak RPC; C: facet RPC, tabela `collection_pairs` w `EXPECTED_TABLES` + `OWNER_SCOPED_TABLES`). | Wypisane w Task 1; migracje produkcyjne wgrywane ręcznie — skoordynować z deployem (frontend z chipsami `decision_date` przed migracją = filtr ignorowany po cichu, nie błąd). |
| 5 | **`collection_ids` widzi tylko `base_extraction_status='completed'`** — kolekcja z dokumentami bez ekstrakcji bazowej wygląda na mniejszą. | Udokumentowane w reference i w „NIE wspólne"; A nie używa tego klucza do populacji próbki; C pokazuje `total` z RPC jako „dokumenty z ekstrakcją bazową", nie jako rozmiar kolekcji. |
| 6 | **Zmiana kształtu odpowiedzi `from-filter` względem spec B** (`collections[]` zamiast `collection`). | Świadoma: jeden endpoint dla B i C; B Task 14 czyta `collections[0]`; opisane w reference. |
| 7 | **Poprawka epoch↔ISO zmienia to, co Quick date control pokazuje dla dat z NL** (teraz poprawnie) i **nowy `describeActive`** wypisuje ≤ 3 wartości enum zamiast liczby — kosmetyczna zmiana dla istniejących chipsów. | Zaznaczyć w PR; testy chipsów/adaptera opisują nowe zachowanie. |
| 8 | **Dwie definicje „puste"** (Python markery vs SQL `NULL/''`) mogą dać inne `coverage` dla tego samego pola, gdy A liczy je z `results` a C z kolumn. | Zakresy nie nachodzą (A/`schema_tally` = wolny tekst LLM z `results`; SQL = kolumny `base_*` enum-kodowane); różnica opisana w docstringu `completeness.py` i reference. |
| 9 | **Helper `proxyToBackend` nie migruje istniejących tras** — dwa style w `app/api/`. | Zamierzone (zakres); nowe trasy A/B/C używają helpera, stare zostają; ewentualna migracja to osobny refaktor. |
| 10 | **`status.HTTP_413_CONTENT_TOO_LARGE` może nie istnieć w zainstalowanym Starlette.** | Fallback `HTTP_413_REQUEST_ENTITY_TOO_LARGE` (w Task 3). |
| 11 | **Frontend Route Contract**: Task 8 to czysty refaktor specu; jeśli `afterEach` w `extraction-path.spec.ts` ma dodatkową logikę (np. zapis logu), zostaw ją obok wywołania helpera. | Krok 1 Task 8 każe porównać przed zamianą. |
| 12 | **Kolizja gałęzi**: B i C edytują te same pliki co Foundation (`use-extracted-data-filters.ts`, `base-schema-filter.ts`, `collections.ts`). | Foundation merguje pierwsze; B/C startują z `origin/main` po merge'u (wymóg „strict checks" i tak wymusza rebase). |

Issues do podlinkowania w PR Foundation: #536 (nawigacja/404 rzędów — naprawia B, ale kodek i adapter tu), #537 (seed schematów — nie blokuje Foundation), #583 (helper sesji dla przeniesionego specu A).
