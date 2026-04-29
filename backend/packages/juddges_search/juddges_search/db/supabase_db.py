"""Backward-compatible barrel module for Supabase database operations.

The implementation has been split into focused domain modules:
- _base.py: shared client initialisation and error handling
- collections_db.py: collection CRUD operations
- documents_db.py: legal document retrieval and vector search
- publications_db.py: publication management
- schemas_db.py: extraction schema operations

All public names are re-exported here so that existing imports continue to
work without any changes.
"""

from .collections_db import CollectionsDB, get_collections_db, reset_collections_db
from .documents_db import SupabaseVectorDB, get_vector_db, reset_vector_db
from .publications_db import PublicationsDB, get_publications_db, reset_publications_db
from .schemas_db import SupabaseDB, get_supabase_db, reset_supabase_db

__all__ = [
    # Classes
    "CollectionsDB",
    "SupabaseDB",
    "PublicationsDB",
    "SupabaseVectorDB",
    # Getters
    "get_collections_db",
    "get_supabase_db",
    "get_publications_db",
    "get_vector_db",
    # Resetters
    "reset_collections_db",
    "reset_supabase_db",
    "reset_publications_db",
    "reset_vector_db",
]
