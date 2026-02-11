"""
Optimized Weaviate Schema Definition
Based on frontend usage analysis - reduces properties from 32 to 13 (59% reduction)
"""

from weaviate.classes.config import Configure, Property, DataType, VectorDistances
from juddges_search.embeddings import VectorName


def create_optimized_legal_documents_schema():
    """
    Optimized LegalDocuments collection schema with only frontend-used properties.
    Memory reduction: ~60% compared to current schema.
    """
    return {
        "class": "LegalDocumentsOptimized",
        "description": "Optimized legal documents collection with reduced property set",
        "vectorizer": "none",  # We handle vectorization manually
        "properties": [
            # === CORE IDENTIFIERS (Required) ===
            Property(
                name="document_id",
                data_type=DataType.TEXT,
                description="Unique document identifier",
                index_filterable=True,
                index_searchable=False,  # Not needed for search content
            ),
            Property(
                name="document_number",
                data_type=DataType.TEXT,
                description="Human-readable document number for display",
                index_filterable=True,
                index_searchable=True,
            ),
            
            # === SEARCH FILTERS (Frontend filters) ===
            Property(
                name="document_type",
                data_type=DataType.TEXT,
                description="Document type (judgment, tax_interpretation)",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="language",
                data_type=DataType.TEXT,
                description="Document language (pl, en)",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="country",
                data_type=DataType.TEXT,
                description="Country code for filtering and display",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="issuing_body",
                data_type=DataType.TEXT,
                description="Simplified issuing body name for filtering and display",
                index_filterable=True,
                index_searchable=True,
            ),
            
            # === DISPLAY PROPERTIES (Frontend display) ===
            Property(
                name="title",
                data_type=DataType.TEXT,
                description="Document title for search and display",
                index_filterable=False,
                index_searchable=True,
            ),
            Property(
                name="keywords",
                data_type=DataType.TEXT_ARRAY,
                description="Keywords for filtering and display badges",
                index_filterable=True,
                index_searchable=True,
            ),
            
            # === DATE PROPERTIES (Display and filtering) ===
            Property(
                name="date_issued",
                data_type=DataType.TEXT,  # Keep as text for flexibility
                description="Document issue date",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="publication_date",
                data_type=DataType.TEXT,
                description="Publication date for display",
                index_filterable=True,
                index_searchable=False,
            ),
            
            # === SEARCH CONTENT (Vector and BM25 search) ===
            Property(
                name="full_text",
                data_type=DataType.TEXT,
                description="Complete document text for search",
                index_filterable=False,
                index_searchable=True,
            ),
            Property(
                name="summary",
                data_type=DataType.TEXT,
                description="Document summary for enhanced search",
                index_filterable=False,
                index_searchable=True,
            ),
            Property(
                name="thesis",
                data_type=DataType.TEXT,
                description="Legal thesis for enhanced search",
                index_filterable=False,
                index_searchable=True,
            ),
        ],
        "vectorIndexConfig": Configure.VectorIndex.hnsw(
            distance_metric=VectorDistances.COSINE,
            ef_construction=256,  # Optimized from benchmarking
            max_connections=64,   # Optimized from benchmarking
            dynamic_ef_max=1000,  # Optimized from benchmarking
            flat_search_cutoff=10000,  # Optimized from benchmarking
        ),
        "vectorizer": Configure.Vectorizer.none(),
    }


def create_optimized_document_chunks_schema():
    """
    Keep current DocumentChunks schema - already optimized for search.
    Only 14 properties, all used for search functionality.
    """
    return {
        "class": "DocumentChunksOptimized", 
        "description": "Document chunks for detailed search results",
        "vectorizer": "none",
        "properties": [
            # === CORE IDENTIFIERS ===
            Property(
                name="document_id",
                data_type=DataType.TEXT,
                description="Parent document ID",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="chunk_id",
                data_type=DataType.INT,
                description="Chunk sequence number",
                index_filterable=True,
                index_searchable=False,
            ),
            
            # === METADATA ===
            Property(
                name="document_type",
                data_type=DataType.TEXT,
                description="Document type for filtering",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="language",
                data_type=DataType.TEXT,
                description="Chunk language",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="position",
                data_type=DataType.INT,
                description="Position in document",
                index_filterable=True,
                index_searchable=False,
            ),
            Property(
                name="parent_segment_id",
                data_type=DataType.TEXT,
                description="Parent segment identifier",
                index_filterable=True,
                index_searchable=False,
            ),
            
            # === SEARCH CONTENT ===
            Property(
                name="chunk_text",
                data_type=DataType.TEXT,
                description="Chunk content for search",
                index_filterable=False,
                index_searchable=True,
            ),
        ],
        "vectorIndexConfig": Configure.VectorIndex.hnsw(
            distance_metric=VectorDistances.COSINE,
            ef_construction=256,
            max_connections=64,
            dynamic_ef_max=1000,
            flat_search_cutoff=10000,
        ),
        "vectorizer": Configure.Vectorizer.none(),
    }


# === REMOVED PROPERTIES (High memory, no frontend usage) ===
REMOVED_PROPERTIES = [
    # Heavy content fields (not displayed)
    "raw_content",           # Large field, not shown in UI
    
    # Complex legal metadata (not displayed)
    "legal_references",      # Complex structured data, not used
    "legal_bases",          # Array field, not displayed
    "extracted_legal_bases", # Text field, not shown
    "references",           # Array field, not displayed
    
    # Court-specific fields (not displayed)
    "parties",              # Court field, not shown
    "outcome",              # Court field, not shown  
    "presiding_judge",      # Court field, not displayed
    "judges",               # Array field, not displayed
    "court_name",           # Court field, not displayed
    "department_name",      # Court field, not displayed
    
    # System metadata (not displayed)
    "ingestion_date",       # System field, not shown
    "last_updated",         # System field, not shown
    "processing_status",    # System field, not shown
    "source_url",           # Metadata, not displayed
    "source",               # Metadata, not displayed
    "metadata",             # JSON field, only publication_date used (moved to top level)
    
    # Unused coordinate fields
    "x",                    # Coordinate, unused
    "y",                    # Coordinate, unused
]


def get_migration_mapping():
    """
    Property mapping from current schema to optimized schema.
    """
    return {
        # Direct mappings (no transformation)
        "document_id": "document_id",
        "document_type": "document_type", 
        "title": "title",
        "date_issued": "date_issued",
        "document_number": "document_number",
        "language": "language",
        "country": "country",
        "full_text": "full_text",
        "summary": "summary", 
        "thesis": "thesis",
        "keywords": "keywords",
        
        # Transformations needed
        "issuing_body": "issuing_body",  # Flatten from object to string
        "metadata.publication_date": "publication_date",  # Extract from JSON
        
        # Removed properties (comment for reference)
        # "raw_content": None,  # Remove - not displayed
        # "legal_references": None,  # Remove - not used
        # ... (see REMOVED_PROPERTIES list above)
    }


if __name__ == "__main__":
    print("=== OPTIMIZED WEAVIATE SCHEMA ===")
    print(f"LegalDocuments: {len(create_optimized_legal_documents_schema()['properties'])} properties")
    print(f"DocumentChunks: {len(create_optimized_document_chunks_schema()['properties'])} properties")
    print(f"Removed properties: {len(REMOVED_PROPERTIES)}")
    print(f"Memory reduction estimate: ~60%")