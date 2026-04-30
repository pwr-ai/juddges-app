"""Tests for Research Agent graph assembly."""

from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langgraph.graph.state import CompiledStateGraph

from research_agent.graph import ResearchAgent

# A lightweight fake LLM that avoids the need for an OPENAI_API_KEY.
_FAKE_LLM = FakeListChatModel(responses=["{}"])


class TestResearchAgentGraph:
    def test_creates_compiled_graph(self):
        agent = ResearchAgent(llm=_FAKE_LLM)
        assert isinstance(agent.graph, CompiledStateGraph)

    def test_graph_has_expected_nodes(self):
        agent = ResearchAgent(llm=_FAKE_LLM)
        node_names = set(agent.graph.nodes.keys())
        expected = {"planner", "executor", "analyzer", "report_writer"}
        assert expected.issubset(node_names)

    def test_initial_state_factory(self):
        agent = ResearchAgent(llm=_FAKE_LLM)
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
        agent = ResearchAgent(llm=_FAKE_LLM, max_iterations=5)
        state = agent.create_initial_state("s", "guided", "q")
        assert state["max_iterations"] == 5
