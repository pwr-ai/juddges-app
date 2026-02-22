"""Configuration constants for search operations."""

# Maximum limit for document count queries (performance optimization)
MAX_DOCUMENT_COUNT_LIMIT = 50

# Maximum number of UUIDs allowed per request (for batch operations)
MAX_UUIDS_PER_REQUEST = 50

# Maximum number of invalid UUIDs to show in error messages
MAX_INVALID_UUIDS_TO_SHOW = 5

# Required fields for LegalDocumentMetadata model (must always be included in return_properties)
# Includes date_issued and publication_date for date filtering support
# Includes document_id so frontend can use it for chunk retrieval
REQUIRED_METADATA_FIELDS = ["document_id", "document_type", "language", "keywords", "date_issued", "publication_date"]

# ===== Optimized Chunk Search Constants =====
# These values have been determined through performance testing to provide
# the best balance between speed and quality for chunk-based document retrieval.
# See: [Link to performance analysis document or code]

# Number of unique documents to return in chunk search (default limit)
OPTIMIZED_CHUNK_DOCS_LIMIT = 50

# Number of raw chunks to fetch for Python GroupBy deduplication
# Lower value = faster queries, but may miss some relevant documents
# 150 chunks provides good quality while maintaining fast performance (~150ms total query time)
OPTIMIZED_CHUNK_FETCH_LIMIT = 150

# Default alpha for hybrid search (0.0=BM25, 0.5=hybrid, 1.0=vector)
# 0.5 provides balanced keyword + semantic search
OPTIMIZED_CHUNK_ALPHA = 0.5

# Maximum number of chunks that can be fetched in a single request via the /chunks/fetch endpoint
MAX_CHUNKS_PER_FETCH_REQUEST = 200

# ===== Python GroupBy Chunk Search Defaults =====

# Default number of documents returned when using Python-side GroupBy
PYTHON_GROUPBY_DEFAULT_DOC_LIMIT = OPTIMIZED_CHUNK_DOCS_LIMIT

# Default multiplier to determine how many raw chunks to fetch vs docs returned
PYTHON_GROUPBY_CHUNKS_PER_DOC_MULTIPLIER = 3

# Default hybrid alpha for Python GroupBy flow
PYTHON_GROUPBY_DEFAULT_ALPHA = 0.5

# Properties required to process chunk objects in Python GroupBy flow
# CRITICAL: document_type is required - all chunks are guaranteed to have it
PYTHON_GROUPBY_RETURN_PROPERTIES = [
    "chunk_id",
    "document_id",
    "chunk_text",
    "segment_type",
    "document_type",
    "language",
]

# Auto-limit parameter for search queries
# Controls score cutoff sensitivity: higher = more results returned
# 10 = balanced threshold for quality vs quantity, prevents cutting off closely-scored results
OPTIMIZED_AUTO_LIMIT = 10

# ===== Pagination Constants =====

# Default page size for infinite scroll (documents per load)
DEFAULT_PAGE_SIZE = 10

# Maximum offset to prevent deep pagination performance issues
MAX_PAGINATION_OFFSET = 10000

# ===== Logging Configuration =====

# Maximum query length to display in logs (truncate longer queries)
MAX_QUERY_LOG_LENGTH = 50

# Conversion factor from seconds to milliseconds
SECONDS_TO_MS = 1000
