"""
Polish Judgment Dataset Curation Pipeline

This script curates ~6K Polish court judgments from HuggingFace datasets
to match topic coverage of UK corpus. Part of GitHub Issue #12.

Uses query-driven retrieval based on cross-jurisdictional queries from Issue #11
and topic taxonomy from Issue #10.

Sources:
- Primary: JuDDGES/pl-court-raw-enriched (has factual_state and legal_state)
- Secondary: JuDDGES/pl-nsa-enriched (administrative courts)
- Fallback: JuDDGES/pl-court-raw, JuDDGES/pl-nsa

Outputs:
- data/polish_judgments_6k.parquet: Curated dataset
- data/polish_dataset_stats.json: Coverage statistics

Usage:
    python scripts/curate_polish_dataset.py
    python scripts/curate_polish_dataset.py --sample 100    # Test with fewer docs
    python scripts/curate_polish_dataset.py --target 3000  # Change target count
"""

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
from dotenv import load_dotenv
from loguru import logger
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
from rich.table import Table

# Import ML/Data dependencies
try:
    from datasets import load_dataset
    import pyarrow as pa
    import pyarrow.parquet as pq
except ImportError as e:
    Console().print(f"[red]Error:[/red] Missing required dependencies.")
    Console().print("Please install: pip install pyarrow")
    sys.exit(1)

# Global console instance
console = Console()


class PolishDatasetCurator:
    """Pipeline for curating Polish court judgments with topic-balanced sampling."""

    def __init__(self, target_count: int = 6000, sample_size: Optional[int] = None):
        """
        Initialize the dataset curator.

        Args:
            target_count: Target number of judgments to curate (default 6000)
            sample_size: If provided, limit processing to this many documents for testing
        """
        self.target_count = target_count
        self.sample_size = sample_size
        self.console = Console()

        # Setup data directory
        self.data_dir = Path("data")
        self.data_dir.mkdir(exist_ok=True)

        # Minimum judgments per topic
        self.min_per_topic = 50

        logger.info(f"Initialized Polish Dataset Curator (target: {target_count}, sample: {sample_size})")

    def validate_hf_access(self) -> str:
        """
        Validate HuggingFace access token.

        Returns:
            HF token if valid

        Raises:
            ValueError: If token is missing or invalid
        """
        hf_token = os.getenv('HF_TOKEN')
        if not hf_token:
            raise ValueError("HF_TOKEN environment variable not found")

        # Try to access a public dataset to validate token
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            api.whoami(token=hf_token)
            logger.info("HuggingFace token validated successfully")
            return hf_token
        except Exception as e:
            raise ValueError(f"Invalid HF_TOKEN: {e}")

    def load_prerequisites(self) -> Tuple[Dict, Dict]:
        """
        Load UK taxonomy and cross-jurisdictional queries.

        Returns:
            Tuple of (taxonomy, cross_jurisdictional_queries)

        Raises:
            FileNotFoundError: If prerequisite files are missing
        """
        # Load UK topic taxonomy
        taxonomy_path = self.data_dir / "uk_topics_taxonomy.json"
        if not taxonomy_path.exists():
            raise FileNotFoundError(
                f"UK topic taxonomy not found at {taxonomy_path}. "
                "Please run Issue #10 script first."
            )

        with open(taxonomy_path, 'r', encoding='utf-8') as f:
            taxonomy = json.load(f)

        # Load cross-jurisdictional queries
        queries_path = self.data_dir / "cross_jurisdictional_queries.json"
        if not queries_path.exists():
            raise FileNotFoundError(
                f"Cross-jurisdictional queries not found at {queries_path}. "
                "Please run Issue #11 script first."
            )

        with open(queries_path, 'r', encoding='utf-8') as f:
            queries = json.load(f)

        logger.info(f"Loaded {len(taxonomy['topics'])} topics and {len(queries['queries'])} query sets")
        return taxonomy, queries

    def load_polish_datasets(self, hf_token: str) -> List[Dict]:
        """
        Load Polish judgments from HuggingFace datasets using streaming.

        Args:
            hf_token: HuggingFace token

        Returns:
            List of Polish judgment documents
        """
        documents = []
        datasets_to_try = [
            ("JuDDGES/pl-court-raw-enriched", "train", ["text", "factual_state", "legal_state"]),
            ("JuDDGES/pl-nsa-enriched", "train", ["text", "factual_state", "legal_state"]),
            ("JuDDGES/pl-court-raw", "train", ["full_text"]),
            ("JuDDGES/pl-nsa", "train", ["full_text"])
        ]

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=self.console
        ) as progress:

            for dataset_name, split, text_fields in datasets_to_try:
                task = progress.add_task(f"Loading {dataset_name}...", total=None)

                try:
                    logger.info(f"Loading {dataset_name} ({split} split)")
                    dataset = load_dataset(
                        dataset_name,
                        split=split,
                        token=hf_token,
                        streaming=True  # Use streaming to avoid memory issues
                    )

                    # Process documents from stream
                    initial_count = len(documents)
                    processed_count = 0

                    for idx, item in enumerate(dataset):
                        # Extract text from available fields
                        text_content = self._extract_text_content(item, text_fields)

                        if len(text_content) >= 500:  # Filter short judgments
                            documents.append({
                                'text': text_content,
                                'source_dataset': dataset_name,
                                'doc_id': f"{dataset_name.split('/')[-1]}_{idx}",
                                'metadata': item,
                                'court': item.get('court', 'unknown'),
                                'date': item.get('date', item.get('judgment_date', 'unknown')),
                                'signature': item.get('signature', item.get('sygnatura', f'sig_{idx}'))
                            })

                        processed_count += 1

                        # Apply sample limit if testing
                        if self.sample_size and processed_count >= self.sample_size // len(datasets_to_try):
                            logger.info(f"Reached sample limit for {dataset_name}")
                            break

                    new_docs = len(documents) - initial_count
                    progress.update(task, total=processed_count, completed=processed_count)
                    logger.info(f"Loaded {new_docs} documents from {dataset_name}")

                except Exception as e:
                    logger.warning(f"Failed to load {dataset_name}: {e}")
                    progress.update(task, completed=1, total=1)
                    continue

        logger.info(f"Total Polish documents loaded: {len(documents)}")
        return documents

    def _extract_text_content(self, item: Dict, text_fields: List[str]) -> str:
        """
        Extract text content from judgment item based on available fields.

        Args:
            item: Judgment item from dataset
            text_fields: Priority order of text fields to check

        Returns:
            Combined text content
        """
        text_parts = []

        for field in text_fields:
            value = item.get(field, '').strip()
            if value:
                text_parts.append(value)

        return ' '.join(text_parts)

    def preprocess_text(self, text: str) -> str:
        """
        Clean and normalize Polish legal text.

        Args:
            text: Raw judgment text

        Returns:
            Cleaned text
        """
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', ' ', text)

        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)

        # Remove excessive punctuation
        text = re.sub(r'[.]{3,}', '...', text)

        # Normalize Polish characters for better matching
        text = text.lower()

        return text.strip()

    def score_document_for_topic(self, document: Dict, queries: List[str]) -> float:
        """
        Score a document's relevance to a topic based on query matching.

        Args:
            document: Polish judgment document
            queries: List of Polish queries for the topic

        Returns:
            Relevance score (0.0 to 1.0)
        """
        text = self.preprocess_text(document['text'])
        score = 0.0
        query_count = 0

        for query in queries:
            query_normalized = self.preprocess_text(query)
            query_words = query_normalized.split()

            # Check for exact phrase matches (higher score)
            if query_normalized in text:
                score += 2.0
                query_count += 1

            # Check for keyword matches
            word_matches = sum(1 for word in query_words if word in text)
            if word_matches > 0:
                score += word_matches / len(query_words)
                query_count += 1

        # Normalize score by number of queries that had matches
        if query_count > 0:
            return min(score / query_count, 1.0)
        return 0.0

    def retrieve_candidates_by_topic(self, documents: List[Dict], queries: Dict) -> Dict[int, List[Tuple[Dict, float]]]:
        """
        Retrieve candidate documents for each topic using query-driven search.

        Args:
            documents: List of Polish judgment documents
            queries: Cross-jurisdictional queries by topic

        Returns:
            Dictionary mapping topic_id to list of (document, score) tuples
        """
        topic_candidates = defaultdict(list)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=self.console
        ) as progress:

            task = progress.add_task("Scoring documents for topics...", total=len(queries['queries']))

            for query_set in queries['queries']:
                topic_id = query_set['topic_id']
                polish_queries = query_set['queries_pl']

                # Score all documents for this topic
                candidates = []
                for doc in documents:
                    score = self.score_document_for_topic(doc, polish_queries)
                    if score > 0.1:  # Only keep candidates with meaningful scores
                        candidates.append((doc, score))

                # Sort by score (descending)
                candidates.sort(key=lambda x: x[1], reverse=True)
                topic_candidates[topic_id] = candidates

                logger.info(f"Topic {topic_id}: Found {len(candidates)} candidates")
                progress.advance(task)

        return dict(topic_candidates)

    def calculate_topic_allocations(self, taxonomy: Dict, topic_candidates: Dict[int, List]) -> Dict[int, int]:
        """
        Calculate target allocation per topic based on UK distribution.

        Args:
            taxonomy: UK topic taxonomy with document counts
            topic_candidates: Candidate documents per topic

        Returns:
            Dictionary mapping topic_id to target count
        """
        # Get UK topic distribution
        uk_topics = {t['topic_id']: t['document_count'] for t in taxonomy['topics']}
        total_uk_docs = sum(uk_topics.values())

        # Calculate proportional allocation
        allocations = {}
        total_allocated = 0

        for topic_id, uk_count in uk_topics.items():
            if topic_id in topic_candidates:
                # Proportional allocation
                proportional = int((uk_count / total_uk_docs) * self.target_count)

                # Ensure minimum per topic
                allocation = max(proportional, self.min_per_topic)

                # Don't exceed available candidates
                available = len(topic_candidates[topic_id])
                allocation = min(allocation, available)

                allocations[topic_id] = allocation
                total_allocated += allocation

        # Adjust if we're over/under target
        if total_allocated != self.target_count:
            logger.warning(f"Initial allocation: {total_allocated}, target: {self.target_count}")
            # Simple adjustment: distribute remainder proportionally
            remainder = self.target_count - total_allocated
            if remainder != 0:
                for topic_id in allocations:
                    if remainder == 0:
                        break
                    if remainder > 0 and len(topic_candidates[topic_id]) > allocations[topic_id]:
                        allocations[topic_id] += 1
                        remainder -= 1
                    elif remainder < 0 and allocations[topic_id] > self.min_per_topic:
                        allocations[topic_id] -= 1
                        remainder += 1

        logger.info(f"Final allocation: {sum(allocations.values())} documents across {len(allocations)} topics")
        return allocations

    def deduplicate_by_signature(self, candidates: List[Tuple[Dict, float]]) -> List[Tuple[Dict, float]]:
        """
        Remove duplicate judgments based on case signatures.

        Args:
            candidates: List of (document, score) tuples

        Returns:
            Deduplicated list
        """
        seen_signatures = set()
        deduplicated = []

        for doc, score in candidates:
            signature = doc.get('signature', doc['doc_id'])
            if signature not in seen_signatures:
                seen_signatures.add(signature)
                deduplicated.append((doc, score))

        return deduplicated

    def balanced_sampling(self, topic_candidates: Dict[int, List], allocations: Dict[int, int], taxonomy: Dict, queries: Dict) -> List[Dict]:
        """
        Perform balanced sampling across topics to create final dataset.

        Args:
            topic_candidates: Candidate documents per topic
            allocations: Target counts per topic
            taxonomy: UK topic taxonomy for metadata
            queries: Cross-jurisdictional queries for metadata

        Returns:
            List of selected documents with topic assignments
        """
        selected_documents = []
        topic_info = {t['topic_id']: t for t in taxonomy['topics']}
        query_info = {q['topic_id']: q for q in queries['queries']}

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=self.console
        ) as progress:

            task = progress.add_task("Selecting documents...", total=len(allocations))

            for topic_id, target_count in allocations.items():
                candidates = topic_candidates.get(topic_id, [])

                # Deduplicate candidates
                candidates = self.deduplicate_by_signature(candidates)

                # Select top candidates up to target
                selected_candidates = candidates[:target_count]

                # Convert to final format
                topic_label = topic_info.get(topic_id, {}).get('label', f'Topic {topic_id}')
                category = topic_info.get(topic_id, {}).get('category', 'Unknown')
                query_used = '; '.join(query_info.get(topic_id, {}).get('queries_pl', [])[:2])  # First 2 queries

                for doc, score in selected_candidates:
                    selected_doc = {
                        'id': doc['doc_id'],
                        'text': doc['text'],
                        'court': doc['court'],
                        'date': doc['date'],
                        'topic_primary': topic_label,
                        'topic_secondary': category,
                        'topic_id': topic_id,
                        'source_dataset': doc['source_dataset'],
                        'query_used': query_used,
                        'relevance_score': score,
                        'signature': doc['signature']
                    }
                    selected_documents.append(selected_doc)

                logger.info(f"Selected {len(selected_candidates)} documents for topic {topic_id} ({topic_label})")
                progress.advance(task)

        return selected_documents

    def save_curated_dataset(self, documents: List[Dict]) -> None:
        """
        Save curated dataset as Parquet file.

        Args:
            documents: Curated documents to save
        """
        df = pd.DataFrame(documents)
        output_path = self.data_dir / "polish_judgments_6k.parquet"
        df.to_parquet(output_path, index=False)
        logger.info(f"Saved {len(documents)} curated documents to {output_path}")

    def save_statistics(self, documents: List[Dict], taxonomy: Dict, topic_candidates: Dict, allocations: Dict) -> None:
        """
        Save dataset curation statistics.

        Args:
            documents: Final curated documents
            taxonomy: UK topic taxonomy
            topic_candidates: All candidates per topic
            allocations: Target allocations per topic
        """
        # Calculate per-topic statistics
        topic_stats = []
        actual_counts = defaultdict(int)

        for doc in documents:
            actual_counts[doc['topic_id']] += 1

        # Get source breakdown
        source_counts = defaultdict(int)
        for doc in documents:
            source_counts[doc['source_dataset']] += 1

        for topic in taxonomy['topics']:
            topic_id = topic['topic_id']
            uk_count = topic['document_count']
            target_count = allocations.get(topic_id, 0)
            actual_count = actual_counts.get(topic_id, 0)
            candidates_count = len(topic_candidates.get(topic_id, []))

            topic_stats.append({
                'topic_id': topic_id,
                'topic_label': topic['label'],
                'category': topic['category'],
                'uk_count': uk_count,
                'target_count': target_count,
                'actual_count': actual_count,
                'candidates_found': candidates_count,
                'coverage_ratio': actual_count / uk_count if uk_count > 0 else 0.0,
                'selection_rate': actual_count / candidates_count if candidates_count > 0 else 0.0
            })

        stats = {
            'summary': {
                'total_documents': len(documents),
                'target_documents': self.target_count,
                'coverage_topics': len([s for s in topic_stats if s['actual_count'] > 0]),
                'total_topics': len(taxonomy['topics']),
                'created_at': datetime.now().isoformat(),
                'min_per_topic': self.min_per_topic
            },
            'source_breakdown': dict(source_counts),
            'topic_statistics': topic_stats,
            'gaps': [
                {
                    'topic_id': s['topic_id'],
                    'topic_label': s['topic_label'],
                    'shortfall': s['target_count'] - s['actual_count']
                }
                for s in topic_stats if s['target_count'] > s['actual_count']
            ]
        }

        # Save statistics
        stats_path = self.data_dir / "polish_dataset_stats.json"
        with open(stats_path, 'w', encoding='utf-8') as f:
            json.dump(stats, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved curation statistics to {stats_path}")

    def display_summary(self, documents: List[Dict], taxonomy: Dict) -> None:
        """
        Display curation summary using Rich.

        Args:
            documents: Curated documents
            taxonomy: UK topic taxonomy
        """
        # Read statistics file for detailed info
        stats_path = self.data_dir / "polish_dataset_stats.json"
        with open(stats_path, 'r', encoding='utf-8') as f:
            stats = json.load(f)

        # Summary panel
        summary_text = f"""
[bold]Polish Dataset Curation Summary[/bold]

📊 [cyan]Dataset Overview[/cyan]
   • Total curated documents: [green]{len(documents):,}[/green]
   • Target document count: [blue]{self.target_count:,}[/blue]
   • Topics with coverage: [green]{stats['summary']['coverage_topics']}/{stats['summary']['total_topics']}[/green]
   • Minimum per topic: [blue]{self.min_per_topic}[/blue]

📈 [cyan]Source Distribution[/cyan]
{self._format_source_breakdown(stats['source_breakdown'])}

🎯 [cyan]Coverage Quality[/cyan]
   • Avg coverage ratio: [yellow]{sum(s['coverage_ratio'] for s in stats['topic_statistics']) / len(stats['topic_statistics']):.2f}[/yellow]
   • Topics with gaps: [red]{len(stats['gaps'])}[/red]
"""

        self.console.print(Panel(summary_text, title="🏛️ Polish Judgment Curation", border_style="blue"))

        # Topic distribution comparison table
        self.console.print("\n[bold]📋 UK vs Polish Topic Distribution[/bold]")

        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("Topic Label", style="cyan")
        table.add_column("UK Count", justify="right", style="blue")
        table.add_column("PL Target", justify="right", style="green")
        table.add_column("PL Actual", justify="right", style="yellow")
        table.add_column("Coverage", justify="right", style="red")

        for topic_stat in stats['topic_statistics']:
            coverage_pct = f"{topic_stat['coverage_ratio']:.1%}"
            table.add_row(
                topic_stat['topic_label'],
                f"{topic_stat['uk_count']:,}",
                f"{topic_stat['target_count']:,}",
                f"{topic_stat['actual_count']:,}",
                coverage_pct
            )

        self.console.print(table)

        # Gaps summary
        if stats['gaps']:
            self.console.print(f"\n[bold red]⚠️ Coverage Gaps ({len(stats['gaps'])} topics)[/bold red]")
            for gap in stats['gaps'][:5]:  # Show top 5 gaps
                self.console.print(f"   • {gap['topic_label']}: {gap['shortfall']} documents short")

    def _format_source_breakdown(self, source_counts: Dict[str, int]) -> str:
        """Format source breakdown for display."""
        lines = []
        for source, count in sorted(source_counts.items(), key=lambda x: x[1], reverse=True):
            source_short = source.split('/')[-1]
            lines.append(f"   • {source_short}: [green]{count:,}[/green] documents")
        return '\n'.join(lines)

    def run_curation(self) -> None:
        """Run the complete dataset curation pipeline."""
        logger.info("Starting Polish judgment dataset curation pipeline")

        try:
            # Step 1: Validate HF access
            self.console.print("\n[bold blue]🔐 Step 1: Validating HuggingFace Access[/bold blue]")
            hf_token = self.validate_hf_access()

            # Step 2: Load prerequisites
            self.console.print("\n[bold blue]📚 Step 2: Loading Prerequisites[/bold blue]")
            taxonomy, queries = self.load_prerequisites()

            # Step 3: Load Polish datasets
            self.console.print("\n[bold blue]🇵🇱 Step 3: Loading Polish Judgment Datasets[/bold blue]")
            documents = self.load_polish_datasets(hf_token)

            if not documents:
                logger.error("No Polish documents loaded. Exiting.")
                return

            # Step 4: Query-driven retrieval
            self.console.print("\n[bold blue]🔍 Step 4: Query-Driven Topic Retrieval[/bold blue]")
            topic_candidates = self.retrieve_candidates_by_topic(documents, queries)

            # Step 5: Calculate allocations
            self.console.print("\n[bold blue]⚖️ Step 5: Calculating Balanced Allocations[/bold blue]")
            allocations = self.calculate_topic_allocations(taxonomy, topic_candidates)

            # Step 6: Balanced sampling
            self.console.print("\n[bold blue]🎯 Step 6: Balanced Sampling[/bold blue]")
            curated_documents = self.balanced_sampling(topic_candidates, allocations, taxonomy, queries)

            # Step 7: Save outputs
            self.console.print("\n[bold blue]💾 Step 7: Saving Curated Dataset[/bold blue]")
            self.save_curated_dataset(curated_documents)
            self.save_statistics(curated_documents, taxonomy, topic_candidates, allocations)

            # Step 8: Display summary
            self.console.print("\n[bold blue]📊 Step 8: Curation Summary[/bold blue]")
            self.display_summary(curated_documents, taxonomy)

            self.console.print(f"\n[bold green]✅ Curation complete![/bold green]")
            self.console.print(f"[dim]Output files saved in: {self.data_dir.absolute()}[/dim]")

        except KeyboardInterrupt:
            self.console.print("\n[yellow]⚠️ Curation interrupted by user[/yellow]")
            logger.info("Curation interrupted by KeyboardInterrupt")
        except Exception as e:
            logger.error(f"Curation failed: {e}")
            import traceback
            traceback.print_exc()
            self.console.print(f"[bold red]❌ Curation failed: {e}[/bold red]")


def main():
    """Main entry point for the curation script."""
    # Setup logging
    logger.remove()  # Remove default handler
    logger.add(sys.stderr, format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>")

    # Load environment variables
    load_dotenv()

    # Parse command line arguments (simple, no argparse)
    target_count = 6000
    sample_size = None

    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--target" and i + 1 < len(sys.argv):
            try:
                target_count = int(sys.argv[i + 1])
                console.print(f"[blue]Target count: {target_count}[/blue]")
                i += 2
            except ValueError:
                console.print("[red]Invalid target count. Using default 6000.[/red]")
                i += 1
        elif sys.argv[i] == "--sample" and i + 1 < len(sys.argv):
            try:
                sample_size = int(sys.argv[i + 1])
                console.print(f"[yellow]Sample size: {sample_size}[/yellow]")
                i += 2
            except ValueError:
                console.print("[red]Invalid sample size. Using full dataset.[/red]")
                i += 1
        else:
            i += 1

    # Check required environment variables
    if not os.getenv('HF_TOKEN'):
        console.print("[bold red]Error:[/bold red] HF_TOKEN environment variable required")
        console.print("Please set your HuggingFace token for dataset access")
        sys.exit(1)

    # Initialize and run curator
    curator = PolishDatasetCurator(target_count=target_count, sample_size=sample_size)
    curator.run_curation()


if __name__ == '__main__':
    main()