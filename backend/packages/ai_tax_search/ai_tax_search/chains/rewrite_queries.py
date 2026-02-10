from operator import itemgetter

from ai_tax_search.chains.callbacks import callbacks
from ai_tax_search.llms import get_default_llm
from ai_tax_search.prompts.formatters.chat_history import format_chat_history
from ai_tax_search.prompts.qa import IMPROVE_QUESTION_BASED_ON_CHAT_HISTORY
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

model_mini = get_default_llm(use_mini_model=True)


condense_question_prompt = ChatPromptTemplate.from_template(
    IMPROVE_QUESTION_BASED_ON_CHAT_HISTORY,
    template_format="jinja2",
)

query_rewrite_chain = (
    {
        "chat_history": lambda x: format_chat_history(x),
        "question": itemgetter("question"),
    }
    | condense_question_prompt
    | model_mini
    | JsonOutputParser()
)

search_query_generation = query_rewrite_chain.with_config(run_name="search_query_generation", callbacks=callbacks)
