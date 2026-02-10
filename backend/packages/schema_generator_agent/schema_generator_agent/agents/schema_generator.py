from typing import Any

import yaml
from ai_tax_search.models import DocumentType
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from schema_generator_agent.agents.agent_state import AgentState
from schema_generator_agent.agents.basic_agents import (
    ProblemDefinerAgent,
    ProblemDefinerHelperAgent,
    SchemaAssessmentAgent,
    SchemaGeneratorAgent,
    SchemaRefinerAgent,
)
from schema_generator_agent.agents.data_agents import (
    QueryGeneratorAgent,
    SchemaDataAssessmentAgent,
    SchemaDataAssessmentMergerAgent,
    SchemaDataRefinerAgent,
)
from schema_generator_agent.settings import PROMPTS_PATH


class HumanFeedback:
    """Human feedback node."""

    def __call__(self, state: AgentState) -> dict[str, Any]:
        feedback = input("Please provide feedback: ")
        return {"user_feedback": feedback, "messages": [HumanMessage(content=feedback)]}


class HumanFeedbackWithInterrupt:
    """Human feedback node with interrupt."""

    def __call__(self, state: AgentState) -> dict[str, Any]:
        value = interrupt({"user_feedback": state["user_feedback"]})
        return {"user_feedback": value}


class SchemaGenerator:
    """Multi-agent system for generating, refining, and assessing legal schemas."""

    def __init__(
        self,
        llm: BaseChatModel,
        document_type: DocumentType,
        prompt_problem_definer_helper: str,
        prompt_problem_definer: str,
        prompt_schema_generator: str,
        prompt_schema_assessment: str,
        prompt_schema_refiner: str,
        prompt_query_generator: str,
        prompt_schema_data_assessment: str,
        prompt_schema_data_assessment_merger: str,
        prompt_schema_data_refiner: str,
        use_interrupt: bool = False,
        graph_compilation_kwargs: dict[str, Any] | None = None,
    ) -> None:
        self.problem_definer_helper = ProblemDefinerHelperAgent(llm, prompt_problem_definer_helper)
        self.use_interrupt = use_interrupt
        if not self.use_interrupt:
            self.human_feedback = HumanFeedback()
        else:
            self.human_feedback = HumanFeedbackWithInterrupt()
        self.problem_definer = ProblemDefinerAgent(llm, prompt_problem_definer)

        self.schema_generator = SchemaGeneratorAgent(llm, prompt_schema_generator)
        self.schema_assessment = SchemaAssessmentAgent(llm, prompt_schema_assessment)
        self.schema_refiner = SchemaRefinerAgent(llm, prompt_schema_refiner)

        self.query_generator = QueryGeneratorAgent(llm, prompt_query_generator)
        self.schema_data_assessment = SchemaDataAssessmentAgent(
            llm, prompt_schema_data_assessment, document_type
        )
        self.schema_data_assessment_merger = SchemaDataAssessmentMergerAgent(
            llm, prompt_schema_data_assessment_merger
        )
        self.schema_data_refiner = SchemaDataRefinerAgent(llm, prompt_schema_data_refiner)

        self.graph = self.build_graph(compilation_kwargs=graph_compilation_kwargs)

    def build_graph(self, compilation_kwargs: dict[str, Any] | None = None):
        graph_builder = StateGraph(AgentState)

        graph_builder.add_node("llm_problem_definer_helper", self.problem_definer_helper)
        graph_builder.add_node("user_feedback_node", self.human_feedback)
        graph_builder.add_node("llm_problem_definer", self.problem_definer)

        graph_builder.add_node("llm_query_generator", self.query_generator)

        graph_builder.add_node("llm_schema_generator", self.schema_generator)
        graph_builder.add_node("llm_first_schema_assessment", self.schema_assessment)
        graph_builder.add_node("llm_schema_refiner", self.schema_refiner)
        graph_builder.add_node("llm_schema_assessment", self.schema_assessment)
        graph_builder.add_node("llm_schema_data_assessment", self.schema_data_assessment)
        graph_builder.add_node(
            "llm_schema_data_assessment_merger", self.schema_data_assessment_merger
        )
        graph_builder.add_node("llm_schema_data_refiner", self.schema_data_refiner)

        # Add edges
        graph_builder.add_edge(START, "llm_problem_definer_helper")
        graph_builder.add_edge("llm_problem_definer_helper", "user_feedback_node")
        graph_builder.add_edge("user_feedback_node", "llm_problem_definer")

        graph_builder.add_edge("llm_problem_definer", "llm_query_generator")

        graph_builder.add_edge("llm_query_generator", "llm_schema_generator")
        graph_builder.add_edge("llm_schema_generator", "llm_schema_assessment")

        graph_builder.add_conditional_edges("llm_schema_assessment", route_after_assessment)
        graph_builder.add_edge("llm_schema_refiner", "llm_schema_assessment")

        graph_builder.add_edge("llm_schema_data_assessment", "llm_schema_data_assessment_merger")
        graph_builder.add_conditional_edges(
            "llm_schema_data_assessment_merger", route_after_data_assessment_merger
        )

        graph_builder.add_edge("llm_schema_data_refiner", "llm_schema_data_assessment")

        return graph_builder.compile(**(compilation_kwargs or {}))

    def stream_graph_updates(self, user_input: str, current_schema: dict = None) -> None:
        if self.use_interrupt:
            raise NotImplementedError(
                "Can't use function stream_graph_updates with use_interrupt set!"
            )
        print("👤 Human:")
        print(user_input)
        print("-" * 50)
        """Process user input through the multi-agent workflow and display results."""
        initial_state = AgentState(
            messages=[],
            user_input=user_input,
            problem_help=None,
            user_feedback=None,
            problem_definition=None,
            query=None,
            current_schema=current_schema,
            schema_history=[],
            refinement_rounds=0,
            assessment_result=None,
            data_assessment_results=None,
            merged_data_assessment=None,
            data_refinement_rounds=0,
        )

        for state in self.graph.stream(initial_state, stream_mode="values"):
            # Get the full content from the latest message
            if state["messages"]:
                full_content = state["messages"][-1].content

                # Print with proper formatting to avoid truncation
                if state["messages"][-1].type == "human":
                    print("👤 Human:")
                else:
                    print("🤖 Assistant:")
                print(full_content)
                print("-" * 50)

        return state

    def get_complete_results(self, user_input: str, current_schema: dict = None) -> dict:
        """Process user input and return complete results without display truncation."""
        if self.use_interrupt:
            raise NotImplementedError(
                "Can't use function get_complete_results with use_interrupt set!"
            )

        initial_state = AgentState(
            messages=[],
            user_input=user_input,
            problem_help=None,
            user_feedback=None,
            problem_definition=None,
            query=None,
            current_schema=current_schema,
            schema_history=[],
            refinement_rounds=0,
            assessment_result=None,
            merged_data_assessment=None,
            data_refinement_rounds=0,
        )

        final_state = self.graph.invoke(initial_state)
        return final_state


def route_after_assessment(state: AgentState) -> str:
    """Route to refiner if needs refinement and under max rounds, otherwise to the next node.

    Uses dynamic criteria based on confidence score and refinement needs.
    """
    assessment = state.get("assessment_result", {})
    refinement_rounds = state.get("refinement_rounds", 0)
    confidence = assessment.get("confidence_score", 0.0)

    # Dynamic refinement criteria
    MAX_ROUNDS = 5
    MIN_CONFIDENCE = 0.85

    print(f"Refinement rounds: {refinement_rounds}, Confidence: {confidence:.2f}")

    needs_refinement = assessment.get("needs_refinement", False)
    low_confidence = confidence < MIN_CONFIDENCE
    rounds_available = refinement_rounds < MAX_ROUNDS

    # Continue refinement if needed and rounds available
    if (needs_refinement or low_confidence) and rounds_available:
        return "llm_schema_refiner"

    return "llm_schema_data_assessment"


def route_after_data_assessment_merger(state: AgentState) -> str:
    """Route to refiner if needs refinement and under max rounds, otherwise to the next node.

    Uses dynamic criteria based on confidence score and refinement needs.
    """
    assessment = state.get("merged_data_assessment", {})
    data_refinement_rounds = state.get("data_refinement_rounds", 0)
    confidence = assessment.get("confidence_score", 0.0)

    # Dynamic refinement criteria
    MAX_ROUNDS = 5
    MIN_CONFIDENCE = 0.85

    print(f"Data refinement rounds: {data_refinement_rounds}, Confidence: {confidence:.2f}")

    needs_refinement = assessment.get("needs_refinement", False)
    low_confidence = confidence < MIN_CONFIDENCE
    rounds_available = data_refinement_rounds < MAX_ROUNDS

    # Continue refinement if needed and rounds available
    if (needs_refinement or low_confidence) and rounds_available:
        return "llm_schema_data_refiner"

    return END


def load_prompts(document_type: DocumentType) -> dict[str, str]:
    if document_type == DocumentType.TAX_INTERPRETATION:
        system_type = "tax"
    else:
        system_type = "law"

    prompt_names = [
        "problem_definer_helper",
        "problem_definer",
        "schema_refiner",
        "schema_assessment",
        "schema_generator",
        "query_generator",
        "schema_data_assessment",
        "schema_data_assessment_merger",
        "schema_data_refiner",
    ]
    prompts = {}
    for prompt_config_file in prompt_names:
        with open(PROMPTS_PATH / system_type / f"{prompt_config_file}.yaml", "r") as f:
            prompt_config = yaml.safe_load(f)
        prompts.update(prompt_config)
    return prompts
