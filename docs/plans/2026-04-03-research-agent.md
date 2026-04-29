# Research Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a LangGraph-based Legal Research Agent with framework-agnostic persistence, 5 MVP tools wrapping existing features, streaming + background execution modes, and semi-autonomous operation with user decision points.

**Architecture:** LangGraph state machine with 4 nodes (Planner, Executor, Analyzer, ReportWriter) + Decision Gate routing. Framework-agnostic persistence via `SessionStore` / `CheckpointStore` Protocol abstractions backed by Supabase. Tools wrap existing endpoints (semantic search, keyword search, precedents, summarization, argumentation). FastAPI router exposes sessions API with SSE streaming.

**Tech Stack:** LangGraph, LangChain tools, FastAPI (SSE via `sse-starlette`), Supabase (PostgreSQL), existing `juddges_search` + app modules.

---

## Task 1: Create research_agent package scaffold

**Files:**
- Create: `backend/packages/research_agent/pyproject.toml`
- Create: `backend/packages/research_agent/research_agent/__init__.py`
- Create: `backend/packages/research_agent/tests/__init__.py`
- Modify: `backend/pyproject.toml` (add package reference)

**Step 1: Create package directory structure**

```bash
mkdir -p backend/packages/research_agent/research_agent
mkdir -p backend/packages/research_agent/tests
```

**Step 2: Create pyproject.toml**

Create `backend/packages/research_agent/pyproject.toml`:

```toml
[tool.poetry]
name = "research_agent"
version = "0.1.0"
description = "Legal Research Agent - autonomous multi-step legal research with tool-using LangGraph agent"
authors = ["Lukasz Augustyniak <aisolutions@lukaszaugustyniak.com>"]
readme = "README.md"
packages = [
    { include = "research_agent" }
]

[tool.poetry.dependencies]
python = ">=3.12,<3.14"
langchain = "^0.3"
langchain-openai = "^0.3.7"
langchain-core = "^0.3.74"
langgraph = "^0.6.4"
juddges-search = {path = "../juddges_search", develop=true}
loguru = "*"
pydantic = ">=2.11.7,<3.0.0"

[tool.poetry.group.dev.dependencies]
ruff = "^0.12.8"
pytest = "^8.4.1"
pytest-asyncio = "^0.24.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"

[tool.ruff]
line-length = 100
extend-include = ["*.ipynb"]

[tool.ruff.lint]
select = ["E4", "E7", "E9", "F", "I"]

[tool.pytest.ini_options]
minversion = "8.0.0"
pythonpath = ["."]
testpaths = ["tests"]
asyncio_mode = "auto"
filterwarnings = ["ignore::DeprecationWarning"]
```

**Step 3: Create __init__.py**

Create `backend/packages/research_agent/research_agent/__init__.py`:

```python
"""Legal Research Agent — autonomous multi-step legal research."""

__version__ = "0.1.0"
```

Create `backend/packages/research_agent/tests/__init__.py` (empty file).

**Step 4: Register package in root pyproject.toml**

In `backend/pyproject.toml`, add to `[tool.poetry.dependencies]`:

```toml
research_agent = { path = "packages/research_agent", develop = true }
```

And add to `packages` list:

```toml
packages = [
    { include = "app" },
    { include = "packages/juddges_search" },
    { include = "packages/schema_generator_agent" },
    { include = "packages/research_agent" },
]
```

**Step 5: Install the package**

```bash
cd backend && poetry lock --no-update && poetry install
```

**Step 6: Commit**

```bash
git add backend/packages/research_agent/ backend/pyproject.toml
git commit -m "feat(research-agent): scaffold research_agent package"
```

---

## Task 2: Persistence layer — SessionStore and CheckpointStore

**Files:**
- Create: `backend/packages/research_agent/research_agent/persistence.py`
- Create: `backend/packages/research_agent/tests/test_persistence.py`

**Step 1: Write the failing tests**

Create `backend/packages/research_agent/tests/test_persistence.py`:

```python
"""Tests for framework-agnostic persistence layer."""

import pytest
from research_agent.persistence import (
    AgentCheckpoint,
    CheckpointStore,
    ResearchFinding,
    ResearchSession,
    SessionStatus,
    SessionStore,
    SupabaseCheckpointStore,
    SupabaseSessionStore,
)


class TestResearchSessionModel:
    def test_create_session_defaults(self):
        session = ResearchSession(
            id="test-id",
            user_id="user-1",
            mode="guided",
            initial_query="test query",
        )
        assert session.status == SessionStatus.PLANNING
        assert session.findings == []
        assert session.used_tools == []
        assert session.decision_points == []
        assert session.report is None
        assert session.agent_framework == "langgraph"

    def test_session_status_values(self):
        assert SessionStatus.PLANNING == "planning"
        assert SessionStatus.RESEARCHING == "researching"
        assert SessionStatus.AWAITING_INPUT == "awaiting_input"
        assert SessionStatus.COMPLETED == "completed"
        assert SessionStatus.FAILED == "failed"
        assert SessionStatus.STOPPED == "stopped"


class TestResearchFinding:
    def test_create_finding(self):
        finding = ResearchFinding(
            finding_type="precedent",
            content="Found relevant case II FSK 1234/20",
            source_document_ids=["doc-1"],
            confidence=0.85,
        )
        assert finding.finding_type == "precedent"
        assert finding.confidence == 0.85


class TestSupabaseSessionStore:
    """Tests that SupabaseSessionStore implements the SessionStore protocol."""

    def test_implements_protocol(self):
        # SupabaseSessionStore must be structurally compatible with SessionStore
        store = SupabaseSessionStore.__new__(SupabaseSessionStore)
        assert hasattr(store, "create_session")
        assert hasattr(store, "update_status")
        assert hasattr(store, "append_finding")
        assert hasattr(store, "append_decision_point")
        assert hasattr(store, "save_report")
        assert hasattr(store, "get_session")
        assert hasattr(store, "list_sessions")


class TestSupabaseCheckpointStore:
    """Tests that SupabaseCheckpointStore implements the CheckpointStore protocol."""

    def test_implements_protocol(self):
        store = SupabaseCheckpointStore.__new__(SupabaseCheckpointStore)
        assert hasattr(store, "save")
        assert hasattr(store, "load_latest")
        assert hasattr(store, "load_step")
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_persistence.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'research_agent.persistence'`

**Step 3: Implement persistence layer**

Create `backend/packages/research_agent/research_agent/persistence.py`:

```python
"""Framework-agnostic persistence for research agent sessions and checkpoints."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Protocol, runtime_checkable

from loguru import logger
from pydantic import BaseModel, Field


# ===== Enums =====


class SessionStatus(StrEnum):
    PLANNING = "planning"
    RESEARCHING = "researching"
    AWAITING_INPUT = "awaiting_input"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class ResearchMode(StrEnum):
    GUIDED = "guided"
    EXPLORATORY = "exploratory"
    CASE_PREPARATION = "case_preparation"


# ===== Models =====


class ResearchFinding(BaseModel):
    """A single finding produced during research."""

    finding_type: str = Field(description="Type: precedent, legal_rule, contradiction, gap, insight")
    content: str = Field(description="Human-readable finding content")
    source_document_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DecisionPoint(BaseModel):
    """A point where the agent paused for user input."""

    question: str
    options: list[str] = Field(default_factory=list)
    user_choice: str | None = None
    timestamp: str | None = None


class ToolUsage(BaseModel):
    """Record of a tool invocation by the agent."""

    tool: str
    input_summary: str
    output_summary: str
    timestamp: str | None = None
    duration_ms: int | None = None


class ResearchReport(BaseModel):
    """Final research report."""

    summary: str
    key_findings: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)


class ResearchSession(BaseModel):
    """Queryable research session — what the user and frontend see."""

    id: str
    user_id: str | None = None
    mode: str
    initial_query: str
    title: str | None = None
    status: SessionStatus = SessionStatus.PLANNING
    current_step: str | None = None
    progress: dict[str, Any] = Field(default_factory=dict)
    findings: list[dict[str, Any]] = Field(default_factory=list)
    used_tools: list[dict[str, Any]] = Field(default_factory=list)
    decision_points: list[dict[str, Any]] = Field(default_factory=list)
    report: dict[str, Any] | None = None
    agent_framework: str = "langgraph"
    created_at: str | None = None
    updated_at: str | None = None


class AgentCheckpoint(BaseModel):
    """Opaque agent checkpoint — framework-specific state blob."""

    id: str
    session_id: str
    framework: str
    step_number: int
    state_blob: dict[str, Any]
    parent_id: str | None = None
    created_at: str | None = None


# ===== Protocols =====


@runtime_checkable
class SessionStore(Protocol):
    """Framework-agnostic session persistence."""

    async def create_session(
        self, user_id: str | None, mode: str, query: str, framework: str = "langgraph"
    ) -> str: ...

    async def update_status(
        self, session_id: str, status: SessionStatus, current_step: str | None = None
    ) -> None: ...

    async def append_finding(self, session_id: str, finding: dict[str, Any]) -> None: ...

    async def append_decision_point(self, session_id: str, decision: dict[str, Any]) -> None: ...

    async def save_report(self, session_id: str, report: dict[str, Any]) -> None: ...

    async def get_session(self, session_id: str) -> ResearchSession | None: ...

    async def list_sessions(
        self, user_id: str, limit: int = 10, status: str | None = None
    ) -> list[ResearchSession]: ...


@runtime_checkable
class CheckpointStore(Protocol):
    """Framework-agnostic checkpoint persistence."""

    async def save(
        self, session_id: str, framework: str, step: int, state: dict[str, Any]
    ) -> str: ...

    async def load_latest(self, session_id: str) -> AgentCheckpoint | None: ...

    async def load_step(self, session_id: str, step: int) -> AgentCheckpoint | None: ...


# ===== Supabase Implementations =====


class SupabaseSessionStore:
    """Supabase-backed session store."""

    def __init__(self, supabase_client) -> None:
        self._client = supabase_client

    async def create_session(
        self, user_id: str | None, mode: str, query: str, framework: str = "langgraph"
    ) -> str:
        data = {
            "user_id": user_id,
            "mode": mode,
            "initial_query": query,
            "status": SessionStatus.PLANNING,
            "agent_framework": framework,
            "findings": [],
            "used_tools": [],
            "decision_points": [],
        }
        response = self._client.table("research_sessions").insert(data).execute()
        session_id = response.data[0]["id"]
        logger.info(f"Created research session {session_id} (mode={mode})")
        return session_id

    async def update_status(
        self, session_id: str, status: SessionStatus, current_step: str | None = None
    ) -> None:
        update = {"status": status}
        if current_step is not None:
            update["current_step"] = current_step
        self._client.table("research_sessions").update(update).eq("id", session_id).execute()

    async def append_finding(self, session_id: str, finding: dict[str, Any]) -> None:
        session = await self.get_session(session_id)
        if not session:
            return
        findings = session.findings + [finding]
        self._client.table("research_sessions").update(
            {"findings": findings}
        ).eq("id", session_id).execute()

    async def append_decision_point(self, session_id: str, decision: dict[str, Any]) -> None:
        session = await self.get_session(session_id)
        if not session:
            return
        points = session.decision_points + [decision]
        self._client.table("research_sessions").update(
            {"decision_points": points}
        ).eq("id", session_id).execute()

    async def save_report(self, session_id: str, report: dict[str, Any]) -> None:
        self._client.table("research_sessions").update(
            {"report": report, "status": SessionStatus.COMPLETED}
        ).eq("id", session_id).execute()

    async def get_session(self, session_id: str) -> ResearchSession | None:
        response = (
            self._client.table("research_sessions")
            .select("*")
            .eq("id", session_id)
            .execute()
        )
        if not response.data:
            return None
        row = response.data[0]
        return ResearchSession(**row)

    async def list_sessions(
        self, user_id: str, limit: int = 10, status: str | None = None
    ) -> list[ResearchSession]:
        query = (
            self._client.table("research_sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
        )
        if status:
            query = query.eq("status", status)
        response = query.execute()
        return [ResearchSession(**row) for row in (response.data or [])]


class SupabaseCheckpointStore:
    """Supabase-backed checkpoint store."""

    def __init__(self, supabase_client) -> None:
        self._client = supabase_client

    async def save(
        self, session_id: str, framework: str, step: int, state: dict[str, Any]
    ) -> str:
        data = {
            "session_id": session_id,
            "framework": framework,
            "step_number": step,
            "state_blob": state,
        }
        response = self._client.table("agent_checkpoints").insert(data).execute()
        return response.data[0]["id"]

    async def load_latest(self, session_id: str) -> AgentCheckpoint | None:
        response = (
            self._client.table("agent_checkpoints")
            .select("*")
            .eq("session_id", session_id)
            .order("step_number", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return AgentCheckpoint(**response.data[0])

    async def load_step(self, session_id: str, step: int) -> AgentCheckpoint | None:
        response = (
            self._client.table("agent_checkpoints")
            .select("*")
            .eq("session_id", session_id)
            .eq("step_number", step)
            .execute()
        )
        if not response.data:
            return None
        return AgentCheckpoint(**response.data[0])
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_persistence.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/packages/research_agent/research_agent/persistence.py backend/packages/research_agent/tests/test_persistence.py
git commit -m "feat(research-agent): add framework-agnostic persistence layer"
```

---

## Task 3: Supabase migration for research_sessions and agent_checkpoints tables

**Files:**
- Create: `supabase/migrations/20260403000001_create_research_agent_tables.sql`

**Step 1: Write the migration**

Create `supabase/migrations/20260403000001_create_research_agent_tables.sql`:

```sql
-- Research Agent: session storage and framework-agnostic checkpoints

CREATE TABLE IF NOT EXISTS research_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users,

    -- Context
    mode            TEXT NOT NULL CHECK (mode IN ('guided', 'exploratory', 'case_preparation')),
    initial_query   TEXT NOT NULL,
    title           TEXT,

    -- Status
    status          TEXT NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'researching', 'awaiting_input', 'completed', 'failed', 'stopped')),
    current_step    TEXT,
    progress        JSONB DEFAULT '{}',

    -- Incremental results
    findings        JSONB DEFAULT '[]'::jsonb,
    used_tools      JSONB DEFAULT '[]'::jsonb,
    decision_points JSONB DEFAULT '[]'::jsonb,

    -- Final report
    report          JSONB,

    -- Framework info
    agent_framework TEXT NOT NULL DEFAULT 'langgraph',

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing user sessions
CREATE INDEX IF NOT EXISTS idx_research_sessions_user_status
    ON research_sessions (user_id, status, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_research_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_research_sessions_updated_at
    BEFORE UPDATE ON research_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_research_sessions_updated_at();

-- RLS
ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own research sessions"
    ON research_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research sessions"
    ON research_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research sessions"
    ON research_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role bypass for backend
CREATE POLICY "Service role full access to research_sessions"
    ON research_sessions FOR ALL
    USING (auth.role() = 'service_role');


-- Agent checkpoints (framework-agnostic)
CREATE TABLE IF NOT EXISTS agent_checkpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    framework       TEXT NOT NULL,
    step_number     INT NOT NULL,
    state_blob      JSONB NOT NULL,
    parent_id       UUID REFERENCES agent_checkpoints(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(session_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_session
    ON agent_checkpoints (session_id, step_number DESC);

-- RLS (checkpoints accessed only via service role from backend)
ALTER TABLE agent_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to agent_checkpoints"
    ON agent_checkpoints FOR ALL
    USING (auth.role() = 'service_role');
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260403000001_create_research_agent_tables.sql
git commit -m "feat(research-agent): add Supabase migration for research sessions and checkpoints"
```

**Step 3: Apply migration (manual)**

```bash
cd supabase && npx supabase db push
```

---

## Task 4: Agent State definition

**Files:**
- Create: `backend/packages/research_agent/research_agent/state.py`
- Create: `backend/packages/research_agent/tests/test_state.py`

**Step 1: Write the failing test**

Create `backend/packages/research_agent/tests/test_state.py`:

```python
"""Tests for Research Agent state definition."""

import pytest
from research_agent.state import ResearchState


class TestResearchState:
    def test_create_initial_state(self):
        state = ResearchState(
            messages=[],
            mode="guided",
            session_id="test-session",
            research_plan=None,
            current_step_index=0,
            search_results=[],
            analyzed_documents=[],
            findings=[],
            contradictions=[],
            pending_decision=None,
            iteration=0,
            max_iterations=10,
            confidence=0.0,
            should_stop=False,
        )
        assert state["mode"] == "guided"
        assert state["iteration"] == 0
        assert state["max_iterations"] == 10
        assert state["confidence"] == 0.0
        assert state["should_stop"] is False

    def test_state_is_typed_dict(self):
        # TypedDict should have __annotations__
        assert "messages" in ResearchState.__annotations__
        assert "research_plan" in ResearchState.__annotations__
        assert "pending_decision" in ResearchState.__annotations__
```

**Step 2: Run test to verify it fails**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_state.py -v
```

Expected: FAIL

**Step 3: Implement state**

Create `backend/packages/research_agent/research_agent/state.py`:

```python
"""Research Agent state — shared across all graph nodes."""

from __future__ import annotations

from typing import Annotated, Any

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class ResearchState(TypedDict):
    """State for the Legal Research Agent LangGraph workflow."""

    # Messages (LangGraph managed)
    messages: Annotated[list, add_messages]

    # Session context
    mode: str  # 'guided' | 'exploratory' | 'case_preparation'
    session_id: str

    # Planning
    research_plan: dict[str, Any] | None  # {goal, steps: [{tool, query, reason}], strategy}
    current_step_index: int

    # Accumulated results
    search_results: list[dict[str, Any]]
    analyzed_documents: list[dict[str, Any]]
    findings: list[dict[str, Any]]  # confirmed findings
    contradictions: list[dict[str, Any]]  # contradictions between sources

    # Decision points (semi-autonomous)
    pending_decision: dict[str, Any] | None  # {question, options} — awaiting user

    # Control flow
    iteration: int
    max_iterations: int  # default 10
    confidence: float  # 0-1, agent self-assessed completeness
    should_stop: bool  # user interrupted or agent finished
```

**Step 4: Run test to verify it passes**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_state.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/packages/research_agent/research_agent/state.py backend/packages/research_agent/tests/test_state.py
git commit -m "feat(research-agent): add LangGraph state definition"
```

---

## Task 5: Tool wrappers (5 MVP tools)

**Files:**
- Create: `backend/packages/research_agent/research_agent/tools.py`
- Create: `backend/packages/research_agent/tests/test_tools.py`

These tools wrap existing logic from `juddges_search`, `app.precedents`, `app.summarization`, and `app.argumentation`. They do NOT duplicate business logic.

**Step 1: Write the failing tests**

Create `backend/packages/research_agent/tests/test_tools.py`:

```python
"""Tests for Research Agent tool definitions."""

import pytest
from langchain_core.tools import BaseTool

from research_agent.tools import (
    analyze_argumentation,
    find_precedents,
    keyword_search,
    semantic_search,
    summarize_documents,
)


class TestToolDefinitions:
    """Verify all tools are properly defined LangChain tools."""

    @pytest.mark.parametrize(
        "tool_fn",
        [
            semantic_search,
            keyword_search,
            find_precedents,
            summarize_documents,
            analyze_argumentation,
        ],
    )
    def test_tool_is_langchain_tool(self, tool_fn):
        assert isinstance(tool_fn, BaseTool)

    @pytest.mark.parametrize(
        "tool_fn",
        [
            semantic_search,
            keyword_search,
            find_precedents,
            summarize_documents,
            analyze_argumentation,
        ],
    )
    def test_tool_has_description(self, tool_fn):
        assert tool_fn.description
        assert len(tool_fn.description) > 20

    def test_semantic_search_schema(self):
        schema = semantic_search.args_schema.model_json_schema()
        assert "query" in schema["properties"]

    def test_keyword_search_schema(self):
        schema = keyword_search.args_schema.model_json_schema()
        assert "query" in schema["properties"]

    def test_find_precedents_schema(self):
        schema = find_precedents.args_schema.model_json_schema()
        assert "fact_pattern" in schema["properties"]

    def test_summarize_documents_schema(self):
        schema = summarize_documents.args_schema.model_json_schema()
        assert "document_ids" in schema["properties"]

    def test_analyze_argumentation_schema(self):
        schema = analyze_argumentation.args_schema.model_json_schema()
        assert "document_ids" in schema["properties"]
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_tools.py -v
```

Expected: FAIL

**Step 3: Implement tools**

Create `backend/packages/research_agent/research_agent/tools.py`:

```python
"""LangChain tools for the Research Agent.

Each tool wraps existing Juddges functionality — no business logic duplication.
Tool docstrings serve as LLM-visible descriptions for function calling.
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool
from loguru import logger


@tool
async def semantic_search(
    query: str,
    max_results: int = 10,
    languages: list[str] | None = None,
    document_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Search court judgments by semantic similarity using vector embeddings.

    Use for conceptual queries like 'circumstances justifying reduced sentence'
    or 'prerequisites for VAT deduction'. Returns documents ranked by meaning similarity.

    Args:
        query: Natural language search query.
        max_results: Maximum results to return (default 10).
        languages: Filter by language codes, e.g. ['pl', 'en'].
        document_types: Filter by type, e.g. ['judgment', 'tax_interpretation'].
    """
    from juddges_search.retrieval.chunks_search import search_chunks

    try:
        results = await search_chunks(
            query, max_chunks=max_results, languages=languages, document_types=document_types
        )
        return [
            {
                "document_id": doc.metadata.get("document_id", ""),
                "title": doc.metadata.get("title", ""),
                "content_preview": doc.page_content[:500],
                "score": doc.metadata.get("score", 0.0),
                "metadata": {
                    k: v
                    for k, v in doc.metadata.items()
                    if k in ("court_name", "date", "document_type", "language")
                },
            }
            for doc in results
        ]
    except Exception as e:
        logger.error(f"semantic_search failed: {e}")
        return [{"error": str(e)}]


@tool
async def keyword_search(
    query: str,
    max_results: int = 10,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Search court judgments by exact keyword matching via Meilisearch.

    Use for specific terms, case numbers (e.g. 'II FSK 1234/20'),
    statute references (e.g. 'art. 286 k.k.'), or exact phrases.

    Args:
        query: Keyword search query.
        max_results: Maximum results (default 10).
        filters: Optional Meilisearch filters dict.
    """
    from app.services.search import MeiliSearchService

    try:
        meili = MeiliSearchService.from_env()
        results = await meili.search(query=query, limit=max_results, filters=filters)
        hits = results.get("hits", [])
        return [
            {
                "document_id": hit.get("id", ""),
                "title": hit.get("title", ""),
                "content_preview": hit.get("full_text", "")[:500] if hit.get("full_text") else "",
                "court_name": hit.get("court_name", ""),
                "date": hit.get("date", ""),
            }
            for hit in hits
        ]
    except Exception as e:
        logger.error(f"keyword_search failed: {e}")
        return [{"error": str(e)}]


@tool
async def find_precedents(
    fact_pattern: str,
    limit: int = 10,
    document_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Find precedent cases matching a fact pattern or legal issue.

    Use when you need to find similar cases, e.g. 'taxpayer deducted VAT on
    mixed-use vehicle' or 'defendant convicted of fraud under art. 286 k.k.'.
    Returns cases ranked by relevance with optional AI analysis.

    Args:
        fact_pattern: Natural language description of facts or legal issue.
        limit: Maximum precedents to return (default 10).
        document_types: Filter by document type.
    """
    from app.documents_pkg import generate_embedding
    from juddges_search.db.supabase_db import get_vector_db

    try:
        embedding = await generate_embedding(fact_pattern)
        db = get_vector_db()
        results = await db.search_by_vector(
            query_embedding=embedding,
            match_count=limit,
            match_threshold=0.3,
        )
        return [
            {
                "document_id": r.get("document_id", ""),
                "title": r.get("title", ""),
                "similarity": round(r.get("similarity", 0.0), 3),
                "court_name": r.get("court_name", ""),
                "date": r.get("date", ""),
                "summary": (r.get("summary") or "")[:300],
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"find_precedents failed: {e}")
        return [{"error": str(e)}]


@tool
async def summarize_documents(
    document_ids: list[str],
    summary_type: str = "executive",
    focus_areas: list[str] | None = None,
) -> dict[str, Any]:
    """Generate a summary of one or more legal documents.

    Types:
    - 'executive': concise overview (~300 words)
    - 'key_findings': extracted key findings as bullet points
    - 'synthesis': comparative analysis across multiple documents

    Args:
        document_ids: List of document IDs to summarize (max 10).
        summary_type: One of 'executive', 'key_findings', 'synthesis'.
        focus_areas: Optional focus areas, e.g. ['VAT deductions', 'sentencing'].
    """
    from juddges_search.db.supabase_db import get_vector_db
    from juddges_search.llms import get_default_llm
    from juddges_search.prompts.summarization import (
        SUMMARIZATION_SYSTEM_PROMPT,
        SUMMARY_TYPE_PROMPTS,
    )
    from langchain_core.output_parsers import JsonOutputParser
    from langchain_core.prompts import ChatPromptTemplate

    try:
        db = get_vector_db()
        docs_content = []
        for doc_id in document_ids[:10]:
            doc = await db.get_document_by_id(doc_id)
            if doc:
                text = doc.get("full_text") or doc.get("summary") or doc.get("title", "")
                docs_content.append(f"[Document {doc_id}]\n{text[:5000]}")

        if not docs_content:
            return {"error": "No documents found for provided IDs"}

        combined = "\n\n---\n\n".join(docs_content)
        focus_str = ", ".join(focus_areas) if focus_areas else "general"

        llm = get_default_llm(use_mini_model=False)
        prompt = ChatPromptTemplate.from_messages([
            ("system", SUMMARIZATION_SYSTEM_PROMPT),
            ("human", SUMMARY_TYPE_PROMPTS.get(summary_type, SUMMARY_TYPE_PROMPTS["executive"])),
        ])

        chain = prompt | llm | JsonOutputParser()
        result = await chain.ainvoke({
            "document_content": combined,
            "focus_areas": focus_str,
            "max_words": 300,
        })
        return result
    except Exception as e:
        logger.error(f"summarize_documents failed: {e}")
        return {"error": str(e)}


@tool
async def analyze_argumentation(
    document_ids: list[str],
    focus_areas: list[str] | None = None,
) -> dict[str, Any]:
    """Analyze legal argumentation structure in documents.

    Decomposes arguments into premises, conclusions, reasoning patterns,
    and identifies counter-arguments. Useful for understanding how courts
    reason and finding weaknesses in legal arguments.

    Args:
        document_ids: Documents to analyze (max 5).
        focus_areas: Optional focus, e.g. ['tax liability', 'evidence assessment'].
    """
    from juddges_search.db.supabase_db import get_vector_db
    from juddges_search.llms import get_default_llm
    from langchain_core.output_parsers import JsonOutputParser
    from langchain_core.prompts import ChatPromptTemplate

    SYSTEM = (
        "You are a legal argumentation analyst. Decompose legal arguments into "
        "premises, conclusions, reasoning patterns, and counter-arguments. "
        "Respond with valid JSON."
    )
    HUMAN = (
        "Analyze the legal arguments in these documents. For each argument identify: "
        "premises (factual + legal), conclusion, reasoning pattern "
        "(deductive/analogical/policy/textual/teleological), strength, counter-arguments.\n\n"
        "{focus_instruction}\n\nDocuments:\n{document_content}\n\n"
        "Respond as JSON with keys: arguments (list), overall_analysis (dict)."
    )

    try:
        db = get_vector_db()
        docs_content = []
        for doc_id in document_ids[:5]:
            doc = await db.get_document_by_id(doc_id)
            if doc:
                text = doc.get("full_text") or doc.get("summary") or ""
                docs_content.append(f"[{doc_id}]\n{text[:5000]}")

        if not docs_content:
            return {"error": "No documents found"}

        focus_instruction = ""
        if focus_areas:
            focus_instruction = f"Focus particularly on: {', '.join(focus_areas)}"

        llm = get_default_llm(use_mini_model=False)
        prompt = ChatPromptTemplate.from_messages([("system", SYSTEM), ("human", HUMAN)])
        chain = prompt | llm | JsonOutputParser()

        return await chain.ainvoke({
            "document_content": "\n\n---\n\n".join(docs_content),
            "focus_instruction": focus_instruction,
        })
    except Exception as e:
        logger.error(f"analyze_argumentation failed: {e}")
        return {"error": str(e)}


# Convenience list for agent construction
ALL_TOOLS = [
    semantic_search,
    keyword_search,
    find_precedents,
    summarize_documents,
    analyze_argumentation,
]
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_tools.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/packages/research_agent/research_agent/tools.py backend/packages/research_agent/tests/test_tools.py
git commit -m "feat(research-agent): add 5 MVP tool wrappers for existing features"
```

---

## Task 6: LangGraph nodes — Planner, Executor, Analyzer, ReportWriter

**Files:**
- Create: `backend/packages/research_agent/research_agent/nodes.py`
- Create: `backend/packages/research_agent/tests/test_nodes.py`

**Step 1: Write the failing tests**

Create `backend/packages/research_agent/tests/test_nodes.py`:

```python
"""Tests for Research Agent graph nodes."""

import pytest
from research_agent.nodes import AnalyzerNode, PlannerNode, ReportWriterNode


class TestPlannerNode:
    def test_planner_exists(self):
        assert callable(PlannerNode)

    def test_planner_has_system_prompt(self):
        planner = PlannerNode.__new__(PlannerNode)
        assert hasattr(planner, "system_prompt")


class TestAnalyzerNode:
    def test_analyzer_exists(self):
        assert callable(AnalyzerNode)


class TestReportWriterNode:
    def test_report_writer_exists(self):
        assert callable(ReportWriterNode)
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_nodes.py -v
```

Expected: FAIL

**Step 3: Implement nodes**

Create `backend/packages/research_agent/research_agent/nodes.py`:

```python
"""LangGraph nodes for the Legal Research Agent.

Four nodes + decision gate:
- PlannerNode: creates/updates research plan
- ExecutorNode: calls tools (handled by LangGraph ToolNode)
- AnalyzerNode: evaluates results, extracts findings
- ReportWriterNode: generates final report
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from loguru import logger

from research_agent.state import ResearchState
from research_agent.tools import ALL_TOOLS

# ===== Prompts =====

PLANNER_SYSTEM_PROMPT = """\
You are a legal research planner. Given a research query and mode, create a step-by-step \
research plan using available tools.

Available tools:
- semantic_search: Search by meaning/concept. Best for broad legal questions.
- keyword_search: Search by exact terms. Best for case numbers, statute references.
- find_precedents: Find similar cases by fact pattern.
- summarize_documents: Summarize one or more documents.
- analyze_argumentation: Decompose legal arguments in documents.

Research modes:
- guided: User has a specific legal question. Focus on finding authoritative answers.
- exploratory: User explores a topic. Cast a wide net, discover connections.
- case_preparation: User prepares a case. Find supporting AND opposing precedents.

Output a JSON research plan:
{{
    "goal": "one sentence research goal",
    "strategy": "brief strategy description",
    "steps": [
        {{"tool": "tool_name", "query": "what to search/analyze", "reason": "why this step"}}
    ]
}}

Keep plans to 3-7 steps. Start broad (search), then narrow (analyze specific documents).\
"""

ANALYZER_SYSTEM_PROMPT = """\
You are a legal research analyst. Given search results and the research goal, extract findings.

For each finding determine:
- type: "precedent", "legal_rule", "contradiction", "gap", "insight"
- content: human-readable description
- confidence: 0.0-1.0 how well-supported this finding is
- source_document_ids: which documents support it

Also assess:
- overall_confidence: 0.0-1.0 how complete the research is
- needs_user_input: true if you found ambiguity requiring user decision
- decision_question: if needs_user_input, what to ask the user
- decision_options: suggested options for the user

Output JSON:
{{
    "new_findings": [...],
    "contradictions": [...],
    "overall_confidence": 0.0-1.0,
    "needs_user_input": false,
    "decision_question": null,
    "decision_options": [],
    "should_continue": true,
    "reason": "why continue or stop"
}}\
"""

REPORT_WRITER_SYSTEM_PROMPT = """\
You are a legal research report writer. Synthesize all findings into a structured report.

Output JSON:
{{
    "summary": "Executive summary of research findings (2-3 paragraphs)",
    "key_findings": ["Finding 1", "Finding 2", ...],
    "gaps": ["Areas not fully explored"],
    "recommendations": ["Suggested next steps"],
    "sources": [{{"document_id": "...", "title": "...", "relevance": "why cited"}}]
}}\
"""


# ===== Nodes =====


class PlannerNode:
    """Creates or updates the research plan based on query, mode, and prior results."""

    system_prompt = PLANNER_SYSTEM_PROMPT

    def __init__(self, llm: ChatOpenAI | None = None) -> None:
        self.llm = llm

    async def __call__(self, state: ResearchState) -> dict[str, Any]:
        from langchain_core.output_parsers import JsonOutputParser

        llm = self.llm or ChatOpenAI(model="gpt-4o", temperature=0.3)

        # Build context for planning
        context_parts = [f"Research mode: {state['mode']}", f"Query: {state['messages'][0].content}"]

        if state.get("findings"):
            context_parts.append(f"Findings so far: {len(state['findings'])}")
            for f in state["findings"][-3:]:
                context_parts.append(f"  - {f.get('content', '')[:100]}")

        if state.get("pending_decision") and state["messages"]:
            last_msg = state["messages"][-1]
            context_parts.append(f"User feedback: {last_msg.content}")

        context = "\n".join(context_parts)

        messages = [
            SystemMessage(content=self.system_prompt),
            *state["messages"][:1],  # original query
            AIMessage(content=f"Research context:\n{context}\n\nCreate/update the research plan."),
        ]

        parser = JsonOutputParser()
        response = await llm.ainvoke(messages)
        plan = await parser.ainvoke(response)

        logger.info(f"Research plan: {plan.get('goal', 'unknown')} ({len(plan.get('steps', []))} steps)")

        return {
            "research_plan": plan,
            "current_step_index": 0,
            "messages": [AIMessage(content=f"Research plan created: {plan.get('goal', '')}")],
        }


class AnalyzerNode:
    """Evaluates tool results and extracts findings."""

    system_prompt = ANALYZER_SYSTEM_PROMPT

    def __init__(self, llm: ChatOpenAI | None = None) -> None:
        self.llm = llm

    async def __call__(self, state: ResearchState) -> dict[str, Any]:
        from langchain_core.output_parsers import JsonOutputParser

        llm = self.llm or ChatOpenAI(model="gpt-4o", temperature=0.2)

        plan = state.get("research_plan", {})
        goal = plan.get("goal", "unknown")

        context_parts = [
            f"Research goal: {goal}",
            f"Iteration: {state['iteration']} / {state['max_iterations']}",
            f"Existing findings: {len(state.get('findings', []))}",
            f"Latest search results: {len(state.get('search_results', []))} items",
        ]

        # Include recent search results summary
        for sr in state.get("search_results", [])[-5:]:
            preview = sr.get("title") or sr.get("content_preview", "")[:80]
            context_parts.append(f"  - {preview}")

        messages = [
            SystemMessage(content=self.system_prompt),
            AIMessage(content="\n".join(context_parts)),
        ]

        parser = JsonOutputParser()
        response = await llm.ainvoke(messages)
        analysis = await parser.ainvoke(response)

        new_findings = state.get("findings", []) + analysis.get("new_findings", [])
        new_contradictions = state.get("contradictions", []) + analysis.get("contradictions", [])

        result: dict[str, Any] = {
            "findings": new_findings,
            "contradictions": new_contradictions,
            "confidence": analysis.get("overall_confidence", state["confidence"]),
            "iteration": state["iteration"] + 1,
        }

        if analysis.get("needs_user_input"):
            result["pending_decision"] = {
                "question": analysis.get("decision_question", ""),
                "options": analysis.get("decision_options", []),
            }

        if not analysis.get("should_continue", True):
            result["should_stop"] = True

        logger.info(
            f"Analysis: {len(analysis.get('new_findings', []))} new findings, "
            f"confidence={analysis.get('overall_confidence', 0):.2f}"
        )

        return result


class ReportWriterNode:
    """Generates the final research report from accumulated findings."""

    system_prompt = REPORT_WRITER_SYSTEM_PROMPT

    def __init__(self, llm: ChatOpenAI | None = None) -> None:
        self.llm = llm

    async def __call__(self, state: ResearchState) -> dict[str, Any]:
        from langchain_core.output_parsers import JsonOutputParser

        llm = self.llm or ChatOpenAI(model="gpt-4o", temperature=0.3)

        context_parts = [
            f"Research goal: {state.get('research_plan', {}).get('goal', 'unknown')}",
            f"Mode: {state['mode']}",
            f"Total findings: {len(state.get('findings', []))}",
            f"Contradictions: {len(state.get('contradictions', []))}",
            f"Confidence: {state.get('confidence', 0):.2f}",
            "",
            "Findings:",
        ]
        for f in state.get("findings", []):
            context_parts.append(
                f"  [{f.get('type', '?')}] {f.get('content', '')[:200]} "
                f"(confidence: {f.get('confidence', 0):.1f})"
            )

        if state.get("contradictions"):
            context_parts.append("\nContradictions:")
            for c in state["contradictions"]:
                context_parts.append(f"  - {c.get('content', '')[:200]}")

        messages = [
            SystemMessage(content=self.system_prompt),
            AIMessage(content="\n".join(context_parts)),
        ]

        parser = JsonOutputParser()
        response = await llm.ainvoke(messages)
        report = await parser.ainvoke(response)

        logger.info(f"Report generated: {len(report.get('key_findings', []))} key findings")

        return {
            "messages": [AIMessage(content=f"Research complete. {report.get('summary', '')[:200]}...")],
            "should_stop": True,
        }
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_nodes.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/packages/research_agent/research_agent/nodes.py backend/packages/research_agent/tests/test_nodes.py
git commit -m "feat(research-agent): add Planner, Analyzer, ReportWriter nodes"
```

---

## Task 7: LangGraph graph assembly — ResearchAgent class

**Files:**
- Create: `backend/packages/research_agent/research_agent/graph.py`
- Create: `backend/packages/research_agent/tests/test_graph.py`

**Step 1: Write the failing tests**

Create `backend/packages/research_agent/tests/test_graph.py`:

```python
"""Tests for Research Agent graph assembly."""

import pytest
from langgraph.graph.state import CompiledStateGraph

from research_agent.graph import ResearchAgent


class TestResearchAgentGraph:
    def test_creates_compiled_graph(self):
        agent = ResearchAgent()
        assert isinstance(agent.graph, CompiledStateGraph)

    def test_graph_has_expected_nodes(self):
        agent = ResearchAgent()
        node_names = set(agent.graph.nodes.keys())
        expected = {"planner", "tools", "analyzer", "report_writer"}
        # LangGraph adds __start__ and __end__ automatically
        assert expected.issubset(node_names)

    def test_initial_state_factory(self):
        agent = ResearchAgent()
        state = agent.create_initial_state(
            session_id="test-123",
            mode="guided",
            query="When can VAT be deducted?",
        )
        assert state["session_id"] == "test-123"
        assert state["mode"] == "guided"
        assert state["iteration"] == 0
        assert state["max_iterations"] == 10
        assert state["confidence"] == 0.0
        assert len(state["messages"]) == 1

    def test_custom_max_iterations(self):
        agent = ResearchAgent(max_iterations=5)
        state = agent.create_initial_state("s", "guided", "q")
        assert state["max_iterations"] == 5
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_graph.py -v
```

Expected: FAIL

**Step 3: Implement the graph**

Create `backend/packages/research_agent/research_agent/graph.py`:

```python
"""LangGraph graph assembly for the Legal Research Agent."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import interrupt
from loguru import logger

from research_agent.nodes import AnalyzerNode, PlannerNode, ReportWriterNode
from research_agent.state import ResearchState
from research_agent.tools import ALL_TOOLS


def _decision_gate(state: ResearchState) -> str:
    """Route after Analyzer: continue, wait for user, or write report."""
    if state.get("should_stop"):
        return "report_writer"

    if state.get("pending_decision"):
        return "interrupt"

    if state["confidence"] >= 0.85:
        logger.info(f"Confidence {state['confidence']:.2f} >= 0.85 → generating report")
        return "report_writer"

    if state["iteration"] >= state["max_iterations"]:
        logger.info(f"Max iterations ({state['max_iterations']}) reached → generating report")
        return "report_writer"

    logger.info(
        f"Iteration {state['iteration']}/{state['max_iterations']}, "
        f"confidence {state['confidence']:.2f} → continuing research"
    )
    return "planner"


def _interrupt_node(state: ResearchState) -> dict[str, Any]:
    """Pause execution and wait for user input."""
    decision = state.get("pending_decision", {})
    value = interrupt(decision)
    return {
        "pending_decision": None,
        "messages": [HumanMessage(content=value)],
    }


async def _executor_node(state: ResearchState) -> dict[str, Any]:
    """Execute the current step from the research plan by calling the appropriate tool."""
    plan = state.get("research_plan")
    if not plan or not plan.get("steps"):
        return {"should_stop": True}

    step_index = state.get("current_step_index", 0)
    steps = plan["steps"]

    if step_index >= len(steps):
        return {"should_stop": True}

    step = steps[step_index]
    tool_name = step.get("tool", "")
    query = step.get("query", "")

    logger.info(f"Executing step {step_index + 1}/{len(steps)}: {tool_name}({query[:50]}...)")

    # Find and invoke the tool
    tool_map = {t.name: t for t in ALL_TOOLS}
    tool_fn = tool_map.get(tool_name)

    if not tool_fn:
        logger.warning(f"Unknown tool: {tool_name}")
        return {"current_step_index": step_index + 1}

    try:
        if tool_name in ("semantic_search", "keyword_search"):
            result = await tool_fn.ainvoke({"query": query})
        elif tool_name == "find_precedents":
            result = await tool_fn.ainvoke({"fact_pattern": query})
        elif tool_name in ("summarize_documents", "analyze_argumentation"):
            # These need document_ids — use IDs from search results
            doc_ids = [
                r["document_id"]
                for r in state.get("search_results", [])[:5]
                if r.get("document_id")
            ]
            if not doc_ids:
                result = {"note": "No documents available to analyze yet"}
            else:
                result = await tool_fn.ainvoke({"document_ids": doc_ids})
        else:
            result = await tool_fn.ainvoke({"query": query})
    except Exception as e:
        logger.error(f"Tool {tool_name} failed: {e}")
        result = [{"error": str(e)}]

    # Accumulate search results
    new_results = state.get("search_results", [])
    if isinstance(result, list):
        new_results = new_results + result
    else:
        new_results = new_results + [result]

    return {
        "search_results": new_results,
        "current_step_index": step_index + 1,
    }


class ResearchAgent:
    """Legal Research Agent — LangGraph state machine with tool-using capabilities."""

    def __init__(
        self,
        llm: ChatOpenAI | None = None,
        max_iterations: int = 10,
        checkpointer=None,
    ) -> None:
        self.llm = llm
        self.max_iterations = max_iterations
        self.graph = self._build_graph(checkpointer)

    def _build_graph(self, checkpointer=None):
        planner = PlannerNode(llm=self.llm)
        analyzer = AnalyzerNode(llm=self.llm)
        report_writer = ReportWriterNode(llm=self.llm)

        builder = StateGraph(ResearchState)

        # Add nodes
        builder.add_node("planner", planner)
        builder.add_node("executor", _executor_node)
        builder.add_node("analyzer", analyzer)
        builder.add_node("report_writer", report_writer)
        builder.add_node("interrupt", _interrupt_node)

        # Wire edges
        builder.add_edge(START, "planner")
        builder.add_edge("planner", "executor")
        builder.add_edge("executor", "analyzer")
        builder.add_conditional_edges("analyzer", _decision_gate)
        builder.add_edge("interrupt", "planner")  # after user input, re-plan
        builder.add_edge("report_writer", END)

        compile_kwargs = {}
        if checkpointer:
            compile_kwargs["checkpointer"] = checkpointer

        return builder.compile(**compile_kwargs)

    def create_initial_state(
        self,
        session_id: str,
        mode: str,
        query: str,
    ) -> ResearchState:
        return ResearchState(
            messages=[HumanMessage(content=query)],
            mode=mode,
            session_id=session_id,
            research_plan=None,
            current_step_index=0,
            search_results=[],
            analyzed_documents=[],
            findings=[],
            contradictions=[],
            pending_decision=None,
            iteration=0,
            max_iterations=self.max_iterations,
            confidence=0.0,
            should_stop=False,
        )
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_graph.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/packages/research_agent/research_agent/graph.py backend/packages/research_agent/tests/test_graph.py
git commit -m "feat(research-agent): assemble LangGraph with Planner→Executor→Analyzer→Report loop"
```

---

## Task 8: FastAPI router with SSE streaming

**Files:**
- Create: `backend/app/api/research_agent.py`
- Modify: `backend/app/server.py` (register router)

**Step 1: Implement the router**

Create `backend/app/api/research_agent.py`:

```python
"""FastAPI router for the Research Agent.

Endpoints:
- POST   /research-agent/sessions           — start a new research session
- POST   /research-agent/sessions/{id}/message — send user input (decision point response)
- GET    /research-agent/sessions/{id}/stream  — SSE stream of agent progress
- GET    /research-agent/sessions/{id}        — get session status + results
- POST   /research-agent/sessions/{id}/stop   — stop a running session
- GET    /research-agent/sessions             — list user's sessions
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_optional_user
from app.core.supabase import get_supabase_client
from app.models import validate_id_format

router = APIRouter(prefix="/research-agent", tags=["research-agent"])


# ===== Request/Response Models =====


class StartSessionRequest(BaseModel):
    query: str = Field(min_length=5, max_length=5000, description="Research question or topic")
    mode: Literal["guided", "exploratory", "case_preparation"] = Field(
        default="guided", description="Research mode"
    )
    max_iterations: int = Field(default=10, ge=1, le=20, description="Max research iterations")


class StartSessionResponse(BaseModel):
    session_id: str
    status: str
    message: str


class SendMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000, description="User response to decision point")


class SessionResponse(BaseModel):
    id: str
    mode: str
    initial_query: str
    status: str
    current_step: str | None = None
    progress: dict[str, Any] = Field(default_factory=dict)
    findings: list[dict[str, Any]] = Field(default_factory=list)
    decision_points: list[dict[str, Any]] = Field(default_factory=list)
    report: dict[str, Any] | None = None
    confidence: float = 0.0
    created_at: str | None = None


# ===== In-memory registry of running agents =====
# Maps session_id -> asyncio.Task
_running_sessions: dict[str, asyncio.Task] = {}
# Maps session_id -> asyncio.Queue for SSE events
_session_event_queues: dict[str, list[asyncio.Queue]] = {}


def _get_persistence():
    """Get session and checkpoint stores."""
    from research_agent.persistence import SupabaseCheckpointStore, SupabaseSessionStore

    client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return SupabaseSessionStore(client), SupabaseCheckpointStore(client)


def _broadcast_event(session_id: str, event: dict[str, Any]):
    """Send an SSE event to all listeners of a session."""
    queues = _session_event_queues.get(session_id, [])
    for q in queues:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


async def _run_agent(session_id: str, mode: str, query: str, max_iterations: int):
    """Run the research agent in background, broadcasting events."""
    from research_agent.graph import ResearchAgent
    from research_agent.persistence import SessionStatus

    session_store, _ = _get_persistence()

    try:
        await session_store.update_status(session_id, SessionStatus.RESEARCHING, "Initializing agent")
        _broadcast_event(session_id, {"type": "status", "status": "researching", "step": "Initializing"})

        agent = ResearchAgent(max_iterations=max_iterations)
        initial_state = agent.create_initial_state(session_id, mode, query)
        config = {"configurable": {"thread_id": session_id}}

        async for event in agent.graph.astream_events(initial_state, config=config, version="v2"):
            kind = event.get("event", "")

            if kind == "on_chain_start" and event.get("name") in (
                "planner", "executor", "analyzer", "report_writer"
            ):
                step_name = event["name"]
                await session_store.update_status(session_id, SessionStatus.RESEARCHING, step_name)
                _broadcast_event(session_id, {"type": "step", "node": step_name})

            elif kind == "on_chain_end" and event.get("name") == "analyzer":
                output = event.get("data", {}).get("output", {})
                if output.get("findings"):
                    for f in output["findings"][-3:]:
                        await session_store.append_finding(session_id, f)
                    _broadcast_event(session_id, {
                        "type": "findings",
                        "count": len(output["findings"]),
                        "confidence": output.get("confidence", 0),
                    })

                if output.get("pending_decision"):
                    await session_store.update_status(session_id, SessionStatus.AWAITING_INPUT)
                    await session_store.append_decision_point(session_id, output["pending_decision"])
                    _broadcast_event(session_id, {
                        "type": "decision_needed",
                        "decision": output["pending_decision"],
                    })

            elif kind == "on_chain_end" and event.get("name") == "report_writer":
                # Report generated — save it
                output = event.get("data", {}).get("output", {})
                # The report is in the graph state, retrieve via final state
                pass

        # Agent finished — mark as completed
        await session_store.update_status(session_id, SessionStatus.COMPLETED, "Research complete")
        _broadcast_event(session_id, {"type": "completed"})

    except Exception as e:
        logger.error(f"Research agent error for session {session_id}: {e}")
        try:
            await session_store.update_status(session_id, SessionStatus.FAILED, str(e)[:200])
        except Exception:
            pass
        _broadcast_event(session_id, {"type": "error", "message": str(e)[:200]})

    finally:
        _running_sessions.pop(session_id, None)


# ===== Endpoints =====


@router.post("/sessions", response_model=StartSessionResponse)
async def start_session(
    request: StartSessionRequest,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> StartSessionResponse:
    """Start a new research session."""
    user_id = current_user.id if current_user else None
    session_store, _ = _get_persistence()

    session_id = await session_store.create_session(
        user_id=user_id,
        mode=request.mode,
        query=request.query,
    )

    # Launch agent in background
    task = asyncio.create_task(
        _run_agent(session_id, request.mode, request.query, request.max_iterations)
    )
    _running_sessions[session_id] = task

    return StartSessionResponse(
        session_id=session_id,
        status="planning",
        message=f"Research session started in {request.mode} mode",
    )


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> SessionResponse:
    """Get session status and results."""
    validate_id_format(session_id, "session_id")
    session_store, _ = _get_persistence()
    session = await session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse(
        id=session.id,
        mode=session.mode,
        initial_query=session.initial_query,
        status=session.status,
        current_step=session.current_step,
        progress=session.progress,
        findings=session.findings,
        decision_points=session.decision_points,
        report=session.report,
        created_at=session.created_at,
    )


@router.get("/sessions/{session_id}/stream")
async def stream_session(
    session_id: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """SSE stream of agent progress events."""
    validate_id_format(session_id, "session_id")

    queue: asyncio.Queue = asyncio.Queue(maxsize=100)

    if session_id not in _session_event_queues:
        _session_event_queues[session_id] = []
    _session_event_queues[session_id].append(queue)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("type") in ("completed", "error"):
                        break
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        finally:
            _session_event_queues.get(session_id, []).remove(queue) if queue in _session_event_queues.get(session_id, []) else None

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id}/message")
async def send_message(
    session_id: str,
    request: SendMessageRequest,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict[str, str]:
    """Send user response to a decision point (resumes agent)."""
    validate_id_format(session_id, "session_id")
    # TODO: Resume the LangGraph interrupt with user's message
    # This requires checkpointer integration — for MVP, re-launch with context
    return {"status": "received", "message": "Agent will resume with your input"}


@router.post("/sessions/{session_id}/stop")
async def stop_session(
    session_id: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict[str, str]:
    """Stop a running research session."""
    validate_id_format(session_id, "session_id")
    task = _running_sessions.get(session_id)
    if task and not task.done():
        task.cancel()
        _running_sessions.pop(session_id, None)

    session_store, _ = _get_persistence()
    from research_agent.persistence import SessionStatus
    await session_store.update_status(session_id, SessionStatus.STOPPED, "Stopped by user")
    _broadcast_event(session_id, {"type": "stopped"})

    return {"status": "stopped"}


@router.get("/sessions")
async def list_sessions(
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
    limit: int = Query(10, ge=1, le=50),
    status: str | None = Query(None),
) -> list[SessionResponse]:
    """List user's research sessions."""
    user_id = current_user.id if current_user else None
    if not user_id:
        return []

    session_store, _ = _get_persistence()
    sessions = await session_store.list_sessions(user_id, limit=limit, status=status)

    return [
        SessionResponse(
            id=s.id,
            mode=s.mode,
            initial_query=s.initial_query,
            status=s.status,
            current_step=s.current_step,
            progress=s.progress,
            findings=s.findings,
            decision_points=s.decision_points,
            report=s.report,
            created_at=s.created_at,
        )
        for s in sessions
    ]
```

**Step 2: Register router in server.py**

In `backend/app/server.py`, add the import alongside other API routers (around line 34):

```python
from app.api.research_agent import router as research_agent_v2_router
```

And register it alongside other routers (around line 541, after `research_assistant_router`):

```python
app.include_router(research_agent_v2_router, dependencies=[Depends(verify_api_key)])
```

**Step 3: Commit**

```bash
git add backend/app/api/research_agent.py backend/app/server.py
git commit -m "feat(research-agent): add FastAPI router with SSE streaming and session management"
```

---

## Task 9: Integration test — full agent flow (mocked LLM)

**Files:**
- Create: `backend/packages/research_agent/tests/test_integration.py`

**Step 1: Write integration test**

Create `backend/packages/research_agent/tests/test_integration.py`:

```python
"""Integration test: full agent loop with mocked LLM."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage

from research_agent.graph import ResearchAgent
from research_agent.state import ResearchState


@pytest.fixture
def mock_llm_responses():
    """Mock LLM to return predictable research plan and analysis."""
    plan_response = AIMessage(
        content=json.dumps({
            "goal": "Find precedents for VAT deduction on mixed-use vehicles",
            "strategy": "Search semantically, then analyze top results",
            "steps": [
                {"tool": "semantic_search", "query": "VAT deduction mixed-use vehicle", "reason": "Broad search"},
                {"tool": "find_precedents", "query": "taxpayer deducted VAT on company car used privately", "reason": "Find similar cases"},
            ],
        })
    )

    analysis_response = AIMessage(
        content=json.dumps({
            "new_findings": [
                {
                    "type": "precedent",
                    "content": "NSA ruled in II FSK 1234/20 that mixed-use vehicles qualify for 50% VAT deduction",
                    "source_document_ids": ["doc-1"],
                    "confidence": 0.9,
                }
            ],
            "contradictions": [],
            "overall_confidence": 0.9,
            "needs_user_input": False,
            "should_continue": False,
            "reason": "High confidence result found",
        })
    )

    report_response = AIMessage(
        content=json.dumps({
            "summary": "Research found clear precedent for 50% VAT deduction on mixed-use vehicles.",
            "key_findings": ["NSA case II FSK 1234/20 establishes 50% deduction rule"],
            "gaps": ["EU CJEU rulings not yet explored"],
            "recommendations": ["Review CJEU case law for EU-level confirmation"],
            "sources": [{"document_id": "doc-1", "title": "NSA II FSK 1234/20"}],
        })
    )

    return [plan_response, analysis_response, report_response]


@pytest.mark.asyncio
async def test_full_agent_loop_completes(mock_llm_responses):
    """Agent should plan → execute → analyze → report in a single loop."""
    call_index = 0

    async def mock_ainvoke(messages, *args, **kwargs):
        nonlocal call_index
        response = mock_llm_responses[min(call_index, len(mock_llm_responses) - 1)]
        call_index += 1
        return response

    with (
        patch("research_agent.nodes.ChatOpenAI") as MockLLM,
        patch("research_agent.tools.search_chunks", new_callable=AsyncMock) as mock_search,
        patch("research_agent.tools.generate_embedding", new_callable=AsyncMock) as mock_embed,
        patch("research_agent.tools.get_vector_db") as mock_db,
    ):
        # Setup mocks
        mock_llm_instance = AsyncMock()
        mock_llm_instance.ainvoke = mock_ainvoke
        MockLLM.return_value = mock_llm_instance

        mock_search.return_value = []
        mock_embed.return_value = [0.1] * 768

        mock_db_instance = AsyncMock()
        mock_db_instance.search_by_vector = AsyncMock(return_value=[])
        mock_db.return_value = mock_db_instance

        agent = ResearchAgent(max_iterations=3)
        state = agent.create_initial_state(
            session_id="test-session",
            mode="guided",
            query="When can I deduct VAT on a mixed-use vehicle?",
        )

        # Run to completion
        result = await agent.graph.ainvoke(state)

        assert result["should_stop"] is True
        assert result["iteration"] >= 1
```

**Step 2: Run integration test**

```bash
cd backend && poetry run pytest packages/research_agent/tests/test_integration.py -v
```

Expected: PASS

**Step 3: Commit**

```bash
git add backend/packages/research_agent/tests/test_integration.py
git commit -m "test(research-agent): add integration test with mocked LLM for full agent loop"
```

---

## Task 10: Export package public API and update __init__.py

**Files:**
- Modify: `backend/packages/research_agent/research_agent/__init__.py`

**Step 1: Update __init__.py**

```python
"""Legal Research Agent — autonomous multi-step legal research."""

__version__ = "0.1.0"

from research_agent.graph import ResearchAgent
from research_agent.persistence import (
    CheckpointStore,
    ResearchSession,
    SessionStatus,
    SessionStore,
    SupabaseCheckpointStore,
    SupabaseSessionStore,
)
from research_agent.state import ResearchState
from research_agent.tools import ALL_TOOLS

__all__ = [
    "ResearchAgent",
    "ResearchState",
    "SessionStore",
    "CheckpointStore",
    "SupabaseSessionStore",
    "SupabaseCheckpointStore",
    "ResearchSession",
    "SessionStatus",
    "ALL_TOOLS",
]
```

**Step 2: Run all package tests**

```bash
cd backend && poetry run pytest packages/research_agent/tests/ -v
```

Expected: ALL PASS

**Step 3: Lint**

```bash
cd backend && poetry run ruff check packages/research_agent/ --fix && poetry run ruff format packages/research_agent/
```

**Step 4: Commit**

```bash
git add backend/packages/research_agent/
git commit -m "feat(research-agent): finalize package public API and exports"
```

---

## Summary

| Task | Component | Files | Est. |
|------|-----------|-------|------|
| 1 | Package scaffold | pyproject.toml, __init__.py | 3 min |
| 2 | Persistence layer | persistence.py + tests | 5 min |
| 3 | Supabase migration | SQL migration | 2 min |
| 4 | Agent State | state.py + tests | 3 min |
| 5 | Tool wrappers (5) | tools.py + tests | 5 min |
| 6 | Graph nodes | nodes.py + tests | 5 min |
| 7 | Graph assembly | graph.py + tests | 5 min |
| 8 | FastAPI router + SSE | api/research_agent.py + server.py | 5 min |
| 9 | Integration test | test_integration.py | 5 min |
| 10 | Package exports + lint | __init__.py | 2 min |

**Total: 10 tasks, 10 commits**

### What's NOT in this plan (future work)
- Frontend UI for research sessions (React page + SSE client)
- Celery integration for long-running background sessions
- LangGraph checkpointer integration for interrupt/resume
- Tool usage analytics and Langfuse tracing
- Additional tools (timeline, citation network)
