import os

import yaml
from ai_tax_search.models import DocumentType
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from schema_generator_agent.agents.schema_generator import SchemaGenerator
from schema_generator_agent.settings import PROMPTS_PATH

MODEL_NAME = "llama3.3"
SYSTEM_TYPE = "law"
WV_COLLECTION_NAME = "LegalDocuments"

load_dotenv(".env")

API_KEY = os.getenv("SELFHOSTED_API_KEY")
API_URL = os.getenv("SELFHOSTED_API_URL")


def load_prompts(system_type: str) -> dict[str, str]:
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


def main() -> None:
    assert SYSTEM_TYPE in ["law", "tax"], "Invalid system type"
    document_type = DocumentType.JUDGMENT if SYSTEM_TYPE == "law" else DocumentType.TAX_INTERPRETATION
    prompts = load_prompts(SYSTEM_TYPE)

    llm = ChatOpenAI(
        model=MODEL_NAME,
        base_url=API_URL,
        api_key=API_KEY,
        temperature=0.7,
        max_tokens=32_000,
        top_p=0.8,
        presence_penalty=1.5,
        extra_body={"top_k": 20, "chat_template_kwargs": {"enable_thinking": False}},
    )

    schema_system = SchemaGenerator(
        llm,
        document_type,
        prompts["problem_definer_helper_prompt"],
        prompts["problem_definer_prompt"],
        prompts["schema_generator_prompt"],
        prompts["schema_assessment_prompt"],
        prompts["schema_refiner_prompt"],
        prompts["query_generator_prompt"],
        prompts["schema_data_assessment_prompt"],
        prompts["schema_data_assessment_merger_prompt"],
        prompts["schema_data_refiner_prompt"],
    )

    print("🚀 DEMO")
    print("=" * 60)
    print("Input text with description of the schema to generate:")
    input_text = input()

    schema_system.stream_graph_updates(input_text)

    print("\n" + "=" * 60)
    print("✅ Schema generation demo completed!")


if __name__ == "__main__":
    main()
