"""LangGraph graph assembly for the Legal Research Agent."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from loguru import logger

from research_agent.nodes import AnalyzerNode, PlannerNode, ReportWriterNode
from research_agent.state import ResearchState
from research_agent.tools import ALL_TOOLS

# ---------------------------------------------------------------------------
# Tool lookup
# ---------------------------------------------------------------------------

_TOOL_MAP: dict[str, Any] = {t.name: t for t in ALL_TOOLS}


# ---------------------------------------------------------------------------
# Standalone node / routing functions
# ---------------------------------------------------------------------------


def _decision_gate(state: ResearchState) -> str:
    """Route after the analyzer: continue, report, or ask user."""
    if state.get("should_stop"):
        return "report_writer"
    if state.get("pending_decision"):
        return "interrupt"
    if state.get("confidence", 0.0) >= 0.85:
        return "report_writer"
    if state.get("iteration", 0) >= state.get("max_iterations", 10):
        return "report_writer"
    return "planner"


def _interrupt_node(state: ResearchState) -> dict:
    """Pause execution and wait for a user decision."""
    decision = state.get("pending_decision") or {}
    logger.info(f"InterruptNode: waiting for user input — {decision.get('question', '')}")
    user_response = interrupt(decision)
    return {
        "messages": [HumanMessage(content=str(user_response))],
        "pending_decision": None,
    }


async def _executor_node(state: ResearchState) -> dict:
    """Execute the current step from the research plan."""
    plan = state.get("research_plan") or {}
    steps = plan.get("steps", [])
    step_index = state.get("current_step_index", 0)

    if step_index >= len(steps):
        logger.warning("ExecutorNode: no more steps to execute")
        return {"search_results": state.get("search_results", [])}

    step = steps[step_index]
    tool_name = step.get("tool", "")
    query = step.get("query", "")

    logger.info(f"ExecutorNode: executing step {step_index} — {tool_name}({query!r})")

    tool_fn = _TOOL_MAP.get(tool_name)
    if tool_fn is None:
        logger.error(f"ExecutorNode: unknown tool '{tool_name}'")
        result = {"error": f"Unknown tool: {tool_name}"}
    else:
        try:
            if tool_name in ("semantic_search", "keyword_search"):
                result = await tool_fn.ainvoke({"query": query})
            elif tool_name == "find_precedents":
                result = await tool_fn.ainvoke({"fact_pattern": query})
            elif tool_name in ("summarize_documents", "analyze_argumentation"):
                # Collect document IDs from previous search results
                existing_results = state.get("search_results", [])
                doc_ids = [
                    r["document_id"]
                    for r in existing_results
                    if isinstance(r, dict) and "document_id" in r
                ]
                result = await tool_fn.ainvoke({"document_ids": doc_ids})
            else:
                result = await tool_fn.ainvoke({"query": query})
        except Exception as exc:
            logger.error(f"ExecutorNode: tool '{tool_name}' raised {exc}")
            result = {"error": str(exc)}

    updated_results = list(state.get("search_results", []))
    if isinstance(result, list):
        updated_results.extend(result)
    else:
        updated_results.append(result)

    return {
        "search_results": updated_results,
        "current_step_index": step_index + 1,
    }


# ---------------------------------------------------------------------------
# ResearchAgent — assembles everything into a compiled StateGraph
# ---------------------------------------------------------------------------


class ResearchAgent:
    """High-level wrapper that builds and exposes the compiled LangGraph."""

    def __init__(
        self,
        llm: Any | None = None,
        max_iterations: int = 10,
        checkpointer: Any | None = None,
    ) -> None:
        self._llm = llm
        self._max_iterations = max_iterations
        self.graph = self._build_graph(checkpointer)

    # ------------------------------------------------------------------
    # Graph construction
    # ------------------------------------------------------------------

    def _build_graph(self, checkpointer: Any | None) -> Any:
        builder: StateGraph = StateGraph(ResearchState)

        # Register nodes
        builder.add_node("planner", PlannerNode(llm=self._llm))
        builder.add_node("executor", _executor_node)
        builder.add_node("analyzer", AnalyzerNode(llm=self._llm))
        builder.add_node("report_writer", ReportWriterNode(llm=self._llm))
        builder.add_node("interrupt", _interrupt_node)

        # Edges
        builder.add_edge(START, "planner")
        builder.add_edge("planner", "executor")
        builder.add_edge("executor", "analyzer")
        builder.add_conditional_edges("analyzer", _decision_gate)
        builder.add_edge("interrupt", "planner")
        builder.add_edge("report_writer", END)

        return builder.compile(checkpointer=checkpointer)

    # ------------------------------------------------------------------
    # State factory
    # ------------------------------------------------------------------

    def create_initial_state(
        self,
        session_id: str,
        mode: str,
        query: str,
    ) -> dict[str, Any]:
        """Create a valid initial state dict for the graph."""
        return {
            "messages": [HumanMessage(content=query)],
            "mode": mode,
            "session_id": session_id,
            "research_plan": None,
            "current_step_index": 0,
            "search_results": [],
            "analyzed_documents": [],
            "findings": [],
            "contradictions": [],
            "pending_decision": None,
            "iteration": 0,
            "max_iterations": self._max_iterations,
            "confidence": 0.0,
            "should_stop": False,
        }
