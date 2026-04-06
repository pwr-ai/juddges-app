# Digest & Notification System Design

## Goal

Cron-based daily and weekly digests delivered via email, in-app notifications, and webhooks (Slack/Discord). Users subscribe via saved searches and get personalized matches plus AI-curated highlights.

## Principles

- **One file per digest type** — self-contained Celery task, easy to duplicate
- **Reuse existing infrastructure** — email_alert_subscriptions, Resend API, Celery Beat, Supabase
- **Channels are pluggable** — delivery handlers keyed by name, add new ones without touching digest logic
- **LLM highlights generated once** — shared across all users to keep costs flat

## Architecture

```
Celery Beat (cron)
  │
  ├── daily @ 7:00 UTC  ──→  send_digest(frequency="daily")
  └── weekly Mon 8:00 UTC ──→  send_digest(frequency="weekly")
                                    │
                                    ├── Fetch active subscriptions (by frequency)
                                    ├── Weekly: generate LLM highlights (once, global)
                                    ├── Per user:
                                    │     ├── Run saved search queries (since last_sent_at)
                                    │     ├── Skip if no matches and no highlights
                                    │     ├── Build digest payload
                                    │     └── Deliver to each channel:
                                    │           ├── email (Resend API)
                                    │           ├── in_app (Supabase notifications table)
                                    │           └── webhook (Slack/Discord/generic)
                                    └── Log delivery in email_alert_logs
```

## Data Model Changes

### Modify: `email_alert_subscriptions`

Add 3 columns:

```sql
ALTER TABLE email_alert_subscriptions
  ADD COLUMN frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('daily', 'weekly'));

ALTER TABLE email_alert_subscriptions
  ADD COLUMN channels JSONB NOT NULL DEFAULT '["email"]';

ALTER TABLE email_alert_subscriptions
  ADD COLUMN webhook_url TEXT;
```

- `frequency`: controls which Beat schedule picks up the subscription
- `channels`: array of delivery targets, e.g. `["email", "in_app", "webhook"]`
- `webhook_url`: Slack/Discord/custom endpoint

### New: `notifications`

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, read) WHERE read = false;
```

## New File: `backend/app/tasks/digest_notifications.py`

### Section 1: Query & Collect (~60 lines)

```python
def fetch_active_subscriptions(frequency: str) -> list[dict]:
    """Get all active subscriptions matching this frequency."""

def collect_user_matches(subscription, since: datetime) -> list[dict]:
    """Run user's saved search query, return judgments added since last digest."""

def fetch_all_recent_judgments(days: int = 7) -> list[dict]:
    """Get all new judgments for LLM highlights (weekly only)."""
```

### Section 2: LLM Highlights (~30 lines, weekly only)

```python
def generate_highlights(new_judgments: list[dict], max_highlights: int = 5) -> str:
    """Select most significant judgments, write 2-3 sentence summaries.
    Uses get_llm() factory. Single call, shared across all users."""
```

### Section 3: Deliver (~80 lines)

```python
DELIVERY_HANDLERS = {
    "email": deliver_email,
    "in_app": deliver_in_app,
    "webhook": deliver_webhook,
}

def deliver_email(user_email, digest_html: str) -> None:
    """Send via Resend API."""

def deliver_in_app(user_id, title, body, link) -> None:
    """Insert into notifications table."""

def deliver_webhook(webhook_url, payload: dict) -> None:
    """POST to Slack/Discord/generic. Auto-detect format from URL."""
```

Webhook format detection:
- URL contains `hooks.slack.com` → Slack Block Kit format
- URL contains `discord.com/api/webhooks` → Discord embed format
- Anything else → generic JSON POST

### Section 4: Main Task (~50 lines)

```python
@celery_app.task(name="digest.send", max_retries=2)
def send_digest(frequency: str = "daily"):
    subscriptions = fetch_active_subscriptions(frequency)

    highlights = None
    if frequency == "weekly":
        recent = fetch_all_recent_judgments(days=7)
        highlights = generate_highlights(recent)

    for sub in subscriptions:
        matches = collect_user_matches(sub, since=sub.last_sent_at)
        if not matches and not highlights:
            continue

        digest = build_digest(matches, highlights, frequency)

        for channel in sub.channels:
            DELIVERY_HANDLERS[channel](sub, digest)

        update_last_sent(sub.id)
        log_delivery(sub.id, frequency, len(matches))
```

## Beat Registration (workers.py)

```python
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
```

## Extensibility

Adding a new digest type:
1. Copy `digest_notifications.py` as `<new_type>.py`
2. Change the collect function
3. Add a Beat entry

Adding a new channel:
1. Write a `deliver_<channel>()` function
2. Add it to `DELIVERY_HANDLERS`
3. Users add the channel name to their `channels` JSONB array

## Cost Estimate

| Component | Cost |
|---|---|
| LLM highlights (weekly, 1 call) | ~$0.02-0.05/week |
| Resend email (free tier: 3K/mo) | $0 |
| Supabase (existing plan) | $0 |
| Webhook POSTs | $0 |

## Files Changed

| File | Change |
|---|---|
| `backend/app/tasks/digest_notifications.py` | **NEW** — main digest task |
| `backend/app/workers.py` | Add 2 Beat entries |
| `supabase/migrations/YYYYMMDD_digest_notifications.sql` | Schema changes |

## Out of Scope (add later as separate scripts)

- Real-time alerts (event-driven, not cron)
- SMS/push notifications
- Digest preview/archive page in UI
- Unsubscribe landing page (email footer link)
