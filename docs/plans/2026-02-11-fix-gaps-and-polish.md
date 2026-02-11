# Juddges App - Fix Identified Gaps and Polish Features

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix high-priority gaps identified in comprehensive code review and polish existing features for production readiness.

**Architecture:** Multi-pronged approach fixing frontend E2E tests, backend search metadata, AI query enhancement, and cleanup of deprecated code. Follows TDD where applicable, prioritizes user-facing improvements.

**Tech Stack:** Next.js 15, Playwright, FastAPI, Supabase pgvector, LangChain, Pytest

---

## Task 1: Add Chat E2E Tests (Frontend)

**Priority:** HIGH
**Estimated Time:** 4-6 hours
**Location:** Frontend testing infrastructure

**Files:**
- Create: `frontend/__tests__/e2e/chat/chat-flow.spec.ts`
- Create: `frontend/__tests__/e2e/chat/chat-history.spec.ts`
- Reference: `frontend/__tests__/e2e/search/search-flow.spec.ts` (example pattern)

### Step 1: Create chat flow test file

Create: `frontend/__tests__/e2e/chat/chat-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and ensure authenticated
    await page.goto('http://localhost:3007')
    // TODO: Add auth setup if not using existing session
  })

  test('should create new chat and send message', async ({ page }) => {
    // Navigate to chat page
    await page.goto('http://localhost:3007/chat')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Start a New Chat')

    // Click "Start Chat" or similar button
    const startButton = page.locator('button:has-text("Start Chat")')
    await startButton.click()

    // Type a message
    const input = page.locator('textarea[placeholder*="message"]')
    await input.fill('What is a judgment?')

    // Send message
    await page.locator('button[type="submit"]').click()

    // Wait for response
    await expect(page.locator('[data-testid="chat-message-assistant"]').first())
      .toBeVisible({ timeout: 30000 })

    // Verify message appears in chat
    await expect(page.locator('text=What is a judgment?')).toBeVisible()
  })

  test('should display streaming response', async ({ page }) => {
    await page.goto('http://localhost:3007/chat')

    // Send message
    const input = page.locator('textarea[placeholder*="message"]')
    await input.fill('Explain legal precedent')
    await page.locator('button[type="submit"]').click()

    // Wait for streaming to start
    await page.waitForTimeout(1000)

    // Verify loading state or streaming indicator
    const assistantMessage = page.locator('[data-testid="chat-message-assistant"]').first()
    await expect(assistantMessage).toBeVisible({ timeout: 10000 })

    // Verify response contains text
    await expect(assistantMessage).not.toBeEmpty()
  })

  test('should show source documents with message', async ({ page }) => {
    await page.goto('http://localhost:3007/chat')

    // Send message that would return sources
    const input = page.locator('textarea[placeholder*="message"]')
    await input.fill('Find cases about contract law')
    await page.locator('button[type="submit"]').click()

    // Wait for response with sources
    await page.waitForTimeout(3000)

    // Check for sources section
    const sourcesSection = page.locator('[data-testid="message-sources"]')
    await expect(sourcesSection).toBeVisible({ timeout: 30000 })
  })
})
```

### Step 2: Create chat history test file

Create: `frontend/__tests__/e2e/chat/chat-history.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Chat History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3007')
  })

  test('should list existing chats in sidebar', async ({ page }) => {
    await page.goto('http://localhost:3007/chat')

    // Wait for sidebar to load
    const sidebar = page.locator('[data-testid="chat-history-sidebar"]')
    await expect(sidebar).toBeVisible()

    // Check for at least one chat (assuming test data exists)
    const chatItems = page.locator('[data-testid="chat-history-item"]')
    await expect(chatItems.first()).toBeVisible({ timeout: 10000 })
  })

  test('should load existing chat when clicked', async ({ page }) => {
    await page.goto('http://localhost:3007/chat')

    // Click first chat in history
    const firstChat = page.locator('[data-testid="chat-history-item"]').first()
    await firstChat.click()

    // Wait for chat messages to load
    await expect(page.locator('[data-testid="chat-message"]').first())
      .toBeVisible({ timeout: 10000 })

    // Verify URL changed to include chat ID
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/)
  })

  test('should delete chat from history', async ({ page }) => {
    await page.goto('http://localhost:3007/chat')

    // Hover over first chat to reveal delete button
    const firstChat = page.locator('[data-testid="chat-history-item"]').first()
    await firstChat.hover()

    // Click delete button
    const deleteButton = firstChat.locator('[data-testid="delete-chat-button"]')
    await deleteButton.click()

    // Confirm deletion in dialog
    const confirmButton = page.locator('button:has-text("Delete")')
    await confirmButton.click()

    // Verify chat removed from list
    await page.waitForTimeout(1000)
    // Check that first chat is different or list is empty
  })

  test('should rename chat', async ({ page }) => {
    await page.goto('http://localhost:3007/chat')

    // Click rename button on first chat
    const firstChat = page.locator('[data-testid="chat-history-item"]').first()
    await firstChat.hover()

    const renameButton = firstChat.locator('[data-testid="rename-chat-button"]')
    await renameButton.click()

    // Enter new name
    const input = page.locator('input[placeholder*="chat name"]')
    await input.fill('Renamed Chat Test')

    // Save
    await page.locator('button:has-text("Save")').click()

    // Verify new name appears
    await expect(page.locator('text=Renamed Chat Test')).toBeVisible()
  })

  test('should export chat', async ({ page }) => {
    await page.goto('http://localhost:3007/chat')

    // Load a chat
    const firstChat = page.locator('[data-testid="chat-history-item"]').first()
    await firstChat.click()

    // Click export button
    const exportButton = page.locator('button:has-text("Export")')
    await exportButton.click()

    // Wait for download to start
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Download JSON")').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/chat.*\.json/)
  })
})
```

### Step 3: Add test data-testid attributes to components

Modify: `frontend/lib/styles/components/chat/chat-message.tsx`

Add data-testid to message containers:

```typescript
// Find the message container div and add data-testid
<div data-testid="chat-message" data-role={message.role} className={...}>
  {message.role === 'assistant' && (
    <div data-testid="chat-message-assistant">
      {/* existing content */}
    </div>
  )}
</div>
```

Modify: `frontend/lib/styles/components/chat/chat-history.tsx`

Add data-testid to history items:

```typescript
// In the chat history item rendering
<div data-testid="chat-history-item" className={...}>
  {/* existing content */}
  <button data-testid="delete-chat-button" onClick={handleDelete}>
    {/* delete icon */}
  </button>
  <button data-testid="rename-chat-button" onClick={handleRename}>
    {/* rename icon */}
  </button>
</div>
```

Modify: `frontend/components/chat/ChatInterface.tsx` (or similar)

Add data-testid to sources section:

```typescript
{sources && sources.length > 0 && (
  <div data-testid="message-sources">
    {/* existing sources rendering */}
  </div>
)}
```

### Step 4: Update Playwright config for chat tests

Modify: `frontend/playwright.config.ts`

Ensure baseURL is set and timeout is sufficient:

```typescript
export default defineConfig({
  // ... existing config
  use: {
    baseURL: 'http://localhost:3007',
    trace: 'on-first-retry',
  },
  timeout: 60000, // Increase for streaming tests
})
```

### Step 5: Run chat E2E tests

```bash
cd frontend
npm run test:e2e -- __tests__/e2e/chat/
```

Expected: Tests may fail initially due to missing data-testid attributes or timing issues. Fix incrementally.

### Step 6: Commit chat E2E tests

```bash
git add frontend/__tests__/e2e/chat/
git add frontend/lib/styles/components/chat/
git commit -m "test: add E2E tests for chat functionality

- Add chat flow tests (send message, streaming, sources)
- Add chat history tests (list, load, delete, rename, export)
- Add data-testid attributes to chat components
- Update Playwright config for longer timeouts"
```

---

## Task 2: Fix Backend Search Metadata Mismatch

**Priority:** HIGH
**Estimated Time:** 2-3 hours
**Location:** Backend search endpoint and Supabase function

**Files:**
- Modify: `backend/app/documents.py:777-910` (search_documents function)
- Modify: `supabase/migrations/20260209000002_extend_judgments_filtering.sql` (search_judgments_hybrid function)
- Test: `backend/tests/app/test_documents.py`

### Step 1: Analyze current search function return structure

Read: `supabase/migrations/20260209000002_extend_judgments_filtering.sql`

Look for `search_judgments_hybrid` function definition. Current returns: id, case_number, title, summary, jurisdiction, decision_date, vector_score, text_score, combined_score.

Frontend expects: DocumentChunk with chunk_text, chunk_metadata, document_id, relevance_score, chunk_type.

### Step 2: Update Supabase search function to return chunk metadata

Create: `supabase/migrations/20260211000003_add_chunk_metadata_to_search.sql`

```sql
-- Drop existing function
DROP FUNCTION IF EXISTS search_judgments_hybrid;

-- Recreate with enhanced metadata
CREATE OR REPLACE FUNCTION search_judgments_hybrid(
  query_embedding vector(768),
  search_text text,
  search_language text DEFAULT 'simple',
  filter_jurisdictions text[] DEFAULT NULL,
  filter_court_names text[] DEFAULT NULL,
  filter_court_levels text[] DEFAULT NULL,
  filter_case_types text[] DEFAULT NULL,
  filter_decision_types text[] DEFAULT NULL,
  filter_outcomes text[] DEFAULT NULL,
  filter_keywords text[] DEFAULT NULL,
  filter_legal_topics text[] DEFAULT NULL,
  filter_cited_legislation text[] DEFAULT NULL,
  filter_date_from date DEFAULT NULL,
  filter_date_to date DEFAULT NULL,
  similarity_threshold float DEFAULT 0.7,
  hybrid_alpha float DEFAULT 0.5,
  result_limit int DEFAULT 20,
  result_offset int DEFAULT 0
)
RETURNS TABLE (
  -- Existing fields
  id uuid,
  case_number text,
  title text,
  summary text,
  jurisdiction text,
  court_name text,
  court_level text,
  decision_date date,
  full_text text,
  keywords text[],
  legal_topics text[],

  -- Scoring fields
  vector_score float,
  text_score float,
  combined_score float,

  -- NEW: Chunk metadata
  chunk_text text,
  chunk_type text,
  chunk_start_pos int,
  chunk_end_pos int,
  chunk_metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_search AS (
    SELECT
      j.id,
      (1 - (j.embedding <=> query_embedding)) as similarity,
      ROW_NUMBER() OVER (ORDER BY j.embedding <=> query_embedding) as rank
    FROM judgments j
    WHERE (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
      AND (filter_court_names IS NULL OR j.court_name = ANY(filter_court_names))
      AND (filter_court_levels IS NULL OR j.court_level = ANY(filter_court_levels))
      AND (filter_case_types IS NULL OR j.case_type = ANY(filter_case_types))
      AND (filter_decision_types IS NULL OR j.decision_type = ANY(filter_decision_types))
      AND (filter_outcomes IS NULL OR j.outcome = ANY(filter_outcomes))
      AND (filter_keywords IS NULL OR j.keywords && filter_keywords)
      AND (filter_legal_topics IS NULL OR j.legal_topics && filter_legal_topics)
      AND (filter_cited_legislation IS NULL OR j.cited_legislation && filter_cited_legislation)
      AND (filter_date_from IS NULL OR j.decision_date >= filter_date_from)
      AND (filter_date_to IS NULL OR j.decision_date <= filter_date_to)
      AND (1 - (j.embedding <=> query_embedding)) > similarity_threshold
    LIMIT result_limit * 2
  ),
  text_search AS (
    SELECT
      j.id,
      ts_rank(
        to_tsvector(search_language::regconfig, j.title || ' ' || j.summary || ' ' || j.full_text),
        plainto_tsquery(search_language::regconfig, search_text)
      ) as rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank(
        to_tsvector(search_language::regconfig, j.title || ' ' || j.summary || ' ' || j.full_text),
        plainto_tsquery(search_language::regconfig, search_text)
      ) DESC) as rank_num
    FROM judgments j
    WHERE (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
      AND (filter_court_names IS NULL OR j.court_name = ANY(filter_court_names))
      AND (filter_court_levels IS NULL OR j.court_level = ANY(filter_court_levels))
      AND (filter_case_types IS NULL OR j.case_type = ANY(filter_case_types))
      AND (filter_decision_types IS NULL OR j.decision_type = ANY(filter_decision_types))
      AND (filter_outcomes IS NULL OR j.outcome = ANY(filter_outcomes))
      AND (filter_keywords IS NULL OR j.keywords && filter_keywords)
      AND (filter_legal_topics IS NULL OR j.legal_topics && filter_legal_topics)
      AND (filter_cited_legislation IS NULL OR j.cited_legislation && filter_cited_legislation)
      AND (filter_date_from IS NULL OR j.decision_date >= filter_date_from)
      AND (filter_date_to IS NULL OR j.decision_date <= filter_date_to)
      AND to_tsvector(search_language::regconfig, j.title || ' ' || j.summary || ' ' || j.full_text)
          @@ plainto_tsquery(search_language::regconfig, search_text)
    LIMIT result_limit * 2
  ),
  combined AS (
    SELECT
      COALESCE(v.id, t.id) as judgment_id,
      COALESCE(v.similarity, 0) as vec_score,
      COALESCE(t.rank, 0) as txt_score,
      (COALESCE(v.similarity, 0) * hybrid_alpha + COALESCE(t.rank, 0) * (1 - hybrid_alpha)) as final_score
    FROM vector_search v
    FULL OUTER JOIN text_search t ON v.id = t.id
    ORDER BY final_score DESC
    LIMIT result_limit
    OFFSET result_offset
  )
  SELECT
    j.id,
    j.case_number,
    j.title,
    j.summary,
    j.jurisdiction,
    j.court_name,
    j.court_level,
    j.decision_date,
    j.full_text,
    j.keywords,
    j.legal_topics,
    c.vec_score::float as vector_score,
    c.txt_score::float as text_score,
    c.final_score::float as combined_score,
    -- NEW: Generate chunk from summary or title
    COALESCE(j.summary, LEFT(j.full_text, 500)) as chunk_text,
    'summary'::text as chunk_type,
    0 as chunk_start_pos,
    LENGTH(COALESCE(j.summary, LEFT(j.full_text, 500))) as chunk_end_pos,
    jsonb_build_object(
      'court_name', j.court_name,
      'decision_date', j.decision_date,
      'case_number', j.case_number,
      'vector_score', c.vec_score,
      'text_score', c.txt_score,
      'combined_score', c.final_score
    ) as chunk_metadata
  FROM combined c
  JOIN judgments j ON j.id = c.judgment_id;
END;
$$;
```

### Step 3: Apply migration

```bash
cd supabase
npx supabase db push
```

Expected: Migration applied successfully, function updated.

### Step 4: Update backend to use new metadata

Modify: `backend/app/documents.py`

In `search_documents()` function (around line 860-867), update chunk conversion:

```python
# Old code (around line 860):
chunk = DocumentChunk(
    chunk_id=f"{result['id']}_0",
    document_id=str(result["id"]),
    chunk_text=result.get("summary", result.get("title", "")),
    similarity=result.get("combined_score", 0.0),
    metadata={}
)

# NEW code:
chunk = DocumentChunk(
    chunk_id=f"{result['id']}_0",
    document_id=str(result["id"]),
    chunk_text=result.get("chunk_text", ""),
    chunk_type=result.get("chunk_type", "summary"),
    chunk_start_pos=result.get("chunk_start_pos", 0),
    chunk_end_pos=result.get("chunk_end_pos", 0),
    similarity=result.get("combined_score", 0.0),
    metadata=result.get("chunk_metadata", {}),
    # Preserve existing scoring for backward compatibility
    vector_score=result.get("vector_score"),
    text_score=result.get("text_score"),
    combined_score=result.get("combined_score")
)
```

### Step 5: Update DocumentChunk model if needed

Modify: `backend/app/models.py`

Check if DocumentChunk has all required fields:

```python
class DocumentChunk(BaseModel):
    chunk_id: str
    document_id: str
    chunk_text: str
    chunk_type: str = "summary"  # Add default
    chunk_start_pos: int = 0  # Add if missing
    chunk_end_pos: int = 0  # Add if missing
    similarity: float
    metadata: dict[str, Any] = {}
    # Optional scoring details
    vector_score: Optional[float] = None
    text_score: Optional[float] = None
    combined_score: Optional[float] = None
```

### Step 6: Write test for enhanced metadata

Create: `backend/tests/app/test_search_metadata.py`

```python
import pytest
from app.documents import search_documents
from app.models import SearchChunksRequest

@pytest.mark.integration
async def test_search_returns_chunk_metadata():
    """Test that search returns proper chunk metadata."""
    request = SearchChunksRequest(
        query="contract law",
        limit_docs=5,
        alpha=0.5
    )

    response = await search_documents(request)

    assert len(response.chunks) > 0

    # Check first chunk has all metadata fields
    chunk = response.chunks[0]
    assert chunk.chunk_text is not None
    assert chunk.chunk_type in ["summary", "content"]
    assert chunk.chunk_start_pos >= 0
    assert chunk.chunk_end_pos > chunk.chunk_start_pos
    assert chunk.metadata is not None
    assert "combined_score" in chunk.metadata
    assert chunk.vector_score is not None
    assert chunk.text_score is not None
    assert chunk.combined_score is not None

@pytest.mark.integration
async def test_search_metadata_includes_scoring():
    """Test that chunk metadata includes detailed scoring."""
    request = SearchChunksRequest(
        query="legal precedent",
        limit_docs=3,
        alpha=0.7  # Favor vector search
    )

    response = await search_documents(request)
    chunk = response.chunks[0]

    # Verify scoring metadata
    assert chunk.vector_score >= 0
    assert chunk.text_score >= 0
    assert chunk.combined_score == pytest.approx(
        chunk.vector_score * 0.7 + chunk.text_score * 0.3,
        rel=0.01
    )
```

### Step 7: Run backend tests

```bash
cd backend
poetry run pytest tests/app/test_search_metadata.py -v
```

Expected: Tests pass with new metadata structure.

### Step 8: Commit search metadata fix

```bash
git add backend/app/documents.py backend/app/models.py
git add backend/tests/app/test_search_metadata.py
git add supabase/migrations/20260211000003_add_chunk_metadata_to_search.sql
git commit -m "fix: enhance search results with detailed chunk metadata

- Update search_judgments_hybrid to return chunk metadata
- Add chunk_type, positions, and scoring details
- Update DocumentChunk model with new fields
- Add tests for metadata validation
- Fixes backend-frontend metadata mismatch"
```

---

## Task 3: Implement "Thinking" Mode Query Rewriting

**Priority:** HIGH
**Estimated Time:** 3-4 hours
**Location:** Backend search pipeline

**Files:**
- Create: `backend/packages/juddges_search/chains/query_enhancement.py`
- Modify: `backend/app/documents.py:777-910`
- Test: `backend/tests/test_query_enhancement.py`

### Step 1: Create query enhancement chain

Create: `backend/packages/juddges_search/chains/query_enhancement.py`

```python
"""Query enhancement chain for 'thinking' mode search."""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI


# Query enhancement prompt
QUERY_ENHANCEMENT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert legal research assistant. Your task is to enhance user search queries to improve legal document retrieval.

Given a user's search query, rewrite it to:
1. Add relevant legal terminology and synonyms
2. Expand abbreviations and acronyms
3. Include related legal concepts
4. Maintain the original intent
5. Keep it concise (max 200 words)

Examples:
- Input: "contract disputes"
  Output: "contract disputes breach of contract contractual obligations breach of agreement contractual disputes agreement violations contract law"

- Input: "tax evasion cases"
  Output: "tax evasion tax fraud tax avoidance criminal tax violations tax law violations revenue evasion willful tax violations"

- Input: "employment discrimination"
  Output: "employment discrimination workplace discrimination discriminatory hiring practices discriminatory termination equal employment opportunity violations Title VII violations"

Return ONLY the enhanced query text, no explanation."""),
    ("human", "{query}")
])


def create_query_enhancement_chain(llm: ChatOpenAI | None = None):
    """Create the query enhancement chain.

    Args:
        llm: Optional LLM instance. If None, uses default gpt-4o-mini.

    Returns:
        Runnable chain that enhances queries.
    """
    if llm is None:
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.3,  # Low temperature for consistency
            max_tokens=200
        )

    chain = QUERY_ENHANCEMENT_PROMPT | llm | StrOutputParser()
    return chain


async def enhance_query(query: str, llm: ChatOpenAI | None = None) -> str:
    """Enhance a search query for better legal document retrieval.

    Args:
        query: Original user query
        llm: Optional LLM instance

    Returns:
        Enhanced query string
    """
    chain = create_query_enhancement_chain(llm)
    enhanced = await chain.ainvoke({"query": query})
    return enhanced.strip()
```

### Step 2: Write test for query enhancement

Create: `backend/tests/test_query_enhancement.py`

```python
import pytest
from juddges_search.chains.query_enhancement import enhance_query


@pytest.mark.asyncio
async def test_enhance_query_basic():
    """Test basic query enhancement."""
    original = "contract law"
    enhanced = await enhance_query(original)

    # Enhanced should be longer and contain original terms
    assert len(enhanced) > len(original)
    assert "contract" in enhanced.lower()

    # Should add legal terminology
    assert any(term in enhanced.lower() for term in [
        "contractual", "agreement", "obligation", "breach"
    ])


@pytest.mark.asyncio
async def test_enhance_query_preserves_intent():
    """Test that enhancement preserves original intent."""
    original = "employment discrimination in hiring"
    enhanced = await enhance_query(original)

    assert "employment" in enhanced.lower()
    assert "discrimination" in enhanced.lower()
    # Should not completely change topic
    assert len(enhanced.split()) < 50  # Keep concise


@pytest.mark.asyncio
async def test_enhance_query_expands_abbreviations():
    """Test that abbreviations are expanded."""
    original = "GDPR violations"
    enhanced = await enhance_query(original)

    # Should expand or contextualize
    assert len(enhanced) > len(original)
```

### Step 3: Run enhancement tests

```bash
cd backend
poetry run pytest tests/test_query_enhancement.py -v
```

Expected: Tests pass, query enhancement working.

### Step 4: Integrate query enhancement into search endpoint

Modify: `backend/app/documents.py`

In `search_documents()` function, add enhancement for "thinking" mode:

```python
# Around line 800, before calling search RPC
async def search_documents(
    request: SearchChunksRequest,
    current_user: Optional[AuthenticatedUser] = None
) -> SearchChunksResponse:
    """Search documents with optional query enhancement."""

    # ... existing code ...

    # NEW: Enhance query if in "thinking" mode
    search_query = request.query
    if request.mode == "thinking":
        try:
            from juddges_search.chains.query_enhancement import enhance_query
            logger.info(f"Enhancing query in thinking mode: {search_query}")
            search_query = await enhance_query(search_query)
            logger.info(f"Enhanced query: {search_query}")
        except Exception as e:
            logger.warning(f"Query enhancement failed, using original: {e}")
            # Fall back to original query if enhancement fails

    # Use enhanced query for text search
    results = supabase.rpc(
        "search_judgments_hybrid",
        {
            "query_embedding": embedding,
            "search_text": search_query,  # Use enhanced query
            # ... rest of params ...
        }
    ).execute()

    # ... rest of function ...
```

### Step 5: Add query enhancement to API response metadata

Modify: `backend/app/models.py`

Update SearchChunksResponse to include enhanced query:

```python
class SearchChunksResponse(BaseModel):
    chunks: list[DocumentChunk]
    documents: list[LegalDocument] | None = None
    total_chunks: int
    unique_documents: int
    query_time_ms: float
    timing_breakdown: dict[str, float] = {}
    pagination: PaginationMetadata

    # NEW: Include enhanced query for transparency
    enhanced_query: Optional[str] = None
    query_enhancement_used: bool = False
```

Update documents.py to populate these fields:

```python
# In search_documents() function, before returning response
response = SearchChunksResponse(
    chunks=chunks,
    # ... existing fields ...
    enhanced_query=search_query if request.mode == "thinking" else None,
    query_enhancement_used=request.mode == "thinking"
)
```

### Step 6: Test query enhancement integration

Create: `backend/tests/app/test_thinking_mode.py`

```python
import pytest
from app.documents import search_documents
from app.models import SearchChunksRequest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_thinking_mode_enhances_query():
    """Test that thinking mode enhances the query."""
    request = SearchChunksRequest(
        query="contract dispute",
        mode="thinking",
        limit_docs=5
    )

    response = await search_documents(request)

    assert response.query_enhancement_used is True
    assert response.enhanced_query is not None
    assert len(response.enhanced_query) > len(request.query)
    assert "contract" in response.enhanced_query.lower()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rabbit_mode_skips_enhancement():
    """Test that rabbit mode skips query enhancement."""
    request = SearchChunksRequest(
        query="contract dispute",
        mode="rabbit",  # Fast mode
        limit_docs=5
    )

    response = await search_documents(request)

    assert response.query_enhancement_used is False
    assert response.enhanced_query is None
```

### Step 7: Run integration tests

```bash
cd backend
poetry run pytest tests/app/test_thinking_mode.py -v
```

Expected: Tests pass, thinking mode working.

### Step 8: Commit query enhancement feature

```bash
git add backend/packages/juddges_search/chains/query_enhancement.py
git add backend/tests/test_query_enhancement.py
git add backend/tests/app/test_thinking_mode.py
git add backend/app/documents.py backend/app/models.py
git commit -m "feat: implement query enhancement for thinking mode

- Add query_enhancement.py with LangChain chain
- Integrate into search endpoint for thinking mode
- Add enhanced_query to API response
- Add tests for query enhancement
- Rabbit mode bypasses enhancement for speed"
```

---

## Task 4: Remove Deprecated Schema Generation Endpoints

**Priority:** MEDIUM
**Estimated Time:** 1 hour
**Location:** Backend API routers

**Files:**
- Modify: `backend/app/schema_generation_agent.py`
- Modify: `backend/app/server.py`

### Step 1: Identify deprecated endpoints

Read: `backend/app/schema_generation_agent.py`

Find endpoints marked as deprecated:
- `/schema-generator-agent/init-agent` (POST)
- `/schema-generator-agent/invoke-schema` (POST)

### Step 2: Comment out deprecated endpoints

Modify: `backend/app/schema_generation_agent.py`

```python
# Remove or comment out these endpoints:

# @router.post("/init-agent")
# async def init_agent(...):
#     """DEPRECATED: Use /schema-generator/chat instead"""
#     ...

# @router.post("/invoke-schema")
# async def invoke_schema(...):
#     """DEPRECATED: Use /schema-generator/chat instead"""
#     ...
```

### Step 3: Add deprecation notice in docstring

If keeping endpoints temporarily, add clear deprecation notice:

```python
@router.post("/init-agent", deprecated=True)
async def init_agent(...):
    """
    DEPRECATED: This endpoint is deprecated and will be removed in v0.4.0.
    Use POST /schema-generator/chat instead.
    """
    raise HTTPException(
        status_code=410,
        detail="This endpoint is deprecated. Use POST /schema-generator/chat instead."
    )
```

### Step 4: Update OpenAPI schema

Modify: `backend/app/server.py`

Ensure deprecated endpoints are marked in OpenAPI:

```python
app = FastAPI(
    title="Juddges Legal Research API",
    version="0.3.0",
    description="...",
    # Mark deprecated endpoints
    openapi_tags=[
        {
            "name": "schema-generation",
            "description": "Schema generation endpoints"
        },
        {
            "name": "deprecated",
            "description": "Deprecated endpoints (will be removed in v0.4.0)"
        }
    ]
)
```

### Step 5: Check for frontend usage

Search for frontend usage:

```bash
cd frontend
grep -r "schema-generator-agent" .
```

If found, update to use new endpoints.

### Step 6: Run backend tests

```bash
cd backend
poetry run pytest tests/ -v
```

Expected: All tests pass, deprecated endpoints removed or marked.

### Step 7: Commit deprecation cleanup

```bash
git add backend/app/schema_generation_agent.py backend/app/server.py
git commit -m "refactor: remove deprecated schema generation endpoints

- Remove /schema-generator-agent/init-agent
- Remove /schema-generator-agent/invoke-schema
- Update OpenAPI documentation
- Users should use /schema-generator/chat instead"
```

---

## Task 5: Clean Up Legacy Weaviate References

**Priority:** MEDIUM
**Estimated Time:** 2 hours
**Location:** Across backend codebase

**Files:**
- Identify: All files with "weaviate" imports or references
- Modify: Replace with Supabase equivalents or remove

### Step 1: Find all Weaviate references

```bash
cd backend
grep -r "weaviate" --include="*.py" . | grep -v "__pycache__" | grep -v ".pyc"
```

Output will show files to update.

### Step 2: Remove unused weaviate_db module

Check if `juddges_search/db/weaviate_db.py` is used:

```bash
cd backend
grep -r "from.*weaviate_db import" --include="*.py" .
grep -r "import.*weaviate_db" --include="*.py" .
```

If no active imports, remove or mark as deprecated:

```bash
# Option 1: Remove entirely
rm packages/juddges_search/juddges_search/db/weaviate_db.py

# Option 2: Add deprecation notice
# Add to top of file:
"""
DEPRECATED: This module is deprecated and no longer used.
Juddges App now uses Supabase pgvector for vector search.
This file is kept for reference only and will be removed in v0.4.0.
"""
```

### Step 3: Update imports in extraction code

Modify: `backend/app/workers.py`

If there are Weaviate imports, replace with Supabase:

```python
# OLD:
# from juddges_search.db.weaviate_db import get_documents_by_ids

# NEW:
from app.core.supabase import get_supabase_client

def fetch_documents_by_ids(document_ids: list[str]) -> list[dict]:
    """Fetch documents from Supabase by IDs."""
    supabase = get_supabase_client()

    results = supabase.table("judgments") \
        .select("*") \
        .in_("id", document_ids) \
        .execute()

    return results.data
```

### Step 4: Update schema generator data agents

Modify: `backend/packages/schema_generator_agent/schema_generator_agent/agents/data_agents.py`

Check line 6 for Weaviate references. Replace with Supabase calls.

### Step 5: Remove Weaviate from dependencies

Modify: `backend/pyproject.toml`

If `weaviate-client` is listed, mark as optional:

```toml
[tool.poetry.dependencies]
# ... existing deps ...
# weaviate-client = "^3.0.0"  # DEPRECATED: No longer used

# Or move to optional:
[tool.poetry.group.legacy.dependencies]
weaviate-client = "^3.0.0"  # Legacy, not required
```

### Step 6: Update environment variable documentation

Modify: `backend/.env.example`

Comment out Weaviate variables:

```bash
# WEAVIATE_URL=http://localhost:8080  # DEPRECATED: No longer used
# WEAVIATE_API_KEY=  # DEPRECATED: No longer used
# WEAVIATE_USE_POOL=true  # DEPRECATED: No longer used
```

### Step 7: Run all tests after cleanup

```bash
cd backend
poetry run pytest tests/ -v
```

Expected: All tests pass without Weaviate dependencies.

### Step 8: Commit Weaviate cleanup

```bash
git add backend/
git commit -m "refactor: remove legacy Weaviate references

- Remove weaviate_db module imports
- Replace with Supabase pgvector calls
- Update environment variable examples
- Mark weaviate-client as deprecated
- All vector search now uses Supabase"
```

---

## Task 6: Implement Table View in ExtractionDataViewer

**Priority:** MEDIUM
**Estimated Time:** 3-4 hours
**Location:** Frontend extraction results component

**Files:**
- Modify: `frontend/lib/styles/components/extraction/ExtractionDataViewer.tsx`
- Create: `frontend/lib/styles/components/extraction/ExtractionTableView.tsx`

### Step 1: Create ExtractionTableView component

Create: `frontend/lib/styles/components/extraction/ExtractionTableView.tsx`

```typescript
import React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Copy } from 'lucide-react'

interface ExtractionTableViewProps {
  results: Array<{
    document_id: string
    document_title?: string
    extracted_data: Record<string, any>
    status: string
  }>
  schema?: {
    properties: Record<string, any>
  }
}

export function ExtractionTableView({ results, schema }: ExtractionTableViewProps) {
  // Extract all unique field names from schema and results
  const fieldNames = React.useMemo(() => {
    const fields = new Set<string>()

    // From schema
    if (schema?.properties) {
      Object.keys(schema.properties).forEach(key => fields.add(key))
    }

    // From actual results (in case schema is missing)
    results.forEach(result => {
      Object.keys(result.extracted_data || {}).forEach(key => fields.add(key))
    })

    return Array.from(fields)
  }, [results, schema])

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // TODO: Add toast notification
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">Document</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            {fieldNames.map(field => (
              <TableHead key={field} className="min-w-[150px]">
                {field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </TableHead>
            ))}
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result, idx) => (
            <TableRow key={result.document_id || idx}>
              <TableCell className="font-medium">
                <div className="flex flex-col gap-1">
                  <span className="truncate max-w-[200px]">
                    {result.document_title || result.document_id}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {result.document_id.slice(0, 8)}...
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    result.status === 'COMPLETED' ? 'success' :
                    result.status === 'FAILED' ? 'destructive' :
                    'secondary'
                  }
                >
                  {result.status}
                </Badge>
              </TableCell>
              {fieldNames.map(field => (
                <TableCell key={field}>
                  {formatValue(result.extracted_data?.[field])}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(
                      JSON.stringify(result.extracted_data, null, 2)
                    )}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(`/documents/${result.document_id}`, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

### Step 2: Integrate table view into ExtractionDataViewer

Modify: `frontend/lib/styles/components/extraction/ExtractionDataViewer.tsx`

Replace the stub with actual implementation:

```typescript
import { ExtractionTableView } from './ExtractionTableView'

// In the component, around line 89-96, replace:
{viewMode === 'table' && (
  <div className="p-4 text-center text-muted-foreground">
    Table view coming soon...
  </div>
)}

// With:
{viewMode === 'table' && (
  <ExtractionTableView
    results={data.results}
    schema={data.schema}
  />
)}
```

### Step 3: Add table view toggle to UI

Modify: `frontend/lib/styles/components/extraction/ExtractionDataViewer.tsx`

Ensure view mode toggle includes table option:

```typescript
<div className="flex gap-2">
  <Button
    variant={viewMode === 'document' ? 'default' : 'outline'}
    onClick={() => setViewMode('document')}
  >
    Document View
  </Button>
  <Button
    variant={viewMode === 'table' ? 'default' : 'outline'}
    onClick={() => setViewMode('table')}
  >
    Table View
  </Button>
  <Button
    variant={viewMode === 'json' ? 'default' : 'outline'}
    onClick={() => setViewMode('json')}
  >
    JSON View
  </Button>
</div>
```

### Step 4: Add export from table view

Modify: `frontend/lib/styles/components/extraction/ExtractionTableView.tsx`

Add export button in component:

```typescript
// Add export function
const exportToCSV = () => {
  const headers = ['Document ID', 'Status', ...fieldNames]
  const rows = results.map(result => [
    result.document_id,
    result.status,
    ...fieldNames.map(field => formatValue(result.extracted_data?.[field]))
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `extraction-results-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Add button before table
<div className="flex justify-end mb-4">
  <Button onClick={exportToCSV} variant="outline" size="sm">
    Export to CSV
  </Button>
</div>
```

### Step 5: Test table view manually

```bash
cd frontend
npm run dev
```

Navigate to `/extractions/[id]`, switch to table view, verify:
- All fields displayed correctly
- Values formatted properly
- Export works
- Actions (copy, open document) work

### Step 6: Commit table view implementation

```bash
git add frontend/lib/styles/components/extraction/
git commit -m "feat: implement table view for extraction results

- Add ExtractionTableView component
- Display all extracted fields in table format
- Add CSV export from table view
- Add copy and open document actions
- Replace 'coming soon' stub with full implementation"
```

---

## Task 7: Add Schema Generation Tests

**Priority:** MEDIUM
**Estimated Time:** 6-8 hours
**Location:** Backend schema generator package tests

**Files:**
- Create: `backend/tests/packages/schema_generator_agent/test_workflow.py`
- Create: `backend/tests/packages/schema_generator_agent/test_agents.py`
- Create: `backend/tests/packages/schema_generator_agent/test_prompts.py`

### Step 1: Create workflow integration test

Create: `backend/tests/packages/schema_generator_agent/test_workflow.py`

```python
import pytest
from schema_generator_agent.agents.schema_generator import SchemaGenerator
from schema_generator_agent.agents.agent_state import AgentState


@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_schema_generation_workflow():
    """Test complete schema generation workflow."""
    generator = SchemaGenerator()

    initial_state: AgentState = {
        "messages": ["Extract party names and contract dates from legal agreements"],
        "problem_definition": "",
        "current_schema": None,
        "assessment_result": None,
        "refinement_rounds": 0,
        "data_assessment_rounds": 0,
        "query": "",
        "sample_documents": [],
        "data_assessment_results": [],
        "merged_data_assessment": None,
        "conversation_history": [],
        "problem_help": "",
        "final_schema": None,
        "metadata": {},
        "user_feedback": None
    }

    # Run workflow
    result = await generator.generate_schema(initial_state)

    # Assertions
    assert result["final_schema"] is not None
    assert "properties" in result["final_schema"]
    assert "party_names" in result["final_schema"]["properties"] or \
           "parties" in result["final_schema"]["properties"]
    assert result["refinement_rounds"] >= 0
    assert len(result["conversation_history"]) > 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_schema_refinement_loop():
    """Test that refinement improves schema quality."""
    generator = SchemaGenerator(max_refinement_rounds=3)

    initial_state: AgentState = {
        "messages": ["Extract case details"],
        "current_schema": {
            "properties": {
                "case_id": {"type": "string"}
            }
        },
        "assessment_result": {
            "confidence": 0.6,
            "needs_refinement": True,
            "suggestions": ["Add more fields"]
        },
        # ... rest of state ...
    }

    result = await generator.refine_schema(initial_state)

    # After refinement, schema should be improved
    assert len(result["current_schema"]["properties"]) > 1
    assert result["refinement_rounds"] > 0
```

### Step 2: Create agent unit tests

Create: `backend/tests/packages/schema_generator_agent/test_agents.py`

```python
import pytest
from schema_generator_agent.agents.basic_agents import (
    ProblemDefinerHelperAgent,
    ProblemDefinerAgent,
    SchemaGeneratorAgent,
    SchemaAssessmentAgent
)


def test_problem_definer_helper_extracts_intent():
    """Test problem definer helper extracts user intent."""
    agent = ProblemDefinerHelperAgent()

    result = agent.process("I need to extract dates and names from contracts")

    assert result["problem_help"] is not None
    assert "date" in result["problem_help"].lower()
    assert "name" in result["problem_help"].lower()


def test_schema_generator_creates_valid_schema():
    """Test schema generator creates valid JSON Schema."""
    agent = SchemaGeneratorAgent()

    problem_def = "Extract party names (string) and contract date (date) from agreements"
    result = agent.generate(problem_def)

    schema = result["current_schema"]
    assert schema is not None
    assert "properties" in schema
    assert "type" in schema
    assert schema["type"] == "object"

    # Check specific properties
    props = schema["properties"]
    assert "party_names" in props or "parties" in props
    assert "contract_date" in props or "date" in props


def test_schema_assessment_validates_quality():
    """Test schema assessment agent validates schema quality."""
    agent = SchemaAssessmentAgent()

    good_schema = {
        "type": "object",
        "properties": {
            "party_name": {
                "type": "string",
                "description": "Name of contracting party"
            },
            "contract_date": {
                "type": "string",
                "format": "date",
                "description": "Date contract was signed"
            }
        },
        "required": ["party_name", "contract_date"]
    }

    result = agent.assess(good_schema, "Extract party names and dates")

    assert result["assessment_result"] is not None
    assert result["assessment_result"]["confidence"] > 0.5
    assert isinstance(result["assessment_result"]["needs_refinement"], bool)


def test_schema_assessment_flags_poor_quality():
    """Test schema assessment identifies poor quality schemas."""
    agent = SchemaAssessmentAgent()

    poor_schema = {
        "type": "object",
        "properties": {
            "data": {"type": "string"}  # Too generic
        }
    }

    result = agent.assess(poor_schema, "Extract detailed contract information")

    assert result["assessment_result"]["needs_refinement"] is True
    assert result["assessment_result"]["confidence"] < 0.8
```

### Step 3: Create prompt validation tests

Create: `backend/tests/packages/schema_generator_agent/test_prompts.py`

```python
import pytest
import yaml
from pathlib import Path


def test_all_prompts_exist():
    """Test that all required prompt files exist."""
    prompt_dir = Path("packages/schema_generator_agent/schema_generator_agent/configs/prompt/law")

    required_prompts = [
        "problem_definer_helper.yaml",
        "problem_definer.yaml",
        "schema_generator.yaml",
        "schema_assessment.yaml",
        "schema_refiner.yaml",
        "query_generator.yaml",
        "schema_data_assessment.yaml",
        "schema_data_assessment_merger.yaml",
        "schema_data_refiner.yaml"
    ]

    for prompt_file in required_prompts:
        assert (prompt_dir / prompt_file).exists(), f"Missing prompt: {prompt_file}"


def test_prompts_have_valid_yaml():
    """Test that all prompt files are valid YAML."""
    prompt_dir = Path("packages/schema_generator_agent/schema_generator_agent/configs/prompt/law")

    for prompt_file in prompt_dir.glob("*.yaml"):
        with open(prompt_file) as f:
            try:
                data = yaml.safe_load(f)
                assert data is not None
            except yaml.YAMLError as e:
                pytest.fail(f"Invalid YAML in {prompt_file}: {e}")


def test_prompts_contain_required_fields():
    """Test that prompts contain required fields."""
    prompt_dir = Path("packages/schema_generator_agent/schema_generator_agent/configs/prompt/law")

    for prompt_file in prompt_dir.glob("*.yaml"):
        with open(prompt_file) as f:
            data = yaml.safe_load(f)

            # All prompts should have system and human sections
            assert "system" in data or "messages" in data, \
                f"{prompt_file} missing prompt content"
```

### Step 4: Run all schema generation tests

```bash
cd backend
poetry run pytest tests/packages/schema_generator_agent/ -v
```

Expected: All tests pass, full coverage of workflow.

### Step 5: Add edge case tests

Create: `backend/tests/packages/schema_generator_agent/test_edge_cases.py`

```python
import pytest
from schema_generator_agent.agents.schema_generator import SchemaGenerator


@pytest.mark.asyncio
async def test_empty_input_handling():
    """Test that empty input is handled gracefully."""
    generator = SchemaGenerator()

    with pytest.raises(ValueError, match="messages cannot be empty"):
        await generator.generate_schema({"messages": []})


@pytest.mark.asyncio
async def test_max_refinement_rounds_respected():
    """Test that max refinement rounds limit is enforced."""
    generator = SchemaGenerator(max_refinement_rounds=2)

    # Create state that always needs refinement
    state = {
        "messages": ["Extract data"],
        "assessment_result": {"confidence": 0.3, "needs_refinement": True},
        "refinement_rounds": 0
    }

    result = await generator.generate_schema(state)

    # Should stop after max rounds even if quality is low
    assert result["refinement_rounds"] <= 2


@pytest.mark.asyncio
async def test_circular_reference_prevention():
    """Test that circular schema references are prevented."""
    generator = SchemaGenerator()

    # Schema with potential circular reference
    schema = {
        "type": "object",
        "properties": {
            "parent": {
                "type": "object",
                "properties": {
                    "child": {"$ref": "#"}  # Circular
                }
            }
        }
    }

    # Validation should detect and fix this
    validated = generator.validate_schema(schema)

    # Check that circular reference is handled
    assert validated is not None
```

### Step 6: Run full test suite

```bash
cd backend
poetry run pytest tests/ -v --cov=schema_generator_agent
```

Expected: High coverage, all tests pass.

### Step 7: Commit schema generation tests

```bash
git add backend/tests/packages/schema_generator_agent/
git commit -m "test: add comprehensive schema generation tests

- Add workflow integration tests
- Add agent unit tests
- Add prompt validation tests
- Add edge case tests
- Achieve >80% test coverage for schema generator"
```

---

## Summary & Next Steps

This plan addresses all high and medium priority gaps identified in the code review:

**High Priority (DONE):**
✅ Task 1: Add Chat E2E Tests
✅ Task 2: Fix Backend Search Metadata
✅ Task 3: Implement Query Enhancement

**Medium Priority (DONE):**
✅ Task 4: Remove Deprecated Endpoints
✅ Task 5: Clean Up Weaviate References
✅ Task 6: Implement Table View
✅ Task 7: Add Schema Generation Tests

**Verification Steps:**
1. Run all frontend tests: `cd frontend && npm run test && npm run test:e2e`
2. Run all backend tests: `cd backend && poetry run pytest tests/ -v`
3. Run type checks: `cd frontend && npm run validate`
4. Run linting: `cd backend && poetry run ruff check .`
5. Manual testing of each feature in dev environment

**Estimated Total Time:** 20-28 hours
**Recommended Approach:** Tackle high-priority tasks first (Tasks 1-3), then medium priority.

---

## Plan Complete

Plan saved to `docs/plans/2026-02-11-fix-gaps-and-polish.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach would you like?**
