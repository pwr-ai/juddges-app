import os

from langchain_openai import ChatOpenAI

GPT_3 = "gpt-3.5-turbo-0125"
GPT_4 = "gpt-4-0125-preview"
GPT_4o = "gpt-4o-2024-08-06"
GPT_4o_mini = "gpt-4o-mini-2024-07-18"
GPT_5_nano = "gpt-5-nano-2025-08-07"

LLM_NAME = os.getenv("LLM_NAME") or GPT_4o
LLM_MINI_NAME = os.getenv("LLM_MINI_NAME") or GPT_4o_mini
LLM_BASE_URL = os.getenv("LLM_BASE_URL", default=None)


def get_default_llm(use_mini_model: bool, **kwargs) -> ChatOpenAI:
    llm_name = LLM_NAME
    if use_mini_model:
        llm_name = LLM_MINI_NAME

    return ChatOpenAI(model=llm_name, base_url=LLM_BASE_URL, **kwargs)


def get_llm(name: str | None = None, **kwargs) -> ChatOpenAI:
    if name is None:
        name = GPT_4o
    return ChatOpenAI(model=name, **kwargs)
