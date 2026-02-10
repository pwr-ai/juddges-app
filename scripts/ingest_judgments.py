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
    import openai
except ImportError as e:
    print(f"Error: Missing required dependencies. Please install:")
    print("pip install datasets supabase openai tqdm python-dotenv")
    sys.exit(1)


class JudgmentIngestionPipeline:
    """Pipeline for ingesting judgments from HuggingFace into Supabase."""

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        openai_api_key: Optional[str] = None
    ):
        """
        Initialize the ingestion pipeline.

        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service role key (for write access)
            openai_api_key: OpenAI API key for generating embeddings (optional)
        """
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.openai_client = None

        if openai_api_key:
            openai.api_key = openai_api_key
            self.openai_client = openai

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate OpenAI embedding for text.

        Args:
            text: Input text to embed

        Returns:
            List of 1536 floats (ada-002 embedding), or None if OpenAI not configured
        """
        if not self.openai_client:
            return None

        try:
            # Truncate text to ~8000 tokens (roughly 32k characters for safety)
            truncated_text = text[:32000]

            response = self.openai_client.embeddings.create(
                model="text-embedding-ada-002",
                input=truncated_text
            )
            return response.data[0].embedding
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
            # Load dataset - filter for Polish jurisdiction
            dataset = load_dataset(
                "HFforLegal/case-law",
                split="train",
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
        Ingest UK judgments from JuDDGES/en-appealcourt dataset.

        Args:
            sample_size: Number of judgments to ingest

        Returns:
            Number of judgments successfully ingested
        """
        print(f"\n🇬🇧 Loading UK judgments from JuDDGES/en-appealcourt (sample: {sample_size})...")

        try:
            # Load dataset
            dataset = load_dataset("JuDDGES/en-appealcourt", split="train")

            # Take sample
            sample_data = dataset.select(range(min(sample_size, len(dataset))))

            # Transform and insert
            ingested = 0
            for case in tqdm(sample_data, desc="Ingesting UK judgments"):
                judgment_data = self._transform_uk_judgment(case)
                if judgment_data:
                    self._insert_judgment(judgment_data)
                    ingested += 1

            print(f"✅ Successfully ingested {ingested} UK judgments")
            return ingested

        except Exception as e:
            print(f"❌ Error ingesting UK judgments: {e}")
            return 0

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

    def _transform_uk_judgment(self, raw_data: Dict) -> Optional[Dict]:
        """
        Transform UK judgment from JuDDGES format to our schema.

        Args:
            raw_data: Raw data from JuDDGES/en-appealcourt

        Returns:
            Transformed judgment data or None if invalid
        """
        try:
            # Extract text content
            full_text = raw_data.get('text', '') or raw_data.get('judgment_text', '')
            if not full_text:
                return None

            # Generate embedding if OpenAI is configured
            embedding = self.generate_embedding(full_text)

            # Parse judges from the judgment
            judges = []
            judge_field = raw_data.get('judges', [])
            if isinstance(judge_field, list):
                judges = judge_field
            elif isinstance(judge_field, str):
                judges = [j.strip() for j in judge_field.split(',')]

            return {
                'case_number': raw_data.get('case_number', raw_data.get('neutral_citation', f"UK-{raw_data.get('id', 'unknown')}")),
                'jurisdiction': 'UK',
                'court_name': 'Court of Appeal (Criminal Division)',
                'court_level': 'Appeal Court',
                'decision_date': self._parse_date(raw_data.get('judgment_date') or raw_data.get('date')),
                'title': raw_data.get('case_name', '')[:500],
                'summary': raw_data.get('summary', ''),
                'full_text': full_text,
                'judges': judges,
                'case_type': 'Criminal',
                'decision_type': raw_data.get('decision_type', 'Judgment'),
                'outcome': raw_data.get('outcome'),
                'keywords': raw_data.get('keywords', []),
                'legal_topics': raw_data.get('topics', []),
                'embedding': embedding,
                'metadata': {
                    'language': 'en',
                    'division': 'Criminal',
                    'original_fields': list(raw_data.keys())
                },
                'source_dataset': 'JuDDGES/en-appealcourt',
                'source_id': str(raw_data.get('id', '')),
                'source_url': raw_data.get('uri') or raw_data.get('url'),
            }
        except Exception as e:
            print(f"Warning: Failed to transform UK judgment: {e}")
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
    openai_api_key = os.getenv('OPENAI_API_KEY') if not args.no_embeddings else None

    if not supabase_url or not supabase_key:
        print("❌ Error: Missing required environment variables")
        print("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
        print("Optional: OPENAI_API_KEY (for embeddings)")
        sys.exit(1)

    # Initialize pipeline
    pipeline = JudgmentIngestionPipeline(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        openai_api_key=openai_api_key
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
