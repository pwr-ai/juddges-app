"""Unit tests for digest_notifications Celery task."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

# Ensure env vars that are read at import time don't cause failures
os.environ.setdefault("RESEND_API_KEY", "test-resend-key")
os.environ.setdefault("DIGEST_FROM_EMAIL", "test@juddges.app")
os.environ.setdefault("CELERY_BROKER_URL", "memory://")
os.environ.setdefault("CELERY_BACKEND_URL", "cache+memory://")
os.environ.setdefault("CELERY_PROJECT_NAME", "test_project")
os.environ.setdefault("SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.tasks.digest_notifications import (
    build_digest,
    collect_user_matches,
    deliver_email,
    deliver_in_app,
    deliver_webhook,
    fetch_active_subscriptions,
    fetch_all_recent_judgments,
    generate_highlights,
    send_digest,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SAMPLE_JUDGMENT = {
    "id": "judgment-1",
    "case_number": "II CSK 1/25",
    "jurisdiction": "PL",
    "court_name": "Supreme Court",
    "court_level": "Supreme",
    "decision_date": "2025-03-01",
    "title": "Contract dispute",
    "summary": "A contract case summary.",
    "keywords": ["contract"],
    "legal_topics": ["civil law"],
}

_SAMPLE_SUBSCRIPTION = {
    "id": "sub-1",
    "user_id": "user-1",
    "frequency": "daily",
    "is_active": True,
    "channels": ["email"],
    "webhook_url": None,
    "last_sent_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
    "search_config": {
        "query": "contract",
        "jurisdictions": ["PL"],
        "court_levels": ["Supreme"],
    },
}


def _make_supabase_chain(data: list) -> MagicMock:
    """Build a mock that mimics the Supabase fluent query builder chain."""
    terminal = MagicMock()
    terminal.execute.return_value = MagicMock(data=data)

    chain = MagicMock()
    # Each chained call returns itself (or terminal at the end)
    for method in (
        "select",
        "eq",
        "in_",
        "gte",
        "ilike",
        "order",
        "limit",
        "range",
        "update",
        "insert",
    ):
        getattr(chain, method).return_value = chain

    chain.execute.return_value = MagicMock(data=data)
    return chain


# ---------------------------------------------------------------------------
# Section 1: fetch_active_subscriptions
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFetchActiveSubscriptions:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_subscriptions_for_frequency(self, mock_sb):
        chain = _make_supabase_chain([_SAMPLE_SUBSCRIPTION])
        mock_sb.table.return_value = chain

        result = fetch_active_subscriptions("daily")

        assert result == [_SAMPLE_SUBSCRIPTION]
        mock_sb.table.assert_called_once_with("email_alert_subscriptions")

    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_empty_when_none(self, mock_sb):
        chain = _make_supabase_chain([])
        mock_sb.table.return_value = chain

        result = fetch_active_subscriptions("weekly")

        assert result == []

    @patch("app.tasks.digest_notifications.supabase_client", None)
    def test_returns_empty_when_no_client(self):
        result = fetch_active_subscriptions("daily")
        assert result == []


# ---------------------------------------------------------------------------
# Section 1: collect_user_matches
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCollectUserMatches:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_judgments_since_last_sent(self, mock_sb):
        chain = _make_supabase_chain([_SAMPLE_JUDGMENT])
        mock_sb.table.return_value = chain

        since = datetime.now(UTC) - timedelta(days=1)
        result = collect_user_matches(_SAMPLE_SUBSCRIPTION, since)

        assert result == [_SAMPLE_JUDGMENT]
        mock_sb.table.assert_called_once_with("judgments")

    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_empty_when_no_matches(self, mock_sb):
        chain = _make_supabase_chain([])
        mock_sb.table.return_value = chain

        since = datetime.now(UTC) - timedelta(days=1)
        result = collect_user_matches(_SAMPLE_SUBSCRIPTION, since)

        assert result == []

    @patch("app.tasks.digest_notifications.supabase_client", None)
    def test_returns_empty_when_no_client(self):
        since = datetime.now(UTC) - timedelta(days=1)
        result = collect_user_matches(_SAMPLE_SUBSCRIPTION, since)
        assert result == []

    @patch("app.tasks.digest_notifications.supabase_client")
    def test_no_filters_when_search_config_empty(self, mock_sb):
        chain = _make_supabase_chain([_SAMPLE_JUDGMENT])
        mock_sb.table.return_value = chain

        sub = {**_SAMPLE_SUBSCRIPTION, "search_config": {}}
        since = datetime.now(UTC) - timedelta(days=1)
        result = collect_user_matches(sub, since)

        assert result == [_SAMPLE_JUDGMENT]
        # ilike should NOT have been called since query is empty
        chain.ilike.assert_not_called()


# ---------------------------------------------------------------------------
# Section 1: fetch_all_recent_judgments
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFetchAllRecentJudgments:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_recent_judgments(self, mock_sb):
        chain = _make_supabase_chain([_SAMPLE_JUDGMENT])
        mock_sb.table.return_value = chain

        result = fetch_all_recent_judgments(days=7)

        assert result == [_SAMPLE_JUDGMENT]
        mock_sb.table.assert_called_once_with("judgments")

    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_empty_when_no_judgments(self, mock_sb):
        chain = _make_supabase_chain([])
        mock_sb.table.return_value = chain

        result = fetch_all_recent_judgments(days=7)

        assert result == []

    @patch("app.tasks.digest_notifications.supabase_client", None)
    def test_returns_empty_when_no_client(self):
        result = fetch_all_recent_judgments(days=7)
        assert result == []


# ---------------------------------------------------------------------------
# Section 2: generate_highlights
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGenerateHighlights:
    @patch("app.tasks.digest_notifications.get_llm")
    def test_generates_markdown_summary(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content="## Highlights\n- Case 1 summary"
        )
        mock_get_llm.return_value = mock_llm

        result = generate_highlights([_SAMPLE_JUDGMENT])

        assert "Highlights" in result or len(result) > 0
        mock_get_llm.assert_called_once_with(name="gpt-4o-mini")
        mock_llm.invoke.assert_called_once()

    def test_returns_empty_string_when_no_judgments(self):
        result = generate_highlights([])
        assert result == ""

    @patch("app.tasks.digest_notifications.get_llm")
    def test_uses_gpt4o_mini(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="summary")
        mock_get_llm.return_value = mock_llm

        generate_highlights([_SAMPLE_JUDGMENT], max_highlights=3)

        mock_get_llm.assert_called_once_with(name="gpt-4o-mini")

    @patch("app.tasks.digest_notifications.get_llm")
    def test_passes_human_message_to_llm(self, mock_get_llm):
        from langchain_core.messages import HumanMessage

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="highlights text")
        mock_get_llm.return_value = mock_llm

        generate_highlights([_SAMPLE_JUDGMENT])

        call_args = mock_llm.invoke.call_args[0][0]
        assert len(call_args) == 1
        assert isinstance(call_args[0], HumanMessage)


# ---------------------------------------------------------------------------
# Section 3: deliver_email
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestDeliverEmail:
    @patch("app.tasks.digest_notifications.httpx")
    def test_sends_via_resend_api(self, mock_httpx):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_resp

        deliver_email("user@example.com", "<p>body</p>", "Digest Subject")

        mock_httpx.post.assert_called_once()
        call_kwargs = mock_httpx.post.call_args

        url = call_kwargs[0][0]
        assert "resend.com" in url

        payload = call_kwargs[1]["json"]
        assert payload["to"] == ["user@example.com"]
        assert payload["subject"] == "Digest Subject"
        assert payload["html"] == "<p>body</p>"

    @patch("app.tasks.digest_notifications.httpx")
    def test_includes_auth_header(self, mock_httpx):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_resp

        deliver_email("user@example.com", "<p>body</p>", "Subject")

        headers = mock_httpx.post.call_args[1]["headers"]
        assert "Authorization" in headers
        assert "Bearer" in headers["Authorization"]

    @patch("app.tasks.digest_notifications.RESEND_API_KEY", "")
    @patch("app.tasks.digest_notifications.httpx")
    def test_skips_when_no_api_key(self, mock_httpx):
        deliver_email("user@example.com", "<p>body</p>", "Subject")
        mock_httpx.post.assert_not_called()


# ---------------------------------------------------------------------------
# Section 3: deliver_in_app
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestDeliverInApp:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_inserts_notification_row(self, mock_sb):
        chain = MagicMock()
        chain.insert.return_value = chain
        chain.execute.return_value = MagicMock(data=[{"id": "notif-1"}])
        mock_sb.table.return_value = chain

        deliver_in_app("user-1", "Digest Title", "Body text", link="/search")

        mock_sb.table.assert_called_once_with("notifications")
        insert_call = chain.insert.call_args[0][0]
        assert insert_call["user_id"] == "user-1"
        assert insert_call["title"] == "Digest Title"
        assert insert_call["body"] == "Body text"
        assert insert_call["link"] == "/search"
        assert insert_call["read"] is False

    @patch("app.tasks.digest_notifications.supabase_client")
    def test_inserts_without_link(self, mock_sb):
        chain = MagicMock()
        chain.insert.return_value = chain
        chain.execute.return_value = MagicMock(data=[])
        mock_sb.table.return_value = chain

        deliver_in_app("user-1", "Title", "Body")

        insert_call = chain.insert.call_args[0][0]
        assert "link" not in insert_call

    @patch("app.tasks.digest_notifications.supabase_client", None)
    def test_skips_when_no_client(self):
        # Should not raise
        deliver_in_app("user-1", "Title", "Body")


# ---------------------------------------------------------------------------
# Section 3: deliver_webhook
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestDeliverWebhook:
    @patch("app.tasks.digest_notifications.httpx")
    def test_slack_format(self, mock_httpx):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_resp

        deliver_webhook(
            "https://hooks.slack.com/services/T00/B00/abc",
            "Digest Title",
            "Body text",
        )

        payload = mock_httpx.post.call_args[1]["json"]
        assert "blocks" in payload
        block_types = [b["type"] for b in payload["blocks"]]
        assert "header" in block_types
        assert "section" in block_types

    @patch("app.tasks.digest_notifications.httpx")
    def test_discord_format(self, mock_httpx):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_resp

        deliver_webhook(
            "https://discord.com/api/webhooks/123/abc",
            "Digest Title",
            "Body text",
        )

        payload = mock_httpx.post.call_args[1]["json"]
        assert "embeds" in payload
        assert payload["embeds"][0]["title"] == "Digest Title"
        assert payload["embeds"][0]["description"] == "Body text"

    @patch("app.tasks.digest_notifications.httpx")
    def test_generic_format_for_other_urls(self, mock_httpx):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_resp

        deliver_webhook(
            "https://myapp.example.com/webhook",
            "Digest Title",
            "Body text",
        )

        payload = mock_httpx.post.call_args[1]["json"]
        assert payload == {"title": "Digest Title", "body": "Body text"}


# ---------------------------------------------------------------------------
# Section 4: build_digest
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildDigest:
    def test_daily_without_highlights(self):
        result = build_digest([_SAMPLE_JUDGMENT], "", "daily")

        assert "Daily" in result["subject"]
        assert "1 new match" in result["subject"]
        assert "Contract dispute" in result["html"]
        assert "highlights" not in result["html"].lower()

    def test_weekly_with_highlights(self):
        highlights = "## Week's Top Cases\n- Case 1"
        result = build_digest([_SAMPLE_JUDGMENT], highlights, "weekly")

        assert "Weekly" in result["subject"]
        assert "Highlights" in result["html"]
        assert "Case 1" in result["html"]
        assert "Contract dispute" in result["html"]

    def test_zero_matches_but_with_highlights(self):
        highlights = "## Week's Top Cases"
        result = build_digest([], highlights, "weekly")

        assert "0 new match" in result["subject"]
        assert "Highlights" in result["html"]
        assert "No new matches" in result["html"]

    def test_subject_pluralisation(self):
        result_one = build_digest([_SAMPLE_JUDGMENT], "", "daily")
        result_two = build_digest([_SAMPLE_JUDGMENT, _SAMPLE_JUDGMENT], "", "daily")

        assert "1 new match" in result_one["subject"]
        assert "es" not in result_one["subject"].split("match")[1][:2]
        assert "2 new matches" in result_two["subject"]

    def test_html_and_text_both_present(self):
        result = build_digest([_SAMPLE_JUDGMENT], "", "daily")
        assert result["html"]
        assert result["text"]
        assert result["subject"]


# ---------------------------------------------------------------------------
# Section 4: send_digest (integration of all helpers)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSendDigest:
    @patch("app.tasks.digest_notifications.log_delivery")
    @patch("app.tasks.digest_notifications.update_last_sent")
    @patch("app.tasks.digest_notifications._get_user_email")
    @patch("app.tasks.digest_notifications.deliver_email")
    @patch("app.tasks.digest_notifications.collect_user_matches")
    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_daily_sends_email(
        self,
        mock_fetch_subs,
        mock_collect,
        mock_deliver_email,
        mock_get_email,
        mock_update,
        mock_log,
    ):
        mock_fetch_subs.return_value = [_SAMPLE_SUBSCRIPTION]
        mock_collect.return_value = [_SAMPLE_JUDGMENT]
        mock_get_email.return_value = "user@example.com"

        result = send_digest("daily")

        assert result["status"] == "ok"
        assert result["delivered"] == 1
        assert result["skipped"] == 0
        mock_deliver_email.assert_called_once()
        mock_update.assert_called_once_with("sub-1")
        mock_log.assert_called_once()

    @patch("app.tasks.digest_notifications.log_delivery")
    @patch("app.tasks.digest_notifications.update_last_sent")
    @patch("app.tasks.digest_notifications._get_user_email")
    @patch("app.tasks.digest_notifications.deliver_webhook")
    @patch("app.tasks.digest_notifications.deliver_in_app")
    @patch("app.tasks.digest_notifications.deliver_email")
    @patch("app.tasks.digest_notifications.generate_highlights")
    @patch("app.tasks.digest_notifications.fetch_all_recent_judgments")
    @patch("app.tasks.digest_notifications.collect_user_matches")
    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_weekly_generates_highlights_and_delivers_multiple_channels(
        self,
        mock_fetch_subs,
        mock_collect,
        mock_fetch_recent,
        mock_highlights,
        mock_deliver_email,
        mock_deliver_in_app,
        mock_deliver_webhook,
        mock_get_email,
        mock_update,
        mock_log,
    ):
        weekly_sub = {
            **_SAMPLE_SUBSCRIPTION,
            "frequency": "weekly",
            "channels": ["email", "in_app", "webhook"],
            "webhook_url": "https://myapp.example.com/hook",
        }
        mock_fetch_subs.return_value = [weekly_sub]
        mock_collect.return_value = [_SAMPLE_JUDGMENT]
        mock_fetch_recent.return_value = [_SAMPLE_JUDGMENT]
        mock_highlights.return_value = "## Highlights\n- Case 1"
        mock_get_email.return_value = "user@example.com"

        result = send_digest("weekly")

        assert result["status"] == "ok"
        assert result["delivered"] == 1
        mock_fetch_recent.assert_called_once()
        mock_highlights.assert_called_once()
        mock_deliver_email.assert_called_once()
        mock_deliver_in_app.assert_called_once()
        mock_deliver_webhook.assert_called_once()

    @patch("app.tasks.digest_notifications.log_delivery")
    @patch("app.tasks.digest_notifications.collect_user_matches")
    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_skips_when_no_matches_and_no_highlights(
        self, mock_fetch_subs, mock_collect, mock_log
    ):
        mock_fetch_subs.return_value = [_SAMPLE_SUBSCRIPTION]
        mock_collect.return_value = []

        result = send_digest("daily")

        assert result["skipped"] == 1
        assert result["delivered"] == 0
        mock_log.assert_called_once_with("sub-1", "daily", 0)

    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_returns_ok_when_no_subscriptions(self, mock_fetch_subs):
        mock_fetch_subs.return_value = []

        result = send_digest("daily")

        assert result == {
            "status": "ok",
            "frequency": "daily",
            "delivered": 0,
            "skipped": 0,
        }

    @patch("app.tasks.digest_notifications.log_delivery")
    @patch("app.tasks.digest_notifications.update_last_sent")
    @patch("app.tasks.digest_notifications._get_user_email")
    @patch("app.tasks.digest_notifications.deliver_email")
    @patch("app.tasks.digest_notifications.collect_user_matches")
    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_skips_email_when_no_address_found(
        self,
        mock_fetch_subs,
        mock_collect,
        mock_deliver_email,
        mock_get_email,
        mock_update,
        mock_log,
    ):
        mock_fetch_subs.return_value = [_SAMPLE_SUBSCRIPTION]
        mock_collect.return_value = [_SAMPLE_JUDGMENT]
        mock_get_email.return_value = None  # no email address found

        result = send_digest("daily")

        assert result["delivered"] == 1
        mock_deliver_email.assert_not_called()
