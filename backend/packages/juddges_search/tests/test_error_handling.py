"""
Tests for error handling in LangChain chains.

Tests retry logic, fallback mechanisms, and error recovery.
"""

import pytest
import time
from unittest.mock import Mock, AsyncMock
from openai import RateLimitError, APIConnectionError
from juddges_search.chains.error_handling import (
    exponential_backoff,
    retry_with_exponential_backoff,
    safe_json_parse,
    create_fallback_response,
    JSONParsingError,
)
from juddges_search.chains.safe_wrappers import (
    create_safe_chain_wrapper,
    create_chat_fallback_response,
    create_qa_fallback_response,
)


class TestExponentialBackoff:
    """Test exponential backoff calculation."""

    def test_exponential_backoff_increases(self):
        """Verify backoff delay increases exponentially."""
        delay_0 = exponential_backoff(0, base_delay=1.0)
        delay_1 = exponential_backoff(1, base_delay=1.0)
        delay_2 = exponential_backoff(2, base_delay=1.0)

        # Each delay should be roughly double the previous (accounting for jitter)
        assert 0.9 <= delay_0 <= 1.5  # ~1.0 with jitter
        assert 1.8 <= delay_1 <= 2.5  # ~2.0 with jitter
        assert 3.6 <= delay_2 <= 4.5  # ~4.0 with jitter

    def test_exponential_backoff_respects_max_delay(self):
        """Verify max delay is respected."""
        delay = exponential_backoff(10, base_delay=1.0, max_delay=60.0)
        assert delay <= 60.0 * 1.1  # Max delay + jitter

    def test_exponential_backoff_has_jitter(self):
        """Verify jitter is applied (delays are not exact)."""
        delays = [exponential_backoff(1, base_delay=1.0) for _ in range(10)]
        # All delays should be different due to jitter
        assert len(set(delays)) > 5  # At least some variation


class TestRetryWithExponentialBackoff:
    """Test retry decorator functionality."""

    def test_successful_execution_no_retry(self):
        """Test successful execution without retries."""
        mock_fn = Mock(return_value="success")
        decorated = retry_with_exponential_backoff(max_retries=3)(mock_fn)

        result = decorated()

        assert result == "success"
        assert mock_fn.call_count == 1

    def test_retry_on_retriable_error(self):
        """Test retry logic for retriable errors."""
        mock_fn = Mock(
            side_effect=[
                RateLimitError("Rate limited", response=None, body=None),
                RateLimitError("Rate limited", response=None, body=None),
                "success",
            ]
        )
        decorated = retry_with_exponential_backoff(
            max_retries=3,
            base_delay=0.01,  # Short delay for testing
        )(mock_fn)

        result = decorated()

        assert result == "success"
        assert mock_fn.call_count == 3

    def test_all_retries_exhausted(self):
        """Test behavior when all retries are exhausted."""
        mock_fn = Mock(side_effect=RateLimitError("Rate limited", response=None, body=None))
        decorated = retry_with_exponential_backoff(max_retries=2, base_delay=0.01)(mock_fn)

        with pytest.raises(Exception):  # Should raise ChainExecutionError or similar
            decorated()

        assert mock_fn.call_count == 3  # Initial + 2 retries

    def test_non_retriable_error_fails_immediately(self):
        """Test non-retriable errors fail without retries."""
        mock_fn = Mock(side_effect=ValueError("Invalid input"))
        decorated = retry_with_exponential_backoff(max_retries=3)(mock_fn)

        with pytest.raises(ValueError):
            decorated()

        assert mock_fn.call_count == 1  # No retries

    @pytest.mark.asyncio
    async def test_async_retry_logic(self):
        """Test retry logic works with async functions."""
        mock_fn = AsyncMock(side_effect=[APIConnectionError("Connection failed"), "success"])
        decorated = retry_with_exponential_backoff(max_retries=2, base_delay=0.01)(mock_fn)

        result = await decorated()

        assert result == "success"
        assert mock_fn.call_count == 2


class TestSafeJSONParse:
    """Test safe JSON parsing functionality."""

    def test_parse_valid_json(self):
        """Test parsing valid JSON."""
        json_str = '{"answer": "test", "sources": []}'
        result = safe_json_parse(json_str)

        assert result == {"answer": "test", "sources": []}

    def test_parse_json_in_markdown_code_block(self):
        """Test extracting JSON from markdown code blocks."""
        markdown = """Here's the response:
```json
{"answer": "test", "sources": []}
```
"""
        result = safe_json_parse(markdown)

        assert result == {"answer": "test", "sources": []}

    def test_parse_json_in_code_block_no_language(self):
        """Test extracting JSON from code blocks without language."""
        markdown = """```
{"answer": "test", "sources": []}
```"""
        result = safe_json_parse(markdown)

        assert result == {"answer": "test", "sources": []}

    def test_parse_invalid_json_with_default(self):
        """Test fallback to default on invalid JSON."""
        invalid = "This is not JSON"
        default = {"error": True}

        result = safe_json_parse(invalid, default=default)

        assert result == default

    def test_parse_invalid_json_no_default_raises(self):
        """Test raising error when no default provided."""
        invalid = "This is not JSON"

        with pytest.raises(JSONParsingError):
            safe_json_parse(invalid)


class TestCreateFallbackResponse:
    """Test fallback response creation."""

    def test_chat_fallback_response(self):
        """Test chat fallback response structure."""
        error = ValueError("Test error")
        response = create_fallback_response(error, question="Test question", response_type="chat")

        assert "answer" in response
        assert "sources" in response
        assert "reasoning" in response
        assert "confidence" in response
        assert response["error"] is True
        assert response["error_type"] == "ValueError"
        assert isinstance(response["answer"], str)
        assert isinstance(response["sources"], list)

    def test_qa_fallback_response(self):
        """Test QA fallback response structure."""
        error = ValueError("Test error")
        response = create_fallback_response(error, question="Test question", response_type="qa")

        assert "answer" in response
        assert "sources" in response
        assert response["error"] is True
        assert isinstance(response["answer"], str)

    def test_enhancement_fallback_returns_original_query(self):
        """Test query enhancement fallback returns original query."""
        error = ValueError("Test error")
        original_query = "test query"
        response = create_fallback_response(error, question=original_query, response_type="enhancement")

        assert response == original_query


class TestSafeChainWrapper:
    """Test safe chain wrapper functionality."""

    def test_wrapper_successful_execution(self):
        """Test wrapper with successful chain execution."""
        mock_chain = Mock()
        mock_chain.invoke = Mock(return_value={"answer": "success"})

        wrapped = create_safe_chain_wrapper(
            chain=mock_chain, chain_name="test_chain", fallback_response={"answer": "fallback"}, max_retries=2
        )

        result = wrapped.invoke({"question": "test"})

        assert result == {"answer": "success"}
        assert mock_chain.invoke.call_count == 1

    def test_wrapper_retry_on_rate_limit(self):
        """Test wrapper retries on rate limit errors."""
        mock_chain = Mock()
        mock_chain.invoke = Mock(
            side_effect=[RateLimitError("Rate limited", response=None, body=None), {"answer": "success"}]
        )

        wrapped = create_safe_chain_wrapper(
            chain=mock_chain,
            chain_name="test_chain",
            fallback_response={"answer": "fallback"},
            max_retries=2,
            base_delay=0.01,
        )

        result = wrapped.invoke({"question": "test"})

        assert result == {"answer": "success"}
        assert mock_chain.invoke.call_count == 2

    def test_wrapper_fallback_after_all_retries(self):
        """Test wrapper returns fallback after all retries exhausted."""
        mock_chain = Mock()
        mock_chain.invoke = Mock(side_effect=RateLimitError("Rate limited", response=None, body=None))

        wrapped = create_safe_chain_wrapper(
            chain=mock_chain,
            chain_name="test_chain",
            fallback_response={"answer": "fallback"},
            max_retries=2,
            base_delay=0.01,
        )

        result = wrapped.invoke({"question": "test"})

        assert result == {"answer": "fallback"}
        assert mock_chain.invoke.call_count == 3  # Initial + 2 retries

    def test_wrapper_fallback_on_non_retriable_error(self):
        """Test wrapper returns fallback on non-retriable errors."""
        mock_chain = Mock()
        mock_chain.invoke = Mock(side_effect=ValueError("Invalid input"))

        wrapped = create_safe_chain_wrapper(
            chain=mock_chain, chain_name="test_chain", fallback_response={"answer": "fallback"}, max_retries=2
        )

        result = wrapped.invoke({"question": "test"})

        assert result == {"answer": "fallback"}
        assert mock_chain.invoke.call_count == 1  # No retries


class TestFallbackResponses:
    """Test fallback response creation functions."""

    def test_chat_fallback_response_structure(self):
        """Test chat fallback response has correct structure."""
        response = create_chat_fallback_response("test question")

        assert "answer" in response
        assert "sources" in response
        assert "reasoning" in response
        assert "confidence" in response
        assert response["error"] is True
        assert isinstance(response["answer"], str)
        assert len(response["answer"]) > 0

    def test_qa_fallback_response_structure(self):
        """Test QA fallback response has correct structure."""
        response = create_qa_fallback_response("test question")

        assert "answer" in response
        assert "sources" in response
        assert response["error"] is True
        assert isinstance(response["answer"], str)
        assert len(response["answer"]) > 0


@pytest.mark.integration
class TestErrorHandlingIntegration:
    """Integration tests for error handling with real-like scenarios."""

    def test_chain_with_multiple_error_types(self):
        """Test chain handles different error types appropriately."""
        call_count = {"count": 0}

        def side_effect_fn(*args, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 1:
                raise APIConnectionError("Connection failed")
            elif call_count["count"] == 2:
                raise RateLimitError("Rate limited", response=None, body=None)
            else:
                return {"answer": "success"}

        mock_chain = Mock()
        mock_chain.invoke = Mock(side_effect=side_effect_fn)

        wrapped = create_safe_chain_wrapper(
            chain=mock_chain,
            chain_name="test_chain",
            fallback_response={"answer": "fallback"},
            max_retries=3,
            base_delay=0.01,
        )

        result = wrapped.invoke({"question": "test"})

        assert result == {"answer": "success"}
        assert call_count["count"] == 3

    def test_timing_of_exponential_backoff(self):
        """Test that exponential backoff actually delays execution."""
        mock_chain = Mock()
        mock_chain.invoke = Mock(
            side_effect=[
                RateLimitError("Rate limited", response=None, body=None),
                RateLimitError("Rate limited", response=None, body=None),
                {"answer": "success"},
            ]
        )

        wrapped = create_safe_chain_wrapper(
            chain=mock_chain,
            chain_name="test_chain",
            fallback_response={"answer": "fallback"},
            max_retries=3,
            base_delay=0.1,  # 100ms base delay
        )

        start_time = time.time()
        result = wrapped.invoke({"question": "test"})
        elapsed = time.time() - start_time

        assert result == {"answer": "success"}
        # Should take at least base_delay * (2^0 + 2^1) = 0.1 * 3 = 0.3s
        assert elapsed >= 0.3
