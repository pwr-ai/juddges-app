from typing import Any

from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.prompts import PromptTemplate

from schema_generator_agent.agents.agent_state import AgentState


class ProblemDefinerHelperAgent:
    """Routes user requests to the appropriate processing agent."""

    def __init__(self, llm, prompt) -> None:
        self.parser = StrOutputParser()
        prompt = PromptTemplate.from_template(prompt)
        self.chain = prompt | llm

    def __call__(self, state: AgentState) -> dict[str, Any]:
        response = self.chain.invoke({"user_input": state["user_input"]})
        parsed_response = self.parser.parse(response.content)
        return {"messages": [response], "problem_help": parsed_response}


class ProblemDefinerAgent:
    """Generates new schemas from natural language descriptions."""

    def __init__(self, llm, prompt) -> None:
        self.parser = StrOutputParser()
        prompt = PromptTemplate.from_template(prompt)
        self.chain = prompt | llm

    def __call__(self, state: AgentState) -> dict[str, Any]:
        user_input = state["user_input"]
        problem_help = state["problem_help"]
        user_feedback = state["user_feedback"]

        response = self.chain.invoke(
            {"user_input": user_input, "problem_help": problem_help, "user_feedback": user_feedback}
        )
        parsed_response = self.parser.parse(response.content)

        update_dict = {"messages": [response], "problem_definition": parsed_response}
        return update_dict


class SchemaGeneratorAgent:
    """Generates new schemas from natural language descriptions."""

    def __init__(self, llm, prompt) -> None:
        self.parser = JsonOutputParser()
        prompt = PromptTemplate.from_template(prompt)
        self.chain = prompt | llm

    def __call__(self, state: AgentState) -> dict[str, Any]:
        user_input = state["user_input"]
        problem_help = state["problem_help"]
        user_feedback = state["user_feedback"]
        problem_definition = state["problem_definition"]

        response = self.chain.invoke(
            {
                "user_input": user_input,
                "problem_help": problem_help,
                "user_feedback": user_feedback,
                "problem_definition": problem_definition,
            }
        )
        parsed_response = self.parser.parse(response.content)

        update_dict = {"messages": [response]}
        if parsed_response.get("is_generated", False):
            update_dict["current_schema"] = parsed_response.get("schema")
            update_dict["schema_history"] = [parsed_response.get("schema")]

        return update_dict


class SchemaAssessmentAgent:
    """Evaluates schema quality against multiple criteria."""

    def __init__(self, llm, prompt) -> None:
        self.parser = JsonOutputParser()
        prompt = PromptTemplate.from_template(prompt)
        self.chain = prompt | llm

    def __call__(self, state: AgentState) -> dict[str, Any]:
        user_input = state["user_input"]
        problem_help = state["problem_help"]
        user_feedback = state["user_feedback"]
        problem_definition = state["problem_definition"]
        current_schema = state["current_schema"]

        response = self.chain.invoke(
            {
                "user_input": user_input,
                "problem_help": problem_help,
                "user_feedback": user_feedback,
                "problem_definition": problem_definition,
                "current_schema": current_schema,
            }
        )
        parsed_response = self.parser.parse(response.content)
        return {"messages": [response], "assessment_result": parsed_response}


class SchemaRefinerAgent:
    """Improves existing schemas based on quality criteria."""

    def __init__(self, llm, prompt) -> None:
        self.parser = JsonOutputParser()
        prompt = PromptTemplate.from_template(prompt)
        self.chain = prompt | llm

    def __call__(self, state: AgentState) -> dict[str, Any]:
        user_input = state["user_input"]
        problem_help = state["problem_help"]
        user_feedback = state["user_feedback"]
        problem_definition = state["problem_definition"]
        current_schema = state["current_schema"]
        assessment_result = state["assessment_result"]

        response = self.chain.invoke(
            {
                "user_input": user_input,
                "problem_help": problem_help,
                "user_feedback": user_feedback,
                "problem_definition": problem_definition,
                "current_schema": current_schema,
                "assessment_result": assessment_result,
            }
        )
        parsed_response = self.parser.parse(response.content)
        update_dict = {"messages": [response], "refinement_rounds": 1}
        if parsed_response.get("is_refined", False):
            update_dict["current_schema"] = parsed_response.get("schema")
            update_dict["schema_history"] = [parsed_response.get("schema")]
        return update_dict
