"""Unit tests for the Sentry allowlist PII scrubber (#194).

_scrub_event is the before_send hook. It is a pure dict transform, so these run
without sentry-sdk installed and pin the privacy invariants: only allowlisted
headers survive, cookies/query strings are filtered, user PII is dropped, and
emails are redacted from messages and exception values.
"""

import json

import pytest

from app.sentry import _scrub_event

pytestmark = pytest.mark.unit


class TestRequestScrubbing:
    def test_drops_non_allowlisted_headers(self):
        event = {
            "request": {
                "headers": {
                    "Authorization": "Bearer secret",
                    "Cookie": "session=abc",
                    "X-Api-Key": "key",
                    "Content-Type": "application/json",
                    "User-Agent": "pytest",
                }
            }
        }
        scrubbed = _scrub_event(event, {})
        headers = scrubbed["request"]["headers"]
        assert headers == {"Content-Type": "application/json", "User-Agent": "pytest"}
        assert "Authorization" not in headers
        assert "Cookie" not in headers

    def test_filters_cookies_and_query_string(self):
        event = {
            "request": {"cookies": "session=abc", "query_string": "email=a@b.com&q=x"}
        }
        scrubbed = _scrub_event(event, {})
        assert scrubbed["request"]["cookies"] == "[Filtered]"
        assert scrubbed["request"]["query_string"] == "[Filtered]"

    def test_no_request_section_is_safe(self):
        assert _scrub_event({}, {})["tags"]["service"] == "backend"


class TestUserScrubbing:
    def test_filters_user_pii_but_keeps_id(self):
        event = {
            "user": {
                "id": "user-123",
                "email": "a@b.com",
                "ip_address": "1.2.3.4",
                "username": "alice",
            }
        }
        user = _scrub_event(event, {})["user"]
        assert user["id"] == "user-123"
        assert user["email"] == "[Filtered]"
        assert user["ip_address"] == "[Filtered]"
        assert user["username"] == "[Filtered]"


class TestEmailRedaction:
    def test_redacts_email_in_message(self):
        event = {"message": "failed for user john.doe@example.com on retry"}
        assert "john.doe@example.com" not in _scrub_event(event, {})["message"]

    def test_redacts_email_in_exception_values(self):
        event = {
            "exception": {
                "values": [
                    {"type": "ValueError", "value": "bad address: jane@corp.co.uk"},
                    {"type": "KeyError", "value": "no pii here"},
                ]
            }
        }
        values = _scrub_event(event, {})["exception"]["values"]
        assert "jane@corp.co.uk" not in values[0]["value"]
        assert values[1]["value"] == "no pii here"


class TestTagging:
    def test_always_tags_service_backend(self):
        assert _scrub_event({}, {})["tags"]["service"] == "backend"

    def test_preserves_existing_tags(self):
        event = {"tags": {"foo": "bar"}}
        tags = _scrub_event(event, {})["tags"]
        assert tags["foo"] == "bar"
        assert tags["service"] == "backend"


_KEY = "jmcp_live_0123456789abcdefSECRETKEYMATERIAL"


def _frame(**extra):
    return {
        "function": "__call__",
        "vars": {"credential": _KEY, "token": _KEY},
        **extra,
    }


class TestFrameVarStripping:
    def test_strips_vars_from_exception_frames(self):
        event = {
            "exception": {
                "values": [
                    {
                        "type": "RuntimeError",
                        "stacktrace": {"frames": [_frame(), _frame()]},
                    }
                ]
            }
        }
        scrubbed = _scrub_event(event, {})
        frames = scrubbed["exception"]["values"][0]["stacktrace"]["frames"]
        assert all("vars" not in f for f in frames)
        assert frames[0]["function"] == "__call__"
        assert _KEY not in json.dumps(scrubbed)

    def test_strips_vars_from_thread_frames(self):
        event = {"threads": {"values": [{"stacktrace": {"frames": [_frame()]}}]}}
        scrubbed = _scrub_event(event, {})
        assert "vars" not in scrubbed["threads"]["values"][0]["stacktrace"]["frames"][0]
        assert _KEY not in json.dumps(scrubbed)

    def test_strips_vars_from_bare_list_sections(self):
        event = {
            "exception": [{"stacktrace": {"frames": [_frame()]}}],
            "threads": [{"stacktrace": {"frames": [_frame()]}}],
        }
        assert _KEY not in json.dumps(_scrub_event(event, {}))

    def test_frames_without_vars_pass_through(self):
        event = {
            "exception": {"values": [{"stacktrace": {"frames": [{"function": "f"}]}}]}
        }
        frames = _scrub_event(event, {})["exception"]["values"][0]["stacktrace"][
            "frames"
        ]
        assert frames == [{"function": "f"}]

    @pytest.mark.parametrize(
        "event",
        [
            {},
            {"exception": None},
            {"exception": "boom"},
            {"exception": {"values": "not-a-list"}},
            {"exception": {"values": [None, "x", {"stacktrace": None}]}},
            {"exception": {"values": [{"stacktrace": {"frames": "nope"}}]}},
            {"exception": {"values": [{"stacktrace": {"frames": [None, "x", 3]}}]}},
            {"threads": {"values": None}},
            {"threads": 5},
        ],
    )
    def test_unexpected_shapes_do_not_raise(self, event):
        assert _scrub_event(event, {})["tags"]["service"] == "backend"
