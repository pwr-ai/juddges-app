"""Unit tests for the MCP rate limits: per key, and rejected keys per IP."""

from unittest.mock import patch

import pytest

from app.mcp_rate_limit import (
    DEFAULT_MCP_IP_RATE_LIMIT,
    DEFAULT_MCP_RATE_LIMIT,
    McpRateLimitExceeded,
    enforce_mcp_rate_limit,
    mcp_auth_failure_retry_after,
    mcp_auth_failures_exhausted,
    record_mcp_auth_failure,
)


@pytest.mark.unit
class TestMcpRateLimit:
    def test_allows_a_call_within_budget(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=True):
            enforce_mcp_rate_limit("key-1")  # does not raise

    def test_rejects_a_call_over_budget_naming_the_limit(self):
        with (
            patch("app.mcp_rate_limit.hit_with_fallback", return_value=False),
            pytest.raises(McpRateLimitExceeded) as exc,
        ):
            enforce_mcp_rate_limit("key-1")
        assert DEFAULT_MCP_RATE_LIMIT in str(exc.value)

    def test_charges_a_bucket_separate_from_the_ui(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=True) as hit:
            enforce_mcp_rate_limit("key-1")
        identifiers = hit.call_args[0][2:]
        assert identifiers == ("mcp", "key-1")

    def test_env_override_is_read_per_call(self, monkeypatch):
        monkeypatch.setenv("MCP_RATE_LIMIT", "1/minute")
        with (
            patch("app.mcp_rate_limit.hit_with_fallback", return_value=False),
            pytest.raises(McpRateLimitExceeded) as exc,
        ):
            enforce_mcp_rate_limit("key-1")
        assert "1/minute" in str(exc.value)

    def test_each_key_has_its_own_budget(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=True) as hit:
            enforce_mcp_rate_limit("key-1")
            enforce_mcp_rate_limit("key-2")
        assert hit.call_args_list[0][0][3] == "key-1"
        assert hit.call_args_list[1][0][3] == "key-2"

    def test_retry_after_is_the_default_window(self):
        with (
            patch("app.mcp_rate_limit.hit_with_fallback", return_value=False),
            pytest.raises(McpRateLimitExceeded) as exc,
        ):
            enforce_mcp_rate_limit("key-1")
        assert DEFAULT_MCP_RATE_LIMIT == "120/hour"
        assert exc.value.retry_after == 3600

    def test_retry_after_follows_an_env_override(self, monkeypatch):
        monkeypatch.setenv("MCP_RATE_LIMIT", "5/minute")
        with (
            patch("app.mcp_rate_limit.hit_with_fallback", return_value=False),
            pytest.raises(McpRateLimitExceeded) as exc,
        ):
            enforce_mcp_rate_limit("key-1")
        assert exc.value.retry_after == 60


@pytest.mark.unit
class TestAuthFailureBudget:
    def test_failure_bucket_is_distinct_from_the_per_key_bucket(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=True) as hit:
            enforce_mcp_rate_limit("1.2.3.4")
            record_mcp_auth_failure("1.2.3.4")
        key_bucket = hit.call_args_list[0][0][2]
        fail_bucket = hit.call_args_list[1][0][2]
        assert key_bucket == "mcp"
        assert fail_bucket != key_bucket
        assert hit.call_args_list[1][0][3] == "1.2.3.4"

    def test_checking_goes_through_test_not_hit(self):
        """A check must not consume budget, or a polite caller loses a slot
        every request."""
        with (
            patch("app.mcp_rate_limit.test_with_fallback", return_value=True) as check,
            patch("app.mcp_rate_limit.hit_with_fallback") as hit,
        ):
            assert mcp_auth_failures_exhausted("1.2.3.4") is False
        check.assert_called_once()
        assert check.call_args[0][2:] == ("mcp-auth-fail", "1.2.3.4")
        hit.assert_not_called()

    def test_exhausted_when_the_check_says_no_room(self):
        with patch("app.mcp_rate_limit.test_with_fallback", return_value=False):
            assert mcp_auth_failures_exhausted("1.2.3.4") is True

    def test_checking_repeatedly_never_exhausts_the_budget(self, monkeypatch):
        """Against the real limiter: only recorded failures spend budget."""
        monkeypatch.setenv("MCP_IP_RATE_LIMIT", "2/minute")
        ip = "198.51.100.77"
        for _ in range(10):
            assert mcp_auth_failures_exhausted(ip) is False
        record_mcp_auth_failure(ip)
        assert mcp_auth_failures_exhausted(ip) is False
        record_mcp_auth_failure(ip)
        assert mcp_auth_failures_exhausted(ip) is True
        assert mcp_auth_failures_exhausted("198.51.100.78") is False

    def test_ip_limit_env_override_is_read_per_call(self, monkeypatch):
        ip = "198.51.100.79"
        assert DEFAULT_MCP_IP_RATE_LIMIT == "20/minute"
        monkeypatch.setenv("MCP_IP_RATE_LIMIT", "1/minute")
        record_mcp_auth_failure(ip)
        assert mcp_auth_failures_exhausted(ip) is True
        # Raising the limit takes effect with no restart: one hit is now room.
        monkeypatch.setenv("MCP_IP_RATE_LIMIT", "5/minute")
        assert mcp_auth_failures_exhausted(ip) is False

    def test_failure_retry_after_follows_the_window(self, monkeypatch):
        assert mcp_auth_failure_retry_after() == 60
        monkeypatch.setenv("MCP_IP_RATE_LIMIT", "3/hour")
        assert mcp_auth_failure_retry_after() == 3600
