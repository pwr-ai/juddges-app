"""Tests for Research Agent graph nodes."""


from research_agent.nodes import AnalyzerNode, PlannerNode, ReportWriterNode


class TestPlannerNode:
    def test_planner_exists(self):
        assert callable(PlannerNode)

    def test_planner_has_system_prompt(self):
        planner = PlannerNode.__new__(PlannerNode)
        assert hasattr(planner, "system_prompt")


class TestAnalyzerNode:
    def test_analyzer_exists(self):
        assert callable(AnalyzerNode)

    def test_analyzer_has_system_prompt(self):
        analyzer = AnalyzerNode.__new__(AnalyzerNode)
        assert hasattr(analyzer, "system_prompt")


class TestReportWriterNode:
    def test_report_writer_exists(self):
        assert callable(ReportWriterNode)

    def test_report_writer_has_system_prompt(self):
        writer = ReportWriterNode.__new__(ReportWriterNode)
        assert hasattr(writer, "system_prompt")
