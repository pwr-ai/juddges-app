"""Date utility functions."""

from datetime import datetime
from typing import Any


def parse_date(value: Any) -> datetime | None:
    """
    Parse a date value that may be a datetime, string, or None.

    Handles ISO format strings with optional 'Z' timezone suffix.

    Args:
        value: Date value (datetime object, ISO string, or None)

    Returns:
        Parsed datetime object, or None if parsing fails or value is None
    """
    if value is None:
        return None

    if isinstance(value, datetime):
        return value

    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def serialize_date(date_value: datetime | str | None) -> str | None:
    """
    Serialize a date value to ISO format string.

    Args:
        date_value: Date value that can be a datetime object, string, or None

    Returns:
        ISO format string if date_value is provided, None otherwise
    """
    if not date_value:
        return None
    if isinstance(date_value, datetime):
        return date_value.isoformat()
    return str(date_value)
