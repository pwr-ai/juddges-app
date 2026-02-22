"""
Error handling utilities for LangChain chains.

Provides robust error handling, retry logic, and fallback mechanisms
for production-ready AI chains with proper logging and monitoring.
"""

import functools
import time
from typing import Any, Callable, TypeVar, ParamSpec
from loguru import logger
from langchain_core.runnables import RunnableLambda, Runnable
from openai import (
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
)
import json

# Type variables for generic functions
P = ParamSpec("P")
T = TypeVar("T")


# Error types that should trigger retries
RETRIABLE_ERRORS = (
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
)

# Error types that should not be retried
NON_RETRIABLE_ERRORS = (
    ValueError,
    KeyError,
    TypeError,
)


class ChainExecutionError(Exception):
    """Base exception for chain execution errors."""

    def __init__(self, message: str, original_error: Exception | None = None, context: dict | None = None):
        super().__init__(message)
        self.original_error = original_error
        self.context = context or {}
        self.timestamp = time.time()


class RetryableChainError(ChainExecutionError):
    """Error that can be retried."""

    pass


class NonRetriableChainError(ChainExecutionError):
    """Error that should not be retried."""

    pass


class JSONParsingError(NonRetriableChainError):
    """Error parsing JSON output from LLM."""

    pass


class RetrievalError(RetryableChainError):
    """Error during document retrieval."""

    pass


def exponential_backoff(attempt: int, base_delay: float = 1.0, max_delay: float = 60.0) -> float:
    """
    Calculate exponential backoff delay with jitter.

    Args:
        attempt: Current retry attempt (0-indexed)
        base_delay: Base delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 60.0)

    Returns:
        Delay in seconds with jitter applied
    """
    import random

    # Exponential backoff: base_delay * 2^attempt
    delay = min(base_delay * (2**attempt), max_delay)

    # Add jitter: random value between 0 and delay
    jitter = random.uniform(0, delay * 0.1)  # 10% jitter

    return delay + jitter


def retry_with_exponential_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retriable_exceptions: tuple = RETRIABLE_ERRORS,
):
    """
    Decorator for retrying functions with exponential backoff.

    Args:
        max_retries: Maximum number of retry attempts (default: 3)
        base_delay: Base delay between retries in seconds (default: 1.0)
        max_delay: Maximum delay between retries (default: 60.0)
        retriable_exceptions: Tuple of exception types that should trigger retries

    Returns:
        Decorated function with retry logic
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            last_exception = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retriable_exceptions as e:
                    last_exception = e

                    if attempt < max_retries:
                        delay = exponential_backoff(attempt, base_delay, max_delay)
                        logger.warning(
                            f"Attempt {attempt + 1}/{max_retries + 1} failed for {func.__name__}: {e}. "
                            f"Retrying in {delay:.2f}s..."
                        )
                        time.sleep(delay)
                    else:
                        logger.error(f"All {max_retries + 1} attempts failed for {func.__name__}: {e}")
                except Exception as e:
                    # Non-retriable error - fail immediately
                    logger.error(f"Non-retriable error in {func.__name__}: {e}", exc_info=True)
                    raise

            # All retries exhausted
            raise RetryableChainError(
                f"Failed after {max_retries + 1} attempts",
                original_error=last_exception,
                context={"function": func.__name__},
            )

        @functools.wraps(func)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            import asyncio

            last_exception = None

            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except retriable_exceptions as e:
                    last_exception = e

                    if attempt < max_retries:
                        delay = exponential_backoff(attempt, base_delay, max_delay)
                        logger.warning(
                            f"Attempt {attempt + 1}/{max_retries + 1} failed for {func.__name__}: {e}. "
                            f"Retrying in {delay:.2f}s..."
                        )
                        await asyncio.sleep(delay)
                    else:
                        logger.error(f"All {max_retries + 1} attempts failed for {func.__name__}: {e}")
                except Exception as e:
                    # Non-retriable error - fail immediately
                    logger.error(f"Non-retriable error in {func.__name__}: {e}", exc_info=True)
                    raise

            # All retries exhausted
            raise RetryableChainError(
                f"Failed after {max_retries + 1} attempts",
                original_error=last_exception,
                context={"function": func.__name__},
            )

        # Return appropriate wrapper based on function type
        if functools.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def safe_json_parse(response_text: str, default: dict | None = None) -> dict:
    """
    Safely parse JSON response from LLM.

    Args:
        response_text: Raw text response from LLM
        default: Default value to return on parse failure

    Returns:
        Parsed JSON dict or default value

    Raises:
        JSONParsingError: If parsing fails and no default provided
    """
    try:
        # Try to parse the entire response
        return json.loads(response_text)
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code blocks
        if "```json" in response_text:
            try:
                json_text = response_text.split("```json")[1].split("```")[0].strip()
                return json.loads(json_text)
            except (IndexError, json.JSONDecodeError):
                pass

        # Try to extract JSON from code blocks without language
        if "```" in response_text:
            try:
                json_text = response_text.split("```")[1].strip()
                return json.loads(json_text)
            except (IndexError, json.JSONDecodeError):
                pass

        # If default provided, return it
        if default is not None:
            logger.warning(f"Failed to parse JSON, using default: {response_text[:100]}...")
            return default

        # No default - raise error
        logger.error(f"Failed to parse JSON response: {response_text[:200]}...")
        raise JSONParsingError(
            "Failed to parse JSON from LLM response", context={"response_preview": response_text[:200]}
        )


def create_fallback_response(error: Exception, question: str = "", response_type: str = "chat") -> dict:
    """
    Create a user-friendly fallback response when chain execution fails.

    Args:
        error: The exception that occurred
        question: User's original question
        response_type: Type of response ('chat', 'qa', 'enhancement')

    Returns:
        Fallback response dictionary
    """
    logger.error(f"Creating fallback response for {response_type}: {error}", exc_info=True)

    if response_type == "chat":
        return {
            "answer": (
                "Przepraszam, ale wystąpił problem podczas przetwarzania Twojego zapytania. "
                "Proszę spróbuj ponownie za chwilę lub sformułuj pytanie inaczej."
            ),
            "sources": [],
            "reasoning": (
                "Wystąpił błąd podczas analizy dokumentów prawnych. System został poinformowany o problemie."
            ),
            "confidence": "low",
            "error": True,
            "error_type": type(error).__name__,
        }
    elif response_type == "qa":
        return {
            "answer": (
                "I apologize, but I encountered an issue processing your question. "
                "Please try again in a moment or rephrase your question."
            ),
            "sources": [],
            "error": True,
            "error_type": type(error).__name__,
        }
    elif response_type == "enhancement":
        # For query enhancement, fallback to original query
        return question
    else:
        return {"error": True, "error_type": type(error).__name__, "message": "An error occurred during processing"}


def wrap_with_error_handling(
    runnable: Runnable,
    fallback_fn: Callable[[Exception, dict], Any] | None = None,
    log_prefix: str = "Chain",
) -> Runnable:
    """
    Wrap a Runnable with comprehensive error handling.

    Args:
        runnable: The Runnable to wrap
        fallback_fn: Optional function to generate fallback response
        log_prefix: Prefix for log messages

    Returns:
        Wrapped Runnable with error handling
    """

    def error_handler(inputs: dict) -> Any:
        try:
            return runnable.invoke(inputs)
        except Exception as e:
            logger.error(f"{log_prefix} execution failed: {e}", exc_info=True)

            if fallback_fn:
                return fallback_fn(e, inputs)
            else:
                raise ChainExecutionError(
                    f"{log_prefix} execution failed", original_error=e, context={"inputs": inputs}
                )

    async def async_error_handler(inputs: dict) -> Any:
        try:
            return await runnable.ainvoke(inputs)
        except Exception as e:
            logger.error(f"{log_prefix} execution failed: {e}", exc_info=True)

            if fallback_fn:
                return fallback_fn(e, inputs)
            else:
                raise ChainExecutionError(
                    f"{log_prefix} execution failed", original_error=e, context={"inputs": inputs}
                )

    return RunnableLambda(func=error_handler, afunc=async_error_handler)


def log_chain_execution(chain_name: str):
    """
    Decorator to log chain execution with timing and error tracking.

    Args:
        chain_name: Name of the chain being executed

    Returns:
        Decorated function with logging
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            start_time = time.time()
            logger.info(f"Starting {chain_name} execution")

            try:
                result = func(*args, **kwargs)
                elapsed = time.time() - start_time
                logger.info(f"{chain_name} completed successfully in {elapsed:.2f}s")
                return result
            except Exception as e:
                elapsed = time.time() - start_time
                logger.error(f"{chain_name} failed after {elapsed:.2f}s: {e}", exc_info=True)
                raise

        @functools.wraps(func)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            start_time = time.time()
            logger.info(f"Starting {chain_name} execution")

            try:
                result = await func(*args, **kwargs)
                elapsed = time.time() - start_time
                logger.info(f"{chain_name} completed successfully in {elapsed:.2f}s")
                return result
            except Exception as e:
                elapsed = time.time() - start_time
                logger.error(f"{chain_name} failed after {elapsed:.2f}s: {e}", exc_info=True)
                raise

        if functools.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def validate_chain_input(required_fields: list[str]):
    """
    Decorator to validate chain inputs have required fields.

    Args:
        required_fields: List of required field names

    Returns:
        Decorated function with input validation
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            # Assume first arg is inputs dict or Pydantic model
            if args:
                inputs = args[0]
                missing_fields = []

                for field in required_fields:
                    if isinstance(inputs, dict):
                        if field not in inputs:
                            missing_fields.append(field)
                    else:
                        # Pydantic model
                        if not hasattr(inputs, field) or getattr(inputs, field) is None:
                            missing_fields.append(field)

                if missing_fields:
                    raise ValueError(f"Missing required fields: {missing_fields}")

            return func(*args, **kwargs)

        return wrapper

    return decorator
