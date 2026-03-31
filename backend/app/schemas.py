"""
Backward-compatibility shim.

All functionality has been moved to ``app.schemas_pkg``.  This module
re-exports every public name so that existing imports (including tests)
continue to work without modification.
"""

from app.schemas_pkg import *  # noqa: F403
from app.schemas_pkg import (
    _fetch_schema_from_db,
    _generation_sessions,
    _get_schema_directory,
    _get_schema_metadata_path,
    _load_schema_metadata,
    _save_schema_metadata,
    cleanup_expired_sessions,
    router,
)

__all__ = [
    "_fetch_schema_from_db",
    "_generation_sessions",
    "_get_schema_directory",
    "_get_schema_metadata_path",
    "_load_schema_metadata",
    "_save_schema_metadata",
    "cleanup_expired_sessions",
    "router",
]
