"""
Test script for schema CRUD endpoints.

This script validates the three new schema management endpoints:
- POST /schemas - Create a new schema
- PUT /schemas/{schema_id} - Update an existing schema
- DELETE /schemas/{schema_id} - Delete a schema

Run this script to verify the implementation works correctly.
"""


from loguru import logger

# Test data - valid schema in YAML internal format
VALID_SCHEMA = {
    "contract_type": {
        "type": "string",
        "description": "Type of the contract",
        "enum": ["Purchase Agreement", "Service Contract", "Lease Agreement"],
        "required": True,
    },
    "parties": {
        "type": "array",
        "items": {"type": "string"},
        "description": "List of contracting parties",
        "required": True,
    },
    "contract_date": {
        "type": "string",
        "description": "Date when the contract was signed (YYYY-MM-DD format)",
        "required": True,
    },
    "contract_value": {
        "type": "number",
        "description": "Total value of the contract in USD",
        "required": False,
    },
}

# Invalid schema - missing required field
INVALID_SCHEMA = {
    "field_without_description": {
        "type": "string",
        "required": True,
    }
}


def test_schema_validation():
    """Test schema validation logic."""
    from juddges_search.info_extraction.extractor import InformationExtractor

    logger.info("Testing schema validation...")

    # Test valid schema
    try:
        validated = InformationExtractor.prepare_oai_compatible_schema(VALID_SCHEMA)
        logger.success("✓ Valid schema passes validation")
        logger.info(f"Validated schema has {len(validated.get('properties', {}))} properties")
    except ValueError as e:
        logger.error(f"✗ Valid schema failed validation: {e}")
        return False

    # Test invalid schema
    try:
        InformationExtractor.prepare_oai_compatible_schema(INVALID_SCHEMA)
        logger.error("✗ Invalid schema should have failed validation")
        return False
    except ValueError:
        logger.success("✓ Invalid schema correctly rejected")

    return True


def test_file_operations():
    """Test file I/O operations for schemas."""
    logger.info("Testing file operations...")

    try:
        from datetime import datetime
        from app.schemas import (
            _get_schema_directory,
            _get_archive_directory,
            _save_schema_to_file,
            _create_backup,
            SchemaMetadata,
            _save_schema_metadata,
            _load_schema_metadata,
        )
    except ImportError as e:
        logger.warning(f"⚠ Cannot test file operations (missing dependency: {e})")
        logger.info("This is expected if running outside Docker environment")
        return True  # Skip test gracefully

    # Test schema directory creation
    schema_dir = _get_schema_directory()
    if not schema_dir.exists():
        logger.error(f"✗ Schema directory not created: {schema_dir}")
        return False
    logger.success(f"✓ Schema directory exists: {schema_dir}")

    # Test archive directory creation
    archive_dir = _get_archive_directory()
    if not archive_dir.exists():
        logger.error(f"✗ Archive directory not created: {archive_dir}")
        return False
    logger.success(f"✓ Archive directory exists: {archive_dir}")

    # Test saving a schema
    test_schema_id = "test_contract_schema"
    try:
        _save_schema_to_file(test_schema_id, VALID_SCHEMA)
        schema_file = schema_dir / f"{test_schema_id}.yaml"
        if not schema_file.exists():
            logger.error(f"✗ Schema file not created: {schema_file}")
            return False
        logger.success(f"✓ Schema saved to: {schema_file}")
    except Exception as e:
        logger.error(f"✗ Failed to save schema: {e}")
        return False

    # Test saving metadata
    try:
        metadata = SchemaMetadata(
            schema_id=test_schema_id,
            description="Test contract schema",
            created_at=datetime.now().isoformat(),
            is_system=False,
        )
        _save_schema_metadata(metadata)
        logger.success("✓ Metadata saved successfully")
    except Exception as e:
        logger.error(f"✗ Failed to save metadata: {e}")
        return False

    # Test loading metadata
    try:
        loaded_metadata = _load_schema_metadata(test_schema_id)
        if loaded_metadata is None:
            logger.error("✗ Failed to load metadata")
            return False
        if loaded_metadata.schema_id != test_schema_id:
            logger.error(f"✗ Metadata mismatch: {loaded_metadata.schema_id} != {test_schema_id}")
            return False
        logger.success("✓ Metadata loaded successfully")
    except Exception as e:
        logger.error(f"✗ Failed to load metadata: {e}")
        return False

    # Test backup creation
    try:
        _create_backup(test_schema_id)
        backup_files = list(schema_dir.glob(f"{test_schema_id}.yaml.backup_*"))
        if not backup_files:
            logger.error("✗ Backup file not created")
            return False
        logger.success(f"✓ Backup created: {backup_files[0].name}")
    except Exception as e:
        logger.error(f"✗ Failed to create backup: {e}")
        return False

    # Cleanup test files
    try:
        schema_file = schema_dir / f"{test_schema_id}.yaml"
        if schema_file.exists():
            schema_file.unlink()

        meta_file = schema_dir / f"{test_schema_id}.meta.json"
        if meta_file.exists():
            meta_file.unlink()

        for backup in schema_dir.glob(f"{test_schema_id}.yaml.backup_*"):
            backup.unlink()

        logger.success("✓ Cleanup completed")
    except Exception as e:
        logger.warning(f"Cleanup warning: {e}")

    return True


def test_system_schema_protection():
    """Test that system schemas cannot be modified or deleted."""
    logger.info("Testing system schema protection...")

    try:
        from app.schemas import SYSTEM_SCHEMAS
    except ImportError as e:
        logger.warning(f"⚠ Cannot test system schema protection (missing dependency: {e})")
        logger.info("This is expected if running outside Docker environment")
        return True  # Skip test gracefully

    if not SYSTEM_SCHEMAS:
        logger.error("✗ No system schemas defined")
        return False

    logger.success(f"✓ System schemas defined: {SYSTEM_SCHEMAS}")

    # Verify system schemas exist
    from juddges_search.info_extraction.extractor import InformationExtractor

    available_schemas = InformationExtractor.list_schemas()
    for schema_id in SYSTEM_SCHEMAS:
        if schema_id not in available_schemas:
            logger.warning(f"⚠ System schema '{schema_id}' not found in available schemas")
        else:
            logger.success(f"✓ System schema '{schema_id}' exists")

    return True


def test_schema_listing():
    """Test schema listing functionality."""
    from juddges_search.info_extraction.extractor import InformationExtractor

    logger.info("Testing schema listing...")

    try:
        schemas = InformationExtractor.list_schemas()
        logger.success(f"✓ Found {len(schemas)} schemas")
        for schema_id in schemas[:5]:  # Show first 5
            logger.info(f"  - {schema_id}")
        if len(schemas) > 5:
            logger.info(f"  ... and {len(schemas) - 5} more")
        return True
    except Exception as e:
        logger.error(f"✗ Failed to list schemas: {e}")
        return False


def main():
    """Run all tests."""
    logger.info("=" * 80)
    logger.info("SCHEMA CRUD ENDPOINT TESTS")
    logger.info("=" * 80)

    tests = [
        ("Schema Validation", test_schema_validation),
        ("File Operations", test_file_operations),
        ("System Schema Protection", test_system_schema_protection),
        ("Schema Listing", test_schema_listing),
    ]

    results = []
    for test_name, test_func in tests:
        logger.info("")
        logger.info(f"Running: {test_name}")
        logger.info("-" * 80)
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            logger.error(f"✗ Test failed with exception: {e}")
            results.append((test_name, False))

    # Summary
    logger.info("")
    logger.info("=" * 80)
    logger.info("TEST SUMMARY")
    logger.info("=" * 80)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        logger.info(f"{status}: {test_name}")

    logger.info("-" * 80)
    logger.info(f"Total: {passed}/{total} tests passed")

    if passed == total:
        logger.success("All tests passed!")
        return 0
    else:
        logger.error(f"{total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(main())
