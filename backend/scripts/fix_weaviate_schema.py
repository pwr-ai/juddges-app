"""
Fix Weaviate schema to enable indexNullState for x and y properties.

This script updates the LegalDocuments collection schema to add
indexNullState: true for x and y properties so they can be filtered.
"""
import asyncio
from loguru import logger
from weaviate.classes.config import Property, DataType, Configure

from ai_tax_search.db.weaviate_db import WeaviateLegalDatabase


async def update_schema():
    """Update LegalDocuments schema to enable null state indexing."""
    logger.info("Connecting to Weaviate...")

    async with WeaviateLegalDatabase() as db:
        collection_name = "LegalDocuments"

        logger.info(f"Getting current schema for {collection_name}...")
        collection = db.client.collections.get(collection_name)
        current_config = await collection.config.get()

        logger.info(f"Current properties: {[p.name for p in current_config.properties]}")

        # Check if x and y properties exist
        x_prop = next((p for p in current_config.properties if p.name == "x"), None)
        y_prop = next((p for p in current_config.properties if p.name == "y"), None)

        if not x_prop or not y_prop:
            logger.warning("x and y properties not found. They may need to be added first.")

            # Add x and y properties if they don't exist
            if not x_prop:
                logger.info("Adding x property with indexNullState...")
                await collection.config.add_property(
                    Property(
                        name="x",
                        data_type=DataType.NUMBER,
                        description="X coordinate for visualization",
                        inverted_index_config=Configure.inverted_index(
                            index_null_state=True
                        )
                    )
                )
                logger.info("Added x property")

            if not y_prop:
                logger.info("Adding y property with indexNullState...")
                await collection.config.add_property(
                    Property(
                        name="y",
                        data_type=DataType.NUMBER,
                        description="Y coordinate for visualization",
                        inverted_index_config=Configure.inverted_index(
                            index_null_state=True
                        )
                    )
                )
                logger.info("Added y property")
        else:
            logger.info("x and y properties already exist")

            # Check if indexNullState is already enabled
            x_has_null_index = (
                hasattr(x_prop, 'inverted_index_config')
                and x_prop.inverted_index_config
                and x_prop.inverted_index_config.index_null_state
            )
            y_has_null_index = (
                hasattr(y_prop, 'inverted_index_config')
                and y_prop.inverted_index_config
                and y_prop.inverted_index_config.index_null_state
            )

            logger.info(f"x property indexNullState: {x_has_null_index}")
            logger.info(f"y property indexNullState: {y_has_null_index}")

            if x_has_null_index and y_has_null_index:
                logger.info("indexNullState is already enabled for x and y properties")
            else:
                logger.warning(
                    "Properties exist but indexNullState cannot be modified after creation. "
                    "You need to either:"
                )
                logger.warning("1. Drop and recreate the collection with proper indexNullState config")
                logger.warning("2. Modify the query to not use null filters on these properties")
                logger.warning("3. Use a different filtering approach")
                logger.info(
                    "\nRecommended: Update schema creation code to include "
                    "indexNullState from the start for future deployments."
                )

        logger.info("Schema update completed successfully!")


if __name__ == "__main__":
    asyncio.run(update_schema())
