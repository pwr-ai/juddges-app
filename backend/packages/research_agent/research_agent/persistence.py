"""Framework-agnostic persistence layer for research agent sessions and checkpoints.

Uses Python Protocols for structural typing so any agent framework
(LangGraph, CrewAI, custom) can use this persistence layer.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Protocol, runtime_checkable

from loguru import logger
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class ResearchFinding(BaseModel):
    """A single finding discovered during research."""

    finding_type: str
    content: str
    source_document_ids: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DecisionPoint(BaseModel):
    """A point where the agent made or awaited a decision."""

    step: int
    question: str
    options: list[str] = Field(default_factory=list)
    chosen: str | None = None
    chosen_by: str = "agent"  # "agent" or "user"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ToolUsage(BaseModel):
    """Record of a tool invocation."""

    tool_name: str
    input_summary: str = ""
    output_summary: str = ""
    duration_ms: int = 0
    step: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ResearchReport(BaseModel):
    """Final research report produced by the agent."""

    title: str
    summary: str
    sections: list[dict[str, Any]] = Field(default_factory=list)
    cited_document_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ResearchSession(BaseModel):
    """Represents a full research session."""

    id: str
    user_id: str
    mode: ResearchMode
    initial_query: str
    status: SessionStatus = SessionStatus.PLANNING
    findings: list[ResearchFinding] = Field(default_factory=list)
    used_tools: list[ToolUsage] = Field(default_factory=list)
    decision_points: list[DecisionPoint] = Field(default_factory=list)
    report: ResearchReport | None = None
    agent_framework: str = "langgraph"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentCheckpoint(BaseModel):
    """Snapshot of agent state at a particular step."""

    id: str
    session_id: str
    step: int
    state: dict[str, Any] = Field(default_factory=dict)
    agent_framework: str = "langgraph"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Protocols
# ---------------------------------------------------------------------------


@runtime_checkable
class SessionStore(Protocol):
    """Protocol for persisting research sessions."""

    async def create_session(self, session: ResearchSession) -> ResearchSession: ...

    async def update_status(self, session_id: str, status: SessionStatus) -> None: ...

    async def append_finding(self, session_id: str, finding: ResearchFinding) -> None: ...

    async def append_decision_point(self, session_id: str, point: DecisionPoint) -> None: ...

    async def save_report(self, session_id: str, report: ResearchReport) -> None: ...

    async def get_session(self, session_id: str) -> ResearchSession | None: ...

    async def list_sessions(
        self, user_id: str, *, limit: int = 20, offset: int = 0
    ) -> list[ResearchSession]: ...


@runtime_checkable
class CheckpointStore(Protocol):
    """Protocol for persisting agent checkpoints."""

    async def save(self, checkpoint: AgentCheckpoint) -> None: ...

    async def load_latest(self, session_id: str) -> AgentCheckpoint | None: ...

    async def load_step(self, session_id: str, step: int) -> AgentCheckpoint | None: ...


# ---------------------------------------------------------------------------
# Supabase Implementations
# ---------------------------------------------------------------------------


class SupabaseSessionStore:
    """Supabase-backed implementation of SessionStore."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self._table = "research_sessions"

    async def create_session(self, session: ResearchSession) -> ResearchSession:
        data = session.model_dump(mode="json")
        logger.info("Creating research session {}", session.id)
        await self._client.table(self._table).insert(data).execute()
        return session

    async def update_status(self, session_id: str, status: SessionStatus) -> None:
        logger.info("Updating session {} status to {}", session_id, status)
        await (
            self._client.table(self._table)
            .update({"status": status, "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", session_id)
            .execute()
        )

    async def append_finding(self, session_id: str, finding: ResearchFinding) -> None:
        logger.debug("Appending finding to session {}", session_id)
        # Read current findings, append, then write back
        resp = (
            await self._client.table(self._table)
            .select("findings")
            .eq("id", session_id)
            .single()
            .execute()
        )
        current_findings: list[dict[str, Any]] = resp.data.get("findings", []) if resp.data else []
        current_findings.append(finding.model_dump(mode="json"))
        await (
            self._client.table(self._table)
            .update(
                {"findings": current_findings, "updated_at": datetime.now(timezone.utc).isoformat()}
            )
            .eq("id", session_id)
            .execute()
        )

    async def append_decision_point(self, session_id: str, point: DecisionPoint) -> None:
        logger.debug("Appending decision point to session {}", session_id)
        resp = (
            await self._client.table(self._table)
            .select("decision_points")
            .eq("id", session_id)
            .single()
            .execute()
        )
        current: list[dict[str, Any]] = resp.data.get("decision_points", []) if resp.data else []
        current.append(point.model_dump(mode="json"))
        await (
            self._client.table(self._table)
            .update(
                {"decision_points": current, "updated_at": datetime.now(timezone.utc).isoformat()}
            )
            .eq("id", session_id)
            .execute()
        )

    async def save_report(self, session_id: str, report: ResearchReport) -> None:
        logger.info("Saving report for session {}", session_id)
        await (
            self._client.table(self._table)
            .update(
                {
                    "report": report.model_dump(mode="json"),
                    "status": SessionStatus.COMPLETED,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", session_id)
            .execute()
        )

    async def get_session(self, session_id: str) -> ResearchSession | None:
        logger.debug("Loading session {}", session_id)
        resp = (
            await self._client.table(self._table)
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
        if not resp.data:
            return None
        return ResearchSession.model_validate(resp.data)

    async def list_sessions(
        self, user_id: str, *, limit: int = 20, offset: int = 0
    ) -> list[ResearchSession]:
        logger.debug("Listing sessions for user {}", user_id)
        resp = (
            await self._client.table(self._table)
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return [ResearchSession.model_validate(row) for row in (resp.data or [])]


class SupabaseCheckpointStore:
    """Supabase-backed implementation of CheckpointStore."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self._table = "agent_checkpoints"

    async def save(self, checkpoint: AgentCheckpoint) -> None:
        data = checkpoint.model_dump(mode="json")
        logger.debug(
            "Saving checkpoint step {} for session {}", checkpoint.step, checkpoint.session_id
        )
        await self._client.table(self._table).insert(data).execute()

    async def load_latest(self, session_id: str) -> AgentCheckpoint | None:
        logger.debug("Loading latest checkpoint for session {}", session_id)
        resp = (
            await self._client.table(self._table)
            .select("*")
            .eq("session_id", session_id)
            .order("step", desc=True)
            .limit(1)
            .single()
            .execute()
        )
        if not resp.data:
            return None
        return AgentCheckpoint.model_validate(resp.data)

    async def load_step(self, session_id: str, step: int) -> AgentCheckpoint | None:
        logger.debug("Loading checkpoint step {} for session {}", step, session_id)
        resp = (
            await self._client.table(self._table)
            .select("*")
            .eq("session_id", session_id)
            .eq("step", step)
            .single()
            .execute()
        )
        if not resp.data:
            return None
        return AgentCheckpoint.model_validate(resp.data)
