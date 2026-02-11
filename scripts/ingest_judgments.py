"""
Data Ingestion Script for Juddges App

This script downloads judgment datasets from HuggingFace and ingests them into Supabase.
Supports:
- Polish judgments from HFforLegal/case-law
- UK judgments from JuDDGES/en-appealcourt

Usage:
    python ingest_judgments.py --polish 100 --uk 100
    python ingest_judgments.py --polish 50 --skip-uk
    python ingest_judgments.py --uk 100 --skip-polish
"""

import argparse
import os
from datetime import datetime
from typing import Dict, List, Optional
import sys

try:
    from datasets import load_dataset
    from supabase import create_client, Client
    from tqdm import tqdm
    import requests
except ImportError as e:
    print(f"Error: Missing required dependencies. Please install:")
    print("pip install datasets supabase requests tqdm python-dotenv")
    sys.exit(1)


class JudgmentIngestionPipeline:
    """Pipeline for ingesting judgments from HuggingFace into Supabase."""

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        transformers_url: Optional[str] = None
    ):
        """
        Initialize the ingestion pipeline.

        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service role key (for write access)
            transformers_url: Sentence Transformers inference URL (optional)
        """
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.transformers_url = transformers_url or os.getenv("TRANSFORMERS_INFERENCE_URL", "http://localhost:8080")

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding using Sentence Transformers.

        Args:
            text: Input text to embed

        Returns:
            List of 768 floats (multilingual-mpnet embedding), or None if service unavailable
        """
        try:
            # Truncate text to reasonable length
            truncated_text = text[:32000]

            url = f"{self.transformers_url}/vectors"
            payload = {"text": truncated_text}

            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()

            data = response.json()
            vector = data.get("vector")

            if not vector:
                print(f"Warning: No vector in response from {url}")
                return None

            return vector

        except Exception as e:
            print(f"Warning: Failed to generate embedding: {e}")
            return None

    def ingest_polish_judgments(self, sample_size: int = 100) -> int:
        """
        Ingest Polish judgments from HFforLegal/case-law dataset.

        Args:
            sample_size: Number of judgments to ingest

        Returns:
            Number of judgments successfully ingested
        """
        print(f"\n🇵🇱 Loading Polish judgments from HFforLegal/case-law (sample: {sample_size})...")

        try:
            # Load dataset - use 'us' split (only available split)
            # Note: This dataset contains US cases, not Polish
            # We'll need to find an alternative Polish dataset
            dataset = load_dataset(
                "HFforLegal/case-law",
                split="us",
                streaming=True  # Use streaming to handle large datasets
            )

            # Filter for Polish cases and take sample
            polish_cases = []
            for item in dataset:
                # Check if this is a Polish case
                # Note: Adjust field names based on actual dataset structure
                jurisdiction = item.get('jurisdiction', '').upper()
                country = item.get('country', '').upper()

                if 'PL' in jurisdiction or 'POLAND' in country or 'POLSKA' in country.upper():
                    polish_cases.append(item)

                if len(polish_cases) >= sample_size:
                    break

            print(f"Found {len(polish_cases)} Polish cases")

            # Transform and insert
            ingested = 0
            for case in tqdm(polish_cases, desc="Ingesting Polish judgments"):
                judgment_data = self._transform_polish_judgment(case)
                if judgment_data:
                    self._insert_judgment(judgment_data)
                    ingested += 1

            print(f"✅ Successfully ingested {ingested} Polish judgments")
            return ingested

        except Exception as e:
            print(f"❌ Error ingesting Polish judgments: {e}")
            return 0

    def ingest_uk_judgments(self, sample_size: int = 100) -> int:
        """
        Ingest UK judgments from JuDDGES datasets.
        Loads from both en-appealcourt and en-court-raw-sample.

        Args:
            sample_size: Number of judgments to ingest (split between datasets)

        Returns:
            Number of judgments successfully ingested
        """
        total_ingested = 0
        half_size = sample_size // 2

        # Dataset 1: JuDDGES/en-appealcourt
        print(f"\n🇬🇧 Loading UK Appeal Court judgments (sample: {half_size})...")
        try:
            dataset1 = load_dataset("JuDDGES/en-appealcourt", split="test")
            sample_data1 = dataset1.select(range(min(half_size, len(dataset1))))

            for case in tqdm(sample_data1, desc="Ingesting Appeal Court judgments"):
                judgment_data = self._transform_uk_judgment(case, source="JuDDGES/en-appealcourt")
                if judgment_data:
                    self._insert_judgment(judgment_data)
                    total_ingested += 1

            print(f"✅ Ingested {total_ingested} from en-appealcourt")
        except Exception as e:
            print(f"❌ Error with en-appealcourt: {e}")

        # Dataset 2: JuDDGES/en-court-raw-sample
        print(f"\n🇬🇧 Loading UK Court raw sample judgments (sample: {sample_size - half_size})...")
        try:
            dataset2 = load_dataset("JuDDGES/en-court-raw-sample", split="train")
            remaining = sample_size - total_ingested
            sample_data2 = dataset2.select(range(min(remaining, len(dataset2))))

            count_before = total_ingested
            for case in tqdm(sample_data2, desc="Ingesting Court raw judgments"):
                judgment_data = self._transform_uk_judgment(case, source="JuDDGES/en-court-raw-sample")
                if judgment_data:
                    self._insert_judgment(judgment_data)
                    total_ingested += 1

            print(f"✅ Ingested {total_ingested - count_before} from en-court-raw-sample")
        except Exception as e:
            print(f"❌ Error with en-court-raw-sample: {e}")

        print(f"✅ Total UK judgments ingested: {total_ingested}")
        return total_ingested

    def _transform_polish_judgment(self, raw_data: Dict) -> Optional[Dict]:
        """
        Transform Polish judgment from HFforLegal format to our schema.

        Args:
            raw_data: Raw data from HFforLegal/case-law

        Returns:
            Transformed judgment data or None if invalid
        """
        try:
            # Extract text content
            full_text = raw_data.get('text', '')
            if not full_text:
                return None

            # Generate embedding if OpenAI is configured
            embedding = self.generate_embedding(full_text)

            return {
                'case_number': raw_data.get('case_id', f"PL-{raw_data.get('id', 'unknown')}"),
                'jurisdiction': 'PL',
                'court_name': raw_data.get('court', 'Unknown Court'),
                'court_level': raw_data.get('court_level'),
                'decision_date': self._parse_date(raw_data.get('date')),
                'title': raw_data.get('title', '')[:500],  # Limit title length
                'summary': raw_data.get('summary', ''),
                'full_text': full_text,
                'judges': raw_data.get('judges', []),
                'case_type': raw_data.get('case_type'),
                'keywords': raw_data.get('keywords', []),
                'legal_topics': raw_data.get('topics', []),
                'embedding': embedding,
                'metadata': {
                    'language': 'pl',
                    'original_fields': raw_data.keys()
                },
                'source_dataset': 'HFforLegal/case-law',
                'source_id': str(raw_data.get('id', '')),
                'source_url': raw_data.get('url'),
            }
        except Exception as e:
            print(f"Warning: Failed to transform Polish judgment: {e}")
            return None

    def _transform_uk_judgment(self, raw_data: Dict, source: str = "JuDDGES/en-appealcourt") -> Optional[Dict]:
        """
        Transform UK judgment from JuDDGES format to our schema.

        Args:
            raw_data: Raw data from JuDDGES datasets
            source: Source dataset name

        Returns:
            Transformed judgment data or None if invalid
        """
        try:
            # Handle different dataset structures
            if source == "JuDDGES/en-appealcourt":
                # This dataset has 'context' (full text) and 'output' (JSON metadata)
                full_text = raw_data.get('context', '')
                if not full_text:
                    return None

                # For now, we'll just use the context text
                # The 'output' field contains structured JSON we could parse later
                return {
                    'case_number': f"UK-APPEAL-{hash(full_text[:100]) % 1000000}",
                    'jurisdiction': 'UK',
                    'court_name': 'Court of Appeal',
                    'court_level': 'Appeal Court',
                    'decision_date': None,
                    'title': full_text[:200] if full_text else 'Appeal Court Judgment',
                    'summary': full_text[:500] if len(full_text) > 500 else '',
                    'full_text': full_text,
                    'judges': [],
                    'case_type': 'Criminal',
                    'decision_type': 'Judgment',
                    'outcome': None,
                    'keywords': [],
                    'legal_topics': [],
                    'embedding': self.generate_embedding(full_text),
                    'metadata': {
                        'language': 'en',
                        'division': 'Criminal',
                        'has_structured_output': 'output' in raw_data
                    },
                    'source_dataset': source,
                    'source_id': str(hash(full_text[:100]))[:10],
                    'source_url': None,
                }

            else:  # JuDDGES/en-court-raw-sample
                full_text = raw_data.get('full_text', '')
                if not full_text:
                    return None

                # Parse judges
                judges = []
                judge_field = raw_data.get('judges', [])
                if isinstance(judge_field, list):
                    judges = judge_field
                elif isinstance(judge_field, str):
                    judges = [j.strip() for j in judge_field.split(',')]

                # Determine court type
                court_type = raw_data.get('court_type', 'unknown')
                court_name = court_type.replace('_', ' ').title()

                return {
                    'case_number': raw_data.get('citation', raw_data.get('docket_number', f"UK-{raw_data.get('judgment_id', 'unknown')[:10]}")),
                    'jurisdiction': 'UK',
                    'court_name': court_name,
                    'court_level': 'High Court' if 'high' in court_type.lower() else 'Crown Court' if 'crown' in court_type.lower() else 'Court',
                    'decision_date': self._parse_date(raw_data.get('publication_date')),
                    'title': raw_data.get('excerpt', full_text[:200])[:500],
                    'summary': raw_data.get('excerpt', ''),
                    'full_text': full_text,
                    'judges': judges,
                    'case_type': 'Criminal' if 'crim' in court_type.lower() else 'Civil',
                    'decision_type': 'Judgment',
                    'outcome': None,
                    'keywords': [],
                    'legal_topics': [],
                    'embedding': self.generate_embedding(full_text),
                    'metadata': {
                        'language': 'en',
                        'court_type': court_type,
                        'country': raw_data.get('country', 'UK'),
                        'file_name': raw_data.get('file_name', ''),
                    },
                    'source_dataset': source,
                    'source_id': raw_data.get('judgment_id', '')[:20],
                    'source_url': raw_data.get('uri'),
                }
        except Exception as e:
            print(f"Warning: Failed to transform UK judgment from {source}: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse date string to ISO format."""
        if not date_str:
            return None

        try:
            # Try common date formats
            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%Y', '%d.%m.%Y']:
                try:
                    parsed = datetime.strptime(str(date_str), fmt)
                    return parsed.date().isoformat()
                except ValueError:
                    continue
            return None
        except Exception:
            return None

    def _insert_judgment(self, judgment_data: Dict) -> bool:
        """
        Insert judgment into Supabase.

        Args:
            judgment_data: Transformed judgment data

        Returns:
            True if successful, False otherwise
        """
        try:
            response = self.supabase.table('judgments').insert(judgment_data).execute()
            return True
        except Exception as e:
            print(f"Warning: Failed to insert judgment {judgment_data.get('case_number')}: {e}")
            return False


def main():
    """Main entry point for the ingestion script."""
    parser = argparse.ArgumentParser(description='Ingest judgments from HuggingFace into Supabase')
    parser.add_argument('--polish', type=int, default=0, help='Number of Polish judgments to ingest')
    parser.add_argument('--uk', type=int, default=0, help='Number of UK judgments to ingest')
    parser.add_argument('--skip-polish', action='store_true', help='Skip Polish judgments')
    parser.add_argument('--skip-uk', action='store_true', help='Skip UK judgments')
    parser.add_argument('--no-embeddings', action='store_true', help='Skip generating embeddings')

    args = parser.parse_args()

    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()

    # Get credentials from environment
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')  # Need service role for writes
    transformers_url = os.getenv('TRANSFORMERS_INFERENCE_URL', 'http://localhost:8080') if not args.no_embeddings else None

    if not supabase_url or not supabase_key:
        print("❌ Error: Missing required environment variables")
        print("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
        print("Optional: TRANSFORMERS_INFERENCE_URL (for embeddings, default: http://localhost:8080)")
        sys.exit(1)

    # Initialize pipeline
    pipeline = JudgmentIngestionPipeline(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        transformers_url=transformers_url
    )

    # Run ingestion
    total_ingested = 0

    if not args.skip_polish and args.polish > 0:
        total_ingested += pipeline.ingest_polish_judgments(sample_size=args.polish)

    if not args.skip_uk and args.uk > 0:
        total_ingested += pipeline.ingest_uk_judgments(sample_size=args.uk)

    print(f"\n🎉 Ingestion complete! Total judgments ingested: {total_ingested}")


if __name__ == '__main__':
    main()
