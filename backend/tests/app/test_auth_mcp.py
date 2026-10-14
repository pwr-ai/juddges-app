"""Unit tests for app.core.auth_mcp key material helpers."""

import pytest

from app.core.auth_mcp import (
    MCP_KEY_PREFIX,
    generate_mcp_key,
    hash_mcp_key,
    key_prefix,
)


@pytest.mark.unit
class TestKeyMaterial:
    def test_generated_key_carries_the_prefix(self):
        assert generate_mcp_key().startswith(MCP_KEY_PREFIX)

    def test_generated_keys_are_unique(self):
        assert len({generate_mcp_key() for _ in range(100)}) == 100

    def test_generated_key_has_enough_entropy(self):
        # 32 random bytes base64url-encoded is 43 chars, no padding.
        assert len(generate_mcp_key()) >= len(MCP_KEY_PREFIX) + 43

    def test_hash_is_stable_and_hex(self):
        token = "jdg_mcp_abc"  # noqa: S105
        first = hash_mcp_key(token)
        assert first == hash_mcp_key(token)
        assert len(first) == 64
        assert int(first, 16) >= 0

    def test_hash_differs_between_keys(self):
        assert hash_mcp_key("jdg_mcp_a") != hash_mcp_key("jdg_mcp_b")

    def test_hash_never_contains_the_plaintext(self):
        token = generate_mcp_key()
        assert token[len(MCP_KEY_PREFIX) :] not in hash_mcp_key(token)

    def test_key_prefix_is_the_first_eight_characters(self):
        token = "jdg_mcp_ABCDEFGHIJ"  # noqa: S105
        assert key_prefix(token) == "jdg_mcp_"[:8]
        assert len(key_prefix(token)) == 8
