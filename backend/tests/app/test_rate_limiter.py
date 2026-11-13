"""
Unit tests for rate_limiter.py — proxy-aware IP resolution.

Tests cover:
- API-key-authenticated BFF identities receive isolated quota keys.
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
    api_key: str | None = None,
    rate_limit_identity: str | None = None,
    rate_limit_client_ip: str | None = None,
    authorization: str | None = None,
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
    if api_key is not None:
        headers["X-API-Key"] = api_key
    if rate_limit_identity is not None:
        headers["X-RateLimit-Identity"] = rate_limit_identity
    if rate_limit_client_ip is not None:
        headers["X-RateLimit-Client-IP"] = rate_limit_client_ip
    if authorization is not None:
        headers["Authorization"] = authorization

    # Starlette Headers supports .get()
    request.headers = MagicMock()
    request.headers.get = lambda key, default="": headers.get(key, default)

    return request


@pytest.mark.unit
class TestVerifiedIdentityQuotaKeys:
    """BFF-authenticated users must not share the proxy container's quota."""

    def test_verified_identities_have_isolated_quota_keys(self):
        import app.rate_limiter as rl_module

        identity_a = "a" * 64
        identity_b = "b" * 64
        with patch.dict(os.environ, {"BACKEND_API_KEY": "server-api-key"}):
            key_a = rl_module.get_client_ip(
                _make_request(
                    client_host="172.18.0.2",
                    api_key="server-api-key",
                    rate_limit_identity=identity_a,
                )
            )
            key_b = rl_module.get_client_ip(
                _make_request(
                    client_host="172.18.0.2",
                    api_key="server-api-key",
                    rate_limit_identity=identity_b,
                )
            )

        assert key_a == f"user:{identity_a}"
        assert key_b == f"user:{identity_b}"
        assert key_a != key_b

    def test_identity_is_ignored_without_the_matching_service_key(self):
        import app.rate_limiter as rl_module

        with (
            patch.dict(os.environ, {"BACKEND_API_KEY": "server-api-key"}),
            patch("app.rate_limiter.get_remote_address", return_value="172.18.0.2"),
        ):
            key = rl_module.get_client_ip(
                _make_request(
                    client_host="172.18.0.2",
                    api_key="wrong-key",
                    rate_limit_identity="a" * 64,
                )
            )

        assert key == "172.18.0.2"

    def test_bearer_claims_cannot_select_a_bucket_without_verified_identity(self):
        import app.rate_limiter as rl_module

        with (
            patch.dict(os.environ, {"BACKEND_API_KEY": "server-api-key"}),
            patch("app.rate_limiter.get_remote_address", return_value="172.18.0.2"),
        ):
            assert (
                rl_module.get_client_ip(
                    _make_request(
                        api_key="server-api-key",
                        authorization="Bearer forged.claims.signature",
                    )
                )
                == "172.18.0.2"
            )


@pytest.mark.unit
def test_router_backstop_is_enabled_by_default(monkeypatch):
    """Nested FastAPI routers must not silently bypass the default limits."""
    import app.rate_limiter as rl_module

    monkeypatch.delenv("RATE_LIMIT_ROUTER_BACKSTOP", raising=False)
    assert rl_module._router_backstop_enabled() is True


@pytest.mark.unit
def test_router_backstop_can_be_disabled_only_explicitly(monkeypatch):
    import app.rate_limiter as rl_module

    monkeypatch.setenv("RATE_LIMIT_ROUTER_BACKSTOP", "false")
    assert rl_module._router_backstop_enabled() is False


@pytest.mark.unit
class TestVerifiedForwardedClientIp:
    """Anonymous BFF traffic must key per visitor, not per frontend container (#565)."""

    @pytest.fixture(autouse=True)
    def _service_key(self):
        with (
            patch.dict(
                os.environ,
                {"BACKEND_API_KEY": "server-api-key", "TRUSTED_PROXY": "false"},
            ),
            patch("app.rate_limiter.get_remote_address", return_value="172.18.0.2"),
        ):
            yield

    def _key(self, **kwargs) -> str:
        import app.rate_limiter as rl_module

        kwargs.setdefault("client_host", "172.18.0.2")
        return rl_module.get_client_ip(_make_request(**kwargs))

    def test_two_visitors_behind_the_bff_get_separate_buckets(self):
        key_a = self._key(api_key="server-api-key", rate_limit_client_ip="203.0.113.5")
        key_b = self._key(api_key="server-api-key", rate_limit_client_ip="198.51.100.7")

        assert key_a == "203.0.113.5"
        assert key_b == "198.51.100.7"

    def test_header_is_ignored_without_the_matching_service_key(self):
        """A direct caller cannot choose its own bucket by sending the header."""
        assert (
            self._key(api_key="wrong-key", rate_limit_client_ip="203.0.113.5")
            == "172.18.0.2"
        )
        assert self._key(rate_limit_client_ip="203.0.113.5") == "172.18.0.2"

    def test_header_is_ignored_when_no_service_key_is_configured(self):
        with patch.dict(os.environ, {"BACKEND_API_KEY": ""}):
            assert self._key(api_key="", rate_limit_client_ip="203.0.113.5") == (
                "172.18.0.2"
            )

    @pytest.mark.parametrize(
        "value", ["not-an-ip", "203.0.113.5, 10.0.0.1", "user:" + "a" * 64, "  "]
    )
    def test_malformed_values_fall_back_to_the_socket(self, value: str):
        assert self._key(api_key="server-api-key", rate_limit_client_ip=value) == (
            "172.18.0.2"
        )

    def test_ipv6_visitors_are_bucketed_by_slash_64(self):
        key_a = self._key(
            api_key="server-api-key", rate_limit_client_ip="2001:db8:1:2::1"
        )
        key_b = self._key(
            api_key="server-api-key",
            rate_limit_client_ip="2001:db8:1:2:ffff:ffff:ffff:ffff",
        )
        key_c = self._key(
            api_key="server-api-key", rate_limit_client_ip="2001:db8:1:3::1"
        )

        assert key_a == key_b == "2001:db8:1:2::/64"
        assert key_c != key_a

    def test_ipv4_mapped_ipv6_keys_as_ipv4(self):
        assert (
            self._key(
                api_key="server-api-key", rate_limit_client_ip="::ffff:203.0.113.5"
            )
            == "203.0.113.5"
        )

    def test_signed_in_identity_takes_precedence(self):
        identity = "c" * 64
        key = self._key(
            api_key="server-api-key",
            rate_limit_identity=identity,
            rate_limit_client_ip="203.0.113.5",
        )
        assert key == f"user:{identity}"

    def test_works_without_trusted_proxy(self):
        """Trust rests on the service key: the BFF does not go through the gateway."""
        with patch.dict(os.environ, {"TRUSTED_PROXY": "false"}):
            assert (
                self._key(api_key="server-api-key", rate_limit_client_ip="203.0.113.5")
                == "203.0.113.5"
            )


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


@pytest.mark.unit
class TestTestWithFallback:
    """test_with_fallback must check without consuming, and degrade like
    hit_with_fallback when storage is down."""

    def _limiter(self):
        from limits.storage import MemoryStorage
        from limits.strategies import MovingWindowRateLimiter

        return MovingWindowRateLimiter(MemoryStorage())

    def test_checking_does_not_consume_budget(self):
        from limits import parse

        import app.rate_limiter as rl_module

        limiter, item = self._limiter(), parse("2/minute")
        for _ in range(5):
            assert rl_module.test_with_fallback(limiter, item, "a") is True
        assert limiter.hit(item, "a") is True
        assert limiter.hit(item, "a") is True
        assert rl_module.test_with_fallback(limiter, item, "a") is False

    def test_storage_error_falls_back_and_still_enforces(self):
        from limits import parse

        import app.rate_limiter as rl_module

        limiter, item = self._limiter(), parse("2/minute")
        fallback = self._limiter()
        with (
            patch.object(limiter, "test", side_effect=ConnectionError("redis")),
            patch.object(rl_module, "_fallback_limiter", fallback),
        ):
            assert rl_module.test_with_fallback(limiter, item, "b") is True
            fallback.hit(item, "b")
            fallback.hit(item, "b")
            assert rl_module.test_with_fallback(limiter, item, "b") is False
