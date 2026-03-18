"""
Cross-Jurisdictional Query Generation Script for Polish Legal Research

This script generates Polish-language search queries from UK legal topics for cross-jurisdictional
legal research. Part of GitHub Issue #11.

The script:
1. Loads UK topic taxonomy from analyze_uk_topics.py output
2. Uses OpenAI GPT-4o to generate Polish legal search queries
3. Maps UK legal concepts to Polish legal framework
4. Outputs structured cross-jurisdictional query sets

Usage:
    python scripts/generate_cross_queries.py
    python scripts/generate_cross_queries.py --sample 5  # Test with 5 topics
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from loguru import logger
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
from rich.table import Table
from tenacity import retry, stop_after_attempt, wait_exponential

# Import OpenAI
try:
    import openai
except ImportError:
    Console().print(f"[red]Error:[/red] Missing OpenAI dependency.")
    Console().print("Please install: pip install openai")
    sys.exit(1)

# Global console instance
console = Console()


class CrossJurisdictionalQueryGenerator:
    """Generator for Polish legal queries from UK legal topics."""

    def __init__(self, sample_size: Optional[int] = None):
        """
        Initialize the cross-jurisdictional query generator.

        Args:
            sample_size: If provided, limit processing to this many topics
        """
        self.sample_size = sample_size
        self.console = Console()

        # Initialize OpenAI client
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if not openai_api_key:
            logger.error("OPENAI_API_KEY environment variable not found")
            raise ValueError("OpenAI API key is required for query generation")

        self.openai_client = openai.OpenAI(api_key=openai_api_key)

        # Setup data directory
        self.data_dir = Path("data")
        self.data_dir.mkdir(exist_ok=True)

        logger.info(f"Initialized Cross-Jurisdictional Query Generator (sample_size: {sample_size})")

    def load_uk_taxonomy(self) -> Dict:
        """
        Load UK topics taxonomy from JSON file.

        Returns:
            UK topics taxonomy dictionary

        Raises:
            FileNotFoundError: If taxonomy file doesn't exist
            json.JSONDecodeError: If taxonomy file is malformed
        """
        taxonomy_path = self.data_dir / "uk_topics_taxonomy.json"

        if not taxonomy_path.exists():
            logger.error(f"UK topics taxonomy file not found: {taxonomy_path}")
            raise FileNotFoundError(
                f"UK topics taxonomy file not found: {taxonomy_path}\n"
                f"Please run 'python scripts/analyze_uk_topics.py' first to generate the taxonomy."
            )

        try:
            with open(taxonomy_path, 'r', encoding='utf-8') as f:
                taxonomy = json.load(f)

            logger.info(f"Loaded UK taxonomy with {len(taxonomy['topics'])} topics")
            return taxonomy

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse UK taxonomy file: {e}")
            raise json.JSONDecodeError(f"Malformed UK taxonomy file: {e}")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def generate_queries_for_topic(self, topic: Dict) -> Dict:
        """
        Generate Polish and English queries for a UK legal topic.

        Args:
            topic: UK topic dictionary with label, description, category, keywords

        Returns:
            Dictionary with generated queries and mapping information
        """
        prompt = self._create_query_generation_prompt(topic)

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a comparative legal expert specializing in UK and Polish law. "
                            "You understand both legal systems and can map legal concepts between "
                            "jurisdictions. You are fluent in both English and Polish legal terminology. "
                            "You MUST respond ONLY with valid JSON, no additional text or explanation."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                max_tokens=800,
                temperature=0.1,
                response_format={"type": "json_object"}
            )

            # Parse response
            response_text = response.choices[0].message.content.strip()
            result = json.loads(response_text)

            # Validate required fields
            required_fields = ['queries_pl', 'queries_en', 'jurisdictional_notes', 'coverage_confidence', 'expected_polish_sources']
            if not all(field in result for field in required_fields):
                missing = [field for field in required_fields if field not in result]
                raise ValueError(f"Missing required fields in OpenAI response: {missing}")

            return result

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse OpenAI response for topic '{topic['label']}': {e}")
            raise
        except Exception as e:
            logger.warning(f"OpenAI API error for topic '{topic['label']}': {e}")
            raise

    def _create_query_generation_prompt(self, topic: Dict) -> str:
        """
        Create the prompt for OpenAI query generation.

        Args:
            topic: UK topic dictionary

        Returns:
            Formatted prompt string
        """
        keywords_str = ", ".join(topic['keywords'][:10])

        prompt = f"""Generate Polish legal search queries for the UK legal topic below. Respond with ONLY valid JSON.

UK Legal Topic:
- Label: "{topic['label']}"
- Description: "{topic['description']}"
- Category: "{topic['category']}"
- Keywords: {keywords_str}

Generate 4-5 Polish queries, 2-3 English queries, jurisdictional mapping notes, confidence level (high/medium/low), and expected Polish legal sources.

Examples:

For "Criminal Sentencing":
{{
    "queries_pl": ["wymiar kary w prawie karnym", "dyrektywy wymiaru kary art. 53 KK", "indywidualizacja kary", "kara pozbawienia wolności"],
    "queries_en": ["criminal sentencing Polish law", "penalty guidelines Poland"],
    "jurisdictional_notes": "UK sentencing guidelines map to Polish Art. 53 Kodeks karny directives on individualization of punishment. Both systems consider aggravating and mitigating factors, but Polish system is more codified.",
    "coverage_confidence": "high",
    "expected_polish_sources": ["Kodeks karny art. 53-63", "Kodeks karny wykonawczy"]
}}

For "Contract Disputes":
{{
    "queries_pl": ["naruszenie umowy", "niewykonanie zobowiązania", "odpowiedzialność kontraktowa", "odszkodowanie za szkodę umowną"],
    "queries_en": ["breach of contract Poland", "contractual liability Polish law"],
    "jurisdictional_notes": "UK contract law concepts translate well to Polish civil law. Both recognize breach remedies, but Polish law is more systematic in Kodeks cywilny.",
    "coverage_confidence": "high",
    "expected_polish_sources": ["Kodeks cywilny art. 353-449", "Kodeks cywilny art. 471-496"]
}}

Now generate for the provided topic using the same JSON structure:
"""
        return prompt

    def process_all_topics(self, taxonomy: Dict) -> Dict:
        """
        Process all UK topics to generate cross-jurisdictional queries.

        Args:
            taxonomy: UK topics taxonomy

        Returns:
            Complete cross-jurisdictional queries structure
        """
        topics = taxonomy['topics']

        # Apply sampling if requested
        if self.sample_size and len(topics) > self.sample_size:
            topics = topics[:self.sample_size]
            logger.info(f"Processing sample of {self.sample_size} topics")

        cross_queries = []
        confidence_counts = {"high": 0, "medium": 0, "low": 0}

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=self.console
        ) as progress:

            task = progress.add_task("Generating cross-jurisdictional queries...", total=len(topics))

            for topic in topics:
                try:
                    query_result = self.generate_queries_for_topic(topic)

                    cross_query = {
                        "topic_id": topic["topic_id"],
                        "uk_topic_label": topic["label"],
                        "uk_description": topic["description"],
                        "uk_category": topic["category"],
                        "uk_keywords": topic["keywords"][:10],  # Limit keywords
                        "queries_pl": query_result["queries_pl"],
                        "queries_en": query_result["queries_en"],
                        "jurisdictional_notes": query_result["jurisdictional_notes"],
                        "coverage_confidence": query_result["coverage_confidence"],
                        "expected_polish_sources": query_result["expected_polish_sources"]
                    }

                    cross_queries.append(cross_query)

                    # Track confidence levels
                    confidence = query_result["coverage_confidence"].lower()
                    if confidence in confidence_counts:
                        confidence_counts[confidence] += 1

                except Exception as e:
                    logger.warning(f"Failed to process topic '{topic['label']}': {e}")
                    # Add a fallback entry
                    cross_queries.append({
                        "topic_id": topic["topic_id"],
                        "uk_topic_label": topic["label"],
                        "uk_description": topic["description"],
                        "uk_category": topic["category"],
                        "uk_keywords": topic["keywords"][:10],
                        "queries_pl": [f"prawo polskie {topic['label'].lower()}"],
                        "queries_en": [f"Polish law {topic['label'].lower()}"],
                        "jurisdictional_notes": "Failed to generate mapping - manual review required",
                        "coverage_confidence": "low",
                        "expected_polish_sources": ["Manual research required"]
                    })
                    confidence_counts["low"] += 1

                progress.advance(task)

        # Create complete structure
        result = {
            "queries": cross_queries,
            "metadata": {
                "source_taxonomy": "data/uk_topics_taxonomy.json",
                "total_topics": len(cross_queries),
                "high_confidence": confidence_counts["high"],
                "medium_confidence": confidence_counts["medium"],
                "low_confidence": confidence_counts["low"],
                "sample_size": self.sample_size,
                "created_at": datetime.now().isoformat(),
                "generator_model": "gpt-4o",
                "generator_version": "1.0.0"
            }
        }

        return result

    def save_cross_queries(self, cross_queries: Dict) -> Path:
        """
        Save cross-jurisdictional queries to JSON file.

        Args:
            cross_queries: Complete cross-jurisdictional queries structure

        Returns:
            Path to saved file
        """
        output_path = self.data_dir / "cross_jurisdictional_queries.json"

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(cross_queries, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved cross-jurisdictional queries to {output_path}")
        return output_path

    def display_summary(self, cross_queries: Dict) -> None:
        """
        Display generation summary using Rich.

        Args:
            cross_queries: Complete cross-jurisdictional queries structure
        """
        metadata = cross_queries['metadata']
        queries = cross_queries['queries']

        # Create summary panel
        summary_text = f"""
[bold]Cross-Jurisdictional Query Generation Summary[/bold]

📊 [cyan]Processing Statistics[/cyan]
   • Total UK topics processed: [green]{metadata['total_topics']:,}[/green]
   • High confidence mappings: [green]{metadata['high_confidence']:,}[/green]
   • Medium confidence mappings: [yellow]{metadata['medium_confidence']:,}[/yellow]
   • Low confidence mappings: [red]{metadata['low_confidence']:,}[/red]

🔬 [cyan]Generation Configuration[/cyan]
   • AI model: [blue]{metadata['generator_model']}[/blue]
   • Sample size: [blue]{metadata.get('sample_size', 'Full dataset')}[/blue]
   • Source taxonomy: [blue]{metadata['source_taxonomy']}[/blue]

📅 [cyan]Generation Info[/cyan]
   • Created: [blue]{metadata['created_at'][:19]}[/blue]
   • Generator version: [blue]{metadata['generator_version']}[/blue]
"""

        self.console.print(Panel(summary_text, title="🌍 Cross-Jurisdictional Query Generation", border_style="blue"))

        # Sample results table
        self.console.print("\n[bold]📋 Sample Query Results[/bold]")

        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("UK Topic", style="cyan", width=20)
        table.add_column("Polish Queries", style="green", width=35)
        table.add_column("Confidence", style="yellow", width=10)
        table.add_column("Polish Sources", style="dim", width=25)

        # Show first 5 results
        for query in queries[:5]:
            polish_queries_str = "\n".join(query['queries_pl'][:2])  # Show first 2
            if len(query['queries_pl']) > 2:
                polish_queries_str += f"\n(+{len(query['queries_pl'])-2} more)"

            sources_str = "\n".join(query['expected_polish_sources'][:2])
            if len(query['expected_polish_sources']) > 2:
                sources_str += "\n(+more...)"

            table.add_row(
                query['uk_topic_label'],
                polish_queries_str,
                query['coverage_confidence'],
                sources_str
            )

        self.console.print(table)

        # Confidence distribution
        self.console.print("\n[bold]📊 Confidence Distribution[/bold]")

        conf_table = Table(show_header=True, header_style="bold magenta")
        conf_table.add_column("Confidence Level", style="cyan")
        conf_table.add_column("Count", justify="right", style="yellow")
        conf_table.add_column("Percentage", justify="right", style="green")

        total = metadata['total_topics']
        for level in ['high', 'medium', 'low']:
            count = metadata[f'{level}_confidence']
            percentage = (count / total * 100) if total > 0 else 0
            conf_table.add_row(level.title(), str(count), f"{percentage:.1f}%")

        self.console.print(conf_table)

    def run_generation(self) -> None:
        """Run the complete cross-jurisdictional query generation pipeline."""
        logger.info("Starting cross-jurisdictional query generation pipeline")

        try:
            # Step 1: Load UK taxonomy
            self.console.print("\n[bold blue]📚 Step 1: Loading UK Topics Taxonomy[/bold blue]")
            taxonomy = self.load_uk_taxonomy()

            # Step 2: Generate cross-jurisdictional queries
            self.console.print("\n[bold blue]🌍 Step 2: Generating Cross-Jurisdictional Queries[/bold blue]")
            cross_queries = self.process_all_topics(taxonomy)

            # Step 3: Save results
            self.console.print("\n[bold blue]💾 Step 3: Saving Results[/bold blue]")
            output_path = self.save_cross_queries(cross_queries)

            # Step 4: Display summary
            self.console.print("\n[bold blue]📊 Step 4: Generation Summary[/bold blue]")
            self.display_summary(cross_queries)

            self.console.print(f"\n[bold green]✅ Query generation complete![/bold green]")
            self.console.print(f"[dim]Output file saved: {output_path.absolute()}[/dim]")

        except FileNotFoundError as e:
            self.console.print(f"[bold red]❌ Input file missing:[/bold red] {e}")
            self.console.print("\n[dim]To resolve:[/dim]")
            self.console.print("  1. Run: python scripts/analyze_uk_topics.py")
            self.console.print("  2. Then retry this script")

        except Exception as e:
            logger.error(f"Generation pipeline failed: {e}")
            import traceback
            traceback.print_exc()
            self.console.print(f"[bold red]❌ Generation failed: {e}[/bold red]")


def main():
    """Main entry point for the cross-jurisdictional query generation script."""
    # Setup logging
    logger.remove()  # Remove default handler
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
    )

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
                console.print("[red]Invalid sample size. Processing all topics.[/red]")

    # Check required environment variables
    if not os.getenv('OPENAI_API_KEY'):
        console.print(f"[bold red]Error:[/bold red] Missing required environment variable: OPENAI_API_KEY")
        console.print("\n[dim]Required variable:[/dim]")
        console.print("  • OPENAI_API_KEY: OpenAI API key for query generation")
        sys.exit(1)

    # Initialize and run generator
    generator = CrossJurisdictionalQueryGenerator(sample_size=sample_size)
    generator.run_generation()


if __name__ == '__main__':
    main()