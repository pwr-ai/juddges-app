"""
Data Ingestion Script for Juddges App

This script downloads judgment datasets from HuggingFace and ingests them into Supabase.
Supports:
- Polish judgments from JuDDGES/pl-court-raw
- UK judgments from JuDDGES/en-court-raw (6,050 judgments)
- UK fallback from JuDDGES/en-appealcourt (573 annotated judgments)

Features:
- Checkpoint/resume capability
- Batch processing with progress bars
- Retry logic with exponential backoff
- Deduplication support
- Graceful shutdown handling

Usage:
    python ingest_judgments.py --polish 3000 --uk 3000  # Full target (6K+)
    python ingest_judgments.py --polish 100 --uk 100     # Dev sample
    python ingest_judgments.py --polish 50 --skip-uk
    python ingest_judgments.py --uk 3000 --skip-polish
    python ingest_judgments.py --polish 3000 --resume    # Resume from checkpoint
    python ingest_judgments.py --polish 3000 --batch-size 100  # Custom batch size
"""

import argparse
import json
import os
import signal
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    from datasets import load_dataset
    from supabase import create_client, Client
    from rich.console import Console
    from rich.progress import Progress, TaskID
    from rich.table import Table
    from loguru import logger
    from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
    import requests
except ImportError as e:
    print(f"Error: Missing required dependencies. Please install:")
    print("pip install datasets supabase requests rich loguru tenacity python-dotenv")
    sys.exit(1)

# Initialize rich console
console = Console()

# Checkpoint file path
CHECKPOINT_FILE = Path(__file__).parent / ".ingest_checkpoint.json"


class JudgmentIngestionPipeline:
    """Pipeline for ingesting judgments from HuggingFace into Supabase with checkpoint/resume capability."""

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        transformers_url: Optional[str] = None,
        batch_size: int = 50
    ):
        """
        Initialize the ingestion pipeline.

        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service role key (for write access)
            transformers_url: Sentence Transformers inference URL (optional)
            batch_size: Number of documents to process in each batch
        """
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.transformers_url = transformers_url or os.getenv("TRANSFORMERS_INFERENCE_URL", "http://localhost:8080")
        self.batch_size = batch_size

        # Statistics tracking
        self.stats = {
            'processed': 0,
            'duplicates_skipped': 0,
            'errors': 0,
            'start_time': datetime.now()
        }

        # Graceful shutdown handling
        self._shutdown = False
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle graceful shutdown on SIGINT/SIGTERM."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self._shutdown = True

    def save_checkpoint(self, dataset: str, index: int, total_processed: int) -> None:
        """Save checkpoint to disk."""
        # Serialize stats with datetime converted to ISO string
        stats_serializable = {
            'processed': self.stats['processed'],
            'duplicates_skipped': self.stats['duplicates_skipped'],
            'errors': self.stats['errors'],
            'start_time': self.stats['start_time'].isoformat()
        }

        checkpoint = {
            "dataset": dataset,
            "last_processed_index": index,
            "total_processed": total_processed,
            "started_at": self.stats['start_time'].isoformat(),
            "updated_at": datetime.now().isoformat(),
            "batch_size": self.batch_size,
            "stats": stats_serializable
        }

        try:
            with open(CHECKPOINT_FILE, 'w') as f:
                json.dump(checkpoint, f, indent=2)
            logger.debug(f"Saved checkpoint: {dataset} at index {index}")
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")

    def load_checkpoint(self) -> Optional[Dict]:
        """Load checkpoint from disk."""
        try:
            if CHECKPOINT_FILE.exists():
                with open(CHECKPOINT_FILE, 'r') as f:
                    checkpoint = json.load(f)

                # Restore datetime object in stats
                if 'stats' in checkpoint and 'start_time' in checkpoint['stats']:
                    checkpoint['stats']['start_time'] = datetime.fromisoformat(checkpoint['stats']['start_time'])

                logger.info(f"Loaded checkpoint for {checkpoint['dataset']} at index {checkpoint['last_processed_index']}")
                return checkpoint
            return None
        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}")
            return None

    def clear_checkpoint(self) -> None:
        """Clear checkpoint file."""
        try:
            if CHECKPOINT_FILE.exists():
                CHECKPOINT_FILE.unlink()
                logger.info("Cleared checkpoint file")
        except Exception as e:
            logger.error(f"Failed to clear checkpoint: {e}")

    def check_document_exists(self, case_number: str) -> bool:
        """Check if a document already exists in the database."""
        try:
            response = self.supabase.table('judgments').select('case_number').eq('case_number', case_number).limit(1).execute()
            return len(response.data) > 0
        except Exception as e:
            logger.warning(f"Failed to check document existence for {case_number}: {e}")
            return False

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((requests.RequestException, Exception))
    )
    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding using Sentence Transformers with retry logic.

        Args:
            text: Input text to embed

        Returns:
            List of 768 floats (multilingual-mpnet embedding), or None if service unavailable
        """
        if not self.transformers_url:
            return None

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
                logger.warning(f"No vector in response from {url}")
                return None

            return vector

        except Exception as e:
            logger.warning(f"Failed to generate embedding (attempt will retry): {e}")
            raise

    def ingest_polish_judgments(self, sample_size: int = 100, resume: bool = False) -> int:
        """
        Ingest Polish criminal appellate judgments from JuDDGES/pl-court-raw.

        Filters for Sąd Apelacyjny (Court of Appeal) + Wydział Karny (Criminal Dept)
        to match the UK dataset profile. Uses streaming to handle 437K+ rows.

        Args:
            sample_size: Number of judgments to ingest
            resume: Whether to resume from checkpoint

        Returns:
            Number of judgments successfully ingested
        """
        import random
        random.seed(42)

        dataset_name = "polish"
        start_index = 0
        checkpoint = None

        # Check for resume
        if resume:
            checkpoint = self.load_checkpoint()
            if checkpoint and checkpoint.get('dataset') == dataset_name:
                start_index = checkpoint['last_processed_index'] + 1
                self.stats = checkpoint.get('stats', self.stats)
                console.print(f"[green]Resuming from index {start_index}[/green]")

        console.print(f"\n🇵🇱 Loading Polish criminal appellate judgments from JuDDGES/pl-court-raw...")
        console.print(f"   Target: {sample_size} (filtering for Sąd Apelacyjny + Wydział Karny)")
        console.print(f"   Starting from index: {start_index}")

        try:
            dataset = load_dataset(
                "JuDDGES/pl-court-raw",
                split="train",
                streaming=True,
            )

            # First pass: collect all matching cases
            matched_cases = []
            scanned = 0

            console.print("   Scanning dataset for matching cases...")

            for item in dataset:
                if self._shutdown:
                    logger.info("Shutdown signal received during scanning")
                    return self.stats['processed']

                scanned += 1
                if scanned % 100000 == 0:
                    console.print(f"   Scanned {scanned:,}... matched {len(matched_cases):,}")

                court = item.get("court_name", "") or ""
                dept = item.get("department_name", "") or ""

                if "Apelacyjn" not in court:
                    continue
                if "karn" not in dept.lower():
                    continue

                # Filter to 2003-2024 year range (matching UK dataset)
                date = item.get("judgment_date")
                year_str = str(date)[:4] if date else ""
                try:
                    year = int(year_str)
                except ValueError:
                    continue
                if year < 2003 or year > 2024:
                    continue

                matched_cases.append(item)

            console.print(f"   Found {len(matched_cases):,} criminal appellate cases (2003-2024)")

            # Sample if we have more than needed
            if len(matched_cases) > sample_size:
                matched_cases = random.sample(matched_cases, sample_size)
                console.print(f"   Sampled {sample_size} cases")

            # Skip already processed items if resuming
            if start_index > 0:
                matched_cases = matched_cases[start_index:]
                console.print(f"   Skipping {start_index} already processed cases")

            # Process in batches with progress bar
            total_cases = len(matched_cases)
            ingested = 0

            with Progress(console=console) as progress:
                task = progress.add_task("Processing Polish judgments", total=total_cases)

                batch = []
                for i, case in enumerate(matched_cases):
                    if self._shutdown:
                        logger.info("Shutdown signal received, saving checkpoint...")
                        self.save_checkpoint(dataset_name, start_index + i - 1, self.stats['processed'])
                        break

                    batch.append((start_index + i, case))

                    # Process batch when full or at end
                    if len(batch) >= self.batch_size or i == total_cases - 1:
                        batch_processed = self._process_polish_batch(batch, dataset_name)
                        ingested += batch_processed
                        progress.update(task, advance=len(batch))
                        batch = []

            # Clear checkpoint on successful completion
            if not self._shutdown:
                self.clear_checkpoint()

            console.print(f"[green]✅ Successfully ingested {ingested} Polish criminal appellate judgments[/green]")
            return ingested

        except Exception as e:
            logger.error(f"Error ingesting Polish judgments: {e}")
            console.print(f"[red]❌ Error ingesting Polish judgments: {e}[/red]")
            return self.stats['processed']

    def _process_polish_batch(self, batch: List[Tuple[int, Dict]], dataset_name: str) -> int:
        """Process a batch of Polish judgments."""
        processed = 0

        for index, case in batch:
            try:
                judgment_data = self._transform_polish_judgment(case)
                if judgment_data:
                    # Check for duplicates
                    case_number = judgment_data.get('case_number', '')
                    if self.check_document_exists(case_number):
                        self.stats['duplicates_skipped'] += 1
                        logger.debug(f"Skipping duplicate: {case_number}")
                        continue

                    # Insert judgment
                    if self._insert_judgment(judgment_data):
                        processed += 1
                        self.stats['processed'] += 1
                    else:
                        self.stats['errors'] += 1
                else:
                    self.stats['errors'] += 1

            except Exception as e:
                logger.error(f"Error processing Polish judgment at index {index}: {e}")
                self.stats['errors'] += 1

            # Save checkpoint after each document (or less frequently for performance)
            if index % 10 == 0:  # Save every 10 documents
                self.save_checkpoint(dataset_name, index, self.stats['processed'])

        return processed

    def ingest_uk_judgments(self, sample_size: int = 100, resume: bool = False) -> int:
        """
        Ingest UK judgments from JuDDGES/en-court-raw (6,050 judgments).

        Falls back to JuDDGES/en-appealcourt (573) if en-court-raw fails.

        Args:
            sample_size: Number of judgments to ingest
            resume: Whether to resume from checkpoint

        Returns:
            Number of judgments successfully ingested
        """
        dataset_name = "uk"
        start_index = 0
        checkpoint = None

        # Check for resume
        if resume:
            checkpoint = self.load_checkpoint()
            if checkpoint and checkpoint.get('dataset') == dataset_name:
                start_index = checkpoint['last_processed_index'] + 1
                self.stats = checkpoint.get('stats', self.stats)
                console.print(f"[green]Resuming from index {start_index}[/green]")

        total_ingested = 0

        # Primary source: JuDDGES/en-court-raw (6,050 judgments)
        console.print(f"\n🇬🇧 Loading UK judgments from JuDDGES/en-court-raw (sample: {sample_size})...")
        console.print(f"   Starting from index: {start_index}")

        try:
            dataset = load_dataset("JuDDGES/en-court-raw", split="train")
            available = len(dataset)
            take = min(sample_size, available)
            console.print(f"   Dataset has {available} judgments, taking {take}")

            # Skip already processed if resuming
            if start_index < take:
                remaining_items = take - start_index
                sample_data = dataset.select(range(start_index, take))
                console.print(f"   Processing {remaining_items} remaining items from en-court-raw")

                batch_processed = self._process_uk_batch(
                    sample_data, dataset_name, "JuDDGES/en-court-raw", start_index
                )
                total_ingested += batch_processed

            console.print(f"[green]✅ Ingested {total_ingested} from en-court-raw[/green]")
        except Exception as e:
            logger.error(f"Error with en-court-raw: {e}")
            console.print(f"[red]❌ Error with en-court-raw: {e}[/red]")

        # Fallback: fill remaining from JuDDGES/en-appealcourt if needed
        remaining = sample_size - total_ingested
        if remaining > 0 and not self._shutdown:
            console.print(f"\n🇬🇧 Loading {remaining} more from JuDDGES/en-appealcourt (fallback)...")
            try:
                dataset2 = load_dataset("JuDDGES/en-appealcourt", split="test")
                take2 = min(remaining, len(dataset2))
                sample_data2 = dataset2.select(range(take2))

                count_before = total_ingested
                batch_processed = self._process_uk_batch(
                    sample_data2, dataset_name, "JuDDGES/en-appealcourt", 0
                )
                total_ingested += batch_processed

                console.print(f"[green]✅ Ingested {total_ingested - count_before} from en-appealcourt[/green]")
            except Exception as e:
                logger.error(f"Error with en-appealcourt: {e}")
                console.print(f"[red]❌ Error with en-appealcourt: {e}[/red]")

        # Clear checkpoint on successful completion
        if not self._shutdown:
            self.clear_checkpoint()

        console.print(f"[green]✅ Total UK judgments ingested: {total_ingested}[/green]")
        return total_ingested

    def _process_uk_batch(self, dataset, dataset_name: str, source: str, start_index: int) -> int:
        """Process a batch of UK judgments."""
        processed = 0

        with Progress(console=console) as progress:
            task = progress.add_task(f"Processing {source}", total=len(dataset))

            batch = []
            for i, case in enumerate(dataset):
                if self._shutdown:
                    logger.info("Shutdown signal received, saving checkpoint...")
                    self.save_checkpoint(dataset_name, start_index + i - 1, self.stats['processed'])
                    break

                batch.append((start_index + i, case))

                # Process batch when full or at end
                if len(batch) >= self.batch_size or i == len(dataset) - 1:
                    for index, judgment_case in batch:
                        try:
                            judgment_data = self._transform_uk_judgment(judgment_case, source=source)
                            if judgment_data:
                                # Check for duplicates
                                case_number = judgment_data.get('case_number', '')
                                if self.check_document_exists(case_number):
                                    self.stats['duplicates_skipped'] += 1
                                    logger.debug(f"Skipping duplicate: {case_number}")
                                    continue

                                # Insert judgment
                                if self._insert_judgment(judgment_data):
                                    processed += 1
                                    self.stats['processed'] += 1
                                else:
                                    self.stats['errors'] += 1
                            else:
                                self.stats['errors'] += 1

                        except Exception as e:
                            logger.error(f"Error processing UK judgment at index {index}: {e}")
                            self.stats['errors'] += 1

                        # Save checkpoint periodically
                        if index % 10 == 0:
                            self.save_checkpoint(dataset_name, index, self.stats['processed'])

                    progress.update(task, advance=len(batch))
                    batch = []

        return processed

    def _transform_polish_judgment(self, raw_data: Dict) -> Optional[Dict]:
        """
        Transform Polish judgment from JuDDGES/pl-court-raw format to our schema.

        Args:
            raw_data: Raw data from JuDDGES/pl-court-raw

        Returns:
            Transformed judgment data or None if invalid
        """
        try:
            full_text = raw_data.get('full_text', '')
            if not full_text:
                return None

            court_name = raw_data.get('court_name', '') or ''
            dept = raw_data.get('department_name', '') or ''

            # Parse judges
            judges_raw = raw_data.get('judges', []) or []
            if isinstance(judges_raw, str):
                judges = [j.strip() for j in judges_raw.split(',')]
            elif isinstance(judges_raw, list):
                judges = judges_raw
            else:
                judges = []

            presiding = raw_data.get('presiding_judge', '') or ''
            if presiding and presiding not in judges:
                judges.insert(0, presiding)

            keywords = raw_data.get('keywords', []) or []
            legal_bases = raw_data.get('legal_bases', []) or []

            docket = raw_data.get('docket_number', '') or ''
            case_number = docket if docket else f"PL-APPEAL-{raw_data.get('judgment_id', 'unknown')[:12]}"

            excerpt = raw_data.get('excerpt', '') or ''
            title = excerpt[:500] if excerpt else full_text[:200]
            summary = excerpt[:2000] if excerpt else ''

            embedding = self.generate_embedding(full_text)

            return {
                'case_number': case_number,
                'jurisdiction': 'PL',
                'court_name': court_name,
                'court_level': 'Court of Appeal',
                'decision_date': self._parse_date(raw_data.get('judgment_date')),
                'title': title,
                'summary': summary,
                'full_text': full_text,
                'judges': judges,
                'case_type': 'Criminal',
                'decision_type': raw_data.get('judgment_type', ''),
                'outcome': None,
                'keywords': keywords[:20],
                'legal_topics': [lb if isinstance(lb, str) else str(lb) for lb in legal_bases[:20]],
                'embedding': embedding,
                'metadata': {
                    'language': 'pl',
                    'department': dept,
                    'court_type': 'appellate',
                    'source_judgment_id': raw_data.get('judgment_id', ''),
                    'num_pages': raw_data.get('num_pages'),
                    'country': 'PL',
                },
                'source_dataset': 'JuDDGES/pl-court-raw',
                'source_id': raw_data.get('judgment_id', '')[:40],
                'source_url': raw_data.get('source', ''),
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

            else:  # JuDDGES/en-court-raw (and legacy en-court-raw-sample)
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

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((Exception,))
    )
    def _insert_judgment(self, judgment_data: Dict) -> bool:
        """
        Insert judgment into Supabase with retry logic and upsert support.

        Args:
            judgment_data: Transformed judgment data

        Returns:
            True if successful, False otherwise
        """
        try:
            # Use upsert to handle potential duplicates gracefully
            response = self.supabase.table('judgments').upsert(
                judgment_data,
                on_conflict='case_number'
            ).execute()

            if response.data:
                logger.debug(f"Successfully inserted/updated judgment: {judgment_data.get('case_number')}")
                return True
            else:
                logger.warning(f"No data returned for judgment: {judgment_data.get('case_number')}")
                return False

        except Exception as e:
            logger.warning(f"Failed to insert judgment {judgment_data.get('case_number')} (attempt will retry): {e}")
            raise


def main():
    """Main entry point for the ingestion script."""
    parser = argparse.ArgumentParser(description='Ingest judgments from HuggingFace into Supabase')
    parser.add_argument('--polish', type=int, default=0, help='Number of Polish judgments to ingest')
    parser.add_argument('--uk', type=int, default=0, help='Number of UK judgments to ingest')
    parser.add_argument('--skip-polish', action='store_true', help='Skip Polish judgments')
    parser.add_argument('--skip-uk', action='store_true', help='Skip UK judgments')
    parser.add_argument('--no-embeddings', action='store_true', help='Skip generating embeddings')
    parser.add_argument('--resume', action='store_true', help='Resume from last checkpoint')
    parser.add_argument('--batch-size', type=int, default=50, help='Number of documents per batch (default: 50)')

    args = parser.parse_args()

    # Configure logging
    logger.remove()  # Remove default logger
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
        level="INFO"
    )
    logger.add(
        "ingest_judgments.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
        level="DEBUG",
        rotation="10 MB"
    )

    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()

    # Get credentials from environment
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')  # Need service role for writes
    transformers_url = os.getenv('TRANSFORMERS_INFERENCE_URL', 'http://localhost:8080') if not args.no_embeddings else None

    if not supabase_url or not supabase_key:
        console.print("[red]❌ Error: Missing required environment variables[/red]")
        console.print("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
        console.print("Optional: TRANSFORMERS_INFERENCE_URL (for embeddings, default: http://localhost:8080)")
        sys.exit(1)

    # Initialize pipeline
    pipeline = JudgmentIngestionPipeline(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        transformers_url=transformers_url,
        batch_size=args.batch_size
    )

    # Show configuration
    console.print("\n[bold blue]Juddges Ingestion Pipeline[/bold blue]")
    console.print(f"Batch size: {args.batch_size}")
    console.print(f"Resume mode: {'Yes' if args.resume else 'No'}")
    console.print(f"Embeddings: {'Disabled' if args.no_embeddings else 'Enabled'}")

    # Run ingestion
    total_ingested = 0
    start_time = datetime.now()

    try:
        if not args.skip_polish and args.polish > 0:
            total_ingested += pipeline.ingest_polish_judgments(
                sample_size=args.polish,
                resume=args.resume
            )

        if not args.skip_uk and args.uk > 0:
            total_ingested += pipeline.ingest_uk_judgments(
                sample_size=args.uk,
                resume=args.resume
            )

    except KeyboardInterrupt:
        logger.info("Ingestion interrupted by user")
        console.print("\n[yellow]⚠️ Ingestion interrupted by user[/yellow]")
    except Exception as e:
        logger.error(f"Unexpected error during ingestion: {e}")
        console.print(f"\n[red]❌ Unexpected error: {e}[/red]")
    finally:
        # Show final summary
        elapsed = datetime.now() - start_time
        _show_summary(pipeline.stats, total_ingested, elapsed)


def _show_summary(stats: Dict, total_ingested: int, elapsed) -> None:
    """Display ingestion summary with Rich table."""
    table = Table(title="Ingestion Summary", show_header=True, header_style="bold magenta")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", justify="right", style="green")

    table.add_row("Documents Processed", f"{stats['processed']:,}")
    table.add_row("Documents Ingested", f"{total_ingested:,}")
    table.add_row("Duplicates Skipped", f"{stats['duplicates_skipped']:,}")
    table.add_row("Errors", f"{stats['errors']:,}")
    table.add_row("Elapsed Time", f"{elapsed}")

    # Calculate processing rate
    total_documents = stats['processed'] + stats['duplicates_skipped'] + stats['errors']
    if total_documents > 0 and elapsed.total_seconds() > 0:
        rate = total_documents / elapsed.total_seconds()
        table.add_row("Processing Rate", f"{rate:.2f} docs/sec")

    console.print("\n")
    console.print(table)
    console.print("\n[bold green]🎉 Ingestion complete![/bold green]")

    # Checkpoint file info
    if CHECKPOINT_FILE.exists():
        console.print(f"[yellow]Note: Checkpoint file still exists at {CHECKPOINT_FILE}[/yellow]")
        console.print("[yellow]The checkpoint will be cleared on successful completion of the next run.[/yellow]")


if __name__ == '__main__':
    main()
