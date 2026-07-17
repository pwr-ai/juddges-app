"""Product-analytics event ingestion (`app_events` table).

POST /api/events accepts a batch envelope from the Next.js /api/events proxy
(or other API-key holders). user_id is ALWAYS stamped from the JWT — never
from the body (extra="forbid" rejects it). Writes happen off the request
critical path via BackgroundTasks.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.auth_jwt import AuthenticatedUser, get_optional_user
from app.services.app_events import (
    API_EVENT_ALLOWLIST,
    MAX_BATCH_SIZE,
    MAX_PROPERTIES_BYTES,
    record_app_events,
)

router = APIRouter(prefix="/api/events", tags=["Events"])


class AppEventIn(BaseModel):
    """A single event inside the batch envelope."""

    model_config = ConfigDict(extra="forbid")

    event_name: str = Field(examples=["judgment_viewed"])
    properties: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_name")
    @classmethod
    def _known_event(cls, v: str) -> str:
        if v not in API_EVENT_ALLOWLIST:
            raise ValueError(f"unknown or server-only event_name: {v}")
        return v

    @field_validator("properties")
    @classmethod
    def _cap_properties(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(v, default=str).encode()) > MAX_PROPERTIES_BYTES:
            raise ValueError(f"properties exceed {MAX_PROPERTIES_BYTES} bytes")
        return v


class TrackEventsRequest(BaseModel):
    """Batch envelope: identity fields apply to every event in the batch."""

    model_config = ConfigDict(extra="forbid")

    events: list[AppEventIn] = Field(min_length=1, max_length=MAX_BATCH_SIZE)
    session_id: str | None = Field(None, max_length=100)
    guest_session_id: str | None = Field(None, max_length=100)
    surface: Literal["web", "api"] = "web"
    locale: str | None = Field(None, max_length=10)
    app_version: str | None = Field(None, max_length=50)


@router.post("", status_code=202)
async def track_events(
    payload: TrackEventsRequest,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser | None = Depends(get_optional_user),
    guest_cookie: str | None = Cookie(None, alias="guest_session_id"),
) -> Response:
    """Ingest a batch of product-analytics events.

    Timestamps are server-side only (created_at DEFAULT now()); client-side
    batching skew of up to ~5s is accepted.
    """
    guest_id = payload.guest_session_id or guest_cookie
    rows = [
        {
            "event_name": e.event_name,
            "user_id": user.id if user else None,
            "guest_session_id": guest_id,
            "session_id": payload.session_id,
            "surface": payload.surface,
            "locale": payload.locale,
            "app_version": payload.app_version,
            "properties": e.properties,
        }
        for e in payload.events
    ]
    background_tasks.add_task(record_app_events, rows)
    return Response(status_code=202)
