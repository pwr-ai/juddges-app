"""
Enable indexNullState for factual_state and legal_state properties.

This allows filtering documents by whether these properties are null or not.
Note: This requires dropping and recreating the properties or the entire collection.
"""
import asyncio
from loguru import logger

from juddges_search.db.weaviate_db import WeaviateLegalDatabase


async def check_and_update_properties():
    """Check current property configuration and provide guidance."""
    logger.info("Connecting to Weaviate...")

    async with WeaviateLegalDatabase() as db:
        collection_name = "LegalDocuments"

        logger.info(f"Getting current schema for {collection_name}...")
        collection = db.client.collections.get(collection_name)
        current_config = await collection.config.get()

        logger.info(f"Current properties: {[p.name for p in current_config.properties]}")

        # Check factual_state and legal_state properties
        factual_state_prop = next((p for p in current_config.properties if p.name == "factual_state"), None)
        legal_state_prop = next((p for p in current_config.properties if p.name == "legal_state"), None)

        if factual_state_prop:
            logger.info("factual_state property found")
            logger.info(f"  - Data type: {factual_state_prop.data_type}")
            if hasattr(factual_state_prop, 'inverted_index_config') and factual_state_prop.inverted_index_config:
                logger.info(f"  - Inverted index config: {factual_state_prop.inverted_index_config}")
                if hasattr(factual_state_prop.inverted_index_config, 'index_null_state'):
                    logger.info(f"  - index_null_state: {factual_state_prop.inverted_index_config.index_null_state}")
            else:
                logger.warning("  - No inverted_index_config found")

        if legal_state_prop:
            logger.info("legal_state property found")
            logger.info(f"  - Data type: {legal_state_prop.data_type}")
            if hasattr(legal_state_prop, 'inverted_index_config') and legal_state_prop.inverted_index_config:
                logger.info(f"  - Inverted index config: {legal_state_prop.inverted_index_config}")
                if hasattr(legal_state_prop.inverted_index_config, 'index_null_state'):
                    logger.info(f"  - index_null_state: {legal_state_prop.inverted_index_config.index_null_state}")
            else:
                logger.warning("  - No inverted_index_config found")

        logger.warning("\n" + "="*80)
        logger.warning("IMPORTANT: indexNullState CANNOT be modified after property creation!")
        logger.warning("="*80)
        logger.warning("\nTo enable indexNullState for existing properties, you must:")
        logger.warning("1. Export all data from the collection")
        logger.warning("2. Delete the collection")
        logger.warning("3. Recreate the collection with indexNullState: true for these properties")
        logger.warning("4. Re-import all data")
        logger.warning("\nAlternative: Use client-side filtering (fetch all docs, filter in code)")
        logger.info("\nCurrent workaround in place: Fetching documents without filter, then filtering client-side")


if __name__ == "__main__":
    asyncio.run(check_and_update_properties())
