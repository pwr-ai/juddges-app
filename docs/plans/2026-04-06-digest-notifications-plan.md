# Digest & Notification System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cron-based daily/weekly digests with email, in-app, and webhook (Slack/Discord) delivery, driven by users' saved search subscriptions.

**Architecture:** One new Celery task file (`digest_notifications.py`) registers with Beat for daily (7 AM) and weekly (Monday 8 AM) runs. Each run fetches active subscriptions, queries Supabase for new judgment matches, optionally generates LLM highlights (weekly), then delivers through pluggable channel handlers. A new `notifications` table supports in-app delivery.

**Tech Stack:** Celery Beat, Supabase (sync client), Resend API (email), httpx (webhooks), LangChain ChatOpenAI (highlights), pytest

**Design doc:** `docs/plans/2026-04-06-digest-notifications-design.md`

---

### Task 1: Supabase Migration — Schema Changes

**Files:**
- Create: `supabase/migrations/20260406000001_digest_notifications.sql`

**Step 1: Write the migration SQL**

```sql
-- Add digest columns to email_alert_subscriptions
-- (if this table doesn't exist yet, create it — see step notes)
DO $$
BEGIN
  -- Create email_alert_subscriptions if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_alert_subscriptions') THEN
    CREATE TABLE public.email_alert_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      search_config JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_email_alert_subs_user ON public.email_alert_subscriptions(user_id);
  END IF;
END $$;

-- Add new columns (idempotent with IF NOT EXISTS pattern)
ALTER TABLE public.email_alert_subscriptions
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('daily', 'weekly'));

ALTER TABLE public.email_alert_subscriptions
  ADD COLUMN IF NOT EXISTS channels JSONB NOT NULL DEFAULT '["email"]';

ALTER TABLE public.email_alert_subscriptions
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Index for Beat queries: "get active subs for this frequency"
CREATE INDEX IF NOT EXISTS idx_email_alert_subs_active_freq
  ON public.email_alert_subscriptions(frequency)
  WHERE is_active = true;

-- In-app notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read)
  WHERE read = false;

-- Digest delivery log (if email_alert_logs doesn't exist)
CREATE TABLE IF NOT EXISTS public.email_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.email_alert_subscriptions(id) ON DELETE SET NULL,
  frequency TEXT,
  matches_count INT NOT NULL DEFAULT 0,
  channels_delivered JSONB NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies (service role bypasses, but good practice)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE public.email_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_alert_logs_select_own ON public.email_alert_logs
  FOR SELECT USING (
    subscription_id IN (
      SELECT id FROM public.email_alert_subscriptions WHERE user_id = auth.uid()
    )
  );
```

**Step 2: Verify migration file is valid SQL**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app && cat supabase/migrations/20260406000001_digest_notifications.sql | head -5`
Expected: First lines of migration visible

**Step 3: Commit**

```bash
git add supabase/migrations/20260406000001_digest_notifications.sql
git commit -m "feat(db): add digest notifications schema — subscriptions, notifications, logs"
```

---

### Task 2: Digest Task — Data Collection Functions

**Files:**
- Create: `backend/app/tasks/digest_notifications.py`
- Test: `backend/tests/app/tasks/test_digest_notifications.py`

**Step 1: Write failing tests for data collection**

Create `backend/tests/app/tasks/test_digest_notifications.py`:

```python
"""Tests for digest notification task."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.unit
class TestFetchActiveSubscriptions:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_subscriptions_for_frequency(self, mock_sb):
        from app.tasks.digest_notifications import fetch_active_subscriptions

        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {
                "id": "sub-1",
                "user_id": "user-1",
                "query": "GDPR penalties",
                "search_config": {},
                "channels": ["email"],
                "webhook_url": None,
                "last_sent_at": None,
                "frequency": "daily",
            }
        ]
        result = fetch_active_subscriptions("daily")
        assert len(result) == 1
        assert result[0]["id"] == "sub-1"

    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_empty_when_no_subscriptions(self, mock_sb):
        from app.tasks.digest_notifications import fetch_active_subscriptions

        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        result = fetch_active_subscriptions("daily")
        assert result == []


@pytest.mark.unit
class TestCollectUserMatches:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_new_judgments_since_last_sent(self, mock_sb):
        from app.tasks.digest_notifications import collect_user_matches

        mock_sb.table.return_value.select.return_value.ilike.return_value.gte.return_value.order.return_value.limit.return_value.execute.return_value.data = [
            {"id": "j-1", "title": "Test Judgment", "case_number": "II SA/Wa 123/25"}
        ]
        sub = {
            "query": "GDPR",
            "search_config": {},
            "last_sent_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
        }
        result = collect_user_matches(sub, since=datetime.now(UTC) - timedelta(days=1))
        assert len(result) == 1
        assert result[0]["id"] == "j-1"


@pytest.mark.unit
class TestFetchAllRecentJudgments:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_returns_judgments_from_last_n_days(self, mock_sb):
        from app.tasks.digest_notifications import fetch_all_recent_judgments

        mock_sb.table.return_value.select.return_value.gte.return_value.order.return_value.limit.return_value.execute.return_value.data = [
            {"id": "j-1", "title": "Recent Judgment", "summary": "A ruling on..."}
        ]
        result = fetch_all_recent_judgments(days=7)
        assert len(result) == 1
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -v -m unit`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.tasks.digest_notifications'`

**Step 3: Write minimal implementation — data collection functions**

Create `backend/app/tasks/digest_notifications.py`:

```python
"""Celery task for daily/weekly digest notifications.

Delivers personalized judgment matches + AI-curated highlights
via email (Resend), in-app notifications (Supabase), and webhooks (Slack/Discord).

To add a new digest type: copy this file, change collect_user_matches(), add a Beat entry.
To add a new channel: add a deliver_<channel>() function and register it in DELIVERY_HANDLERS.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from loguru import logger

from app.core.supabase import supabase_client
from app.workers import celery_app

# Resend config (reuses same env vars as frontend contact form)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("DIGEST_FROM_EMAIL", "digest@juddges.app")

# Columns to fetch for digest — skip embedding vector (large, unused here)
_JUDGMENT_DIGEST_COLS = (
    "id, case_number, jurisdiction, court_name, court_level, "
    "decision_date, title, summary, keywords, legal_topics"
)


def fetch_active_subscriptions(frequency: str) -> list[dict[str, Any]]:
    """Get all active subscriptions matching this frequency."""
    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot fetch subscriptions")
        return []

    resp = (
        supabase_client.table("email_alert_subscriptions")
        .select("id, user_id, query, search_config, channels, webhook_url, last_sent_at, frequency")
        .eq("is_active", True)
        .eq("frequency", frequency)
        .execute()
    )
    return resp.data or []


def collect_user_matches(
    subscription: dict[str, Any],
    since: datetime,
) -> list[dict[str, Any]]:
    """Run user's saved search query against judgments added since last digest.

    Uses simple text matching on title/summary + search_config filters.
    This is intentionally simpler than the full RAG pipeline — digests
    just need "new stuff matching your keywords", not semantic search.
    """
    if not supabase_client:
        return []

    query_text = subscription.get("query", "")
    search_config = subscription.get("search_config", {})
    filters = search_config.get("filters", {})

    # Start with base query — new judgments since last digest
    q = (
        supabase_client.table("judgments")
        .select(_JUDGMENT_DIGEST_COLS)
    )

    # Text match on title or summary (case-insensitive LIKE)
    if query_text:
        q = q.ilike("title", f"%{query_text}%")

    q = q.gte("created_at", since.isoformat())

    # Apply optional filters from search_config
    jurisdictions = filters.get("jurisdictions")
    if jurisdictions:
        q = q.in_("jurisdiction", jurisdictions)

    court_levels = filters.get("courtLevels")
    if court_levels:
        q = q.in_("court_level", court_levels)

    q = q.order("decision_date", desc=True).limit(20)

    resp = q.execute()
    return resp.data or []


def fetch_all_recent_judgments(days: int = 7) -> list[dict[str, Any]]:
    """Get recent judgments for LLM highlights (weekly digest)."""
    if not supabase_client:
        return []

    since = datetime.now(UTC) - timedelta(days=days)
    resp = (
        supabase_client.table("judgments")
        .select(_JUDGMENT_DIGEST_COLS)
        .gte("created_at", since.isoformat())
        .order("decision_date", desc=True)
        .limit(50)
        .execute()
    )
    return resp.data or []
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -v -m unit`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add backend/app/tasks/digest_notifications.py backend/tests/app/tasks/test_digest_notifications.py
git commit -m "feat(digest): add data collection functions — subscriptions, matches, recent judgments"
```

---

### Task 3: Digest Task — LLM Highlights

**Files:**
- Modify: `backend/app/tasks/digest_notifications.py`
- Modify: `backend/tests/app/tasks/test_digest_notifications.py`

**Step 1: Write failing test for LLM highlights**

Append to test file:

```python
@pytest.mark.unit
class TestGenerateHighlights:
    @patch("app.tasks.digest_notifications.get_llm")
    def test_generates_markdown_summary(self, mock_get_llm):
        from app.tasks.digest_notifications import generate_highlights

        mock_llm = MagicMock()
        mock_llm.invoke.return_value.content = (
            "## Legal Highlights\n\n"
            "1. **Supreme Court ruling** on data protection...\n"
        )
        mock_get_llm.return_value = mock_llm

        judgments = [
            {"id": "j-1", "title": "GDPR Penalty Case", "summary": "Court imposed fine..."},
            {"id": "j-2", "title": "Employment Law", "summary": "Unfair dismissal..."},
        ]
        result = generate_highlights(judgments)
        assert "Legal Highlights" in result
        mock_llm.invoke.assert_called_once()

    def test_returns_empty_string_when_no_judgments(self):
        from app.tasks.digest_notifications import generate_highlights

        result = generate_highlights([])
        assert result == ""
```

**Step 2: Run test to verify it fails**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py::TestGenerateHighlights -v -m unit`
Expected: FAIL — `ImportError: cannot import name 'generate_highlights'`

**Step 3: Add generate_highlights to digest_notifications.py**

Add this import at top of file:
```python
from juddges_search.llms import get_llm
from langchain_core.messages import HumanMessage
```

Add this function after `fetch_all_recent_judgments`:

```python
def generate_highlights(judgments: list[dict[str, Any]], max_highlights: int = 5) -> str:
    """Pick most significant recent judgments, write 2-3 sentence summaries.

    Called once per weekly digest run — the result is shared across all users.
    Uses GPT-4o-mini to keep costs low (~$0.01 per call).
    """
    if not judgments:
        return ""

    # Format judgments for the prompt
    entries = []
    for j in judgments[:30]:  # Cap input to control token usage
        entries.append(
            f"- [{j.get('case_number', 'N/A')}] {j.get('title', 'Untitled')}\n"
            f"  Court: {j.get('court_name', 'Unknown')} | Date: {j.get('decision_date', 'Unknown')}\n"
            f"  Summary: {j.get('summary', 'No summary available')[:300]}"
        )
    formatted = "\n".join(entries)

    prompt = (
        "You are a legal analyst preparing a weekly digest for judges and lawyers. "
        f"From the following {len(entries)} recent court judgments, select the {max_highlights} "
        "most significant ones and write a brief highlight for each (2-3 sentences). "
        "Focus on legal significance, novel interpretations, and practical impact.\n\n"
        "Format as markdown with numbered list under a '## Legal Highlights' header.\n\n"
        f"Judgments:\n{formatted}"
    )

    llm = get_llm(name="gpt-4o-mini")
    response = llm.invoke([HumanMessage(content=prompt)])
    return response.content
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py::TestGenerateHighlights -v -m unit`
Expected: 2 tests PASS

**Step 5: Commit**

```bash
git add backend/app/tasks/digest_notifications.py backend/tests/app/tasks/test_digest_notifications.py
git commit -m "feat(digest): add LLM highlights generation for weekly digest"
```

---

### Task 4: Digest Task — Delivery Handlers

**Files:**
- Modify: `backend/app/tasks/digest_notifications.py`
- Modify: `backend/tests/app/tasks/test_digest_notifications.py`

**Step 1: Write failing tests for delivery handlers**

Append to test file:

```python
@pytest.mark.unit
class TestDeliverEmail:
    @patch("app.tasks.digest_notifications.httpx")
    def test_sends_email_via_resend(self, mock_httpx):
        from app.tasks.digest_notifications import deliver_email

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_response

        with patch("app.tasks.digest_notifications.RESEND_API_KEY", "re_test_key"):
            deliver_email("user@example.com", "<h1>Digest</h1>", "Weekly Legal Digest")

        mock_httpx.post.assert_called_once()
        call_kwargs = mock_httpx.post.call_args
        assert call_kwargs[0][0] == "https://api.resend.com/emails"


@pytest.mark.unit
class TestDeliverInApp:
    @patch("app.tasks.digest_notifications.supabase_client")
    def test_inserts_notification_row(self, mock_sb):
        from app.tasks.digest_notifications import deliver_in_app

        deliver_in_app("user-1", "New digest", "3 new matches", "/search?q=GDPR")
        mock_sb.table.assert_called_with("notifications")
        mock_sb.table.return_value.insert.assert_called_once()


@pytest.mark.unit
class TestDeliverWebhook:
    @patch("app.tasks.digest_notifications.httpx")
    def test_sends_slack_format_for_slack_url(self, mock_httpx):
        from app.tasks.digest_notifications import deliver_webhook

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_response

        deliver_webhook(
            "https://hooks.slack.com/services/T00/B00/xxx",
            title="Weekly Digest",
            body="5 new matches",
        )
        call_kwargs = mock_httpx.post.call_args
        payload = call_kwargs[1]["json"]
        assert "blocks" in payload

    @patch("app.tasks.digest_notifications.httpx")
    def test_sends_discord_format_for_discord_url(self, mock_httpx):
        from app.tasks.digest_notifications import deliver_webhook

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_response

        deliver_webhook(
            "https://discord.com/api/webhooks/123/abc",
            title="Weekly Digest",
            body="5 new matches",
        )
        call_kwargs = mock_httpx.post.call_args
        payload = call_kwargs[1]["json"]
        assert "embeds" in payload

    @patch("app.tasks.digest_notifications.httpx")
    def test_sends_generic_json_for_unknown_url(self, mock_httpx):
        from app.tasks.digest_notifications import deliver_webhook

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_httpx.post.return_value = mock_response

        deliver_webhook(
            "https://example.com/hook",
            title="Weekly Digest",
            body="5 new matches",
        )
        call_kwargs = mock_httpx.post.call_args
        payload = call_kwargs[1]["json"]
        assert payload["title"] == "Weekly Digest"
        assert "blocks" not in payload
        assert "embeds" not in payload
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -k "Deliver" -v -m unit`
Expected: FAIL — `ImportError`

**Step 3: Add delivery handlers to digest_notifications.py**

Add these functions after `generate_highlights`:

```python
def deliver_email(to_email: str, html_body: str, subject: str) -> None:
    """Send digest email via Resend API."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping email delivery")
        return

    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": RESEND_FROM_EMAIL,
            "to": to_email,
            "subject": subject,
            "html": html_body,
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    logger.info(f"Digest email sent to {to_email}")


def deliver_in_app(user_id: str, title: str, body: str, link: str | None = None) -> None:
    """Insert notification row into Supabase."""
    if not supabase_client:
        logger.warning("Supabase unavailable — skipping in-app notification")
        return

    supabase_client.table("notifications").insert({
        "user_id": user_id,
        "title": title,
        "body": body,
        "link": link,
    }).execute()
    logger.info(f"In-app notification created for user {user_id}")


def deliver_webhook(webhook_url: str, title: str, body: str) -> None:
    """POST digest to webhook. Auto-detects Slack/Discord format from URL."""
    if "hooks.slack.com" in webhook_url:
        payload = {
            "blocks": [
                {"type": "header", "text": {"type": "plain_text", "text": title}},
                {"type": "section", "text": {"type": "mrkdwn", "text": body}},
            ]
        }
    elif "discord.com/api/webhooks" in webhook_url:
        payload = {
            "embeds": [{"title": title, "description": body, "color": 3447003}]
        }
    else:
        payload = {"title": title, "body": body}

    resp = httpx.post(webhook_url, json=payload, timeout=10.0)
    resp.raise_for_status()
    logger.info(f"Webhook delivered to {webhook_url[:50]}...")
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -k "Deliver" -v -m unit`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add backend/app/tasks/digest_notifications.py backend/tests/app/tasks/test_digest_notifications.py
git commit -m "feat(digest): add delivery handlers — email (Resend), in-app, webhook (Slack/Discord)"
```

---

### Task 5: Digest Task — Main Task + Build Digest

**Files:**
- Modify: `backend/app/tasks/digest_notifications.py`
- Modify: `backend/tests/app/tasks/test_digest_notifications.py`

**Step 1: Write failing tests for build_digest and send_digest**

Append to test file:

```python
@pytest.mark.unit
class TestBuildDigest:
    def test_builds_daily_digest_without_highlights(self):
        from app.tasks.digest_notifications import build_digest

        matches = [
            {"title": "GDPR Case", "case_number": "II SA/Wa 1/26", "court_name": "WSA Warszawa",
             "decision_date": "2026-04-01", "summary": "Fine imposed."}
        ]
        result = build_digest(matches, highlights=None, frequency="daily")
        assert "GDPR Case" in result["html"]
        assert "II SA/Wa 1/26" in result["html"]
        assert result["subject"] == "Juddges Daily Digest — 1 new match"
        assert "highlights" not in result["html"].lower() or result.get("highlights") is None

    def test_builds_weekly_digest_with_highlights(self):
        from app.tasks.digest_notifications import build_digest

        matches = [
            {"title": "Case A", "case_number": "I ACa 1/26", "court_name": "SA Krakow",
             "decision_date": "2026-04-01", "summary": "Appeal dismissed."}
        ]
        highlights = "## Legal Highlights\n\n1. **Major ruling**..."
        result = build_digest(matches, highlights=highlights, frequency="weekly")
        assert "Legal Highlights" in result["html"]
        assert result["subject"] == "Juddges Weekly Digest — 1 new match"

    def test_builds_digest_with_zero_matches_but_highlights(self):
        from app.tasks.digest_notifications import build_digest

        highlights = "## Legal Highlights\n\n1. Something important..."
        result = build_digest([], highlights=highlights, frequency="weekly")
        assert "Legal Highlights" in result["html"]
        assert "0 new matches" in result["subject"]


@pytest.mark.unit
class TestSendDigest:
    @patch("app.tasks.digest_notifications.log_delivery")
    @patch("app.tasks.digest_notifications.update_last_sent")
    @patch("app.tasks.digest_notifications.deliver_email")
    @patch("app.tasks.digest_notifications.collect_user_matches")
    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_daily_digest_sends_email(
        self, mock_fetch, mock_collect, mock_deliver_email, mock_update, mock_log
    ):
        from app.tasks.digest_notifications import send_digest

        mock_fetch.return_value = [
            {
                "id": "sub-1",
                "user_id": "user-1",
                "query": "GDPR",
                "search_config": {},
                "channels": ["email"],
                "webhook_url": None,
                "last_sent_at": "2026-04-05T00:00:00+00:00",
                "frequency": "daily",
            }
        ]
        mock_collect.return_value = [
            {"title": "Case", "case_number": "X", "court_name": "Y",
             "decision_date": "2026-04-06", "summary": "Z"}
        ]

        send_digest(frequency="daily")

        mock_deliver_email.assert_called_once()
        mock_update.assert_called_once_with("sub-1")
        mock_log.assert_called_once()

    @patch("app.tasks.digest_notifications.log_delivery")
    @patch("app.tasks.digest_notifications.update_last_sent")
    @patch("app.tasks.digest_notifications.deliver_email")
    @patch("app.tasks.digest_notifications.deliver_webhook")
    @patch("app.tasks.digest_notifications.collect_user_matches")
    @patch("app.tasks.digest_notifications.fetch_all_recent_judgments")
    @patch("app.tasks.digest_notifications.generate_highlights")
    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_weekly_digest_generates_highlights_and_delivers(
        self, mock_fetch, mock_highlights, mock_recent, mock_collect,
        mock_webhook, mock_email, mock_update, mock_log,
    ):
        from app.tasks.digest_notifications import send_digest

        mock_fetch.return_value = [
            {
                "id": "sub-1",
                "user_id": "user-1",
                "query": "employment law",
                "search_config": {},
                "channels": ["email", "webhook"],
                "webhook_url": "https://hooks.slack.com/services/T/B/x",
                "last_sent_at": "2026-03-30T00:00:00+00:00",
                "frequency": "weekly",
            }
        ]
        mock_recent.return_value = [{"id": "j-1", "title": "T", "summary": "S"}]
        mock_highlights.return_value = "## Legal Highlights\n1. Important..."
        mock_collect.return_value = []

        send_digest(frequency="weekly")

        mock_highlights.assert_called_once()
        mock_email.assert_called_once()
        mock_webhook.assert_called_once()

    @patch("app.tasks.digest_notifications.deliver_email")
    @patch("app.tasks.digest_notifications.collect_user_matches")
    @patch("app.tasks.digest_notifications.fetch_active_subscriptions")
    def test_skips_user_when_no_matches_and_no_highlights(
        self, mock_fetch, mock_collect, mock_deliver_email,
    ):
        from app.tasks.digest_notifications import send_digest

        mock_fetch.return_value = [
            {
                "id": "sub-1",
                "user_id": "user-1",
                "query": "obscure topic",
                "search_config": {},
                "channels": ["email"],
                "webhook_url": None,
                "last_sent_at": "2026-04-05T00:00:00+00:00",
                "frequency": "daily",
            }
        ]
        mock_collect.return_value = []

        send_digest(frequency="daily")

        mock_deliver_email.assert_not_called()
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -k "BuildDigest or SendDigest" -v -m unit`
Expected: FAIL

**Step 3: Add build_digest, send_digest, and helpers**

Add to `digest_notifications.py`:

```python
import markdown  # Add to imports if available, otherwise use simple html conversion
```

Actually, skip the markdown dependency. Use a simple HTML builder. Add these functions:

```python
def _matches_to_html(matches: list[dict[str, Any]]) -> str:
    """Render judgment matches as HTML list items."""
    if not matches:
        return ""
    items = []
    for m in matches:
        items.append(
            f'<li><strong>{m.get("case_number", "N/A")}</strong> — {m.get("title", "Untitled")}<br/>'
            f'<small>{m.get("court_name", "")} | {m.get("decision_date", "")}</small><br/>'
            f'<em>{(m.get("summary") or "")[:200]}</em></li>'
        )
    return "<ul>" + "".join(items) + "</ul>"


def _matches_to_text(matches: list[dict[str, Any]]) -> str:
    """Render judgment matches as plain text for webhooks."""
    if not matches:
        return "No new matches for your saved searches."
    lines = []
    for m in matches:
        lines.append(
            f"- [{m.get('case_number', 'N/A')}] {m.get('title', 'Untitled')} "
            f"({m.get('court_name', '')}, {m.get('decision_date', '')})"
        )
    return "\n".join(lines)


def build_digest(
    matches: list[dict[str, Any]],
    highlights: str | None,
    frequency: str,
) -> dict[str, str]:
    """Build digest payload with HTML (email), text (webhook), and subject."""
    count = len(matches)
    freq_label = "Daily" if frequency == "daily" else "Weekly"
    subject = f"Juddges {freq_label} Digest — {count} new match{'es' if count != 1 else ''}"

    # HTML body for email
    html_parts = [f"<h1>Juddges {freq_label} Digest</h1>"]

    if highlights:
        # Convert markdown highlights to simple HTML
        html_highlights = highlights.replace("## ", "<h2>").replace("\n1.", "</h2><ol><li>")
        html_highlights = html_highlights.replace("\n2.", "</li><li>").replace("\n3.", "</li><li>")
        html_highlights = html_highlights.replace("\n4.", "</li><li>").replace("\n5.", "</li><li>")
        if "<ol>" in html_highlights:
            html_highlights += "</li></ol>"
        html_parts.append(html_highlights)

    if matches:
        html_parts.append(f"<h2>Your Matches ({count})</h2>")
        html_parts.append(_matches_to_html(matches))
    elif not highlights:
        html_parts.append("<p>No new matches this period.</p>")

    html_body = "\n".join(html_parts)

    # Plain text for webhooks
    text_parts = [f"**Juddges {freq_label} Digest**"]
    if highlights:
        text_parts.append(highlights)
    if matches:
        text_parts.append(f"\n**Your Matches ({count})**")
        text_parts.append(_matches_to_text(matches))

    return {
        "subject": subject,
        "html": html_body,
        "text": "\n\n".join(text_parts),
    }


def update_last_sent(subscription_id: str) -> None:
    """Update last_sent_at timestamp for a subscription."""
    if not supabase_client:
        return
    supabase_client.table("email_alert_subscriptions").update(
        {"last_sent_at": datetime.now(UTC).isoformat()}
    ).eq("id", subscription_id).execute()


def log_delivery(
    subscription_id: str,
    frequency: str,
    matches_count: int,
    channels_delivered: list[str] | None = None,
    error: str | None = None,
) -> None:
    """Log digest delivery to email_alert_logs."""
    if not supabase_client:
        return
    supabase_client.table("email_alert_logs").insert({
        "subscription_id": subscription_id,
        "frequency": frequency,
        "matches_count": matches_count,
        "channels_delivered": channels_delivered or [],
        "error": error,
    }).execute()


def _get_user_email(user_id: str) -> str | None:
    """Look up user email from Supabase auth.users via service role."""
    if not supabase_client:
        return None
    resp = supabase_client.auth.admin.get_user_by_id(user_id)
    if resp and resp.user:
        return resp.user.email
    return None


@celery_app.task(
    name="digest.send",
    max_retries=2,
    default_retry_delay=120,
    autoretry_for=(ConnectionError, OSError, TimeoutError),
    retry_backoff=True,
)
def send_digest(frequency: str = "daily") -> dict[str, Any]:
    """Main digest task — called by Celery Beat daily and weekly.

    Args:
        frequency: "daily" (matches only) or "weekly" (matches + LLM highlights).
    """
    logger.info(f"Starting {frequency} digest run")
    subscriptions = fetch_active_subscriptions(frequency)

    if not subscriptions:
        logger.info(f"No active {frequency} subscriptions — skipping")
        return {"status": "skipped", "reason": "no_subscriptions"}

    # Weekly: generate highlights once (shared across all users)
    highlights = None
    if frequency == "weekly":
        recent = fetch_all_recent_judgments(days=7)
        if recent:
            highlights = generate_highlights(recent)

    delivered_count = 0
    skipped_count = 0

    for sub in subscriptions:
        since_str = sub.get("last_sent_at")
        if since_str:
            since = datetime.fromisoformat(since_str)
        else:
            # First digest — look back 1 day for daily, 7 days for weekly
            days_back = 1 if frequency == "daily" else 7
            since = datetime.now(UTC) - timedelta(days=days_back)

        matches = collect_user_matches(sub, since=since)

        if not matches and not highlights:
            skipped_count += 1
            continue

        digest = build_digest(matches, highlights, frequency)
        channels = sub.get("channels", ["email"])
        delivered_channels = []

        for channel in channels:
            try:
                if channel == "email":
                    user_email = _get_user_email(sub["user_id"])
                    if user_email:
                        deliver_email(user_email, digest["html"], digest["subject"])
                        delivered_channels.append("email")
                elif channel == "in_app":
                    deliver_in_app(
                        sub["user_id"],
                        digest["subject"],
                        f"{len(matches)} new matches",
                        f"/search?q={sub.get('query', '')}",
                    )
                    delivered_channels.append("in_app")
                elif channel == "webhook" and sub.get("webhook_url"):
                    deliver_webhook(sub["webhook_url"], digest["subject"], digest["text"])
                    delivered_channels.append("webhook")
            except Exception as e:
                logger.error(f"Delivery failed for sub {sub['id']} via {channel}: {e}")

        update_last_sent(sub["id"])
        log_delivery(sub["id"], frequency, len(matches), delivered_channels)
        delivered_count += 1

    logger.info(
        f"{frequency} digest complete: {delivered_count} delivered, {skipped_count} skipped"
    )
    return {
        "status": "completed",
        "frequency": frequency,
        "delivered": delivered_count,
        "skipped": skipped_count,
    }
```

**Step 4: Run all tests to verify they pass**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -v -m unit`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/app/tasks/digest_notifications.py backend/tests/app/tasks/test_digest_notifications.py
git commit -m "feat(digest): add build_digest, send_digest task, and delivery orchestration"
```

---

### Task 6: Register Beat Schedules in workers.py

**Files:**
- Modify: `backend/app/workers.py:41-48`

**Step 1: Write failing test for Beat schedule registration**

Append to test file:

```python
@pytest.mark.unit
class TestBeatScheduleRegistration:
    def test_digest_tasks_registered_in_beat_schedule(self):
        from app.workers import celery_app

        schedule = celery_app.conf.beat_schedule
        assert "daily-digest-7am" in schedule
        assert schedule["daily-digest-7am"]["task"] == "digest.send"
        assert schedule["daily-digest-7am"]["kwargs"] == {"frequency": "daily"}

        assert "weekly-digest-monday-8am" in schedule
        assert schedule["weekly-digest-monday-8am"]["task"] == "digest.send"
        assert schedule["weekly-digest-monday-8am"]["kwargs"] == {"frequency": "weekly"}
```

**Step 2: Run test to verify it fails**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py::TestBeatScheduleRegistration -v -m unit`
Expected: FAIL — `"daily-digest-7am" not in schedule`

**Step 3: Add Beat entries to workers.py**

Modify `backend/app/workers.py` — add `crontab` import and 2 Beat entries:

Add to imports (line 1 area):
```python
from celery.schedules import crontab
```

Replace the `beat_schedule` block (lines 42-47) with:

```python
celery_app.conf.beat_schedule = {
    "meilisearch-full-sync-every-6h": {
        "task": "meilisearch.full_sync",
        "schedule": 6 * 60 * 60,  # every 6 hours
    },
    "daily-digest-7am": {
        "task": "digest.send",
        "schedule": crontab(hour=7, minute=0),
        "kwargs": {"frequency": "daily"},
    },
    "weekly-digest-monday-8am": {
        "task": "digest.send",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),
        "kwargs": {"frequency": "weekly"},
    },
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py::TestBeatScheduleRegistration -v -m unit`
Expected: PASS

**Step 5: Run ALL tests to verify nothing is broken**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -v -m unit`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add backend/app/workers.py backend/tests/app/tasks/test_digest_notifications.py
git commit -m "feat(digest): register daily and weekly Beat schedules in workers.py"
```

---

### Task 7: Lint, Format, and Final Validation

**Files:**
- All modified files

**Step 1: Run ruff format**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run ruff format app/tasks/digest_notifications.py tests/app/tasks/test_digest_notifications.py app/workers.py`

**Step 2: Run ruff check and fix**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run ruff check app/tasks/digest_notifications.py tests/app/tasks/test_digest_notifications.py app/workers.py --fix`

**Step 3: Run full test suite to verify nothing is broken**

Run: `cd /home/laugustyniak/github/legal-ai/juddges-app/backend && poetry run pytest tests/app/tasks/test_digest_notifications.py -v`
Expected: All tests PASS

**Step 4: Commit any formatting fixes**

```bash
git add -u
git commit -m "style: format digest notifications code"
```

---

## Summary

| Task | Files | What |
|------|-------|------|
| 1 | `supabase/migrations/20260406000001_digest_notifications.sql` | Schema: 3 columns + 2 tables + RLS |
| 2 | `backend/app/tasks/digest_notifications.py` + tests | Data collection: subscriptions, matches, recent |
| 3 | Same files | LLM highlights generation |
| 4 | Same files | Delivery handlers: email, in-app, webhook |
| 5 | Same files | Main task: build_digest + send_digest orchestration |
| 6 | `backend/app/workers.py` + tests | Beat schedule: daily 7AM, weekly Mon 8AM |
| 7 | All files | Lint, format, final validation |

**Total new files:** 2 (migration + task)
**Modified files:** 1 (workers.py)
**Test file:** 1 (comprehensive unit tests)
