"""Filter building utilities for Weaviate queries."""

from typing import Optional, Any

from loguru import logger
from weaviate.classes.query import Filter


def build_weaviate_filters(
    languages: Optional[list[str]] = None,
    document_types: Optional[list[str]] = None,
    segment_types: Optional[list[str]] = None,
    document_ids: Optional[list[str]] = None,
) -> tuple[Optional[Filter], dict[str, Any]]:
    """Build Weaviate filter object from common filter parameters.

    Handles optional filters safely - returns None if no filters are provided.

    Args:
        languages: Optional list of language codes to filter by (will be lowercased)
        document_types: Optional list of document types to filter by
        segment_types: Optional list of segment types to filter by
        document_ids: Optional list of document IDs to filter by

    Returns:
        Tuple of (Filter object combining all provided filters, or None if no filters provided,
                 dict with human-readable filter description for logging)
    """
    filters = []
    filter_description = {}

    # Language filter (always lowercase for consistency)
    # "pl" maps to "pl" in database
    # "uk" or "en" maps to both "uk" and "en" in database (to cover both cases)
    if languages:
        lowercase_languages = [lang.lower() for lang in languages]
        # Map languages to database values
        mapped_languages = set()
        for lang in lowercase_languages:
            if lang == 'en' or lang == 'uk':
                # Both "en" and "uk" search for both "uk" and "en" in database
                mapped_languages.add('uk')
                mapped_languages.add('en')
            else:
                mapped_languages.add(lang)
        
        languages_list = sorted(list(mapped_languages))
        filters.append(Filter.any_of([Filter.by_property("language").equal(lang) for lang in languages_list]))
        filter_description["languages"] = languages_list
        logger.info(f"Language filter: searching for language IN {languages_list} (input: {languages}, normalized: {lowercase_languages}, 'en'/'uk' mapped to ['uk', 'en'])")

    # Document type filter
    if document_types:
        filters.append(Filter.any_of([Filter.by_property("document_type").equal(dt) for dt in document_types]))
        filter_description["document_types"] = document_types

    # Segment type filter (for chunks)
    if segment_types:
        filters.append(Filter.any_of([Filter.by_property("segment_type").equal(st) for st in segment_types]))
        filter_description["segment_types"] = segment_types

    # Document ID filter - use contains_any for batch efficiency (like UUID fetch)
    if document_ids:
        if len(document_ids) == 1:
            # Single ID: use equal for simplicity
            filters.append(Filter.by_property("document_id").equal(document_ids[0]))
        else:
            # Multiple IDs: use contains_any for batch efficiency (faster than many OR conditions)
            filters.append(Filter.by_property("document_id").contains_any(document_ids))
        filter_description["document_ids"] = document_ids

    # Return combined filter or None if no filters
    filter_obj = Filter.all_of(filters) if filters else None
    return filter_obj, filter_description
