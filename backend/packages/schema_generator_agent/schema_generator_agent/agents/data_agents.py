import asyncio
import random
from typing import Any

from ai_tax_search.models import DocumentType
from ai_tax_search.retrieval.weaviate_search import search_documents
from langchain_core.prompts import PromptTemplate
from langchain.schema import StrOutputParser
from langchain_core.output_parsers import JsonOutputParser
from loguru import logger
from pydantic import BaseModel

from schema_generator_agent.agents.schema_generator import AgentState


class QueryGeneratorAgent:
    class Query(BaseModel):
        query: str

    def __init__(self, llm, prompt) -> None:
        structured_llm = llm.with_structured_output(self.Query, include_raw=True)
        prompt = PromptTemplate.from_template(prompt)
        self.chain = prompt | structured_llm

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
        return {"messages": [response["raw"]], "query": response["parsed"].query}


class SchemaDataAssessmentAgent:
    """Evaluates schema quality against multiple criteria."""

    def __init__(
        self,
        llm,
        prompt,
        document_type: DocumentType,
        top_k: int = 100,
        min_examples: int = 3,
        max_examples: int = 10,
        random_seed: int = 17,
    ) -> None:
        self.parser = StrOutputParser()
        prompt = PromptTemplate.from_template(prompt)
        self.chain = prompt | llm
        self.random = random.Random(random_seed)
        self.top_k = top_k
        self.min_examples = min_examples
        self.max_examples = max_examples
        self.document_type = document_type

    def __call__(self, state: AgentState) -> dict[str, Any]:
        user_input = state["user_input"]
        problem_help = state["problem_help"]
        user_feedback = state["user_feedback"]
        problem_definition = state["problem_definition"]
        current_schema = state["current_schema"]
        query = state["query"]
        
        responses, data_assessment_results = asyncio.run(
            self._process_documents(
                query, user_input, problem_help, user_feedback, problem_definition, current_schema
            )
        )
        return {"messages": responses, "data_assessment_results": data_assessment_results}

    async def _process_documents(
        self, query: str, user_input: str, problem_help: str, user_feedback: str, problem_definition: str, current_schema: str
    ) -> tuple[list[Any], list[str]]:
        example_documents = await self._get_example_documents(query)
        
        tasks = []
        for example_document in example_documents:
            tasks.append(
                self.chain.ainvoke(
                    {
                        "user_input": user_input,
                        "problem_help": problem_help,
                        "user_feedback": user_feedback,
                        "problem_definition": problem_definition,
                        "current_schema": current_schema,
                        "example_document": example_document,
                    }
                )
            )
        
        responses = await asyncio.gather(*tasks)
        data_assessment_results = [self.parser.parse(response.content) for response in responses]
        return responses, data_assessment_results

    async def _get_example_documents(self, query: str) -> list[str]:
        """Retrieve and sample example documents with error handling and adaptive sampling."""
        try:
            documents = await search_documents(
                query=query, max_docs=self.top_k, document_type=self.document_type
            )

            if not documents:
                logger.warning(f"No documents found for query: {query}")
                return []

            # Adaptive sampling based on result quality
            num_samples = min(
                self.max_examples, max(self.min_examples, len(documents) // 10)
            )

            # Sample documents, ensuring we don't exceed available documents
            actual_samples = min(num_samples, len(documents))
            sampled_docs = self.random.sample(documents, actual_samples)

            logger.info(
                f"Retrieved {len(documents)} documents, sampled {actual_samples} for assessment"
            )
            return sampled_docs

        except Exception as e:
            logger.error(f"Document retrieval failed for query '{query}': {e}")
            return []


class SchemaDataAssessmentMergerAgent:
    """Merges multiple data assessment results and determines if refinement is needed."""

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
        data_assessment_results = state["data_assessment_results"]

        data_assessment_results_str = ""
        for i, data_assessment_result in enumerate(data_assessment_results):
            data_assessment_results_str += f"### Assessment {i + 1}\n\n{data_assessment_result}\n\n"

        response = self.chain.invoke(
            {
                "user_input": user_input,
                "problem_help": problem_help,
                "user_feedback": user_feedback,
                "problem_definition": problem_definition,
                "current_schema": current_schema,
                "data_assessment_results": data_assessment_results_str,
            }
        )
        parsed_response = self.parser.parse(response.content)
        return {"messages": [response], "merged_data_assessment": parsed_response}


class SchemaDataRefinerAgent:
    """Refines schemas based on data assessment feedback."""

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
        merged_data_assessment = state["merged_data_assessment"]

        response = self.chain.invoke(
            {
                "user_input": user_input,
                "problem_help": problem_help,
                "user_feedback": user_feedback,
                "problem_definition": problem_definition,
                "current_schema": current_schema,
                "merged_data_assessment": merged_data_assessment,
            }
        )
        parsed_response = self.parser.parse(response.content)
        update_dict = {"messages": [response], "data_refinement_rounds": 1}
        if parsed_response.get("is_refined", False):
            update_dict["current_schema"] = parsed_response.get("schema")
            update_dict["schema_history"] = [parsed_response.get("schema")]
        return update_dict
