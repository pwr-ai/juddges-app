"""
Adapter between the ``schematize`` package and the juddges HTTP API.

``schematize.SchemaGenerator`` is written for terminal use: its default graph ends
in a ``summarizer -> human_message -> chat`` loop where ``input()`` blocks, and
``use_interrupt=True`` is not implemented upstream. This module provides:

* ``JuddgesSchemaGenerator`` - same pipeline, but the problem-definition feedback
  step uses a LangGraph ``interrupt`` (resumed with ``Command(resume=...)``) and the
  run ends right after data-grounded refinement.
* ``SupabaseChunkRetriever`` - ``DocumentRetriever`` backed by hybrid chunk search.
* converters between ``schematize.SchemaFields`` and JSON Schema, and
  ``state_to_response`` which turns graph state into JSON-serialisable values.
"""

import asyncio
import dataclasses
from typing import Any

from juddges_search.llms import get_default_llm
from juddges_search.retrieval.supabase_search import search_chunks
from langgraph.graph import END, START, StateGraph
from loguru import logger
from schematize import (
    AgentState,
    SchemaFields,
    SchemaGenerator,
    SchemaGeneratorPrompts,
    load_prompts,
)
from schematize.agents.agent_state import msg_usage
from schematize.agents.schema_generator import HumanFeedbackWithInterrupt

# Latency budget: the Next.js proxy gives the whole request ~300 s.
GRAPH_RECURSION_LIMIT = 50
# Structured schema outputs are large; the shared default (30 s) times out.
# openai-level retries are off because schematize's RetryingChain retries
# already (max_retries=1), keeping the worst case under the proxy budget.
GENERATOR_REQUEST_TIMEOUT_SECONDS = 150.0
GENERATOR_MAX_COMPLETION_TOKENS = 16000
GENERATOR_LLM_MAX_RETRIES = 0

_CONFIDENCE_LEVELS = {"high": 0.9, "medium": 0.7, "low": 0.4}
_FIELD_TYPE_TO_JSON = {
    "string": "string",
    "integer": "integer",
    "boolean": "boolean",
    "float": "number",
    "number": "number",
}


# ---------------------------------------------------------------------------
# Schema converters
# ---------------------------------------------------------------------------


def _as_field_dicts(schema: SchemaFields | dict[str, Any]) -> list[dict[str, Any]]:
    dumped = (
        schema.model_dump(mode="json") if isinstance(schema, SchemaFields) else schema
    )
    return list(dumped.get("fields") or [])


def schema_fields_to_json_schema(
    schema: SchemaFields | dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Convert schematize ``SchemaFields`` (or its dict dump) into a JSON Schema object.

    All properties are listed in ``required`` and ``additionalProperties`` is false,
    which is what OpenAI structured output (used by the extractor) demands.
    Returns None when there is no schema or it has no fields. A dict that already
    looks like JSON Schema (has ``properties``) is returned unchanged.
    """
    if schema is None:
        return None
    if isinstance(schema, dict) and "properties" in schema and "fields" not in schema:
        return schema or None

    properties: dict[str, Any] = {}
    for field in _as_field_dicts(schema):
        name = field.get("name")
        if not name:
            continue
        type_ = str(field.get("type_") or "string")
        prop: dict[str, Any]
        enum_values = list(field.get("enum_values") or [])
        if type_ == "enum" and enum_values:
            prop = {"type": "string", "enum": enum_values}
        elif type_ == "enum":
            prop = {"type": "string"}  # an empty enum would reject every value
        else:
            prop = {"type": _FIELD_TYPE_TO_JSON.get(type_, "string")}
        if field.get("description"):
            prop["description"] = field["description"]
        properties[name] = prop

    if not properties:
        return None
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def json_schema_to_schema_fields(
    schema: dict[str, Any] | None,
) -> SchemaFields | None:
    """
    Best-effort conversion of a JSON Schema object into ``SchemaFields``.

    Unknown or nested types degrade to ``string``. Returns None for empty input.
    """
    if not schema:
        return None
    if "fields" in schema and "properties" not in schema:
        return SchemaFields.model_validate(schema)

    fields: list[dict[str, Any]] = []
    for name, prop in (schema.get("properties") or {}).items():
        prop = prop if isinstance(prop, dict) else {}
        description = prop.get("description") or name
        if isinstance(prop.get("enum"), list) and prop["enum"]:
            fields.append(
                {
                    "name": name,
                    "type_": "enum",
                    "enum_name": "".join(p.capitalize() for p in name.split("_"))
                    or "Enum",
                    "enum_values": [str(v) for v in prop["enum"]],
                    "description": description,
                }
            )
            continue
        json_type = prop.get("type")
        if json_type in ("array", "object") or isinstance(json_type, list):
            logger.warning(
                f"Flattening unsupported JSON Schema type {json_type!r} of "
                f"field '{name}' to string"
            )
        type_ = {
            "string": "string",
            "integer": "integer",
            "boolean": "boolean",
            "number": "float",
        }.get(json_type if isinstance(json_type, str) else "", "string")
        fields.append({"name": name, "type_": type_, "description": description})

    if not fields:
        return None
    return SchemaFields.model_validate({"fields": fields})


# ---------------------------------------------------------------------------
# State <-> API
# ---------------------------------------------------------------------------


def confidence_from_assessment(assessment: dict[str, Any] | None) -> float | None:
    """Map schematize's high/medium/low confidence onto a 0-1 score."""
    if not assessment:
        return None
    return _CONFIDENCE_LEVELS.get(str(assessment.get("confidence", "")).lower())


def _serialise_message(message: Any) -> Any:
    if hasattr(message, "model_dump"):
        return message.model_dump(mode="json")
    return message


def state_to_response(state: dict[str, Any]) -> dict[str, Any]:
    """
    Turn raw graph state into JSON-serialisable values for the HTTP layer.

    ``current_schema`` becomes JSON Schema, messages become plain dicts, the
    LangGraph ``__interrupt__`` marker and bulky bookkeeping (schema_history,
    token_usage, retrieved documents) are dropped.
    """
    merged = state.get("merged_data_assessment")
    return {
        "messages": [_serialise_message(m) for m in state.get("messages") or []],
        "problem_help": state.get("problem_help"),
        "problem_definition": state.get("problem_definition"),
        "current_schema": schema_fields_to_json_schema(state.get("current_schema")),
        "refinement_rounds": state.get("refinement_rounds") or 0,
        "data_refinement_rounds": state.get("data_refinement_rounds") or 0,
        "assessment_result": state.get("assessment_result"),
        "merged_data_assessment": merged,
        "confidence_score": confidence_from_assessment(merged),
    }


def build_initial_state(
    user_input: str, current_schema: dict[str, Any] | None = None
) -> AgentState:
    """Initial graph state; only fields declared by ``schematize.AgentState``."""
    return AgentState(
        messages=[],
        user_input=user_input,
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=json_schema_to_schema_fields(current_schema),
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        final_messages=[],
        end_conversation=None,
        token_usage=[],
    )


def graph_config(thread_id: str) -> dict[str, Any]:
    """ainvoke config: thread id plus a hard cap on graph supersteps."""
    return {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": GRAPH_RECURSION_LIMIT,
    }


# ---------------------------------------------------------------------------
# Retriever
# ---------------------------------------------------------------------------


class SupabaseChunkRetriever:
    """
    ``schematize.DocumentRetriever`` over the curated set (hybrid chunk search).

    schematize runs ``asyncio.run`` inside a worker thread, i.e. in a fresh event
    loop, so this must not touch loop-bound async clients. ``search_chunks`` only
    uses the sync Supabase client and sync httpx (TEI), which is loop-agnostic.
    """

    chunks_per_document = 5

    async def __call__(self, query: str, max_docs: int = 100) -> list[str]:
        try:
            # search_chunks does blocking sync I/O under an async signature; run it
            # in a worker thread with its own loop so the main loop stays free.
            chunks = await asyncio.to_thread(
                lambda: asyncio.run(
                    search_chunks(query, max_chunks=max_docs * self.chunks_per_document)
                )
            )
        except Exception as e:
            logger.error(f"Schema data-assessment retrieval failed: {e}")
            return []
        if not chunks:
            logger.warning(f"Schema data-assessment retrieval found nothing: {query!r}")

        grouped: dict[str, list[Any]] = {}
        for chunk in chunks:
            grouped.setdefault(chunk.document_id, []).append(chunk)

        documents: list[str] = []
        for document_id, doc_chunks in list(grouped.items())[:max_docs]:
            metadata = doc_chunks[0].metadata or {}
            header = [f"Document: {document_id}"]
            for key, label in (("title", "Title"), ("case_number", "Case number")):
                if metadata.get(key):
                    header.append(f"{label}: {metadata[key]}")
            body = "\n\n".join(c.chunk_text for c in doc_chunks)
            documents.append("\n".join(header) + "\n\n" + body)
        return documents


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------


class JuddgesSchemaGenerator(SchemaGenerator):
    """``SchemaGenerator`` with an interrupt-based, server-safe graph."""

    async def data_assessment_node(self, state: AgentState) -> dict[str, Any]:
        """
        Async replacement for ``SchemaDataAssessmentAgent.__call__``.

        Upstream wraps ``_process_documents`` in ``asyncio.run`` which, under
        ``graph.ainvoke``, executes in a throwaway loop; the shared ChatOpenAI's
        async httpx pool then binds to a loop that is closed afterwards. Awaiting
        it here keeps everything on the request's loop.
        """
        agent = self.schema_data_assessment
        responses, results = await agent._process_documents(
            state["query"],
            state["user_input"],
            state["problem_help"],
            state["user_feedback"],
            state["problem_definition"],
            state["current_schema"],
        )
        if not results:
            logger.warning(
                "Schema data assessment got no documents; skipping data-grounded refinement"
            )
        return {
            "messages": responses,
            "data_assessment_results": results,
            "token_usage": [msg_usage(r, type(agent).__name__) for r in responses],
        }

    def route_after_data_assessment(self, state: AgentState) -> str:
        """No documents means nothing to ground on: finish instead of merging nothing."""
        if not state.get("data_assessment_results"):
            return END
        return "llm_schema_data_assessment_merger"

    def build_graph(self, compilation_kwargs: dict[str, Any] | None = None):
        builder: Any = StateGraph(AgentState)

        if self.skip_problem_definition:
            builder.add_edge(START, "llm_query_generator")
        else:
            builder.add_node("llm_problem_definer_helper", self.problem_definer_helper)
            builder.add_node("user_feedback_node", HumanFeedbackWithInterrupt())
            builder.add_node("llm_problem_definer", self.problem_definer)
            builder.add_edge(START, "llm_problem_definer_helper")
            builder.add_edge("llm_problem_definer_helper", "user_feedback_node")
            builder.add_edge("user_feedback_node", "llm_problem_definer")
            builder.add_edge("llm_problem_definer", "llm_query_generator")

        builder.add_node("llm_query_generator", self.query_generator)
        builder.add_node("llm_schema_generator", self.schema_generator)
        builder.add_edge("llm_query_generator", "llm_schema_generator")

        # Upstream routers return "summarizer" when the pipeline is done; we have
        # no summarizer/chat phase, so that means END.
        after_refinement = (
            END if self.skip_data_grounded else "llm_schema_data_assessment"
        )

        if self.skip_refinement:
            builder.add_edge("llm_schema_generator", after_refinement)
        else:
            builder.add_node("llm_schema_assessment", self.schema_assessment)
            builder.add_node("llm_schema_refiner", self.schema_refiner)
            builder.add_edge("llm_schema_generator", "llm_schema_assessment")
            builder.add_conditional_edges(
                "llm_schema_assessment",
                self.route_after_assessment,
                {
                    "llm_schema_refiner": "llm_schema_refiner",
                    "llm_schema_data_assessment": after_refinement,
                    "summarizer": END,
                },
            )
            builder.add_edge("llm_schema_refiner", "llm_schema_assessment")

        if not self.skip_data_grounded:
            # Async node: runs on the request's event loop (see data_assessment_node).
            builder.add_node("llm_schema_data_assessment", self.data_assessment_node)
            builder.add_node(
                "llm_schema_data_assessment_merger", self.schema_data_assessment_merger
            )
            builder.add_node("llm_schema_data_refiner", self.schema_data_refiner)
            builder.add_conditional_edges(
                "llm_schema_data_assessment",
                self.route_after_data_assessment,
                {
                    "llm_schema_data_assessment_merger": "llm_schema_data_assessment_merger",
                    END: END,
                },
            )
            builder.add_conditional_edges(
                "llm_schema_data_assessment_merger",
                self.route_after_data_assessment_merger,
                {
                    "llm_schema_data_refiner": "llm_schema_data_refiner",
                    "summarizer": END,
                },
            )
            builder.add_edge("llm_schema_data_refiner", "llm_schema_data_assessment")

        return builder.compile(**(compilation_kwargs or {}))


def _build_prompts() -> SchemaGeneratorPrompts:
    prompts = load_prompts(language="en", system_type="law")
    return SchemaGeneratorPrompts(
        **{f.name: prompts[f.name] for f in dataclasses.fields(SchemaGeneratorPrompts)}
    )


def build_schema_generator(
    checkpointer: Any, llm: Any = None, retriever: Any = None
) -> JuddgesSchemaGenerator:
    """Factory used by both the /schemas/generate and /schema-generator/chat endpoints."""
    return JuddgesSchemaGenerator(
        llm
        if llm is not None
        else get_default_llm(
            use_mini_model=True,
            request_timeout=GENERATOR_REQUEST_TIMEOUT_SECONDS,
            max_retries=GENERATOR_LLM_MAX_RETRIES,
            max_completion_tokens=GENERATOR_MAX_COMPLETION_TOKENS,
        ),
        retriever if retriever is not None else SupabaseChunkRetriever(),
        _build_prompts(),
        use_interrupt=False,
        graph_compilation_kwargs={"checkpointer": checkpointer},
        recursion_limit=GRAPH_RECURSION_LIMIT,
        min_refinement_rounds=0,
        max_refinement_rounds=1,
        min_data_refinement_rounds=0,
        max_data_refinement_rounds=1,
        data_assessment_top_k=20,
        data_assessment_num_examples=3,
        max_retries=1,
    )
