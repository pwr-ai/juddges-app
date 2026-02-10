"""
Add factual_state and legal_state properties to Weaviate LegalDocuments collection.

This script adds two new text properties:
- factual_state: Description of factual circumstances (stan faktyczny)
- legal_state: Legal reasoning and interpretation (stan prawny)
"""
import asyncio
from loguru import logger
from weaviate.classes.config import Property, DataType

from ai_tax_search.db.weaviate_db import WeaviateLegalDatabase


async def add_properties():
    """Add factual_state and legal_state properties to LegalDocuments collection."""
    logger.info("Connecting to Weaviate...")

    async with WeaviateLegalDatabase() as db:
        collection_name = "LegalDocuments"

        logger.info(f"Getting current schema for {collection_name}...")
        collection = db.client.collections.get(collection_name)
        current_config = await collection.config.get()

        logger.info(f"Current properties: {[p.name for p in current_config.properties]}")

        # Check if properties already exist
        factual_state_prop = next((p for p in current_config.properties if p.name == "factual_state"), None)
        legal_state_prop = next((p for p in current_config.properties if p.name == "legal_state"), None)

        # Add factual_state property
        if not factual_state_prop:
            logger.info("Adding factual_state property...")
            await collection.config.add_property(
                Property(
                    name="factual_state",
                    data_type=DataType.TEXT,
                    description="Description of factual circumstances (stan faktyczny) of the case",
                )
            )
            logger.info("✓ Added factual_state property")
        else:
            logger.info("factual_state property already exists")

        # Add legal_state property
        if not legal_state_prop:
            logger.info("Adding legal_state property...")
            await collection.config.add_property(
                Property(
                    name="legal_state",
                    data_type=DataType.TEXT,
                    description="Legal reasoning and interpretation (stan prawny) of the case",
                )
            )
            logger.info("✓ Added legal_state property")
        else:
            logger.info("legal_state property already exists")

        # Verify properties were added
        updated_config = await collection.config.get()
        updated_properties = [p.name for p in updated_config.properties]
        logger.info(f"Updated properties: {updated_properties}")

        if "factual_state" in updated_properties and "legal_state" in updated_properties:
            logger.success("✓ Both properties added successfully!")
        else:
            logger.warning("⚠ Some properties may not have been added correctly")

        logger.info("Schema update completed!")


if __name__ == "__main__":
    asyncio.run(add_properties())
