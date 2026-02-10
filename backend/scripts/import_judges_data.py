import os
import sys
import uuid
import vecs
from datasets import load_dataset
from datetime import datetime
from dotenv import load_dotenv

# Add parent directory to path to allow importing from packages
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from ai_tax_search.models import LegalDocument, DocumentType

load_dotenv()

# Configuration
PL_DATASET = "madmax86/saos-pl-judgments"
EN_DATASET = "JuDDGES/en-appealcourt"
TARGET_COUNT = 6000
COLLECTION_NAME = "judgments_criminal"
DB_CONNECTION = os.environ.get("VECS_DB_URL") or os.environ.get("POSTGRES_URL")

if not DB_CONNECTION:
    print("Error: VECS_DB_URL or POSTGRES_URL environment variable not set.")
    print("Please set it to your Supabase/Postgres connection string.")
    print("Example: postgresql://postgres.Ref:Password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres")
    sys.exit(1)

def create_collection_if_not_exists(vx):
    try:
        # Create collection with 1536 dimensions (standard for OpenAI embeddings)
        # Assuming we will update vectors later or now. 
        # Note: This script just inserts records. If we need vectors, we need an embedding service.
        # For this "simple way" fork, we might just store metadata first, or generate dummy vectors.
        # Since the user said "we will add supabase vectors", I'll assume standard 1536 dim.
        docs = vx.get_or_create_collection(name=COLLECTION_NAME, dimension=1536)
        return docs
    except Exception as e:
        print(f"Error creating collection: {e}")
        sys.exit(1)

def import_pl_data(docs):
    print(f"Loading Polish dataset: {PL_DATASET}...")
    ds = load_dataset(PL_DATASET, split="train", streaming=True)
    
    count = 0
    records = []
    
    for row in ds:
        if count >= TARGET_COUNT:
            break
            
        # Map fields
        doc_id = str(row.get("case_number", "")) or str(uuid.uuid4())
        text = row.get("text_content", "")
        if not text:
            continue
            
        # Create LegalDocument
        try:
            legal_doc = LegalDocument(
                document_id=doc_id,
                document_type=DocumentType.JUDGMENT,
                title=f"Wyrok {doc_id}",
                date_issued=parse_date(row.get("publication_date")),
                language="pl",
                country="PL",
                full_text=text,
                summary=row.get("summary"),
                judges=[str(j) for j in row.get("judges", []) if j] if isinstance(row.get("judges"), list) else [],
                legal_bases=[str(lb) for lb in row.get("legal_bases", []) if lb] if isinstance(row.get("legal_bases"), list) else [],
                case_type="criminal", # Defaulting to criminal as per requirement
                victims_count=0, # Placeholder, will be populated by extraction later
                offenders_count=0, # Placeholder
                metadata={
                    "saos_id": row.get("saos_id"),
                    "court_type": row.get("court_type"),
                    "judgment_type": row.get("judgment_type")
                }
            )
            
            # Prepare for vecs upsert
            # vecs expects (id, vector, metadata)
            # We don't have vectors yet. We can insert dummy or skip scalar insert if vecs requires vector.
            # Vecs IS a vector store client. It usually requires a vector.
            # Using a zero-vector for now as placeholder.
            records.append((
                str(uuid.uuid4()),
                [0.0] * 1536,
                legal_doc.model_dump(mode="json")
            ))
            
            count += 1
            if count % 100 == 0:
                print(f"Processed {count} PL documents...")
                docs.upsert(records)
                records = []
                
        except Exception as e:
            print(f"Skipping PL document {doc_id}: {e}")
            continue

    if records:
        docs.upsert(records)
    print(f"Finished importing {count} Polish documents.")

def import_en_data(docs):
    print(f"Loading English dataset: {EN_DATASET}...")
    ds = load_dataset(EN_DATASET, split="train", streaming=True)
    
    count = 0
    records = []
    
    for row in ds:
        if count >= TARGET_COUNT:
            break
            
        text = row.get("context", "")
        if not text:
            continue
            
        doc_id = f"EN-JUDGMENT-{count}-{uuid.uuid4().hex[:8]}"
        
        try:
            legal_doc = LegalDocument(
                document_id=doc_id,
                document_type=DocumentType.JUDGMENT,
                title=f"Judgment {doc_id}",
                language="en",
                country="UK", # Assuming UK based on dataset research
                full_text=text,
                case_type="criminal",
                metadata={
                    "original_output": row.get("output")
                }
            )
            
            records.append((
                str(uuid.uuid4()),
                [0.0] * 1536,
                legal_doc.model_dump(mode="json")
            ))
            
            count += 1
            if count % 100 == 0:
                print(f"Processed {count} EN documents...")
                docs.upsert(records)
                records = []
                
        except Exception as e:
            print(f"Skipping EN document {doc_id}: {e}")
            continue

    if records:
        docs.upsert(records)
    print(f"Finished importing {count} English documents.")

def parse_date(date_str):
    if not date_str:
        return None
    try:
        # Try varying formats
        return datetime.fromisoformat(str(date_str))
    except:
        return None

def main():
    print("Connecting to Supabase Vecs...")
    vx = vecs.create_client(DB_CONNECTION)
    docs = create_collection_if_not_exists(vx)
    
    print("Starting import...")
    import_pl_data(docs)
    import_en_data(docs)
    
    print("Import completed successfully!")

if __name__ == "__main__":
    main()
