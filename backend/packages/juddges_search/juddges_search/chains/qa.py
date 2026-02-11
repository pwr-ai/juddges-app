from juddges_search.chains.callbacks import callbacks
from juddges_search.chains.models import DocumentRetrievalInput, Response
from juddges_search.chains.retrieve import retrieve_documents_runnable
from juddges_search.llms import get_default_llm
from juddges_search.prompts.formatters.documents import format_documents_with_metadata
from juddges_search.prompts.qa import IMPROVE_QUESTION_BASED_ON_CHAT_HISTORY, SIMPLE_QA
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.runnables import RunnableLambda, RunnableSequence


prompt = ChatPromptTemplate.from_template(SIMPLE_QA, template_format="jinja2")
model = get_default_llm(use_mini_model=False)
model_mini = get_default_llm(use_mini_model=True)
condense_question_prompt = ChatPromptTemplate.from_template(
    IMPROVE_QUESTION_BASED_ON_CHAT_HISTORY,
    template_format="jinja2",
)

retrieve_and_format_documents_runnable = (
    retrieve_documents_runnable
    | RunnableLambda(
        lambda inputs: {
            **inputs,
            "context": format_documents_with_metadata(inputs["context"]),
        }
    )
).with_config(run_name="retrieve_and_format_documents_runnable")


chain = (
    RunnableSequence(
        retrieve_and_format_documents_runnable,
        prompt.with_config(run_name="prepare_response_prompt"),
        model,
        JsonOutputParser(),
    )
    .with_config(run_name="suggest_answer", callbacks=callbacks)
    .with_types(input_type=DocumentRetrievalInput, output_type=Response)
)
