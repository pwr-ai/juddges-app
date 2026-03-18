"""
Topic Analysis Pipeline for UK Judgments

This script analyzes UK court judgments from HuggingFace datasets to identify legal themes
using BERTopic and LLM-assisted topic labeling. Part of GitHub Issue #10.

Sources:
- JuDDGES/en-appealcourt (test split)
- JuDDGES/en-court-raw-sample (train split)

Outputs:
- data/uk_topics_taxonomy.json: Structured topic hierarchy
- data/uk_topic_assignments.parquet: Document-to-topic mappings

Usage:
    python scripts/analyze_uk_topics.py
    python scripts/analyze_uk_topics.py --sample 500  # Test with fewer docs
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from loguru import logger
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
from rich.table import Table

# Import ML dependencies
try:
    from bertopic import BERTopic
    from datasets import load_dataset
    import openai
    from sentence_transformers import SentenceTransformer
    from umap import UMAP
    from hdbscan import HDBSCAN
    from sklearn.feature_extraction.text import CountVectorizer
except ImportError as e:
    Console().print(f"[red]Error:[/red] Missing required dependencies.")
    Console().print("Please install: pip install -r scripts/requirements.txt")
    sys.exit(1)

# Global console instance
console = Console()

class UKTopicAnalyzer:
    """Pipeline for analyzing legal topics in UK court judgments."""

    def __init__(self, sample_size: Optional[int] = None):
        """
        Initialize the topic analyzer.

        Args:
            sample_size: If provided, limit analysis to this many documents
        """
        self.sample_size = sample_size
        self.console = Console()

        # Initialize OpenAI client
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if not openai_api_key:
            logger.error("OPENAI_API_KEY environment variable not found")
            raise ValueError("OpenAI API key is required for topic labeling")

        self.openai_client = openai.OpenAI(api_key=openai_api_key)

        # Setup data directory
        self.data_dir = Path("data")
        self.data_dir.mkdir(exist_ok=True)

        logger.info(f"Initialized UK Topic Analyzer (sample_size: {sample_size})")

    def load_uk_datasets(self) -> List[Dict]:
        """
        Load UK judgments from HuggingFace datasets.

        Returns:
            List of judgment documents with text and metadata
        """
        hf_token = os.getenv('HF_TOKEN')
        if not hf_token:
            logger.error("HF_TOKEN environment variable not found")
            raise ValueError("HuggingFace token is required to access datasets")

        documents = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=self.console
        ) as progress:

            # Load JuDDGES/en-appealcourt (test split)
            task1 = progress.add_task("Loading en-appealcourt dataset...", total=None)
            try:
                logger.info("Loading JuDDGES/en-appealcourt (test split)")
                dataset1 = load_dataset(
                    "JuDDGES/en-appealcourt",
                    split="test",
                    token=hf_token
                )

                for idx, item in enumerate(dataset1):
                    context = item.get('context', '').strip()
                    if len(context) >= 500:  # Filter short texts
                        documents.append({
                            'text': context,
                            'source': 'JuDDGES/en-appealcourt',
                            'doc_id': f"appeal_{idx}",
                            'metadata': item
                        })

                progress.update(task1, total=len(dataset1), completed=len(dataset1))
                logger.info(f"Loaded {len([d for d in documents if d['source'] == 'JuDDGES/en-appealcourt'])} documents from en-appealcourt")

            except Exception as e:
                logger.warning(f"Failed to load en-appealcourt: {e}")
                progress.update(task1, completed=1, total=1)

            # Load JuDDGES/en-court-raw-sample (train split)
            task2 = progress.add_task("Loading en-court-raw-sample dataset...", total=None)
            try:
                logger.info("Loading JuDDGES/en-court-raw-sample (train split)")
                dataset2 = load_dataset(
                    "JuDDGES/en-court-raw-sample",
                    split="train",
                    token=hf_token
                )

                initial_count = len(documents)
                for idx, item in enumerate(dataset2):
                    full_text = item.get('full_text', '').strip()
                    if len(full_text) >= 500:  # Filter short texts
                        documents.append({
                            'text': full_text,
                            'source': 'JuDDGES/en-court-raw-sample',
                            'doc_id': f"raw_{idx}",
                            'metadata': item
                        })

                progress.update(task2, total=len(dataset2), completed=len(dataset2))
                new_docs = len(documents) - initial_count
                logger.info(f"Loaded {new_docs} documents from en-court-raw-sample")

            except Exception as e:
                logger.warning(f"Failed to load en-court-raw-sample: {e}")
                progress.update(task2, completed=1, total=1)

        logger.info(f"Total documents loaded: {len(documents)}")

        # Apply sampling if requested
        if self.sample_size and len(documents) > self.sample_size:
            import random
            random.seed(42)
            documents = random.sample(documents, self.sample_size)
            logger.info(f"Sampled {self.sample_size} documents for analysis")

        return documents

    def preprocess_text(self, text: str) -> str:
        """
        Clean and preprocess judgment text.

        Args:
            text: Raw judgment text

        Returns:
            Cleaned text
        """
        # Strip HTML tags
        text = re.sub(r'<[^>]+>', ' ', text)

        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)

        # Remove excessive punctuation
        text = re.sub(r'[.]{3,}', '...', text)

        return text.strip()

    def extract_topics_with_bertopic(self, documents: List[Dict]) -> Tuple[BERTopic, List[str], List[int]]:
        """
        Extract topics using BERTopic with sentence transformers.

        Args:
            documents: List of judgment documents

        Returns:
            Tuple of (fitted BERTopic model, processed texts, topic assignments)
        """
        logger.info("Preprocessing texts for topic modeling")

        # Extract and preprocess texts
        texts = []
        for doc in documents:
            cleaned_text = self.preprocess_text(doc['text'])
            if len(cleaned_text) >= 500:  # Final filter
                texts.append(cleaned_text)

        logger.info(f"Processing {len(texts)} documents for topic modeling")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=self.console
        ) as progress:

            # Initialize sentence transformer
            task1 = progress.add_task("Loading sentence transformer model...", total=None)
            embedding_model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
            progress.update(task1, completed=1, total=1)

            # Setup BERTopic with custom components
            task2 = progress.add_task("Setting up BERTopic pipeline...", total=None)

            # UMAP for dimensionality reduction
            umap_model = UMAP(
                n_neighbors=15,
                n_components=5,
                min_dist=0.0,
                metric='cosine',
                random_state=42
            )

            # HDBSCAN for clustering
            hdbscan_model = HDBSCAN(
                min_cluster_size=20,  # Minimum documents per topic
                metric='euclidean',
                cluster_selection_method='eom',
                prediction_data=True
            )

            # CountVectorizer for keyword extraction
            vectorizer_model = CountVectorizer(
                ngram_range=(1, 2),
                stop_words="english",
                max_features=5000,
                min_df=10,
                max_df=0.7
            )

            # Initialize BERTopic
            topic_model = BERTopic(
                embedding_model=embedding_model,
                umap_model=umap_model,
                hdbscan_model=hdbscan_model,
                vectorizer_model=vectorizer_model,
                calculate_probabilities=True,
                nr_topics="auto",
                verbose=True
            )

            progress.update(task2, completed=1, total=1)

            # Fit BERTopic model
            task3 = progress.add_task("Fitting BERTopic model...", total=None)
            topics, probabilities = topic_model.fit_transform(texts)
            progress.update(task3, completed=1, total=1)

        # Get topic info
        topic_info = topic_model.get_topic_info()
        logger.info(f"Extracted {len(topic_info)} topics (including outliers)")

        # Filter out outlier topic (-1)
        valid_topics = topic_info[topic_info.Topic != -1]
        logger.info(f"Valid topics: {len(valid_topics)}")

        return topic_model, texts, topics

    def generate_topic_labels(self, topic_model: BERTopic, texts: List[str], topics: List[int]) -> Dict[int, Dict]:
        """
        Generate human-readable labels for topics using OpenAI GPT-4o-mini.

        Args:
            topic_model: Fitted BERTopic model
            texts: Document texts
            topics: Topic assignments

        Returns:
            Dictionary mapping topic_id to label information
        """
        topic_labels = {}
        topic_info = topic_model.get_topic_info()

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=self.console
        ) as progress:

            task = progress.add_task("Generating topic labels...", total=len(topic_info))

            for _, row in topic_info.iterrows():
                topic_id = row['Topic']

                # Skip outlier topic
                if topic_id == -1:
                    progress.advance(task)
                    continue

                # Get topic keywords
                topic_words = topic_model.get_topic(topic_id)
                keywords = [word for word, score in topic_words[:10]]

                # Get representative documents
                topic_docs = [texts[i] for i, t in enumerate(topics) if t == topic_id]
                if topic_docs:
                    # Sample up to 3 representative documents
                    sample_docs = topic_docs[:3]
                    doc_excerpts = [doc[:500] + "..." if len(doc) > 500 else doc for doc in sample_docs]
                else:
                    doc_excerpts = []

                # Generate label using OpenAI
                try:
                    label_info = self._call_openai_for_labeling(keywords, doc_excerpts, topic_id)
                    topic_labels[topic_id] = label_info
                except Exception as e:
                    logger.warning(f"Failed to generate label for topic {topic_id}: {e}")
                    # Fallback to keyword-based label
                    topic_labels[topic_id] = {
                        'label': f"Topic {topic_id}: {', '.join(keywords[:3])}",
                        'description': f"Legal topic related to {', '.join(keywords[:5])}",
                        'category': 'General Law',
                        'keywords': keywords,
                        'confidence': 0.5
                    }

                progress.advance(task)

        return topic_labels

    def _call_openai_for_labeling(self, keywords: List[str], doc_excerpts: List[str], topic_id: int) -> Dict:
        """
        Call OpenAI API to generate topic label and description.

        Args:
            keywords: Top keywords for the topic
            doc_excerpts: Representative document excerpts
            topic_id: Topic ID for reference

        Returns:
            Dictionary with label, description, category, etc.
        """
        # Prepare prompt
        keywords_str = ", ".join(keywords)
        docs_str = "\n\n".join([f"Document {i+1}: {doc}" for i, doc in enumerate(doc_excerpts)])

        prompt = f"""
You are a legal expert analyzing court judgment topics. Based on the following information, provide a structured analysis of this legal topic cluster.

Topic Keywords: {keywords_str}

Representative Document Excerpts:
{docs_str}

Please provide:
1. A concise topic label (2-4 words, e.g., "Criminal Sentencing", "Contract Disputes")
2. A 2-3 sentence description of what this topic covers
3. A top-level legal category (e.g., "Criminal Law", "Civil Law", "Family Law", "Commercial Law", "Public Law", "Constitutional Law")

Respond in JSON format:
{{
    "label": "Topic Label",
    "description": "Description of the legal topic...",
    "category": "Legal Category"
}}
"""

        response = self.openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a legal expert specializing in UK court judgments and legal taxonomy."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.1
        )

        # Parse response
        try:
            result = json.loads(response.choices[0].message.content.strip())
            return {
                'label': result.get('label', f'Topic {topic_id}'),
                'description': result.get('description', ''),
                'category': result.get('category', 'General Law'),
                'keywords': keywords,
                'confidence': 0.8  # High confidence for AI-generated labels
            }
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse OpenAI response for topic {topic_id}: {e}")
            raise

    def create_topic_taxonomy(self, topic_model: BERTopic, topic_labels: Dict, texts: List[str], topics: List[int], documents: List[Dict]) -> Dict:
        """
        Create structured topic taxonomy with metadata.

        Args:
            topic_model: Fitted BERTopic model
            topic_labels: Generated topic labels
            texts: Document texts
            topics: Topic assignments
            documents: Original documents with metadata

        Returns:
            Complete taxonomy dictionary
        """
        topic_info = topic_model.get_topic_info()
        taxonomy_topics = []

        for _, row in topic_info.iterrows():
            topic_id = row['Topic']

            # Skip outlier topic
            if topic_id == -1:
                continue

            # Get topic information
            labels = topic_labels.get(topic_id, {})
            topic_words = topic_model.get_topic(topic_id)
            keywords = [word for word, score in topic_words[:15]]

            # Get representative document IDs
            topic_doc_indices = [i for i, t in enumerate(topics) if t == topic_id]
            representative_docs = []

            # Map back to original document IDs
            for idx in topic_doc_indices[:3]:  # Top 3 representative docs
                if idx < len(documents):
                    representative_docs.append(documents[idx]['doc_id'])

            taxonomy_topics.append({
                'topic_id': int(topic_id),
                'label': labels.get('label', f'Topic {topic_id}'),
                'description': labels.get('description', ''),
                'category': labels.get('category', 'General Law'),
                'keywords': keywords,
                'document_count': int(row['Count']),
                'representative_docs': representative_docs,
                'confidence': labels.get('confidence', 0.5)
            })

        # Sort by document count (descending)
        taxonomy_topics.sort(key=lambda x: x['document_count'], reverse=True)

        # Calculate outliers
        outlier_count = len([t for t in topics if t == -1])

        taxonomy = {
            'topics': taxonomy_topics,
            'metadata': {
                'total_documents': len(texts),
                'total_topics': len(taxonomy_topics),
                'outlier_documents': outlier_count,
                'model': 'sentence-transformers/all-MiniLM-L6-v2',
                'method': 'BERTopic + GPT-4o-mini labeling',
                'created_at': datetime.now().isoformat(),
                'sample_size': self.sample_size,
                'min_topic_size': 20,
                'sources': ['JuDDGES/en-appealcourt', 'JuDDGES/en-court-raw-sample']
            }
        }

        return taxonomy

    def save_topic_assignments(self, documents: List[Dict], texts: List[str], topics: List[int], topic_model: BERTopic) -> None:
        """
        Save document-to-topic assignments as Parquet file.

        Args:
            documents: Original documents
            texts: Processed texts
            topics: Topic assignments
            topic_model: Fitted model for confidence scores
        """
        assignments = []
        probabilities = topic_model.probabilities_

        for i, (doc, topic_id) in enumerate(zip(documents[:len(topics)], topics)):
            # Get topic probability/confidence
            if probabilities is not None and i < len(probabilities):
                # For outliers (-1), confidence is low
                if topic_id == -1:
                    confidence = 0.0
                else:
                    # Get probability for assigned topic
                    topic_probs = probabilities[i]
                    if topic_id < len(topic_probs):
                        confidence = float(topic_probs[topic_id])
                    else:
                        confidence = 0.5
            else:
                confidence = 0.5  # Default confidence

            assignments.append({
                'doc_id': doc['doc_id'],
                'source_dataset': doc['source'],
                'topic_id': int(topic_id),
                'confidence': confidence,
                'text_length': len(doc['text']),
                'processed_text_length': len(texts[i]) if i < len(texts) else 0
            })

        # Create DataFrame and save
        df = pd.DataFrame(assignments)
        output_path = self.data_dir / "uk_topic_assignments.parquet"
        df.to_parquet(output_path, index=False)

        logger.info(f"Saved topic assignments to {output_path}")
        logger.info(f"Assignment statistics:")
        logger.info(f"  - Total assignments: {len(df)}")
        logger.info(f"  - Unique topics: {df['topic_id'].nunique()}")
        logger.info(f"  - Outliers (topic -1): {len(df[df['topic_id'] == -1])}")
        logger.info(f"  - Avg confidence: {df['confidence'].mean():.3f}")

    def display_summary_statistics(self, taxonomy: Dict) -> None:
        """
        Display topic analysis summary using Rich.

        Args:
            taxonomy: Complete topic taxonomy
        """
        topics = taxonomy['topics']
        metadata = taxonomy['metadata']

        # Create summary panel
        summary_text = f"""
[bold]Topic Analysis Summary[/bold]

📊 [cyan]Dataset Statistics[/cyan]
   • Total documents analyzed: [green]{metadata['total_documents']:,}[/green]
   • Documents assigned to topics: [green]{metadata['total_documents'] - metadata['outlier_documents']:,}[/green]
   • Outlier documents: [yellow]{metadata['outlier_documents']:,}[/yellow]
   • Total topics discovered: [green]{metadata['total_topics']}[/green]

🔬 [cyan]Model Configuration[/cyan]
   • Embedding model: [blue]{metadata['model']}[/blue]
   • Topic modeling method: [blue]{metadata['method']}[/blue]
   • Minimum topic size: [blue]{metadata['min_topic_size']}[/blue]
   • Sample size: [blue]{metadata.get('sample_size', 'Full dataset')}[/blue]

📅 [cyan]Analysis Info[/cyan]
   • Created: [blue]{metadata['created_at'][:19]}[/blue]
   • Data sources: [blue]{', '.join(metadata['sources'])}[/blue]
"""

        self.console.print(Panel(summary_text, title="🏛️ UK Legal Topic Analysis", border_style="blue"))

        # Top 5 topics table
        self.console.print("\n[bold]📈 Top 5 Topics by Document Count[/bold]")

        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("Rank", style="dim", width=6)
        table.add_column("Topic Label", style="cyan")
        table.add_column("Category", style="green")
        table.add_column("Documents", justify="right", style="yellow")
        table.add_column("Top Keywords", style="dim")

        for i, topic in enumerate(topics[:5], 1):
            keywords_str = ", ".join(topic['keywords'][:5])
            table.add_row(
                str(i),
                topic['label'],
                topic['category'],
                f"{topic['document_count']:,}",
                keywords_str
            )

        self.console.print(table)

        # Topic distribution by category
        self.console.print("\n[bold]📊 Topics by Legal Category[/bold]")

        category_counts = {}
        for topic in topics:
            category = topic['category']
            category_counts[category] = category_counts.get(category, 0) + 1

        cat_table = Table(show_header=True, header_style="bold magenta")
        cat_table.add_column("Legal Category", style="cyan")
        cat_table.add_column("Number of Topics", justify="right", style="yellow")
        cat_table.add_column("Total Documents", justify="right", style="green")

        for category, count in sorted(category_counts.items(), key=lambda x: x[1], reverse=True):
            doc_count = sum(topic['document_count'] for topic in topics if topic['category'] == category)
            cat_table.add_row(category, str(count), f"{doc_count:,}")

        self.console.print(cat_table)

    def run_analysis(self) -> None:
        """Run the complete topic analysis pipeline."""
        logger.info("Starting UK legal topic analysis pipeline")

        try:
            # Step 1: Load datasets
            self.console.print("\n[bold blue]📚 Step 1: Loading UK Judgment Datasets[/bold blue]")
            documents = self.load_uk_datasets()

            if not documents:
                logger.error("No documents loaded. Exiting.")
                return

            # Step 2: Extract topics with BERTopic
            self.console.print("\n[bold blue]🔍 Step 2: Extracting Topics with BERTopic[/bold blue]")
            topic_model, texts, topics = self.extract_topics_with_bertopic(documents)

            # Step 3: Generate topic labels with OpenAI
            self.console.print("\n[bold blue]🏷️ Step 3: Generating Topic Labels with AI[/bold blue]")
            topic_labels = self.generate_topic_labels(topic_model, texts, topics)

            # Step 4: Create taxonomy
            self.console.print("\n[bold blue]📋 Step 4: Creating Topic Taxonomy[/bold blue]")
            taxonomy = self.create_topic_taxonomy(topic_model, topic_labels, texts, topics, documents)

            # Step 5: Save outputs
            self.console.print("\n[bold blue]💾 Step 5: Saving Results[/bold blue]")

            # Save taxonomy JSON
            taxonomy_path = self.data_dir / "uk_topics_taxonomy.json"
            with open(taxonomy_path, 'w', encoding='utf-8') as f:
                json.dump(taxonomy, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved taxonomy to {taxonomy_path}")

            # Save topic assignments
            self.save_topic_assignments(documents, texts, topics, topic_model)

            # Step 6: Display summary
            self.console.print("\n[bold blue]📊 Step 6: Analysis Summary[/bold blue]")
            self.display_summary_statistics(taxonomy)

            self.console.print(f"\n[bold green]✅ Analysis complete![/bold green]")
            self.console.print(f"[dim]Output files saved in: {self.data_dir.absolute()}[/dim]")

        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            import traceback
            traceback.print_exc()
            self.console.print(f"[bold red]❌ Analysis failed: {e}[/bold red]")


def main():
    """Main entry point for the topic analysis script."""
    # Setup logging
    logger.remove()  # Remove default handler
    logger.add(sys.stderr, format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>")

    # Load environment variables
    load_dotenv()

    # Parse simple command line arguments
    sample_size = None
    if len(sys.argv) > 1:
        if sys.argv[1] == "--sample" and len(sys.argv) > 2:
            try:
                sample_size = int(sys.argv[2])
                console.print(f"[yellow]Using sample size: {sample_size}[/yellow]")
            except ValueError:
                console.print("[red]Invalid sample size. Using full dataset.[/red]")

    # Check required environment variables
    required_vars = ['HF_TOKEN', 'OPENAI_API_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]

    if missing_vars:
        console.print(f"[bold red]Error:[/bold red] Missing required environment variables: {', '.join(missing_vars)}")
        console.print("\n[dim]Required variables:[/dim]")
        console.print("  • HF_TOKEN: HuggingFace token for dataset access")
        console.print("  • OPENAI_API_KEY: OpenAI API key for topic labeling")
        sys.exit(1)

    # Initialize and run analyzer
    analyzer = UKTopicAnalyzer(sample_size=sample_size)
    analyzer.run_analysis()


if __name__ == '__main__':
    main()