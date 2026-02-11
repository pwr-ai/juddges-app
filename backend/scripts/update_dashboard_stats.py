#!/usr/bin/env python3
"""
Script to update dashboard statistics in Supabase.

This script queries Weaviate for current document counts and updates
the dashboard_stats table in Supabase for fast dashboard rendering.

PERFORMANCE OPTIMIZATIONS:
- Uses Weaviate server-side aggregates instead of Python iteration
- Bulk upsert to Supabase (1 HTTP call vs N)
- ~8 Weaviate queries total instead of iterating millions of docs
- Execution time: seconds instead of minutes/hours

Can be run:
- Manually: python backend/scripts/update_dashboard_stats.py
- As a cron job: */30 * * * * /path/to/update_dashboard_stats.py
- Via API endpoint: POST /api/dashboard/refresh-stats

Architecture notes:
- For even better performance, consider updating stats incrementally
  during document ingestion rather than recomputing periodically
- For very large datasets, consider Postgres materialized views
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from loguru import logger
from supabase import create_client, Client
from supabase.client import ClientOptions

from weaviate.classes.query import Filter
from weaviate.config import Timeout


def get_supabase_client() -> Client:
    """Get Supabase client instance."""
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not service_role_key:
        raise ValueError("Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    
    options = ClientOptions(
        postgrest_client_timeout=30,
        storage_client_timeout=30,
        schema="public"
    )
    return create_client(supabase_url, service_role_key, options=options)


async def get_weaviate_counts() -> dict:
    """
    Query Weaviate for all dashboard counts using server-side aggregates.

    This is MUCH faster than iterating through all documents in Python.
    Weaviate does the heavy lifting using indexes and internal pagination.

    Returns:
        dict: Dictionary with stat_type as keys and counts as values
    """
    import weaviate
    from weaviate.classes.init import Auth
    from weaviate.config import AdditionalConfig

    logger.info("Fetching document counts from Weaviate using aggregates...")

    counts = {}

    try:
        # Create direct connection with extended timeout (10 min for slow aggregates)
        host = os.getenv("WV_HOST", "host.docker.internal")
        port = int(os.getenv("WV_PORT", "8084"))
        grpc_port = int(os.getenv("WV_GRPC_PORT", "8085"))
        api_key = os.getenv("WV_API_KEY", "")

        # Extended timeout for large dataset aggregation
        timeout_config = Timeout(query=600, insert=60, init=30)
        additional_config = AdditionalConfig(timeout=timeout_config)

        client = weaviate.use_async_with_custom(
            http_host=host,
            http_port=port,
            http_secure=False,
            grpc_host=host,
            grpc_port=grpc_port,
            grpc_secure=False,
            auth_credentials=Auth.api_key(api_key) if api_key else None,
            skip_init_checks=True,
            additional_config=additional_config,
        )

        async with client:
            collection = client.collections.get("LegalDocuments")
            
            # Calculate date thresholds
            now = datetime.now(timezone.utc)
            one_week_ago = now - timedelta(days=7)
            one_month_ago = now - timedelta(days=30)
            one_year_ago = now - timedelta(days=365)
            
            # 1) Total documents - single aggregate query
            logger.info("Counting total documents...")
            total_res = await collection.aggregate.over_all(total_count=True)
            counts["total_documents"] = total_res.total_count
            logger.info(f"Total documents: {counts['total_documents']:,}")
            
            # 2) Counts by document_type - server-side filtering
            async def count_with_type(doc_type: str) -> int:
                """Count documents of a specific type using Weaviate aggregate"""
                res = await collection.aggregate.over_all(
                    total_count=True,
                    filters=Filter.by_property("document_type").equal(doc_type),
                )
                return res.total_count

            logger.info("Counting by document type...")
            counts["judgments"] = await count_with_type("judgment")
            counts["tax_interpretations"] = await count_with_type("tax_interpretation")
            counts["legal_acts"] = await count_with_type("legal_act")
            counts["other_documents"] = await count_with_type("other")

            logger.info(f"Judgments: {counts['judgments']:,}")
            logger.info(f"Tax interpretations: {counts['tax_interpretations']:,}")
            logger.info(f"Legal acts: {counts['legal_acts']:,}")
            logger.info(f"Other documents: {counts['other_documents']:,}")

            # 2b) Counts by document_type AND country for granular statistics
            # UK documents are stored with country="England" in the database
            logger.info("Counting PL/UK breakdowns by country...")

            async def count_by_type_and_country(doc_type: str, country: str) -> int:
                """Count documents of a specific type and country"""
                res = await collection.aggregate.over_all(
                    total_count=True,
                    filters=(
                        Filter.by_property("document_type").equal(doc_type) &
                        Filter.by_property("country").equal(country)
                    ),
                )
                return res.total_count

            # Count UK judgments (stored with country="England")
            counts["judgments_uk"] = await count_by_type_and_country("judgment", "England")
            # Polish judgments = total judgments - UK judgments
            counts["judgments_pl"] = counts["judgments"] - counts["judgments_uk"]

            # Count UK tax interpretations (stored with country="England")
            counts["tax_interpretations_uk"] = await count_by_type_and_country("tax_interpretation", "England")
            # Polish tax interpretations = total - UK
            counts["tax_interpretations_pl"] = counts["tax_interpretations"] - counts["tax_interpretations_uk"]

            logger.info(f"Judgments PL: {counts['judgments_pl']:,}")
            logger.info(f"Judgments UK: {counts['judgments_uk']:,}")
            logger.info(f"Tax interpretations PL: {counts['tax_interpretations_pl']:,}")
            logger.info(f"Tax interpretations UK: {counts['tax_interpretations_uk']:,}")
            
            # 3) Time windows - server-side filter on ingestion_date
            async def count_since(dt: datetime) -> int:
                """Count documents ingested since a given datetime"""
                res = await collection.aggregate.over_all(
                    total_count=True,
                    filters=Filter.by_property("ingestion_date").greater_or_equal(
                        dt
                    ),
                )
                return res.total_count
            
            logger.info("Counting by time windows...")
            counts["added_this_week"] = await count_since(one_week_ago)
            counts["added_this_month"] = await count_since(one_month_ago)
            counts["added_this_year"] = await count_since(one_year_ago)
            
            logger.info(f"Added this week: {counts['added_this_week']:,}")
            logger.info(f"Added this month: {counts['added_this_month']:,}")
            logger.info(f"Added this year: {counts['added_this_year']:,}")
            
            # 4) Last ingestion date = max(ingestion_date)
            # Query for one object sorted by ingestion_date DESC
            logger.info("Finding most recent ingestion date...")
            from weaviate.classes.query import Sort
            
            last_obj_res = await collection.query.fetch_objects(
                limit=1,
                return_properties=["ingestion_date"],
                sort=Sort.by_property("ingestion_date", ascending=False),
            )
            
            if last_obj_res.objects:
                last_ing = last_obj_res.objects[0].properties.get("ingestion_date")
                if last_ing:
                    counts["last_ingestion_date"] = (
                        last_ing.isoformat() if isinstance(last_ing, datetime) else str(last_ing)
                    )
                    logger.info(f"Last ingestion: {counts.get('last_ingestion_date', 'N/A')}")
            
            logger.info("✅ Got all aggregate counts from Weaviate (no full scan!)")
    
    except Exception as e:
        logger.error(f"Error querying Weaviate: {e}")
        raise
    
    return counts


def update_supabase_stats(supabase: Client, counts: dict) -> None:
    """
    Update doc_type_stats table in Supabase using bulk upsert.

    Much more efficient than individual upserts - one HTTP call instead of N.

    The doc_type_stats table schema:
        - doc_type: VARCHAR(50) UNIQUE - the document type identifier
        - count: INTEGER - the document count
        - created_at: TIMESTAMPTZ - auto-set on insert
        - updated_at: TIMESTAMPTZ - auto-set on insert

    Args:
        supabase: Supabase client
        counts: Dictionary of stat_type -> count
    """
    logger.info("Updating Supabase doc_type_stats table (bulk upsert)...")

    now_iso = datetime.now(timezone.utc).isoformat()
    rows = []

    # Map the counts to doc_type values expected by the dashboard
    # The backend expects: TOTAL, judgment, tax_interpretation, and language-specific variants
    doc_type_mapping = {
        "total_documents": "TOTAL",
        "judgments": "judgment",
        "judgments_pl": "judgment_pl",
        "judgments_uk": "judgment_uk",
        "tax_interpretations": "tax_interpretation",
        "tax_interpretations_pl": "tax_interpretation_pl",
        "tax_interpretations_uk": "tax_interpretation_uk",
        "legal_acts": "legal_act",
        "other_documents": "other",
        "added_this_week": "added_this_week",
        "added_this_month": "added_this_month",
        "added_this_year": "added_this_year",
    }

    # Build all rows for bulk upsert
    for stat_type, stat_value in counts.items():
        # Skip last_ingestion_date (not stored in doc_type_stats)
        if stat_type == "last_ingestion_date":
            continue

        # Map to the correct doc_type name
        doc_type = doc_type_mapping.get(stat_type, stat_type)

        rows.append({
            "doc_type": doc_type,
            "count": stat_value,
            "updated_at": now_iso,
        })

    # Bulk upsert all stats in one call
    try:
        supabase.table("doc_type_stats").upsert(
            rows,
            on_conflict="doc_type",
        ).execute()
        logger.info(f"✅ Bulk upserted {len(rows)} stats to doc_type_stats table")

        # Log individual values
        for row in rows:
            logger.info(f"  {row['doc_type']}: {row['count']:,}")

    except Exception as e:
        logger.error(f"❌ Error bulk-upserting stats: {e}")
        # Fall back to individual upserts on error
        logger.info("Falling back to individual upserts...")
        for row in rows:
            try:
                supabase.table("doc_type_stats").upsert(row, on_conflict="doc_type").execute()
                logger.info(f"  Updated {row['doc_type']} = {row['count']}")
            except Exception as e2:
                logger.error(f"  Error updating {row['doc_type']}: {e2}")

    logger.info("✅ All dashboard stats updated successfully!")


async def main():
    """Main execution function."""
    logger.info("=" * 60)
    logger.info("Starting dashboard stats update...")
    logger.info("=" * 60)
    
    try:
        # Get Supabase client
        supabase = get_supabase_client()
        logger.info("✅ Connected to Supabase")
        
        # Get counts from Weaviate
        counts = await get_weaviate_counts()
        logger.info("✅ Retrieved counts from Weaviate")
        
        # Update Supabase
        update_supabase_stats(supabase, counts)
        
        logger.info("=" * 60)
        logger.info("Dashboard stats update completed successfully!")
        logger.info("=" * 60)
        
        # Print summary
        logger.info("\nStats Summary:")
        for key, value in counts.items():
            logger.info(f"  {key}: {value}")
        
        return 0
        
    except Exception as e:
        logger.error(f"❌ Error updating dashboard stats: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

