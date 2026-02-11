from operator import itemgetter

from juddges_search.chains.callbacks import callbacks
from juddges_search.llms import get_default_llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda

model_mini = get_default_llm(use_mini_model=True)

ENHANCE_QUERY_PROMPT = """You are an expert at understanding tax-related questions and improving search queries. 
Your task is to enhance the given query to make it more effective for searching tax documents.

Original query: {{query}}

Enhance this query by:
1. Expanding any abbreviations or technical terms
2. Adding relevant tax-specific keywords that might be in helpful documents
3. Including synonyms for key terms
4. Removing any unnecessary words or phrases
5. Ensuring the query is focused and specific

Return ONLY the enhanced query text as a string with no additional explanation or formatting.

Enhanced Query:"""

enhance_query_prompt = ChatPromptTemplate.from_template(
    ENHANCE_QUERY_PROMPT,
    template_format="jinja2",
)

enhance_query_chain = (
    {"query": itemgetter("query")}
    | enhance_query_prompt
    | model_mini
    | RunnableLambda(lambda x: x.content)  # Extract just the string content
).with_config(run_name="ai_tax_query_enhancement_chain", callbacks=callbacks)
