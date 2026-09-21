# Collection Table — Base Schema Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the `base_*` extracted-schema columns from the Supabase `judgments` table in the collection detail page's table view (`/collections/{id}` → Table mode), so users see all extracted schema fields (Appellant, Appeal Outcome, Number of Victims, …) alongside the existing metadata columns.

**Architecture:** The collection page already loads documents from Supabase via `GET /documents/{id}` and `POST /documents/batch` — the data source is correct. The gap is that `_convert_supabase_to_legal_document()` strips the `base_*` columns. We add an opt-in `include_base_fields` flag to the batch and single-doc endpoints, populate a typed `base_fields: dict` on the `LegalDocument` response via the existing `_merge_base_extraction_fields()` helper, then append the canonical fixed list of `base_*` columns (~50, derived from the existing detail-page schema in `key-information.tsx`) to `COLLECTION_EXPORT_COLUMNS`. The table component auto-iterates that list, so it picks up the new columns with no rendering changes. The shared field metadata (labels, ordering, enum value mapping, formatting) is extracted from `key-information.tsx` into a new `lib/document-fields.ts` module so both detail page and table render values identically.

**Tech Stack:**
- Backend: FastAPI, Pydantic v2, pytest
- Frontend: Next.js 15 App Router, TypeScript, React 19, Jest

---

## File Structure

**Backend** (`backend/`):
- `packages/juddges_search/juddges_search/models.py` — add `base_fields` to `LegalDocument`
- `app/models.py` — add `include_base_fields` to `DocumentRequest` and `BatchDocumentsRequest`
- `app/judgments_pkg/conversion.py` — new `_extract_base_fields()` helper (returns dict; mirrors `_merge_base_extraction_fields` but builds a fresh dict rather than mutating)
- `app/judgments_pkg/__init__.py` — wire flag through `GET /documents/{id}`, `POST /documents/batch`, and `GET /documents/{id}/metadata` (keep current behaviour for metadata endpoint — already includes them)
- `tests/app/test_documents_crud.py` — tests for the new flag on single and batch GET

**Frontend** (`frontend/`):
- `lib/document-fields.ts` (new) — canonical `FIELD_LABELS`, `BASE_FIELD_ORDER`, `ENUM_VALUE_LABELS`, `formatBaseFieldValue()` extracted from `key-information.tsx`
- `lib/styles/components/key-information.tsx` — import from `lib/document-fields.ts` instead of inlining (no behavioural change)
- `types/search.ts` — add `base_fields?: Record<string, unknown>` to `SearchDocument`
- `lib/api/documents.ts` — add `include_base_fields?: boolean` to `FetchDocumentsByIdsInput`, forward to backend
- `lib/api/collections.ts` — `loadAllCollectionDocuments` passes `include_base_fields: true`
- `lib/collection-export.ts` — append base_* columns to `COLLECTION_EXPORT_COLUMNS`; in `flattenDocumentForExport()` read `doc.base_fields?.[key]` and format via shared helper
- `__tests__/lib/collection-export.test.ts` (new or extend) — verify base columns are flattened/formatted correctly

> The `/api/documents/batch` Next.js route forwards the full body to the backend already (it doesn't enumerate fields), so no change needed there.

---

## Task 1: Backend — Add `base_fields` to `LegalDocument` model

**Files:**
- Modify: `backend/packages/juddges_search/juddges_search/models.py:103-164`

- [ ] **Step 1: Add typed `base_fields` to `LegalDocument`**

In `backend/packages/juddges_search/juddges_search/models.py`, immediately after the existing `references: Optional[List[str]] = Field(...)` line (around line 147) and before `model_config = ConfigDict(...)`, add:

```python
    base_fields: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "Extracted base-schema columns (base_appellant, base_appeal_outcome, "
            "base_num_victims, …). Populated only when include_base_fields=true is "
            "requested; otherwise None to keep search/list responses lean."
        ),
    )
```

- [ ] **Step 2: Verify field appears in OpenAPI schema**

Run: `cd backend && poetry run python -c "from juddges_search.models import LegalDocument; print('base_fields' in LegalDocument.model_fields)"`
Expected output: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/packages/juddges_search/juddges_search/models.py
git commit -m "feat(backend): add base_fields to LegalDocument model"
```

---

## Task 2: Backend — Add `include_base_fields` flag to request schemas

**Files:**
- Modify: `backend/app/models.py:792-818`

- [ ] **Step 1: Add flag to `DocumentRequest`**

In `backend/app/models.py`, change the `DocumentRequest` class (around line 792) to:

```python
class DocumentRequest(BaseModel):
    """Request model for retrieving a single document by ID."""

    document_id: str = Field(description="Document ID to retrieve")
    return_vectors: bool = Field(
        default=False, description="Whether to include vector embeddings"
    )
    include_base_fields: bool = Field(
        default=False,
        description=(
            "Include extracted base-schema columns (base_appellant, "
            "base_appeal_outcome, base_num_victims, …) under the response's "
            "`base_fields` key. Off by default to keep payloads lean."
        ),
    )
```

- [ ] **Step 2: Add flag to `BatchDocumentsRequest`**

In `backend/app/models.py`, change the `BatchDocumentsRequest` class (around line 807) to:

```python
class BatchDocumentsRequest(BaseModel):
    """Request model for retrieving multiple documents by IDs."""

    document_ids: list[str] = Field(description="List of document IDs to retrieve")
    return_vectors: bool = Field(
        default=False, description="Whether to include vector embeddings"
    )
    return_properties: list[str] | None = Field(
        None,
        description="Optional list of property names to return. If None, returns all properties. Use to optimize performance by fetching only needed fields.",
        max_length=settings.MAX_RETURN_PROPERTIES,
    )
    include_base_fields: bool = Field(
        default=False,
        description=(
            "Include extracted base-schema columns (base_appellant, "
            "base_appeal_outcome, base_num_victims, …) under each document's "
            "`base_fields` key. Off by default to keep payloads lean."
        ),
    )
```

- [ ] **Step 3: Verify field parses correctly**

Run: `cd backend && poetry run python -c "from app.models import BatchDocumentsRequest; r = BatchDocumentsRequest(document_ids=['x'], include_base_fields=True); print(r.include_base_fields)"`
Expected output: `True`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py
git commit -m "feat(backend): add include_base_fields flag to document request schemas"
```

---

## Task 3: Backend — Add `_extract_base_fields()` helper

**Files:**
- Modify: `backend/app/judgments_pkg/conversion.py:185-208`

- [ ] **Step 1: Add a sibling helper that returns a fresh dict**

In `backend/app/judgments_pkg/conversion.py`, immediately after the existing `_merge_base_extraction_fields(...)` function (ends around line 208), add:

```python
def _extract_base_fields(
    raw_doc_data: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Build a fresh dict of `base_*` extracted-schema columns from a judgments row.

    Returns None when the row has no non-empty base_* keys. Mirrors
    `_merge_base_extraction_fields` semantics: skips None, empty lists, and
    serialises datetimes to ISO strings — so the frontend can render values
    without further parsing.
    """
    if not raw_doc_data:
        return None
    result: dict[str, Any] = {}
    for key, value in raw_doc_data.items():
        if not key.startswith("base_"):
            continue
        if value is None:
            continue
        if isinstance(value, list) and len(value) == 0:
            continue
        if isinstance(value, datetime):
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result if result else None
```

- [ ] **Step 2: Verify helper imports cleanly**

Run: `cd backend && poetry run python -c "from app.judgments_pkg.conversion import _extract_base_fields; print(_extract_base_fields({'base_appellant': 'offender', 'title': 'X'}))"`
Expected output: `{'base_appellant': 'offender'}`

Also verify None case:

Run: `cd backend && poetry run python -c "from app.judgments_pkg.conversion import _extract_base_fields; print(_extract_base_fields({'title': 'X'}))"`
Expected output: `None`

- [ ] **Step 3: Commit**

```bash
git add backend/app/judgments_pkg/conversion.py
git commit -m "feat(backend): add _extract_base_fields helper for document responses"
```

---

## Task 4: Backend — Wire flag into single-doc and batch endpoints

**Files:**
- Modify: `backend/app/judgments_pkg/__init__.py:52` (imports), `283-316` (single GET), `322-352` (legacy POST), `355-385` (batch POST)

- [ ] **Step 1: Add helper to imports**

In `backend/app/judgments_pkg/__init__.py`, find the existing import block that already includes `_merge_base_extraction_fields` (around line 52) and add the new helper to it:

```python
from app.judgments_pkg.conversion import (
    _build_document_metadata_dict,
    _convert_supabase_to_legal_document,
    _extract_base_fields,
    _merge_base_extraction_fields,
)
```

(Note: this replaces the existing import. Adjust to match the actual import shape — the names may be split across lines or imported individually. Add `_extract_base_fields` alongside the others.)

- [ ] **Step 2: Update `get_document_by_id` to accept the flag**

In `backend/app/judgments_pkg/__init__.py`, replace the `get_document_by_id` endpoint (around line 288-316) with:

```python
@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document by ID",
)
async def get_document_by_id(
    document_id: str = Path(..., description="Document ID to retrieve"),
    return_vectors: bool = Query(False, description="Include vector embeddings"),
    include_base_fields: bool = Query(
        False,
        description="Include extracted base_* schema columns under `base_fields`",
    ),
) -> DocumentResponse:
    """Get a document by its ID."""
    try:
        validate_id_format(document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        db = get_vector_db()
        doc_data = await db.get_document_by_id(document_id)

        if not doc_data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        document = _convert_supabase_to_legal_document(
            doc_data, include_vectors=return_vectors
        )
        if include_base_fields:
            document.base_fields = _extract_base_fields(doc_data)
        return DocumentResponse(document=document)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving document {document_id}: {e!s}")
        raise HTTPException(status_code=500, detail="Error retrieving document.")
```

- [ ] **Step 3: Update legacy `get_document_by_id_legacy` (POST) to honour the request flag**

In `backend/app/judgments_pkg/__init__.py`, replace the inner block of `get_document_by_id_legacy` (around line 336-352) with:

```python
    db = get_vector_db()
    doc_data = await db.get_document_by_id(request.document_id)

    if not doc_data:
        raise HTTPException(
            status_code=404, detail=f"Document {request.document_id} not found"
        )

    document = _convert_supabase_to_legal_document(
        doc_data, include_vectors=request.return_vectors
    )
    if request.include_base_fields:
        document.base_fields = _extract_base_fields(doc_data)
    return DocumentResponse(document=document)
```

- [ ] **Step 4: Update `get_documents_batch` to honour the flag**

In `backend/app/judgments_pkg/__init__.py`, replace the inner block of `get_documents_batch` (around line 377-385) with:

```python
    db = get_vector_db()
    docs_data = await db.get_documents_by_ids(request.document_ids)

    documents: list[LegalDocument] = []
    for doc in docs_data:
        converted = _convert_supabase_to_legal_document(
            doc, include_vectors=request.return_vectors
        )
        if request.include_base_fields:
            converted.base_fields = _extract_base_fields(doc)
        documents.append(converted)

    return BatchDocumentsResponse(documents=documents)
```

Make sure `LegalDocument` is imported at the top of the file (it almost certainly already is, since the file uses it elsewhere — verify with `grep "from juddges_search.models" backend/app/judgments_pkg/__init__.py`).

- [ ] **Step 5: Run a smoke check that the module imports**

Run: `cd backend && poetry run python -c "from app.judgments_pkg import router; print(router.prefix)"`
Expected output: prints the router prefix (e.g. `/documents`) with no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/judgments_pkg/__init__.py
git commit -m "feat(backend): expose base_fields opt-in on document GET and batch endpoints"
```

---

## Task 5: Backend — Tests for the flag

**Files:**
- Modify: `backend/tests/app/test_documents_crud.py`

- [ ] **Step 1: Read the test file to understand existing fixture / client patterns**

Run: `head -100 backend/tests/app/test_documents_crud.py`
Note the test client fixture name, how DB mocks are set up, and existing test naming conventions. Mirror those patterns in the tests below — the exact mock setup will depend on what's already there.

- [ ] **Step 2: Add tests for single GET with flag**

Append to `backend/tests/app/test_documents_crud.py` (adapt fixture names and mock paths to match existing tests in the same file):

```python
@pytest.mark.unit
async def test_get_document_by_id_includes_base_fields_when_flag_set(
    test_client, mock_vector_db
):
    """GET /documents/{id}?include_base_fields=true returns base_fields dict."""
    mock_vector_db.get_document_by_id.return_value = {
        "document_id": "X-1",
        "document_type": "judgment",
        "country": "GB",
        "full_text": "...",
        "base_appellant": "offender",
        "base_num_victims": 3,
        "title": "Case X",
    }

    response = test_client.get("/documents/X-1?include_base_fields=true")

    assert response.status_code == 200
    body = response.json()
    assert body["document"]["base_fields"] == {
        "base_appellant": "offender",
        "base_num_victims": 3,
    }


@pytest.mark.unit
async def test_get_document_by_id_omits_base_fields_by_default(
    test_client, mock_vector_db
):
    """GET /documents/{id} without flag returns base_fields = None."""
    mock_vector_db.get_document_by_id.return_value = {
        "document_id": "X-1",
        "document_type": "judgment",
        "country": "GB",
        "full_text": "...",
        "base_appellant": "offender",
    }

    response = test_client.get("/documents/X-1")

    assert response.status_code == 200
    body = response.json()
    assert body["document"].get("base_fields") is None


@pytest.mark.unit
async def test_batch_documents_includes_base_fields_when_flag_set(
    test_client, mock_vector_db
):
    """POST /documents/batch with include_base_fields=true populates per-doc base_fields."""
    mock_vector_db.get_documents_by_ids.return_value = [
        {
            "document_id": "X-1",
            "document_type": "judgment",
            "country": "GB",
            "full_text": "...",
            "base_appellant": "offender",
            "base_num_victims": 2,
        },
        {
            "document_id": "X-2",
            "document_type": "judgment",
            "country": "GB",
            "full_text": "...",
        },
    ]

    response = test_client.post(
        "/documents/batch",
        json={
            "document_ids": ["X-1", "X-2"],
            "include_base_fields": True,
        },
    )

    assert response.status_code == 200
    docs = response.json()["documents"]
    assert docs[0]["base_fields"] == {
        "base_appellant": "offender",
        "base_num_victims": 2,
    }
    # X-2 had no base_* keys → base_fields is None
    assert docs[1].get("base_fields") is None


@pytest.mark.unit
async def test_batch_documents_omits_base_fields_by_default(
    test_client, mock_vector_db
):
    """POST /documents/batch without flag returns base_fields = None even when row has base_* keys."""
    mock_vector_db.get_documents_by_ids.return_value = [
        {
            "document_id": "X-1",
            "document_type": "judgment",
            "country": "GB",
            "full_text": "...",
            "base_appellant": "offender",
        },
    ]

    response = test_client.post(
        "/documents/batch",
        json={"document_ids": ["X-1"]},
    )

    assert response.status_code == 200
    docs = response.json()["documents"]
    assert docs[0].get("base_fields") is None
```

> **Note on fixtures:** the actual fixtures in `test_documents_crud.py` may be named differently (e.g. `client`, `mock_db`, async vs sync). After Step 1, adapt the fixture parameter names and `await` usage to match the existing tests in the same file before running.

- [ ] **Step 3: Run the new tests**

Run: `cd backend && poetry run pytest tests/app/test_documents_crud.py -v -k "base_fields"`
Expected: all 4 new tests pass.

- [ ] **Step 4: Run the full backend test suite to confirm no regressions**

Run: `cd backend && poetry run poe check-all`
Expected: PASS for lint, format, and tests.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/app/test_documents_crud.py
git commit -m "test(backend): cover include_base_fields flag on document endpoints"
```

---

## Task 6: Frontend — Extract shared field-metadata module

**Files:**
- Create: `frontend/lib/document-fields.ts`
- Modify: `frontend/lib/styles/components/key-information.tsx` (imports + remove inlined definitions)

- [ ] **Step 1: Read the current detail-page module fully to capture exact behaviour**

Run: `wc -l frontend/lib/styles/components/key-information.tsx`
Then read the file in full so the extraction below preserves every detail. Critical pieces to lift verbatim:
- `FIELD_LABELS` (the `{ label, icon, wide? }` map at lines ~50-191)
- `FIELD_ORDER` (the canonical ordering at lines ~290-384)
- `ENUM_VALUE_LABELS` (lines ~198-260)
- `SKIP_KEYS` + `shouldSkipKey` (lines ~267-287)
- `stripTags`, `prettifyKey`, `formatDate`, `looksLikeDate`, `formatValue` (lines ~386 onward — read to end of formatting helpers, **not** the JSX renderer)

Verify by running: `grep -n "^export\|^const \|^function " frontend/lib/styles/components/key-information.tsx`

- [ ] **Step 2: Create the shared module**

Create `frontend/lib/document-fields.ts`. Move the **non-React** definitions only — icons stay coupled because they're used by the table too (the icons are React components but can be imported in a `.ts` module; tsc accepts that as long as the file doesn't render JSX).

```typescript
/**
 * Canonical, fixed field metadata for legal-document responses.
 *
 * Source of truth for:
 *   - Detail view (`lib/styles/components/key-information.tsx`)
 *   - Collection table view (`components/collection-documents-table.tsx`
 *     via `lib/collection-export.ts`)
 *
 * Keep these aligned with the backend `base_*` columns in
 * `supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql`.
 */

import {
  Activity,
  BookOpen,
  Calendar,
  Clock,
  FileText,
  Gavel,
  Hash,
  type LucideIcon,
  MessageSquare,
  Scale,
  Tag,
  User,
  Users,
} from "lucide-react";

export interface FieldMeta {
  label: string;
  icon?: LucideIcon;
  /** If true, the detail view spans this field across two columns. */
  wide?: boolean;
}

// PASTE the full FIELD_LABELS map from key-information.tsx here, verbatim.
// (Including both the standard fields like `title`, `document_type`, … AND the
// base_* fields. Keep all icons and `wide` flags.)
export const FIELD_LABELS: Record<string, FieldMeta> = {
  // ⚠️ Paste the entire object body from key-information.tsx FIELD_LABELS here.
};

// PASTE ENUM_VALUE_LABELS verbatim
export const ENUM_VALUE_LABELS: Record<string, string> = {
  // ⚠️ Paste entire object body.
};

// PASTE FIELD_ORDER verbatim
export const FIELD_ORDER: string[] = [
  // ⚠️ Paste entire array body.
];

/** Subset of FIELD_ORDER restricted to base_* keys, preserving order. */
export const BASE_FIELD_ORDER: string[] = FIELD_ORDER.filter((k) =>
  k.startsWith("base_")
);

// PASTE SKIP_KEYS + shouldSkipKey verbatim
const SKIP_KEYS = new Set<string>([
  // ⚠️ Paste entire set body.
]);

export const shouldSkipKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  if (SKIP_KEYS.has(lower)) return true;
  if (lower.endsWith("_embedding")) return true;
  if (lower.includes("chunk")) return true;
  return false;
};

// PASTE stripTags, prettifyKey, formatDate, looksLikeDate verbatim
export const stripTags = (value: string): string =>
  value.replace(/<[^>]*>/g, "").trim();

export const prettifyKey = (key: string): string =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (raw: string): string => {
  const clean = stripTags(raw);
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return clean;
  return parsed.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const looksLikeDate = (key: string, value: string): boolean => {
  if (/_date$|_at$|date_/i.test(key)) return true;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(value);
};

// PASTE formatValue verbatim — this is the unknown-primitive formatter
// used by the detail page. Returns null when the value has no real content.
export const formatValue = (key: string, value: unknown): string | null => {
  // ⚠️ Paste entire formatValue function body from key-information.tsx here.
};
```

> **Important:** Don't paraphrase the maps or `formatValue`. Copy verbatim from `key-information.tsx`. The placeholder comments above must be replaced with the actual content from that file before you commit.

- [ ] **Step 3: Update `key-information.tsx` to re-import from the shared module**

In `frontend/lib/styles/components/key-information.tsx`:
- Remove the now-duplicated definitions of `FIELD_LABELS`, `ENUM_VALUE_LABELS`, `FIELD_ORDER`, `SKIP_KEYS`, `shouldSkipKey`, `stripTags`, `prettifyKey`, `formatDate`, `looksLikeDate`, `formatValue` (whichever it had).
- Add at the top:

```typescript
import {
  ENUM_VALUE_LABELS,
  FIELD_LABELS,
  FIELD_ORDER,
  formatValue,
  prettifyKey,
  shouldSkipKey,
  stripTags,
} from "@/lib/document-fields";
```

- Remove the lucide-react icon imports that are now only used by the moved map (re-import only the ones the JSX in this file still references directly).

- [ ] **Step 4: Type-check + lint**

Run: `cd frontend && npm run validate`
Expected: PASS. No type errors, no unused imports.

- [ ] **Step 5: Smoke-check that the detail page still renders fields the same**

Run: `cd frontend && npm run dev` in one terminal, open a document detail page (e.g. `/doc/<an-id>` or `/judgments/<id>` — check the current routes), and confirm key-information renders identically to before. If the dev server can't be started, run the existing tests instead:

Run: `cd frontend && npm test -- key-information`
Expected: all existing tests pass (no behaviour change).

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/document-fields.ts frontend/lib/styles/components/key-information.tsx
git commit -m "refactor(frontend): extract document field metadata into shared module"
```

---

## Task 7: Frontend — Add `base_fields` to `SearchDocument` type

**Files:**
- Modify: `frontend/types/search.ts:64-124`

- [ ] **Step 1: Extend `SearchDocument`**

In `frontend/types/search.ts`, inside the `SearchDocument` interface, after the existing `metadata?: { ... }` block (around line 104-114) and before the `_isWeaviateError` line, add:

```typescript
  /**
   * Extracted base-schema columns (base_appellant, base_appeal_outcome,
   * base_num_victims, …). Populated by the backend only when
   * include_base_fields=true is requested on /documents/{id} or
   * /documents/batch. Otherwise undefined.
   */
  base_fields?: Record<string, unknown> | null;
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run validate`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/types/search.ts
git commit -m "feat(frontend): add base_fields to SearchDocument type"
```

---

## Task 8: Frontend — Forward `include_base_fields` through API client

**Files:**
- Modify: `frontend/lib/api/documents.ts:20-28, 102-150`
- Modify: `frontend/lib/api/collections.ts:169-186`

- [ ] **Step 1: Extend `FetchDocumentsByIdsInput`**

In `frontend/lib/api/documents.ts` (around line 20-24), update the input interface:

```typescript
export interface FetchDocumentsByIdsInput {
  document_ids: string[];
  return_vectors?: boolean;
  return_properties?: string[];
  include_base_fields?: boolean;
}
```

- [ ] **Step 2: Forward the flag in `fetchDocumentsByIds`**

In the same file, inside `fetchDocumentsByIds` (around line 110-128), after the existing `payload` setup and the conditional `return_properties` block, add:

```typescript
  if (input.include_base_fields) {
    payload.include_base_fields = true;
  }
```

(Place this before the `await fetch(...)` call.)

- [ ] **Step 3: Pass the flag from `loadAllCollectionDocuments`**

In `frontend/lib/api/collections.ts`, update `loadAllCollectionDocuments` (around line 169-186):

```typescript
export async function loadAllCollectionDocuments(
  documentIds: string[],
  onProgress?: (progress: LoadAllProgress) => void
): Promise<SearchDocument[]> {
  if (documentIds.length === 0) return [];

  const chunks = chunkDocumentIds(documentIds);
  const all: SearchDocument[] = [];
  onProgress?.({ loaded: 0, total: documentIds.length });

  for (const chunk of chunks) {
    const result = await fetchDocumentsByIds({
      document_ids: chunk,
      include_base_fields: true,
    });
    all.push(...result.documents);
    onProgress?.({ loaded: all.length, total: documentIds.length });
  }

  return all;
}
```

- [ ] **Step 4: Type-check + lint**

Run: `cd frontend && npm run validate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api/documents.ts frontend/lib/api/collections.ts
git commit -m "feat(frontend): request base_fields when loading collection table"
```

---

## Task 9: Frontend — Add base columns to `COLLECTION_EXPORT_COLUMNS`

**Files:**
- Modify: `frontend/lib/collection-export.ts`

- [ ] **Step 1: Read the current file**

Re-read `frontend/lib/collection-export.ts` to have the current column list and `flattenDocumentForExport` in working memory.

- [ ] **Step 2: Add the base columns + base-field flattening**

Replace the file's contents with this updated version (keeping all existing behaviour, appending base columns at the end):

```typescript
import type { SearchDocument } from "@/types/search";
import type { ExportRow } from "@/lib/file-export";
import {
  BASE_FIELD_ORDER,
  FIELD_LABELS,
  formatValue,
} from "@/lib/document-fields";

export interface CollectionExportColumn {
  key: string;
  label: string;
}

const STANDARD_COLUMNS: CollectionExportColumn[] = [
  { key: "document_id", label: "Document ID" },
  { key: "title", label: "Title" },
  { key: "date_issued", label: "Date issued" },
  { key: "country", label: "Country" },
  { key: "language", label: "Language" },
  { key: "court_name", label: "Court" },
  { key: "department_name", label: "Department" },
  { key: "document_number", label: "Document number" },
  { key: "issuing_body_name", label: "Issuing body" },
  { key: "issuing_body_type", label: "Issuing body type" },
  { key: "issuing_body_jurisdiction", label: "Issuing body jurisdiction" },
  { key: "presiding_judge", label: "Presiding judge" },
  { key: "judges", label: "Judges" },
  { key: "parties", label: "Parties" },
  { key: "outcome", label: "Outcome" },
  { key: "summary", label: "Summary" },
  { key: "thesis", label: "Thesis" },
  { key: "keywords", label: "Keywords" },
  { key: "legal_bases", label: "Legal bases" },
  { key: "legal_concepts", label: "Legal concepts" },
  { key: "legal_references", label: "Legal references" },
  { key: "extracted_legal_bases", label: "Extracted legal bases" },
  { key: "references", label: "References" },
  { key: "factual_state", label: "Factual state" },
  { key: "legal_state", label: "Legal state" },
  { key: "full_text", label: "Full text" },
  { key: "source_url", label: "Source URL" },
  { key: "score", label: "Score" },
];

const BASE_COLUMNS: CollectionExportColumn[] = BASE_FIELD_ORDER.map((key) => ({
  key,
  label: FIELD_LABELS[key]?.label ?? key,
}));

export const COLLECTION_EXPORT_COLUMNS: CollectionExportColumn[] = [
  ...STANDARD_COLUMNS,
  ...BASE_COLUMNS,
];

function joinArray(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (item === null || item === undefined) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") return JSON.stringify(item);
      return String(item);
    })
    .filter((s) => s.length > 0)
    .join("\n");
}

function formatLegalReferences(value: SearchDocument["legal_references"]): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((ref) => {
      const cite = ref.normalized_citation ? ` (${ref.normalized_citation})` : "";
      return `[${ref.ref_type}] ${ref.text}${cite}`;
    })
    .join("\n");
}

function formatLegalConcepts(value: SearchDocument["legal_concepts"]): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((c) => (c.concept_type ? `${c.concept_name} (${c.concept_type})` : c.concept_name))
    .join("\n");
}

/** Render a base_* value using the shared detail-page formatter. */
function formatBaseCell(key: string, value: unknown): string {
  return formatValue(key, value) ?? "";
}

export function flattenDocumentForExport(doc: SearchDocument): ExportRow {
  const issuingBody = doc.issuing_body;
  const issuingBodyName =
    typeof issuingBody === "string"
      ? issuingBody
      : issuingBody?.name ?? "";
  const issuingBodyType =
    typeof issuingBody === "object" && issuingBody !== null ? issuingBody.type ?? "" : "";
  const issuingBodyJurisdiction =
    typeof issuingBody === "object" && issuingBody !== null
      ? issuingBody.jurisdiction ?? ""
      : "";

  const row: ExportRow = {
    document_id: doc.document_id ?? "",
    title: doc.title ?? "",
    date_issued: doc.date_issued ?? "",
    country: doc.country ?? "",
    language: doc.language ?? "",
    court_name: doc.court_name ?? "",
    department_name: doc.department_name ?? "",
    document_number: doc.document_number ?? "",
    issuing_body_name: issuingBodyName,
    issuing_body_type: issuingBodyType,
    issuing_body_jurisdiction: issuingBodyJurisdiction,
    presiding_judge: doc.presiding_judge ?? "",
    judges: joinArray(doc.judges),
    parties: doc.parties ?? "",
    outcome: doc.outcome ?? "",
    summary: doc.summary ?? "",
    thesis: doc.thesis ?? "",
    keywords: joinArray(doc.keywords),
    legal_bases: joinArray(doc.legal_bases),
    legal_concepts: formatLegalConcepts(doc.legal_concepts),
    legal_references: formatLegalReferences(doc.legal_references),
    extracted_legal_bases: doc.extracted_legal_bases ?? "",
    references: joinArray(doc.references),
    factual_state: doc.factual_state ?? "",
    legal_state: doc.legal_state ?? "",
    full_text: doc.full_text ?? "",
    source_url: doc.metadata?.source_url ?? "",
    score: doc.score ?? "",
  };

  // Base extraction columns: read from doc.base_fields and format via shared
  // helper so booleans render as "Yes / No", arrays comma-join, enum codes
  // (gender_male → "Male") map to human labels, etc.
  const baseFields = doc.base_fields ?? null;
  for (const col of BASE_COLUMNS) {
    const value = baseFields ? baseFields[col.key] : undefined;
    row[col.key] = formatBaseCell(col.key, value);
  }

  return row;
}

export function buildCollectionExportRows(docs: SearchDocument[]): ExportRow[] {
  return docs.map(flattenDocumentForExport);
}

export function buildExportFilename(collectionName: string): string {
  const slug =
    collectionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collection";
  const date = new Date().toISOString().split("T")[0];
  return `${slug}-${date}`;
}
```

- [ ] **Step 3: Type-check + lint**

Run: `cd frontend && npm run validate`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/collection-export.ts
git commit -m "feat(frontend): add base_* extracted-schema columns to collection table"
```

---

## Task 10: Frontend — Unit test for collection-export flattening

**Files:**
- Create or extend: `frontend/__tests__/lib/collection-export.test.ts`

- [ ] **Step 1: Check whether the test file already exists**

Run: `ls frontend/__tests__/lib/collection-export.test.ts 2>/dev/null && echo "exists" || echo "missing"`

- [ ] **Step 2: Write the test file (create if missing, append cases if it exists)**

Create / extend `frontend/__tests__/lib/collection-export.test.ts`:

```typescript
import {
  COLLECTION_EXPORT_COLUMNS,
  flattenDocumentForExport,
} from "@/lib/collection-export";
import type { SearchDocument } from "@/types/search";

const makeDoc = (overrides: Partial<SearchDocument> = {}): SearchDocument =>
  ({
    document_id: "X-1",
    title: "Case X",
    date_issued: null,
    issuing_body: null,
    language: null,
    document_number: null,
    country: "GB",
    full_text: null,
    summary: null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: null,
    score: null,
    court_name: null,
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    ...overrides,
  } as SearchDocument);

describe("collection-export", () => {
  it("includes base_* columns in COLLECTION_EXPORT_COLUMNS after standard ones", () => {
    const keys = COLLECTION_EXPORT_COLUMNS.map((c) => c.key);
    const firstBaseIdx = keys.findIndex((k) => k.startsWith("base_"));
    const lastStandardIdx = keys.findIndex((k) => k === "score");
    expect(firstBaseIdx).toBeGreaterThan(lastStandardIdx);
    expect(keys).toContain("base_appellant");
    expect(keys).toContain("base_appeal_outcome");
    expect(keys).toContain("base_num_victims");
  });

  it("flattens base_fields into the row using formatValue", () => {
    const doc = makeDoc({
      base_fields: {
        base_appellant: "offender",
        base_num_victims: 3,
        base_did_offender_confess: true,
        base_appeal_outcome: ["outcome_conviction_quashed"],
      },
    });
    const row = flattenDocumentForExport(doc);
    expect(row.base_appellant).toBe("Offender");
    expect(row.base_num_victims).toBe("3");
    expect(row.base_did_offender_confess).toBe("Yes");
    expect(row.base_appeal_outcome).toBe("Conviction quashed");
  });

  it("emits empty strings for base_* keys when base_fields is missing", () => {
    const doc = makeDoc({ base_fields: null });
    const row = flattenDocumentForExport(doc);
    expect(row.base_appellant).toBe("");
    expect(row.base_num_victims).toBe("");
  });

  it("preserves existing standard column flattening", () => {
    const doc = makeDoc({
      title: "Case X",
      keywords: ["a", "b"],
      judges: ["J. Doe"],
    });
    const row = flattenDocumentForExport(doc);
    expect(row.title).toBe("Case X");
    expect(row.keywords).toBe("a\nb");
    expect(row.judges).toBe("J. Doe");
  });
});
```

> If `formatValue` for `base_appellant` produces a different exact string in this codebase (e.g. it might pass strings through unchanged when no enum match exists), adjust the expectation to whatever the actual helper returns. Run the test and let the failure tell you the canonical value — but **don't** silently weaken the assertion to anything-goes.

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npm test -- collection-export`
Expected: all tests pass.

- [ ] **Step 4: Run full frontend test + lint suite**

Run: `cd frontend && npm run validate && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/__tests__/lib/collection-export.test.ts
git commit -m "test(frontend): cover base_* columns in collection-export flattening"
```

---

## Task 11: Manual UI verification

**Files:** none — exploratory.

- [ ] **Step 1: Start backend + frontend in dev**

```bash
# Terminal 1 (backend)
cd backend && poetry run uvicorn app.server:app --reload --port 8004

# Terminal 2 (frontend)
cd frontend && npm run dev
```

- [ ] **Step 2: Open the target collection in the browser**

Navigate to `http://localhost:3026/collections/d6d56dad-d8e9-4509-90d9-eeb55970235e` (the collection from the original request).

- [ ] **Step 3: Switch to Table mode**

Click the **Table** toggle in the top-right. Confirm:
- All ~50 `base_*` columns appear *after* the existing columns (Document ID … Score), in the order defined by `BASE_FIELD_ORDER`.
- Documents that have extracted base values show them (Appellant: "Offender", Appeal Outcome: "Conviction quashed", Number of Victims: "3", etc.).
- Documents without base data show empty cells (`—` placeholder).
- The Export → Excel and Export → CSV buttons produce a file with all base columns populated.

- [ ] **Step 4: Capture a screenshot for the PR**

Take a browser screenshot of the table view with base columns visible.

- [ ] **Step 5: Note any visual issues for follow-up**

Likely issues (do **not** fix in this plan — file as separate tasks if needed):
- Horizontal scroll for ~80 columns may feel heavy → potential follow-up: column toggle UI.
- Some `base_*` labels may be longer than the existing column header tokens → minor `whitespace-nowrap` truncation tradeoff.

---

## Self-Review

- **Spec coverage:** All five items from the brainstorm are tasked:
  1. Backend exposes base_* via opt-in flag → Tasks 1-4
  2. Backend tests cover both flag states → Task 5
  3. Frontend shared field schema (avoid duplication with detail page) → Task 6
  4. Frontend type + API plumbing → Tasks 7-8
  5. Table columns reuse fixed canonical order, append after standard → Task 9, with tests in Task 10
- **Placeholder scan:** Two intentional inline-paste placeholders in Task 6 Step 2 (`FIELD_LABELS`, `ENUM_VALUE_LABELS`, `FIELD_ORDER`, `formatValue` bodies). These are not "TBD" — they are "copy verbatim from the file you just read in Step 1." Acceptable: the engineer has the source file and a clear instruction. Everything else is concrete.
- **Type consistency:** `base_fields` named identically across backend (`LegalDocument.base_fields`), API (`include_base_fields`), TS type (`SearchDocument.base_fields`), and column reads (`doc.base_fields?.[key]`). `BASE_FIELD_ORDER` is the only new identifier; it's defined in Task 6 and consumed in Task 9.
