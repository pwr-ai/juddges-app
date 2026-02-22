"""
Safe wrappers for existing chains with error handling.

Provides production-ready wrappers around existing chains that add:
- Retry logic for API failures
- Fallback responses on errors
- Comprehensive logging
"""

from typing import Any
from loguru import logger
from langchain_core.runnables import Runnable, RunnableLambda
from openai import RateLimitError, APIConnectionError, APITimeoutError, InternalServerError
import time
import asyncio


def create_safe_chain_wrapper(
    chain: Runnable, chain_name: str, fallback_response: dict, max_retries: int = 3, base_delay: float = 1.0
) -> Runnable:
    """
    Wrap a chain with error handling, retry logic, and fallback.

    Args:
        chain: Original LangChain Runnable
        chain_name: Name for logging
        fallback_response: Default response on complete failure
        max_retries: Maximum retry attempts for retriable errors
        base_delay: Base delay for exponential backoff

    Returns:
        Wrapped Runnable with error handling
    """

    def exponential_backoff(attempt: int) -> float:
        """Calculate exponential backoff with jitter."""
        import random

        delay = min(base_delay * (2**attempt), 60.0)
        jitter = random.uniform(0, delay * 0.1)
        return delay + jitter

    def sync_wrapper(inputs: Any) -> Any:
        """Synchronous wrapper with retry logic."""
        retriable_errors = (RateLimitError, APIConnectionError, APITimeoutError, InternalServerError)
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                logger.info(f"[{chain_name}] Executing (attempt {attempt + 1}/{max_retries + 1})")
                start_time = time.time()

                result = chain.invoke(inputs)

                elapsed = time.time() - start_time
                logger.info(f"[{chain_name}] Completed successfully in {elapsed:.2f}s")
                return result

            except retriable_errors as e:
                last_error = e

                if attempt < max_retries:
                    delay = exponential_backoff(attempt)
                    logger.warning(
                        f"[{chain_name}] Attempt {attempt + 1} failed with {type(e).__name__}: {str(e)[:100]}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(f"[{chain_name}] All {max_retries + 1} attempts failed: {e}")

            except Exception as e:
                # Non-retriable error - log and fallback immediately
                logger.error(f"[{chain_name}] Non-retriable error: {e}", exc_info=True)
                logger.warning(f"[{chain_name}] Returning fallback response due to error")
                return fallback_response

        # All retries exhausted
        logger.error(f"[{chain_name}] Failed after all retries: {last_error}")
        logger.warning(f"[{chain_name}] Returning fallback response")
        return fallback_response

    async def async_wrapper(inputs: Any) -> Any:
        """Asynchronous wrapper with retry logic."""
        retriable_errors = (RateLimitError, APIConnectionError, APITimeoutError, InternalServerError)
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                logger.info(f"[{chain_name}] Executing async (attempt {attempt + 1}/{max_retries + 1})")
                start_time = time.time()

                result = await chain.ainvoke(inputs)

                elapsed = time.time() - start_time
                logger.info(f"[{chain_name}] Completed successfully in {elapsed:.2f}s")
                return result

            except retriable_errors as e:
                last_error = e

                if attempt < max_retries:
                    delay = exponential_backoff(attempt)
                    logger.warning(
                        f"[{chain_name}] Attempt {attempt + 1} failed with {type(e).__name__}: {str(e)[:100]}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"[{chain_name}] All {max_retries + 1} attempts failed: {e}")

            except Exception as e:
                # Non-retriable error - log and fallback immediately
                logger.error(f"[{chain_name}] Non-retriable error: {e}", exc_info=True)
                logger.warning(f"[{chain_name}] Returning fallback response due to error")
                return fallback_response

        # All retries exhausted
        logger.error(f"[{chain_name}] Failed after all retries: {last_error}")
        logger.warning(f"[{chain_name}] Returning fallback response")
        return fallback_response

    return RunnableLambda(func=sync_wrapper, afunc=async_wrapper).with_config(
        run_name=f"safe_{chain_name}", tags=["error-handled", "retry-enabled", "fallback-enabled"]
    )


def create_chat_fallback_response(question: str = "") -> dict:
    """Create fallback response for chat chain failures."""
    return {
        "answer": (
            "Przepraszam, ale wystąpił problem podczas przetwarzania Twojego zapytania. "
            "Proszę spróbuj ponownie za chwilę lub sformułuj pytanie inaczej."
        ),
        "sources": [],
        "reasoning": ("Wystąpił błąd podczas analizy dokumentów prawnych. System został poinformowany o problemie."),
        "confidence": "low",
        "error": True,
    }


def create_qa_fallback_response(question: str = "") -> dict:
    """Create fallback response for QA chain failures."""
    return {
        "answer": (
            "I apologize, but I encountered an issue processing your question. "
            "Please try again in a moment or rephrase your question."
        ),
        "sources": [],
        "error": True,
    }


def create_enhancement_fallback_response(question: str = "") -> str:
    """Create fallback response for query enhancement failures - returns original query."""
    logger.warning(f"Query enhancement failed, returning original query: {question}")
    return question
