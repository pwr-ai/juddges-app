"""
Schema Migration Tool for Weaviate Optimization
Migrates from current 32-property schema to optimized 13-property schema
"""

import asyncio
import json
from typing import List, Dict, Any, Optional
from loguru import logger
from rich.console import Console
from rich.progress import track
from rich.table import Table

from ai_tax_search.db.weaviate_db import WeaviateLegalDatabase
from ai_tax_search.performance.optimized_schema import (
    create_optimized_legal_documents_schema,
    create_optimized_document_chunks_schema,
    get_migration_mapping,
    REMOVED_PROPERTIES
)

console = Console()


class SchemaMigrator:
    """Handles migration from current schema to optimized schema."""
    
    def __init__(self):
        self.current_collection = "LegalDocuments"
        self.optimized_collection = "LegalDocumentsOptimized"
        self.chunks_collection = "DocumentChunks"
        self.optimized_chunks_collection = "DocumentChunksOptimized"
        
    async def analyze_current_schema(self) -> Dict[str, Any]:
        """Analyze current schema and data to understand migration impact."""
        async with WeaviateLegalDatabase() as db:
            # Get collection info
            collections = await db.client.collections.list_all()
            legal_docs_collection = None
            
            for collection in collections:
                if collection.name == self.current_collection:
                    legal_docs_collection = collection
                    break
            
            if not legal_docs_collection:
                raise ValueError(f"Collection {self.current_collection} not found")
            
            # Count documents
            doc_count_response = await db.legal_documents_collection.aggregate.over_all(
                total_count=True
            )
            total_docs = doc_count_response.total_count
            
            # Sample documents to analyze property usage
            sample_response = await db.legal_documents_collection.query.fetch_objects(limit=10)
            
            property_analysis = {}
            for obj in sample_response.objects:
                for prop_name, prop_value in obj.properties.items():
                    if prop_name not in property_analysis:
                        property_analysis[prop_name] = {
                            'count': 0,
                            'null_count': 0,
                            'sample_values': [],
                            'avg_size': 0
                        }
                    
                    property_analysis[prop_name]['count'] += 1
                    if prop_value is None or prop_value == "":
                        property_analysis[prop_name]['null_count'] += 1
                    else:
                        if len(property_analysis[prop_name]['sample_values']) < 3:
                            property_analysis[prop_name]['sample_values'].append(str(prop_value)[:100])
                        
                        # Estimate size
                        if isinstance(prop_value, str):
                            property_analysis[prop_name]['avg_size'] += len(prop_value)
                        elif isinstance(prop_value, list):
                            property_analysis[prop_name]['avg_size'] += len(str(prop_value))
            
            return {
                'total_documents': total_docs,
                'current_properties': len(property_analysis),
                'property_analysis': property_analysis,
                'optimized_properties': 13,
                'removed_properties': len(REMOVED_PROPERTIES),
                'memory_reduction_estimate': 0.6
            }
    
    async def create_optimized_collections(self) -> bool:
        """Create new optimized collections."""
        try:
            async with WeaviateLegalDatabase() as db:
                # Create optimized legal documents collection
                legal_docs_schema = create_optimized_legal_documents_schema()
                await db.client.collections.create_from_dict(legal_docs_schema)
                console.print(f"✅ Created {self.optimized_collection}")
                
                # Create optimized chunks collection  
                chunks_schema = create_optimized_document_chunks_schema()
                await db.client.collections.create_from_dict(chunks_schema)
                console.print(f"✅ Created {self.optimized_chunks_collection}")
                
                return True
        except Exception as e:
            console.print(f"❌ Error creating collections: {e}")
            return False
    
    def transform_document(self, doc_properties: Dict[str, Any]) -> Dict[str, Any]:
        """Transform document from current schema to optimized schema."""
        mapping = get_migration_mapping()
        transformed = {}
        
        for current_prop, optimized_prop in mapping.items():
            if optimized_prop is None:  # Property being removed
                continue
                
            if "." in current_prop:  # Nested property like metadata.publication_date
                parent_prop, child_prop = current_prop.split(".", 1)
                parent_value = doc_properties.get(parent_prop)
                
                if isinstance(parent_value, str):
                    try:
                        parent_value = json.loads(parent_value)
                    except (json.JSONDecodeError, TypeError):
                        parent_value = {}
                
                if isinstance(parent_value, dict):
                    transformed[optimized_prop] = parent_value.get(child_prop)
                else:
                    transformed[optimized_prop] = None
            else:
                value = doc_properties.get(current_prop)
                
                # Special transformations
                if current_prop == "issuing_body":
                    # Flatten issuing_body object to simple string
                    if isinstance(value, dict):
                        transformed[optimized_prop] = value.get("name", str(value))
                    else:
                        transformed[optimized_prop] = str(value) if value else None
                else:
                    transformed[optimized_prop] = value
        
        return transformed
    
    async def migrate_documents(self, batch_size: int = 100) -> bool:
        """Migrate documents from current to optimized schema."""
        try:
            async with WeaviateLegalDatabase() as db:
                # Get total count for progress tracking
                count_response = await db.legal_documents_collection.aggregate.over_all(total_count=True)
                total_docs = count_response.total_count
                
                console.print(f"📊 Migrating {total_docs} documents...")
                
                migrated_count = 0
                errors = []
                
                # Process in batches
                for offset in track(range(0, total_docs, batch_size), description="Migrating..."):
                    batch_response = await db.legal_documents_collection.query.fetch_objects(
                        limit=batch_size,
                        offset=offset
                    )
                    
                    # Transform batch
                    transformed_batch = []
                    for obj in batch_response.objects:
                        try:
                            transformed = self.transform_document(obj.properties)
                            transformed_batch.append(transformed)
                        except Exception as e:
                            errors.append(f"Doc {obj.properties.get('document_id', 'unknown')}: {e}")
                    
                    # Insert batch into optimized collection
                    if transformed_batch:
                        optimized_collection = db.client.collections.get(self.optimized_collection)
                        batch_result = await optimized_collection.data.insert_many(transformed_batch)
                        migrated_count += len(transformed_batch)
                
                console.print(f"✅ Migrated {migrated_count} documents")
                if errors:
                    console.print(f"⚠️ {len(errors)} errors occurred:")
                    for error in errors[:5]:  # Show first 5 errors
                        console.print(f"  - {error}")
                
                return len(errors) == 0
                
        except Exception as e:
            console.print(f"❌ Migration failed: {e}")
            return False
    
    async def validate_migration(self) -> Dict[str, Any]:
        """Validate migration results."""
        async with WeaviateLegalDatabase() as db:
            # Count documents in both collections
            original_count = await db.legal_documents_collection.aggregate.over_all(total_count=True)
            optimized_collection = db.client.collections.get(self.optimized_collection)
            optimized_count = await optimized_collection.aggregate.over_all(total_count=True)
            
            # Sample comparison
            original_sample = await db.legal_documents_collection.query.fetch_objects(limit=5)
            optimized_sample = await optimized_collection.query.fetch_objects(limit=5)
            
            return {
                'original_count': original_count.total_count,
                'optimized_count': optimized_count.total_count,
                'count_match': original_count.total_count == optimized_count.total_count,
                'original_properties': len(original_sample.objects[0].properties) if original_sample.objects else 0,
                'optimized_properties': len(optimized_sample.objects[0].properties) if optimized_sample.objects else 0,
            }
    
    def print_migration_plan(self, analysis: Dict[str, Any]):
        """Print detailed migration plan."""
        table = Table(title="Schema Migration Plan")
        table.add_column("Metric", style="cyan")
        table.add_column("Current", style="yellow")
        table.add_column("Optimized", style="green")
        table.add_column("Change", style="magenta")
        
        table.add_row(
            "Total Documents",
            str(analysis['total_documents']),
            str(analysis['total_documents']),
            "No change"
        )
        table.add_row(
            "Properties per Document", 
            str(analysis['current_properties']),
            str(analysis['optimized_properties']),
            f"-{analysis['removed_properties']} (-{analysis['memory_reduction_estimate']:.0%})"
        )
        table.add_row(
            "Estimated Memory Usage",
            "100%",
            f"{(1-analysis['memory_reduction_estimate'])*100:.0f}%",
            f"-{analysis['memory_reduction_estimate']:.0%}"
        )
        
        console.print(table)
        
        # Show removed properties
        console.print("\n🗑️ Properties to be removed:")
        for prop in REMOVED_PROPERTIES:
            console.print(f"  - {prop}")


async def main():
    """Main migration workflow."""
    migrator = SchemaMigrator()
    
    console.print("🔍 Analyzing current schema...")
    analysis = await migrator.analyze_current_schema()
    
    migrator.print_migration_plan(analysis)
    
    # Ask for confirmation
    console.print("\n⚠️ This will create new collections with optimized schema.")
    console.print("Original collections will be preserved for safety.")
    
    proceed = console.input("\nProceed with migration? (y/N): ")
    if proceed.lower() != 'y':
        console.print("Migration cancelled.")
        return
    
    # Create optimized collections
    console.print("\n🏗️ Creating optimized collections...")
    if not await migrator.create_optimized_collections():
        return
    
    # Migrate data
    console.print("\n📦 Migrating documents...")
    if not await migrator.migrate_documents():
        return
    
    # Validate migration
    console.print("\n✅ Validating migration...")
    validation = await migrator.validate_migration()
    
    validation_table = Table(title="Migration Validation")
    validation_table.add_column("Check", style="cyan")
    validation_table.add_column("Result", style="green" if validation['count_match'] else "red")
    
    validation_table.add_row("Document Count Match", "✅ Pass" if validation['count_match'] else "❌ Fail")
    validation_table.add_row("Property Reduction", f"{validation['original_properties']} → {validation['optimized_properties']}")
    
    console.print(validation_table)
    
    if validation['count_match']:
        console.print("\n🎉 Migration completed successfully!")
        console.print(f"New collections created: {migrator.optimized_collection}, {migrator.optimized_chunks_collection}")
        console.print("Update your application to use the new collection names.")
    else:
        console.print("\n❌ Migration validation failed. Check the results before proceeding.")


if __name__ == "__main__":
    asyncio.run(main())