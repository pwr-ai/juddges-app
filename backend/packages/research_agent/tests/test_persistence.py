"""Tests for framework-agnostic persistence layer."""

from research_agent.persistence import (
    ResearchFinding,
    ResearchSession,
    SessionStatus,
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
    def test_implements_protocol(self):
        store = SupabaseSessionStore.__new__(SupabaseSessionStore)
        assert hasattr(store, "create_session")
        assert hasattr(store, "update_status")
        assert hasattr(store, "append_finding")
        assert hasattr(store, "append_decision_point")
        assert hasattr(store, "save_report")
        assert hasattr(store, "get_session")
        assert hasattr(store, "list_sessions")


class TestSupabaseCheckpointStore:
    def test_implements_protocol(self):
        store = SupabaseCheckpointStore.__new__(SupabaseCheckpointStore)
        assert hasattr(store, "save")
        assert hasattr(store, "load_latest")
        assert hasattr(store, "load_step")
