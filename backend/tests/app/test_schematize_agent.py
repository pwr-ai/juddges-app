"""
Unit tests for app.schemas_pkg.schematize_agent (adapter around the schematize package).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from juddges_search.models import DocumentChunk
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command
from schematize import SchemaFields
from schematize.agents.basic_agents import (
    ProblemDefinerAgent,
    ProblemDefinerHelperAgent,
    SchemaAssessmentAgent,
    SchemaGeneratorAgent,
)
from schematize.agents.data_agents import (
    QueryGeneratorAgent,
    SchemaDataAssessmentAgent,
    SchemaDataAssessmentMergerAgent,
)

from app.schemas_pkg import schematize_agent as sa
from app.schemas_pkg.schematize_agent import (
    JuddgesSchemaGenerator,
    SupabaseChunkRetriever,
    build_schema_generator,
    confidence_from_assessment,
    json_schema_to_schema_fields,
    schema_fields_to_json_schema,
    state_to_response,
)
from app.server import app

_FIELDS = SchemaFields.model_validate(
    {
        "fields": [
            {"name": "amount", "type_": "float", "description": "Sum awarded"},
            {"name": "year", "type_": "integer", "description": "Decision year"},
            {"name": "appealed", "type_": "boolean", "description": "Was appealed"},
            {"name": "party", "type_": "string", "description": "Main party"},
            {
                "name": "outcome",
                "type_": "enum",
                "enum_name": "Outcome",
                "enum_values": ["granted", "denied"],
                "description": "Result",
            },
        ]
    }
)


# ---------------------------------------------------------------------------
# Converters
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestConverters:
    def test_fields_to_json_schema(self):
        schema = schema_fields_to_json_schema(_FIELDS)
        assert schema is not None
        assert schema["type"] == "object"
        assert schema["additionalProperties"] is False
        assert schema["required"] == list(schema["properties"])
        props = schema["properties"]
        assert props["amount"] == {"type": "number", "description": "Sum awarded"}
        assert props["year"]["type"] == "integer"
        assert props["appealed"]["type"] == "boolean"
        assert props["outcome"] == {
            "type": "string",
            "enum": ["granted", "denied"],
            "description": "Result",
        }

    def test_accepts_dict_dump(self):
        assert schema_fields_to_json_schema(
            _FIELDS.model_dump(mode="json")
        ) == schema_fields_to_json_schema(_FIELDS)

    def test_empty_inputs_give_none(self):
        assert schema_fields_to_json_schema(None) is None
        assert schema_fields_to_json_schema({"fields": []}) is None
        assert json_schema_to_schema_fields(None) is None
        assert json_schema_to_schema_fields({}) is None
        assert json_schema_to_schema_fields({"properties": {}}) is None

    def test_json_schema_passthrough(self):
        existing = {"type": "object", "properties": {"a": {"type": "string"}}}
        assert schema_fields_to_json_schema(existing) is existing

    def test_round_trip(self):
        back = json_schema_to_schema_fields(schema_fields_to_json_schema(_FIELDS))
        assert back is not None
        assert {f.name: f.type_.value for f in back.fields} == {
            "amount": "float",
            "year": "integer",
            "appealed": "boolean",
            "party": "string",
            "outcome": "enum",
        }
        outcome = next(f for f in back.fields if f.name == "outcome")
        assert outcome.enum_values == ["granted", "denied"]
        assert outcome.enum_name

    def test_unknown_types_degrade_to_string(self):
        fields = json_schema_to_schema_fields(
            {
                "properties": {
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "meta": {"type": "object"},
                    "nothing": "not-a-dict",
                }
            }
        )
        assert fields is not None
        assert [f.type_.value for f in fields.fields] == ["string"] * 3

    def test_confidence_mapping(self):
        assert confidence_from_assessment({"confidence": "high"}) == 0.9
        assert confidence_from_assessment({"confidence": "Medium"}) == 0.7
        assert confidence_from_assessment({"confidence": "low"}) == 0.4
        assert confidence_from_assessment({"confidence": "??"}) is None
        assert confidence_from_assessment(None) is None

    def test_state_to_response_is_json_serialisable(self):
        import json

        out = state_to_response(
            {
                "messages": [AIMessage(content="hi")],
                "current_schema": _FIELDS,
                "merged_data_assessment": {"confidence": "high"},
                "__interrupt__": ["x"],
                "token_usage": [{"node": "a"}],
            }
        )
        json.dumps(out)
        assert out["current_schema"]["properties"]["party"]["type"] == "string"
        assert out["confidence_score"] == 0.9
        assert out["messages"][0]["content"] == "hi"
        assert "__interrupt__" not in out
        assert "token_usage" not in out


# ---------------------------------------------------------------------------
# Retriever
# ---------------------------------------------------------------------------


def _chunk(doc: str, idx: int, text: str, **metadata) -> DocumentChunk:
    return DocumentChunk(
        document_id=doc, chunk_id=idx, chunk_text=text, metadata=metadata
    )


@pytest.mark.unit
class TestSupabaseChunkRetriever:
    async def test_groups_chunks_by_document_in_rank_order(self):
        chunks = [
            _chunk("b", 1, "b-one", title="Title B"),
            _chunk("a", 1, "a-one", case_number="I C 1/20"),
            _chunk("b", 2, "b-two"),
            _chunk("c", 1, "c-one"),
        ]
        with patch.object(sa, "search_chunks", AsyncMock(return_value=chunks)) as m:
            docs = await SupabaseChunkRetriever()("query", max_docs=2)

        m.assert_awaited_once()
        assert m.await_args.args[0] == "query"
        assert len(docs) == 2
        assert all(isinstance(d, str) for d in docs)
        assert docs[0].startswith("Document: b")
        assert "Title: Title B" in docs[0]
        assert "b-one" in docs[0] and "b-two" in docs[0]
        assert "Case number: I C 1/20" in docs[1]
        assert "c-one" not in "".join(docs)

    async def test_failure_returns_empty_list(self):
        with patch.object(
            sa, "search_chunks", AsyncMock(side_effect=RuntimeError("down"))
        ):
            assert await SupabaseChunkRetriever()("q") == []

    async def test_no_hits(self):
        with patch.object(sa, "search_chunks", AsyncMock(return_value=[])):
            assert await SupabaseChunkRetriever()("q") == []


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def _generator(checkpointer=None) -> JuddgesSchemaGenerator:
    return build_schema_generator(
        checkpointer, llm=MagicMock(), retriever=SupabaseChunkRetriever()
    )


@pytest.mark.unit
class TestGraphTopology:
    def test_nodes_and_edges(self):
        graph = _generator(MemorySaver()).graph.get_graph()
        nodes = set(graph.nodes)
        assert {
            "user_feedback_node",
            "llm_problem_definer_helper",
            "llm_schema_data_assessment_merger",
            "llm_schema_data_refiner",
        } <= nodes
        assert not nodes & {"summarizer", "human_message", "chat"}

        edges = {(e.source, e.target) for e in graph.edges}
        assert ("llm_schema_data_assessment_merger", "__end__") in edges
        assert ("llm_schema_data_assessment_merger", "llm_schema_data_refiner") in edges
        assert ("llm_problem_definer_helper", "user_feedback_node") in edges

    def test_latency_budget(self):
        gen = _generator()
        assert gen.max_refinement_rounds == 0
        assert gen.min_refinement_rounds == 0
        assert gen.max_data_refinement_rounds == 1
        assert gen.min_data_refinement_rounds == 0
        assert gen.schema_data_assessment.top_k == 20
        assert sa.graph_config("t")["recursion_limit"] == 50


# ---------------------------------------------------------------------------
# End-to-end run with fake agents (start -> interrupt -> resume)
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_agents(monkeypatch):
    class Calls(list):
        assessment_results: list[str]

    calls = Calls()

    def patch_call(cls, fn):
        def wrapper(self, state):
            calls.append(cls.__name__)
            return fn(state)

        monkeypatch.setattr(cls, "__call__", wrapper)

    patch_call(
        ProblemDefinerHelperAgent,
        lambda s: {
            "messages": [AIMessage(content="Which court?")],
            "problem_help": "Which court?",
        },
    )
    patch_call(
        ProblemDefinerAgent,
        lambda s: {
            "messages": [AIMessage(content="Problem: " + s["user_feedback"])],
            "problem_definition": "Problem: " + s["user_feedback"],
        },
    )
    patch_call(QueryGeneratorAgent, lambda s: {"query": "tax appeals"})
    patch_call(
        SchemaGeneratorAgent,
        lambda s: {"current_schema": _FIELDS, "schema_history": [_FIELDS]},
    )
    patch_call(
        SchemaAssessmentAgent,
        lambda s: {"assessment_result": {"needs_refinement": False}},
    )

    async def fake_process(self, *args):
        calls.append("SchemaDataAssessmentAgent")
        return [AIMessage(content="ok")], list(calls.assessment_results)

    calls.assessment_results = ["ok"]
    monkeypatch.setattr(SchemaDataAssessmentAgent, "_process_documents", fake_process)
    patch_call(
        SchemaDataAssessmentMergerAgent,
        lambda s: {
            "merged_data_assessment": {
                "summary": "Looks fine",
                "main_issues": [],
                "strengths": ["typed"],
                "needs_refinement": False,
                "confidence": "high",
                "priority_areas": [],
            }
        },
    )
    return calls


@pytest.mark.unit
class TestFakeRun:
    async def test_start_interrupt_resume_via_endpoints(self, fake_agents, monkeypatch):
        import app.schemas_pkg.generation as generation

        checkpointer = MemorySaver()
        monkeypatch.setattr(app.state, "checkpointer", checkpointer, raising=False)
        original_build = generation.build_schema_generator
        monkeypatch.setattr(
            generation,
            "build_schema_generator",
            lambda cp: original_build(
                cp, llm=MagicMock(), retriever=SupabaseChunkRetriever()
            ),
        )
        monkeypatch.setattr(generation, "_generation_sessions", {})

        headers = {"X-API-Key": "test-api-key-12345"}
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            started = await client.post(
                "/schemas/generate",
                json={"prompt": "Extract tax data", "document_type": "judgment"},
                headers=headers,
            )
            assert started.status_code == 201, started.text
            body = started.json()
            # Paused at the human feedback interrupt: helper ran, nothing else.
            assert body["problem_definition"] is None
            assert body["current_schema"] is None
            assert fake_agents == ["ProblemDefinerHelperAgent"]

            resumed = await client.post(
                f"/schemas/generate/{body['session_id']}/refine",
                json={"user_feedback": "Polish tax courts"},
                headers=headers,
            )
            assert resumed.status_code == 200, resumed.text
            out = resumed.json()

        assert out["problem_definition"] == "Problem: Polish tax courts"
        schema = out["current_schema"]
        assert schema["type"] == "object"
        assert schema["properties"]["outcome"]["enum"] == ["granted", "denied"]
        assert schema["properties"]["amount"]["type"] == "number"
        assert out["confidence_score"] == 0.9
        # Finished at END right after the data merger: no chat phase.
        assert fake_agents[-1] == "SchemaDataAssessmentMergerAgent"
        assert "ChatAgent" not in fake_agents

    async def test_checkpoint_round_trips_schema_fields(self, fake_agents):
        saver = MemorySaver()
        gen = _generator(saver)
        cfg = sa.graph_config("serde")
        await gen.graph.ainvoke(sa.build_initial_state("q"), config=cfg)
        await gen.graph.ainvoke(
            Command(resume="fb"),
            config=cfg,
        )
        state = (await gen.graph.aget_state(cfg)).values
        # Whatever form the checkpoint serde returns (model or dict), the
        # converter must produce the same JSON Schema.
        assert schema_fields_to_json_schema(
            state["current_schema"]
        ) == schema_fields_to_json_schema(_FIELDS)

        serde = saver.serde
        restored = serde.loads_typed(serde.dumps_typed(_FIELDS))
        assert schema_fields_to_json_schema(restored) == schema_fields_to_json_schema(
            _FIELDS
        )

    async def test_empty_retrieval_skips_merger_and_ends(self, fake_agents):
        fake_agents.assessment_results.clear()
        gen = _generator(MemorySaver())
        cfg = sa.graph_config("empty")
        await gen.graph.ainvoke(sa.build_initial_state("q"), config=cfg)
        state = await gen.graph.ainvoke(Command(resume="fb"), config=cfg)
        assert "SchemaDataAssessmentAgent" in fake_agents
        assert "SchemaDataAssessmentMergerAgent" not in fake_agents
        assert state["merged_data_assessment"] is None
        assert state["current_schema"] is not None

    async def test_resume_on_finished_thread_returns_state(self, fake_agents):
        """Pins current behaviour: no pending interrupt, so the final state is returned."""
        gen = _generator(MemorySaver())
        cfg = sa.graph_config("finished")
        await gen.graph.ainvoke(sa.build_initial_state("q"), config=cfg)
        first = await gen.graph.ainvoke(Command(resume="fb"), config=cfg)
        again = await gen.graph.ainvoke(Command(resume="more"), config=cfg)
        assert schema_fields_to_json_schema(
            again["current_schema"]
        ) == schema_fields_to_json_schema(first["current_schema"])


@pytest.mark.unit
class TestDataAssessmentNode:
    async def test_async_node_runs_twice_on_the_calling_loop(self):
        import asyncio

        loops: list[asyncio.AbstractEventLoop] = []

        class FakeChain:
            async def ainvoke(self, inputs):
                loops.append(asyncio.get_running_loop())
                await asyncio.sleep(0)
                return AIMessage(content="assessment")

        gen = _generator()
        assert asyncio.iscoroutinefunction(gen.data_assessment_node)
        gen.schema_data_assessment.chain = FakeChain()
        docs = [_chunk("a", 1, "text a"), _chunk("b", 1, "text b")]
        state = {
            **sa.build_initial_state("q"),
            "query": "tax",
            "problem_help": "h",
            "user_feedback": "f",
            "problem_definition": "d",
            "current_schema": _FIELDS,
        }
        with patch.object(sa, "search_chunks", AsyncMock(return_value=docs)):
            first = await gen.data_assessment_node(state)
            second = await gen.data_assessment_node(state)

        running = asyncio.get_running_loop()
        assert loops and all(loop is running for loop in loops)
        assert first["data_assessment_results"] == ["assessment"] * 2
        assert second["data_assessment_results"] == ["assessment"] * 2
        assert len(second["token_usage"]) == 2

    def test_route_after_data_assessment(self):
        gen = _generator()
        assert (
            gen.route_after_data_assessment({"data_assessment_results": []})
            == "__end__"
        )
        assert (
            gen.route_after_data_assessment({"data_assessment_results": ["x"]})
            == "llm_schema_data_assessment_merger"
        )

    def test_skip_data_grounded_builds(self):
        gen = JuddgesSchemaGenerator(
            MagicMock(),
            SupabaseChunkRetriever(),
            sa._build_prompts(),
            graph_compilation_kwargs={"checkpointer": MemorySaver()},
            skip_data_grounded=True,
        )
        nodes = set(gen.graph.get_graph().nodes)
        assert "llm_schema_data_assessment" not in nodes
        assert "llm_schema_assessment" in nodes


@pytest.mark.unit
class TestLlmAndConverterEdges:
    def test_llm_settings(self):
        with patch.object(sa, "get_default_llm") as m:
            m.return_value = MagicMock()
            build_schema_generator(MemorySaver(), retriever=SupabaseChunkRetriever())
        kwargs = m.call_args.kwargs
        assert kwargs["use_mini_model"] is True
        assert kwargs["request_timeout"] == 150.0
        assert kwargs["max_retries"] == 0
        assert kwargs["max_completion_tokens"] == 16000

    def test_empty_enum_becomes_string(self):
        schema = schema_fields_to_json_schema(
            {
                "fields": [
                    {
                        "name": "kind",
                        "type_": "enum",
                        "enum_values": [],
                        "description": "d",
                    }
                ]
            }
        )
        assert schema["properties"]["kind"] == {"type": "string", "description": "d"}

    def test_flattening_arrays_warns(self):
        from loguru import logger

        messages: list[str] = []
        sink = logger.add(lambda m: messages.append(str(m)), level="WARNING")
        try:
            json_schema_to_schema_fields(
                {"properties": {"tags": {"type": "array", "items": {"type": "string"}}}}
            )
        finally:
            logger.remove(sink)
        assert any("tags" in m and "array" in m for m in messages)
