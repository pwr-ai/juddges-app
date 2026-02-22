"""Application configuration with environment variable support."""

import os


class Settings:
    """Application settings with environment variable fallbacks."""

    # Cache settings
    CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL_SECONDS", "300"))  # 5 minutes

    # Document fetching limits
    MAX_DOCUMENT_IDS_FETCH_LIMIT: int = int(
        os.getenv("MAX_DOCUMENT_IDS_FETCH_LIMIT", "1000")
    )
    DEFAULT_SAMPLE_SIZE: int = int(os.getenv("DEFAULT_SAMPLE_SIZE", "20"))
    MAX_SAMPLE_SIZE: int = int(os.getenv("MAX_SAMPLE_SIZE", "100"))

    # Similarity graph settings
    DEFAULT_SIMILARITY_GRAPH_SAMPLE_SIZE: int = int(
        os.getenv("DEFAULT_SIMILARITY_GRAPH_SAMPLE_SIZE", "500")
    )
    MAX_SIMILARITY_GRAPH_SAMPLE_SIZE: int = int(
        os.getenv("MAX_SIMILARITY_GRAPH_SAMPLE_SIZE", "1000")
    )
    DEFAULT_SIMILARITY_THRESHOLD: float = float(
        os.getenv("DEFAULT_SIMILARITY_THRESHOLD", "0.7")
    )

    # Legacy search limits
    MAX_CHUNKS_LEGACY_SEARCH: int = int(os.getenv("MAX_CHUNKS_LEGACY_SEARCH", "100"))
    MAX_DOCUMENTS_LEGACY_SEARCH: int = int(
        os.getenv("MAX_DOCUMENTS_LEGACY_SEARCH", "100")
    )

    # Input validation limits
    MAX_BATCH_DOCUMENT_IDS: int = int(os.getenv("MAX_BATCH_DOCUMENT_IDS", "100"))
    MAX_BATCH_UUIDS: int = int(os.getenv("MAX_BATCH_UUIDS", "100"))
    MAX_CSV_STRING_LENGTH: int = int(os.getenv("MAX_CSV_STRING_LENGTH", "500"))
    MAX_RETURN_PROPERTIES: int = int(os.getenv("MAX_RETURN_PROPERTIES", "50"))


# Global settings instance
settings = Settings()
