#!/usr/bin/env python3
"""Test script to verify dashboard stats from Weaviate."""

import asyncio
from datetime import datetime, timedelta, timezone
from ai_tax_search.db.weaviate_db import WeaviateLegalDatabase


async def test_dashboard_stats():
    """Test fetching dashboard statistics from Weaviate."""
    print("Testing dashboard stats from Weaviate...")
    print("=" * 60)

    async with WeaviateLegalDatabase() as db:
        collection = db.legal_documents_collection

        # Count all documents by iterating
        total_documents = 0
        judgments = 0
        tax_interpretations = 0
        last_updated = None
        one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        added_this_week = 0

        print("\nIterating through documents...")
        async for obj in collection.iterator(
            return_properties=["document_type", "ingestion_date"]
        ):
            total_documents += 1
            doc_type = obj.properties.get("document_type", "")

            if doc_type == "judgment":
                judgments += 1
            elif doc_type == "tax_interpretation":
                tax_interpretations += 1

            # Track most recent ingestion date
            ingestion_date = obj.properties.get("ingestion_date")
            if ingestion_date:
                if last_updated is None or ingestion_date > last_updated:
                    last_updated = ingestion_date

                # Count documents added this week
                if ingestion_date >= one_week_ago:
                    added_this_week += 1

        print("\n" + "=" * 60)
        print("DASHBOARD STATISTICS FROM WEAVIATE:")
        print("=" * 60)
        print(f"Total documents:        {total_documents}")
        print(f"Judgments:              {judgments}")
        print(f"Tax interpretations:    {tax_interpretations}")
        print(f"Added this week:        {added_this_week}")
        print(f"Last updated:           {last_updated}")
        print("=" * 60)

        # Verify we got data
        if total_documents > 0:
            print("\n✅ SUCCESS: Found documents in Weaviate")
        else:
            print("\n⚠️  WARNING: No documents found in Weaviate")


if __name__ == "__main__":
    asyncio.run(test_dashboard_stats())
