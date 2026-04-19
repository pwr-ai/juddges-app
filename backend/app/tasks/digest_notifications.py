"""Celery task for sending periodic digest notifications to subscribers."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from juddges_search.llms import get_llm
from langchain_core.messages import HumanMessage
from loguru import logger

from app.core.supabase import supabase_client
from app.workers import celery_app

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("DIGEST_FROM_EMAIL", "digest@juddges.app")

# Column projection for judgments — skip the embedding vector to save bandwidth
_JUDGMENT_DIGEST_COLS = (
    "id, case_number, jurisdiction, court_name, court_level, "
    "decision_date, title, summary, keywords, legal_topics"
)


# ── Section 1: Data Collection ───────────────────────────────────────────────


def fetch_active_subscriptions(frequency: str) -> list[dict[str, Any]]:
    """Get all active subscriptions matching this frequency from email_alert_subscriptions table."""
    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot fetch subscriptions")
        return []

    resp = (
        supabase_client.table("email_alert_subscriptions")
        .select("*")
        .eq("frequency", frequency)
        .eq("is_active", True)
        .execute()
    )
    return resp.data or []


def collect_user_matches(
    subscription: dict[str, Any], since: datetime
) -> list[dict[str, Any]]:
    """Run user's saved search query against judgments table.

    Uses simple ilike on title + filters from search_config (jurisdictions,
    court_levels). Ordered by decision_date desc, limit 20.
    """
    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot collect matches")
        return []

    since_iso = since.isoformat()
    search_config: dict[str, Any] = subscription.get("search_config") or {}
    query_text: str = search_config.get("query", "")
    jurisdictions: list[str] = search_config.get("jurisdictions") or []
    court_levels: list[str] = search_config.get("court_levels") or []

    qb = (
        supabase_client.table("judgments")
        .select(_JUDGMENT_DIGEST_COLS)
        .gte("decision_date", since_iso)
        .order("decision_date", desc=True)
        .limit(20)
    )

    if query_text:
        qb = qb.ilike("title", f"%{query_text}%")

    if jurisdictions:
        qb = qb.in_("jurisdiction", jurisdictions)

    if court_levels:
        qb = qb.in_("court_level", court_levels)

    resp = qb.execute()
    return resp.data or []


def fetch_all_recent_judgments(days: int = 7) -> list[dict[str, Any]]:
    """Get recent judgments for LLM highlights.

    Ordered by decision_date desc, limit 50.
    """
    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot fetch recent judgments")
        return []

    since = datetime.now(UTC) - timedelta(days=days)
    resp = (
        supabase_client.table("judgments")
        .select(_JUDGMENT_DIGEST_COLS)
        .gte("decision_date", since.isoformat())
        .order("decision_date", desc=True)
        .limit(50)
        .execute()
    )
    return resp.data or []


# ── Section 2: LLM Highlights ────────────────────────────────────────────────


def generate_highlights(
    judgments: list[dict[str, Any]], max_highlights: int = 5
) -> str:
    """Pick most significant recent judgments, write summaries using GPT-4o-mini.

    Returns markdown string. Returns empty string if no judgments.
    """
    if not judgments:
        return ""

    llm = get_llm(name="gpt-5-mini")

    items_text = "\n\n".join(
        f"- [{j.get('case_number', 'N/A')}] {j.get('title', '')} "
        f"(Court: {j.get('court_name', '')}, Date: {j.get('decision_date', '')})\n"
        f"  Summary: {j.get('summary', '')}"
        for j in judgments[:50]
    )

    prompt = (
        f"You are a legal analyst. From the following recent court judgments, "
        f"select the {max_highlights} most significant ones and write a concise "
        f"markdown summary for each (2-3 sentences). Focus on legal significance "
        f"and practical impact.\n\nJudgments:\n{items_text}\n\n"
        f"Return only the markdown highlights, no preamble."
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    return response.content or ""


# ── Section 3: Delivery Handlers ─────────────────────────────────────────────


def deliver_email(to_email: str, html_body: str, subject: str) -> None:
    """Send via Resend API using httpx.post()."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping email delivery")
        return

    payload = {
        "from": RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    logger.info(f"Email digest sent to {to_email}")


def deliver_in_app(
    user_id: str, title: str, body: str, link: str | None = None
) -> None:
    """Insert into notifications table via supabase_client."""
    if not supabase_client:
        logger.warning(
            "Supabase client unavailable — cannot deliver in-app notification"
        )
        return

    row: dict[str, Any] = {
        "user_id": user_id,
        "title": title,
        "body": body,
        "read": False,
        "created_at": datetime.now(UTC).isoformat(),
    }
    if link is not None:
        row["link"] = link

    supabase_client.table("notifications").insert(row).execute()
    logger.info(f"In-app notification delivered to user {user_id}")


def deliver_webhook(webhook_url: str, title: str, body: str) -> None:
    """POST to webhook.

    Auto-detect format:
    - hooks.slack.com → Slack Block Kit (blocks with header + section)
    - discord.com/api/webhooks → Discord embed format
    - anything else → generic JSON {title, body}
    """
    if "hooks.slack.com" in webhook_url:
        payload: dict[str, Any] = {
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": title},
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": body},
                },
            ]
        }
    elif "discord.com/api/webhooks" in webhook_url:
        payload = {
            "embeds": [
                {
                    "title": title,
                    "description": body,
                }
            ]
        }
    else:
        payload = {"title": title, "body": body}

    resp = httpx.post(webhook_url, json=payload, timeout=15)
    resp.raise_for_status()
    logger.info(f"Webhook delivered to {webhook_url}")


# ── Section 4: Build + Orchestrate ───────────────────────────────────────────


def _matches_to_html(matches: list[dict[str, Any]]) -> str:
    """Render matches as HTML ul/li list."""
    if not matches:
        return "<p>No new matches found.</p>"

    items = "".join(
        f"<li><strong>{m.get('case_number', 'N/A')}</strong> — "
        f"{m.get('title', '')} "
        f"({m.get('court_name', '')}, {m.get('decision_date', '')})</li>"
        for m in matches
    )
    return f"<ul>{items}</ul>"


def _matches_to_text(matches: list[dict[str, Any]]) -> str:
    """Render matches as plain text for webhooks."""
    if not matches:
        return "No new matches found."

    lines = [
        f"- [{m.get('case_number', 'N/A')}] {m.get('title', '')} "
        f"({m.get('court_name', '')}, {m.get('decision_date', '')})"
        for m in matches
    ]
    return "\n".join(lines)


def build_digest(
    matches: list[dict[str, Any]],
    highlights: str,
    frequency: str,
) -> dict[str, str]:
    """Build digest payload.

    Returns dict with keys: subject, html, text.
    Subject format: 'Juddges Daily/Weekly Digest — N new match(es)'
    """
    label = "Weekly" if frequency == "weekly" else "Daily"
    n = len(matches)
    subject = f"Juddges {label} Digest — {n} new match{'es' if n != 1 else ''}"

    matches_html = _matches_to_html(matches)
    matches_text = _matches_to_text(matches)

    highlights_html = f"<h2>Weekly Highlights</h2>{highlights}" if highlights else ""
    highlights_text = f"\n\nWeekly Highlights:\n{highlights}" if highlights else ""

    html = f"<h1>{subject}</h1>{highlights_html}<h2>Your Matches</h2>{matches_html}"
    text = f"{subject}{highlights_text}\n\nYour Matches:\n{matches_text}"

    return {"subject": subject, "html": html, "text": text}


def update_last_sent(subscription_id: str) -> None:
    """Update last_sent_at on email_alert_subscriptions."""
    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot update last_sent_at")
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
    """Insert row into email_alert_logs."""
    if not supabase_client:
        logger.warning("Supabase client unavailable — cannot log delivery")
        return

    row: dict[str, Any] = {
        "subscription_id": subscription_id,
        "frequency": frequency,
        "matches_count": matches_count,
        "channels_delivered": channels_delivered or [],
        "sent_at": datetime.now(UTC).isoformat(),
    }
    if error is not None:
        row["error"] = error

    supabase_client.table("email_alert_logs").insert(row).execute()


def _get_user_email(user_id: str) -> str | None:
    """Look up email via supabase_client.auth.admin.get_user_by_id()."""
    if not supabase_client:
        return None

    try:
        response = supabase_client.auth.admin.get_user_by_id(user_id)
        user = response.user if hasattr(response, "user") else response
        if user and hasattr(user, "email"):
            return user.email
    except Exception as exc:
        logger.warning(f"Could not fetch email for user {user_id}: {exc}")

    return None


# ── Main Celery Task ──────────────────────────────────────────────────────────


@celery_app.task(
    name="digest.send",
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(ConnectionError, OSError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def send_digest(frequency: str = "daily") -> dict[str, Any]:
    """Main task called by Beat.

    - Fetches active subs for frequency
    - Weekly: generates highlights once (shared)
    - Per sub: collect matches, skip if empty + no highlights, build digest,
      deliver per channel
    - Channels loop: email → _get_user_email then deliver_email;
      in_app → deliver_in_app; webhook → deliver_webhook
    - After delivery: update_last_sent + log_delivery
    - Returns dict with status, frequency, delivered count, skipped count
    """
    subscriptions = fetch_active_subscriptions(frequency)
    if not subscriptions:
        logger.info(f"No active subscriptions for frequency={frequency}")
        return {"status": "ok", "frequency": frequency, "delivered": 0, "skipped": 0}

    # Weekly digests include shared highlights generated once for all subscribers
    highlights = ""
    if frequency == "weekly":
        recent_judgments = fetch_all_recent_judgments(days=7)
        highlights = generate_highlights(recent_judgments)

    delivered = 0
    skipped = 0

    for sub in subscriptions:
        sub_id: str = sub["id"]
        user_id: str = sub["user_id"]
        channels: list[str] = sub.get("channels") or []

        last_sent_at_raw = sub.get("last_sent_at")
        if last_sent_at_raw:
            since = datetime.fromisoformat(last_sent_at_raw)
        else:
            since = datetime.now(UTC) - timedelta(days=1 if frequency == "daily" else 7)

        matches = collect_user_matches(sub, since)

        if not matches and not highlights:
            skipped += 1
            log_delivery(sub_id, frequency, 0)
            continue

        digest = build_digest(matches, highlights, frequency)
        channels_delivered: list[str] = []

        for channel in channels:
            try:
                if channel == "email":
                    email = _get_user_email(user_id)
                    if email:
                        deliver_email(email, digest["html"], digest["subject"])
                        channels_delivered.append("email")
                    else:
                        logger.warning(
                            f"No email found for user {user_id} — skipping email channel"
                        )

                elif channel == "in_app":
                    deliver_in_app(
                        user_id=user_id,
                        title=digest["subject"],
                        body=digest["text"],
                        link="/search",
                    )
                    channels_delivered.append("in_app")

                elif channel == "webhook":
                    webhook_url: str = sub.get("webhook_url", "")
                    if webhook_url:
                        deliver_webhook(webhook_url, digest["subject"], digest["text"])
                        channels_delivered.append("webhook")
                    else:
                        logger.warning(
                            f"Webhook channel configured but no URL for sub {sub_id}"
                        )

                else:
                    logger.warning(f"Unknown channel '{channel}' for sub {sub_id}")

            except Exception as exc:
                logger.error(
                    f"Failed to deliver {channel} for sub {sub_id}: {exc}",
                    exc_info=True,
                )

        update_last_sent(sub_id)
        log_delivery(sub_id, frequency, len(matches), channels_delivered)
        delivered += 1

    logger.info(
        f"Digest task complete: frequency={frequency}, "
        f"delivered={delivered}, skipped={skipped}"
    )
    return {
        "status": "ok",
        "frequency": frequency,
        "delivered": delivered,
        "skipped": skipped,
    }
