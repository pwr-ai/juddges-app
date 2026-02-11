from juddges_search.settings import MAX_CHAT_LAST_MESSAGES
from langchain.schema import AIMessage, BaseMessage, HumanMessage
from loguru import logger


def format_messages(
    input: dict, max_last_messages: int = MAX_CHAT_LAST_MESSAGES
) -> list[BaseMessage]:
    """Format the messages for the evaluator."""
    chat_history = input.get("chat_history", [])
    results: list[BaseMessage] = []
    logger.debug(f"Chat history:\n{chat_history}")
    if chat_history is None:
        return results
    for message in chat_history[-max_last_messages:]:
        logger.debug(f"Message:\n{message}")
        if message.type == "human":
            results.append(HumanMessage.model_validate(message))
        else:
            results.append(AIMessage.model_validate(message))
    return results


def format_chat_history(chain_input: dict) -> list[BaseMessage]:
    logger.debug(f"Chain input:\n{chain_input}")
    messages = format_messages(chain_input)

    return messages


def format_chat_history_as_string(input: dict, max_last_messages: int = 4) -> str:
    chat_history = input.get("chat_history", [])
    results = ""
    logger.debug(f"Chat history:\n{chat_history}")
    if chat_history is None:
        return ""
    for message in chat_history[-max_last_messages:]:
        logger.debug(f"Message:\n{message}")
        if message.type == "human":
            results += f"User: {message.content}\n"
        else:
            results += f"Assistant: {message.content}\n"
    return results
