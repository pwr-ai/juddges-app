"""LLM-powered graph nodes for the Legal Research Agent.

Three nodes form the "brain" of the research workflow:
- **PlannerNode** — creates / updates the research plan
- **AnalyzerNode** — evaluates tool results, extracts findings
- **ReportWriterNode** — synthesises findings into a final report
"""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_openai import ChatOpenAI
from loguru import logger

from research_agent.state import ResearchState
from research_agent.tools import ALL_TOOLS

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

PLANNER_SYSTEM_PROMPT = """\
You are the **Planner** for a Legal Research Agent that assists lawyers and \
legal researchers.

## Available Tools
{tool_descriptions}

## Research Modes
- **guided**: User provided a specific legal question — focus tightly on answering it.
- **exploratory**: User wants to explore a legal topic broadly — cast a wide net.
- **case_preparation**: User is preparing for a case — find precedents, counter-arguments, and gaps.

## Output Format
Return **only** valid JSON (no markdown fences) with the following schema:
{{
  "goal": "<one-sentence research goal>",
  "strategy": "<brief description of the overall approach>",
  "steps": [
    {{
      "tool": "<tool_name>",
      "query": "<query or parameters for the tool>",
      "reason": "<why this step is needed>"
    }}
  ]
}}

Rules:
- Produce between 3 and 7 steps.
- Order steps logically — broader searches first, then targeted follow-ups.
- If user feedback is present, revise the plan accordingly.
- Each step must reference one of the available tools by its exact name.
"""

ANALYZER_SYSTEM_PROMPT = """\
You are the **Analyzer** for a Legal Research Agent. Your job is to evaluate \
search results, extract findings, and decide whether to continue researching.

## Output Format
Return **only** valid JSON (no markdown fences) with the following schema:
{{
  "new_findings": [
    {{
      "type": "<precedent|legal_rule|contradiction|gap|insight>",
      "content": "<description of the finding>",
      "confidence": <float 0-1>,
      "source_document_ids": ["<id>", ...]
    }}
  ],
  "new_contradictions": [
    {{
      "content": "<description of the contradiction>",
      "source_document_ids": ["<id>", ...]
    }}
  ],
  "overall_confidence": <float 0-1>,
  "needs_user_input": <true|false>,
  "user_input_question": "<question for user, if needs_user_input is true>",
  "should_continue": <true|false>,
  "reasoning": "<brief explanation of your assessment>"
}}

Rules:
- Be conservative with confidence scores — only high when evidence is strong.
- Set needs_user_input=true when you encounter ambiguity that the user should resolve.
- Set should_continue=false when the goal is sufficiently answered or max iterations approached.
- Identify contradictions between sources explicitly.
"""

REPORT_WRITER_SYSTEM_PROMPT = """\
You are the **Report Writer** for a Legal Research Agent. Synthesise all \
findings into a clear, well-structured research report.

## Output Format
Return **only** valid JSON (no markdown fences) with the following schema:
{{
  "summary": "<executive summary of the research, 2-4 paragraphs>",
  "key_findings": [
    {{
      "title": "<short title>",
      "description": "<detailed description>",
      "confidence": <float 0-1>,
      "sources": ["<document_id>", ...]
    }}
  ],
  "gaps": ["<identified gap in the research>", ...],
  "recommendations": ["<actionable recommendation>", ...],
  "sources": [
    {{
      "document_id": "<id>",
      "relevance": "<brief note on how this source was used>"
    }}
  ]
}}

Rules:
- Write in a professional legal tone.
- Clearly distinguish between well-supported findings and tentative ones.
- Highlight contradictions and unresolved questions in the gaps section.
- Recommendations should be specific and actionable.
"""


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _tool_descriptions() -> str:
    """Build a bullet list of tool names and descriptions from ALL_TOOLS."""
    lines: list[str] = []
    for t in ALL_TOOLS:
        lines.append(f"- **{t.name}**: {t.description.strip()}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


class PlannerNode:
    """Creates or revises the multi-step research plan."""

    system_prompt: str = PLANNER_SYSTEM_PROMPT

    def __init__(self, llm: Any | None = None) -> None:
        self.llm = llm or ChatOpenAI(model="gpt-4o", temperature=0.3)
        self._parser = JsonOutputParser()

    async def __call__(self, state: ResearchState) -> dict:
        """Build a research plan from the current state."""
        messages_list = state.get("messages", [])
        mode = state.get("mode", "guided")
        findings = state.get("findings", [])

        # Extract user query from the first human message
        query = ""
        for msg in messages_list:
            if hasattr(msg, "type") and msg.type == "human":
                query = msg.content
                break
            elif isinstance(msg, dict) and msg.get("role") == "user":
                query = msg.get("content", "")
                break

        # Build context for the planner
        context_parts: list[str] = [
            f"Research mode: {mode}",
            f"User query: {query}",
        ]
        if findings:
            context_parts.append(
                f"Existing findings ({len(findings)} so far): "
                + json.dumps(findings[:5], default=str)
            )

        # Check for user feedback (last human message if not the first)
        human_messages = [
            m
            for m in messages_list
            if (hasattr(m, "type") and m.type == "human")
            or (isinstance(m, dict) and m.get("role") == "user")
        ]
        if len(human_messages) > 1:
            last_feedback = human_messages[-1]
            feedback_text = (
                last_feedback.content
                if hasattr(last_feedback, "content")
                else last_feedback.get("content", "")
            )
            context_parts.append(f"User feedback: {feedback_text}")

        context = "\n".join(context_parts)

        system = self.system_prompt.format(tool_descriptions=_tool_descriptions())

        llm_messages = [
            SystemMessage(content=system),
            AIMessage(content="I will create a research plan based on your query."),
        ]
        # Add the context as a human-style message
        from langchain_core.messages import HumanMessage

        llm_messages.append(HumanMessage(content=context))

        logger.info("PlannerNode: generating research plan")
        response = await self.llm.ainvoke(llm_messages)
        plan = await self._parser.ainvoke(response)

        # Ensure steps are within 3-7
        steps = plan.get("steps", [])
        if len(steps) < 3:
            logger.warning(f"Plan has only {len(steps)} steps, expected 3-7")
        elif len(steps) > 7:
            plan["steps"] = steps[:7]
            logger.warning("Trimmed plan to 7 steps")

        return {
            "research_plan": plan,
            "current_step_index": 0,
            "messages": [AIMessage(content=json.dumps(plan, indent=2))],
        }


class AnalyzerNode:
    """Evaluates tool results and extracts findings."""

    system_prompt: str = ANALYZER_SYSTEM_PROMPT

    def __init__(self, llm: Any | None = None) -> None:
        self.llm = llm or ChatOpenAI(model="gpt-4o", temperature=0.2)
        self._parser = JsonOutputParser()

    async def __call__(self, state: ResearchState) -> dict:
        """Analyse recent search results and update findings."""
        research_plan = state.get("research_plan") or {}
        goal = research_plan.get("goal", "unknown")
        iteration = state.get("iteration", 0)
        max_iterations = state.get("max_iterations", 10)
        existing_findings = list(state.get("findings", []))
        existing_contradictions = list(state.get("contradictions", []))
        search_results = state.get("search_results", [])

        # Build context
        context_parts: list[str] = [
            f"Research goal: {goal}",
            f"Iteration: {iteration + 1} of {max_iterations}",
            f"Existing findings count: {len(existing_findings)}",
        ]
        if existing_findings:
            context_parts.append(
                "Existing findings: " + json.dumps(existing_findings[-5:], default=str)
            )
        if search_results:
            # Include recent results (last batch)
            recent = search_results[-10:] if len(search_results) > 10 else search_results
            context_parts.append("Recent search results: " + json.dumps(recent, default=str))
        else:
            context_parts.append("No new search results to analyse.")

        context = "\n".join(context_parts)

        from langchain_core.messages import HumanMessage

        llm_messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=context),
        ]

        logger.info(f"AnalyzerNode: analysing results (iteration {iteration + 1})")
        response = await self.llm.ainvoke(llm_messages)
        analysis = await self._parser.ainvoke(response)

        # Merge findings
        new_findings = analysis.get("new_findings", [])
        new_contradictions = analysis.get("new_contradictions", [])
        merged_findings = existing_findings + new_findings
        merged_contradictions = existing_contradictions + new_contradictions
        confidence = analysis.get("overall_confidence", 0.0)

        result: dict[str, Any] = {
            "findings": merged_findings,
            "contradictions": merged_contradictions,
            "confidence": confidence,
            "iteration": iteration + 1,
        }

        if analysis.get("needs_user_input"):
            result["pending_decision"] = {
                "question": analysis.get("user_input_question", "Please clarify your query."),
                "options": [],
            }

        if not analysis.get("should_continue", True):
            result["should_stop"] = True

        return result


class ReportWriterNode:
    """Generates the final research report from accumulated findings."""

    system_prompt: str = REPORT_WRITER_SYSTEM_PROMPT

    def __init__(self, llm: Any | None = None) -> None:
        self.llm = llm or ChatOpenAI(model="gpt-4o", temperature=0.3)
        self._parser = JsonOutputParser()

    async def __call__(self, state: ResearchState) -> dict:
        """Synthesise all findings into a structured report."""
        findings = state.get("findings", [])
        contradictions = state.get("contradictions", [])
        confidence = state.get("confidence", 0.0)
        mode = state.get("mode", "guided")
        research_plan = state.get("research_plan") or {}

        context_parts: list[str] = [
            f"Research mode: {mode}",
            f"Research goal: {research_plan.get('goal', 'N/A')}",
            f"Overall confidence: {confidence}",
            f"Total findings: {len(findings)}",
            "Findings: " + json.dumps(findings, default=str),
        ]
        if contradictions:
            context_parts.append("Contradictions: " + json.dumps(contradictions, default=str))

        context = "\n".join(context_parts)

        from langchain_core.messages import HumanMessage

        llm_messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=context),
        ]

        logger.info("ReportWriterNode: generating final report")
        response = await self.llm.ainvoke(llm_messages)
        report = await self._parser.ainvoke(response)

        return {
            "messages": [AIMessage(content=json.dumps(report, indent=2))],
            "should_stop": True,
        }
