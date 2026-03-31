"""
Filesystem operations for schema management: save, backup, restore, archive.
"""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from juddges_search.info_extraction.extractor import InformationExtractor
from loguru import logger

from .models import SchemaMetadata


def _get_schema_directory() -> Path:
    """Get the schemas directory path."""
    # Use the SCHEMA_DIR from InformationExtractor (for deprecated file-based schemas)
    base_dir = Path(__file__).parent.parent.parent
    schema_dir = base_dir / InformationExtractor.SCHEMA_DIR
    schema_dir.mkdir(parents=True, exist_ok=True)
    return schema_dir


def _get_archive_directory() -> Path:
    """Get or create the archive directory for deleted schemas."""
    archive_dir = _get_schema_directory() / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    return archive_dir


def _get_schema_metadata_path(schema_id: str) -> Path:
    """Get the path to the metadata JSON file for a schema."""
    return _get_schema_directory() / f"{schema_id}.meta.json"


def _save_schema_metadata(metadata: SchemaMetadata) -> None:
    """Save schema metadata to a JSON file."""
    meta_path = _get_schema_metadata_path(metadata.schema_id)
    with open(meta_path, "w") as f:
        json.dump(metadata.model_dump(), f, indent=2)
    logger.info(f"Saved metadata for schema: {metadata.schema_id}")


def _load_schema_metadata(schema_id: str) -> SchemaMetadata | None:
    """Load schema metadata from JSON file."""
    meta_path = _get_schema_metadata_path(schema_id)
    if not meta_path.exists():
        return None

    try:
        with open(meta_path) as f:
            data = json.load(f)
        return SchemaMetadata(**data)
    except Exception as e:
        logger.warning(f"Failed to load metadata for {schema_id}: {e}")
        return None


def _save_schema_to_file(schema_id: str, schema: dict[str, Any]) -> None:
    """Save schema to YAML file."""
    schema_path = _get_schema_directory() / f"{schema_id}.yaml"

    with open(schema_path, "w") as f:
        yaml.dump(
            schema, f, default_flow_style=False, sort_keys=False, allow_unicode=True
        )

    logger.info(f"Saved schema to file: {schema_path}")


def _create_backup(schema_id: str) -> None:
    """Create a timestamped backup of an existing schema."""
    schema_dir = _get_schema_directory()

    # Find the existing schema file
    existing_files = [
        f
        for f in schema_dir.iterdir()
        if f.stem == schema_id and f.suffix in InformationExtractor.SCHEMA_EXTENSIONS
    ]

    if existing_files:
        original_file = existing_files[0]
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        backup_path = (
            schema_dir / f"{schema_id}{original_file.suffix}.backup_{timestamp}"
        )

        shutil.copy2(original_file, backup_path)
        logger.info(f"Created backup: {backup_path}")
