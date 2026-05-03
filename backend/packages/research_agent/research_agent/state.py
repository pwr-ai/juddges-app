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
