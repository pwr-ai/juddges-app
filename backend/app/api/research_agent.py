"""FastAPI router for the Research Agent v2 with SSE streaming and session management.

Provides endpoints for:
- Starting new research sessions
- Streaming real-time progress events via SSE
- Sending user input at decision points
- Stopping and listing sessions
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_optional_user
from app.core.supabase import get_supabase_client
from app.models import validate_id_format

router = APIRouter(prefix="/research-agent", tags=["research-agent-v2"])

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

_running_sessions: dict[str, asyncio.Task] = {}
_session_event_queues: dict[str, list[asyncio.Queue]] = {}

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class StartSessionRequest(BaseModel):
    query: str = Field(min_length=5, max_length=5000, description="Research query")
    mode: Literal["guided", "exploratory", "case_preparation"] = Field(
        default="guided", description="Research mode"
    )
    max_iterations: int = Field(
        default=10, ge=1, le=20, description="Maximum research iterations"
    )


class StartSessionResponse(BaseModel):
    session_id: str
    status: str
    message: str


class SendMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000, description="User message")


class SessionResponse(BaseModel):
    id: str
    mode: str
    initial_query: str
    status: str
    current_step: int = 0
    progress: float = 0.0
    findings: list[dict[str, Any]] = Field(default_factory=list)
    decision_points: list[dict[str, Any]] = Field(default_factory=list)
    report: dict[str, Any] | None = None
    created_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_persistence():
    """Return (SupabaseSessionStore, SupabaseCheckpointStore) using the shared Supabase client."""
    from research_agent.persistence import (
        SupabaseCheckpointStore,
        SupabaseSessionStore,
    )

    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Supabase client unavailable.")
    return SupabaseSessionStore(client), SupabaseCheckpointStore(client)


def _broadcast_event(session_id: str, event: dict[str, Any]) -> None:
    """Push *event* to every SSE listener queue registered for *session_id*."""
    queues = _session_event_queues.get(session_id, [])
    for q in queues:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("SSE queue full for session {}, dropping event", session_id)


async def _run_agent(
    session_id: str,
    mode: str,
    query: str,
    max_iterations: int,
) -> None:
    """Background coroutine that drives the ResearchAgent and broadcasts SSE events."""
    from research_agent.graph import ResearchAgent
    from research_agent.persistence import (
        DecisionPoint,
        ResearchFinding,
        SessionStatus,
    )

    session_store, _checkpoint_store = _get_persistence()

    try:
        # 1. Update status to RESEARCHING
        await session_store.update_status(session_id, SessionStatus.RESEARCHING)
        _broadcast_event(
            session_id,
            {"type": "status", "status": "researching", "ts": _now_iso()},
        )

        # 2. Create agent and initial state
        agent = ResearchAgent(max_iterations=max_iterations)
        state = agent.create_initial_state(session_id, mode, query)
        config = {"configurable": {"thread_id": session_id}}

        # 3. Stream events from the graph
        async for event in agent.graph.astream_events(state, config, version="v2"):
            kind = event.get("event", "")
            name = event.get("name", "")

            if kind == "on_chain_start":
                _broadcast_event(
                    session_id,
                    {
                        "type": "node_start",
                        "node": name,
                        "ts": _now_iso(),
                    },
                )

            elif kind == "on_chain_end":
                _broadcast_event(
                    session_id,
                    {
                        "type": "node_end",
                        "node": name,
                        "ts": _now_iso(),
                    },
                )

                # When the analyzer finishes, persist findings / decision points
                if name == "analyzer":
                    output = event.get("data", {}).get("output", {})

                    # Append findings
                    for f in output.get("findings", []):
                        finding = ResearchFinding(
                            finding_type=f.get("finding_type", "general"),
                            content=f.get("content", ""),
                            source_document_ids=f.get("source_document_ids", []),
                            confidence=f.get("confidence", 0.0),
                        )
                        await session_store.append_finding(session_id, finding)
                        _broadcast_event(
                            session_id,
                            {
                                "type": "finding",
                                "data": finding.model_dump(mode="json"),
                                "ts": _now_iso(),
                            },
                        )

                    # Check for decision points
                    pending = output.get("pending_decision")
                    if pending:
                        point = DecisionPoint(
                            step=output.get("iteration", 0),
                            question=pending.get("question", ""),
                            options=pending.get("options", []),
                        )
                        await session_store.append_decision_point(session_id, point)
                        _broadcast_event(
                            session_id,
                            {
                                "type": "decision_point",
                                "data": point.model_dump(mode="json"),
                                "ts": _now_iso(),
                            },
                        )

        # 4. Mark session as completed
        await session_store.update_status(session_id, SessionStatus.COMPLETED)
        _broadcast_event(
            session_id,
            {"type": "status", "status": "completed", "ts": _now_iso()},
        )

    except asyncio.CancelledError:
        logger.info("Agent task cancelled for session {}", session_id)
        raise

    except Exception as exc:
        logger.error("Agent error for session {}: {}", session_id, exc)
        try:
            from research_agent.persistence import SessionStatus as SS

            await session_store.update_status(session_id, SS.FAILED)
        except Exception:
            pass
        _broadcast_event(
            session_id,
            {"type": "error", "message": str(exc), "ts": _now_iso()},
        )

    finally:
        _running_sessions.pop(session_id, None)
        _broadcast_event(
            session_id,
            {"type": "done", "ts": _now_iso()},
        )


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/sessions",
    response_model=StartSessionResponse,
    summary="Start a new research session",
)
async def start_session(
    request: StartSessionRequest,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> StartSessionResponse:
    """Create a research session and launch the agent in the background."""
    from research_agent.persistence import ResearchMode, ResearchSession

    user_id = current_user.id if current_user else "anonymous"
    session_id = str(uuid.uuid4())

    session_store, _ = _get_persistence()

    session = ResearchSession(
        id=session_id,
        user_id=user_id,
        mode=ResearchMode(request.mode),
        initial_query=request.query,
    )
    await session_store.create_session(session)

    # Launch background task
    task = asyncio.create_task(
        _run_agent(session_id, request.mode, request.query, request.max_iterations)
    )
    _running_sessions[session_id] = task

    return StartSessionResponse(
        session_id=session_id,
        status="planning",
        message="Research session started.",
    )


@router.get(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Get session status and results",
)
async def get_session(
    session_id: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> SessionResponse:
    """Read a research session by ID."""
    try:
        validate_id_format(session_id, "session_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    session_store, _ = _get_persistence()
    session = await session_store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    return SessionResponse(
        id=session.id,
        mode=session.mode,
        initial_query=session.initial_query,
        status=session.status,
        current_step=len(session.findings),
        progress=min(len(session.findings) / 10.0, 1.0),
        findings=[f.model_dump(mode="json") for f in session.findings],
        decision_points=[dp.model_dump(mode="json") for dp in session.decision_points],
        report=session.report.model_dump(mode="json") if session.report else None,
        created_at=session.created_at.isoformat()
        if isinstance(session.created_at, datetime)
        else str(session.created_at),
    )


@router.get(
    "/sessions/{session_id}/stream",
    summary="SSE stream of session progress events",
)
async def stream_session(
    session_id: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Return an SSE stream that emits progress events for the given session."""
    try:
        validate_id_format(session_id, "session_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    queue: asyncio.Queue = asyncio.Queue(maxsize=256)
    _session_event_queues.setdefault(session_id, []).append(queue)

    async def _event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                except TimeoutError:
                    # Send heartbeat to keep the connection alive
                    yield f"data: {json.dumps({'type': 'heartbeat', 'ts': _now_iso()})}\n\n"
                    continue

                yield f"data: {json.dumps(event, default=str)}\n\n"

                if event.get("type") == "done":
                    break
        finally:
            queues = _session_event_queues.get(session_id, [])
            if queue in queues:
                queues.remove(queue)
            if not queues:
                _session_event_queues.pop(session_id, None)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/sessions/{session_id}/message",
    summary="Send user input to a decision point",
)
async def send_message(
    session_id: str,
    request: SendMessageRequest,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict[str, str]:
    """Placeholder for interrupt-resume: accepts user input at a decision point."""
    try:
        validate_id_format(session_id, "session_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info(
        "Received user message for session {}: {}",
        session_id,
        request.message[:80],
    )
    return {"status": "received"}


@router.post(
    "/sessions/{session_id}/stop",
    summary="Stop a running research session",
)
async def stop_session(
    session_id: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict[str, str]:
    """Cancel the running agent task and mark the session as stopped."""
    try:
        validate_id_format(session_id, "session_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    task = _running_sessions.get(session_id)
    if task is None:
        raise HTTPException(status_code=404, detail="No running task for this session.")

    task.cancel()

    from research_agent.persistence import SessionStatus

    session_store, _ = _get_persistence()
    try:
        await session_store.update_status(session_id, SessionStatus.STOPPED)
    except Exception as exc:
        logger.error("Failed to update status to STOPPED for {}: {}", session_id, exc)

    return {"status": "stopped"}


@router.get(
    "/sessions",
    response_model=list[SessionResponse],
    summary="List user's research sessions",
)
async def list_sessions(
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
    limit: int = Query(20, ge=1, le=100, description="Max sessions to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> list[SessionResponse]:
    """List research sessions for the current user."""
    user_id = current_user.id if current_user else "anonymous"

    session_store, _ = _get_persistence()
    sessions = await session_store.list_sessions(user_id, limit=limit, offset=offset)

    return [
        SessionResponse(
            id=s.id,
            mode=s.mode,
            initial_query=s.initial_query,
            status=s.status,
            current_step=len(s.findings),
            progress=min(len(s.findings) / 10.0, 1.0),
            findings=[f.model_dump(mode="json") for f in s.findings],
            decision_points=[dp.model_dump(mode="json") for dp in s.decision_points],
            report=s.report.model_dump(mode="json") if s.report else None,
            created_at=s.created_at.isoformat()
            if isinstance(s.created_at, datetime)
            else str(s.created_at),
        )
        for s in sessions
    ]
