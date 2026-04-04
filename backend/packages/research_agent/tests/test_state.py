"""Tests for Research Agent state definition."""

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
        assert "messages" in ResearchState.__annotations__
        assert "research_plan" in ResearchState.__annotations__
        assert "pending_decision" in ResearchState.__annotations__
