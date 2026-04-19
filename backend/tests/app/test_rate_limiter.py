"""
Unit tests for rate_limiter.py — proxy-aware IP resolution.

Tests cover:
- Trusted proxy mode uses leftmost X-Forwarded-For address (real client).
- Trusted proxy mode falls back to X-Real-IP when X-Forwarded-For absent.
- Trusted proxy mode falls back to socket address when no proxy headers.
- Untrusted mode always uses socket address regardless of proxy headers.
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest


def _make_request(
    *,
    client_host: str = "10.0.0.1",
    forwarded_for: str | None = None,
    real_ip: str | None = None,
) -> MagicMock:
    """Build a minimal Starlette-like Request mock."""
    request = MagicMock()
    request.client = MagicMock()
    request.client.host = client_host

    headers: dict[str, str] = {}
    if forwarded_for is not None:
        headers["X-Forwarded-For"] = forwarded_for
    if real_ip is not None:
        headers["X-Real-IP"] = real_ip

    # Starlette Headers supports .get()
    request.headers = MagicMock()
    request.headers.get = lambda key, default="": headers.get(key, default)

    return request


@pytest.mark.unit
class TestGetClientIpTrustedProxy:
    """Behaviour when TRUSTED_PROXY=true."""

    def test_leftmost_xff_is_used_for_real_client(self):
        """The leftmost X-Forwarded-For entry is returned, not the proxy IP."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "true"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            request = _make_request(
                client_host="192.168.1.1",  # proxy socket
                forwarded_for="203.0.113.5, 192.168.1.1",
            )
            assert rl_module.get_client_ip(request) == "203.0.113.5"

    def test_single_xff_entry_returned(self):
        """Single-entry X-Forwarded-For is used as-is."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "true"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            request = _make_request(forwarded_for="1.2.3.4")
            assert rl_module.get_client_ip(request) == "1.2.3.4"

    def test_multiple_xff_entries_leftmost_wins(self):
        """Three-hop chain — leftmost (original client) wins."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "true"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            request = _make_request(forwarded_for="10.1.1.1, 10.2.2.2, 10.3.3.3")
            assert rl_module.get_client_ip(request) == "10.1.1.1"

    def test_xff_with_spaces_stripped(self):
        """Whitespace around IP addresses in X-Forwarded-For is stripped."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "true"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            request = _make_request(forwarded_for="  172.16.0.5 , 192.168.0.1")
            assert rl_module.get_client_ip(request) == "172.16.0.5"

    def test_falls_back_to_real_ip_when_no_xff(self):
        """X-Real-IP is used when X-Forwarded-For is absent."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "true"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            request = _make_request(client_host="10.0.0.1", real_ip="203.0.113.42")
            assert rl_module.get_client_ip(request) == "203.0.113.42"

    def test_falls_back_to_socket_when_no_proxy_headers(self):
        """Socket address used when neither proxy header is present."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "true"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            with patch("app.rate_limiter.get_remote_address", return_value="10.0.0.99"):
                request = _make_request(client_host="10.0.0.99")
                result = rl_module.get_client_ip(request)
        assert result == "10.0.0.99"


@pytest.mark.unit
class TestGetClientIpUntrustedProxy:
    """Behaviour when TRUSTED_PROXY=false (default)."""

    def test_xff_header_ignored(self):
        """X-Forwarded-For header must be ignored in untrusted mode."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "false"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            with patch(
                "app.rate_limiter.get_remote_address", return_value="192.168.1.1"
            ):
                request = _make_request(
                    client_host="192.168.1.1",
                    forwarded_for="1.2.3.4",
                )
                result = rl_module.get_client_ip(request)

        # Must not return the spoofed XFF address
        assert result != "1.2.3.4"
        assert result == "192.168.1.1"

    def test_real_ip_header_ignored(self):
        """X-Real-IP header must be ignored in untrusted mode."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "false"}):
            import importlib

            import app.rate_limiter as rl_module

            importlib.reload(rl_module)
            with patch(
                "app.rate_limiter.get_remote_address", return_value="10.10.10.10"
            ):
                request = _make_request(client_host="10.10.10.10", real_ip="5.5.5.5")
                result = rl_module.get_client_ip(request)

        assert result != "5.5.5.5"
        assert result == "10.10.10.10"


@pytest.mark.unit
class TestIsTrustedProxy:
    """Tests for _is_trusted_proxy() env-var parsing."""

    @pytest.mark.parametrize(
        "env_value,expected",
        [
            ("true", True),
            ("True", True),
            ("TRUE", True),
            ("1", True),
            ("yes", True),
            ("YES", True),
            ("false", False),
            ("False", False),
            ("0", False),
            ("no", False),
            ("", False),
        ],
    )
    def test_env_parsing(self, env_value: str, expected: bool):
        """_is_trusted_proxy parses common truthy/falsy env values."""
        import app.rate_limiter as rl_module

        with patch.dict(os.environ, {"TRUSTED_PROXY": env_value}):
            result = rl_module._is_trusted_proxy()
        assert result is expected

    def test_default_is_false(self):
        """TRUSTED_PROXY defaults to False when env var is not set."""
        import app.rate_limiter as rl_module

        env = {k: v for k, v in os.environ.items() if k != "TRUSTED_PROXY"}
        with patch.dict(os.environ, env, clear=True):
            result = rl_module._is_trusted_proxy()
        assert result is False
