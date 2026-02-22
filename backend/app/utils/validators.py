"""Validation utility functions for request/response models."""

from typing import List, Any


def validate_array_size(arr: List[Any], max_size: int, field_name: str) -> List[Any]:
    """
    Validate that an array doesn't exceed maximum size.

    Args:
        arr: Array to validate
        max_size: Maximum allowed size
        field_name: Name of field for error message

    Returns:
        The original array if valid

    Raises:
        ValueError: If array exceeds max_size
    """
    if len(arr) > max_size:
        raise ValueError(
            f"{field_name} array too large: {len(arr)} items (max: {max_size})"
        )
    return arr


def validate_string_length(value: str, max_length: int, field_name: str) -> str:
    """
    Validate that a string doesn't exceed maximum length.

    Args:
        value: String to validate
        max_length: Maximum allowed length
        field_name: Name of field for error message

    Returns:
        The original string if valid

    Raises:
        ValueError: If string exceeds max_length
    """
    if len(value) > max_length:
        raise ValueError(
            f"{field_name} too long: {len(value)} characters (max: {max_length})"
        )
    return value


def validate_languages(v: list[str] | None) -> list[str] | None:
    """Validate language codes - accept 'pl', 'en', or 'uk' (normalized to 'en').

    Note: 'uk' stands for United Kingdom and is normalized to 'en' (English).
    """
    if not v:
        return v

    valid_languages = {"pl", "en", "uk"}
    normalized = []

    for lang in v:
        lang_lower = lang.strip().lower()
        if lang_lower not in valid_languages:
            raise ValueError(
                f"Invalid language code: '{lang}'. Must be one of: 'pl', 'en', or 'uk'"
            )
        # Normalize "uk" (United Kingdom) to "en" (English)
        if lang_lower == "uk":
            normalized.append("en")
        else:
            normalized.append(lang_lower)

    return normalized


def validate_document_types(v: list[str] | None) -> list[str] | None:
    """Validate document types - accept both 'judgment' and 'judgement' (normalize to 'judgment')."""
    if not v:
        return v

    valid_types = {"judgment", "tax_interpretation"}
    # Also accept British spelling "judgement" and normalize to "judgment"
    valid_types_with_alt = valid_types | {"judgement"}
    normalized = []

    for doc_type in v:
        doc_type_lower = doc_type.strip().lower()
        if doc_type_lower not in valid_types_with_alt:
            raise ValueError(
                f"Invalid document_type: '{doc_type}'. "
                f"Must be one of: 'judgment' (or 'judgement'), 'tax_interpretation'"
            )
        # Normalize "judgement" to "judgment"
        if doc_type_lower == "judgement":
            normalized.append("judgment")
        else:
            normalized.append(doc_type_lower)

    return normalized
