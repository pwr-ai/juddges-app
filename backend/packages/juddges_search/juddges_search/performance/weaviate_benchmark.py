"""
Weaviate Query Performance Benchmark Suite

Measures performance for vector, hybrid, and BM25 search queries.
Measures latency, aggregates results, and saves to file with rich console output.
"""

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median, stdev
from typing import Dict, List, Tuple, Any, Optional

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

from ..db.weaviate_db import WeaviateLegalDatabase
from ..retrieval.weaviate_search import (
    search_documents,
    search_chunks_vector, 
    search_chunks_term,
)

# Load environment variables
load_dotenv()

console = Console()

# Test queries for different search types
VECTOR_QUERIES = [
    "podatek dochodowy od osób fizycznych",
    "rozliczenie roczne PIT",
    "ulgi podatkowe dla rodzin",
    "koszty uzyskania przychodu",
    "zwolnienia z podatku dochodowego",
    "podatek VAT od usług",
    "ewidencja księgowa przychodów",
    "składki na ubezpieczenia społeczne",
    "odliczenia od podstawy opodatkowania",
    "procedury kontroli skarbowej",
    "sankcje za niepłacenie podatków",
    "interpretacje przepisów podatkowych"
]

HYBRID_QUERIES = [
    "Art. 15 ustawy o podatku dochodowym od osób fizycznych",
    "zasady rozliczeń międzynarodowych",
    "podatek od nieruchomości w gminie",
    "rozporządzenie Ministra Finansów VAT",
    "umowa o unikaniu podwójnego opodatkowania",
    "przepisy przejściowe nowej ordynacji",
    "definicja działalności gospodarczej",
    "obowiązki płatnika podatku",
    "terminy płatności zobowiązań podatkowych",
    "postępowanie w sprawach podatkowych",
    "środki zabezpieczenia wykonania zobowiązań",
    "zasady dokumentowania transakcji"
]

BM25_QUERIES = [
    "PIT-37",
    "CIT-8",
    "VAT-7",
    "ZUS DRA",
    "Art. 27 ust. 1",
    "§ 15 rozporządzenia",
    "ustawa z dnia 26 lipca 1991",
    "Dz.U. 2021 poz. 1540",
    "WSA w Warszawie",
    "NSA sygn. akt II FSK",
    "interpretacja indywidualna",
    "decyzja nr 0114-KDIP3-1.4010"
]

# Long complex queries for stress testing (100-300 characters each)
VECTOR_QUERIES_LONG = [
    "Czy spółka jawna prowadząca działalność gospodarczą może zastosować uproszczoną metodę rozliczania podatku dochodowego od osób prawnych w sytuacji, gdy jeden ze wspólników jest osobą fizyczną nieprowadzącą działalności gospodarczej?",
    "Jakie są konsekwencje podatkowe przekształcenia jednoosobowej działalności gospodarczej w spółkę z ograniczoną odpowiedzialnością w kontekście kontynuacji amortyzacji środków trwałych nabytych przed przekształceniem?",
    "W jaki sposób należy ustalić moment powstania przychodu podatkowego z tytułu otrzymania dotacji z Unii Europejskiej na realizację projektu inwestycyjnego rozliczanego metodą kosztu amortyzowanego?",
    "Czy wydatki poniesione na zakup oprogramowania komputerowego niezbędnego do prowadzenia ewidencji księgowej mogą zostać zakwalifikowane jako koszty uzyskania przychodów w momencie ich poniesienia, czy podlegają amortyzacji?",
    "Jakie są zasady opodatkowania podatkiem od towarów i usług świadczenia usług najmu nieruchomości komercyjnych przez podmiot zwolniony podmiotowo z VAT, który zdecydował się na rezygnację ze zwolnienia?",
    "W jakiej wysokości można odliczyć od podstawy opodatkowania składki na ubezpieczenie zdrowotne i społeczne przedsiębiorcy prowadzącego jednoosobową działalność gospodarczą rozliczającego się na zasadach ogólnych?",
    "Czy przekazanie nieodpłatnie środków trwałych pomiędzy spółkami powiązanymi kapitałowo stanowi przychód podatkowy po stronie spółki otrzymującej i czy po stronie spółki przekazującej powstaje obowiązek określenia wartości rynkowej?",
    "Jakie dokumenty należy przedstawić organowi podatkowemu w celu wykazania, że transakcja z kontrahentem z kraju trzeciego została przeprowadzona na warunkach rynkowych zgodnie z zasadą cen transferowych?",
    "W jaki sposób należy rozliczyć podatek dochodowy od osób fizycznych w sytuacji otrzymania dywidendy z udziałów w spółce kapitałowej mającej siedzibę w państwie członkowskim Unii Europejskiej, z którym Polska zawarła umowę o unikaniu podwójnego opodatkowania?",
    "Czy wydatki poniesione na reprezentację, w tym koszty organizacji konferencji dla klientów oraz wyjazdy integracyjne dla pracowników, mogą zostać uznane za koszty uzyskania przychodów w świetle przepisów ustawy o podatku dochodowym od osób prawnych?"
]

HYBRID_QUERIES_LONG = [
    "Artykuł 15 ust. 1 ustawy o podatku dochodowym od osób fizycznych - definicja kosztów uzyskania przychodów w kontekście wydatków na zakup materiałów biurowych oraz oprogramowania wykorzystywanego w działalności gospodarczej",
    "Wykładnia art. 86 ust. 2 pkt 1 lit. a ustawy o VAT dotycząca prawa do odliczenia podatku naliczonego od zakupu samochodu osobowego wykorzystywanego wyłącznie do celów działalności gospodarczej",
    "Zastosowanie art. 22 ust. 6d ustawy o PIT w zakresie obowiązku sporządzenia dokumentacji cen transferowych dla transakcji kontrolowanych przekraczających próg wartościowy określony w przepisach",
    "Interpretacja art. 12 ust. 3 pkt 2 ustawy o CIT odnośnie momentu rozpoznania przychodu z tytułu otrzymania zaliczki na poczet przyszłych dostaw towarów w ramach umowy długoterminowej",
    "Stosowanie art. 41 ust. 12 ustawy o VAT w przypadku świadczenia usług elektronicznych na rzecz konsumentów mających siedzibę lub miejsce zamieszkania poza terytorium Rzeczypospolitej Polskiej",
    "Artykuł 23 ust. 1 pkt 43 ustawy o podatku dochodowym od osób fizycznych - wyłączenie z kosztów uzyskania przychodów wydatków na reprezentację ponoszonych w związku z organizacją eventów dla kontrahentów",
    "Przepis art. 16 ust. 1 pkt 46 ustawy o CIT dotyczący wydatków związanych z używaniem przez pracowników samochodów służbowych dla celów prywatnych jako świadczeń nieodpłatnych",
    "Analiza art. 119 ust. 4 Ordynacji podatkowej w kontekście przedawnienia zobowiązania podatkowego w przypadku wszczęcia postępowania karnego skarbowego przed upływem terminu przedawnienia",
    "Zastosowanie art. 30c ustawy o PIT odnośnie możliwości rozliczenia straty z pozarolniczej działalności gospodarczej w kolejnych latach podatkowych przy zachowaniu pięcioletniego okresu rozliczeniowego",
    "Wykładnia art. 88 ust. 3a pkt 2 ustawy o VAT dotycząca korekty podatku naliczonego w sytuacji zmiany przeznaczenia środka trwałego z działalności opodatkowanej na działalność zwolnioną"
]

BM25_QUERIES_LONG = [
    "Wyrok NSA sygn. akt II FSK 1847/19 dotyczący interpretacji przepisów art. 15 ust. 4e ustawy o CIT w zakresie ograniczenia zaliczania do kosztów podatkowych odsetek od pożyczek udzielonych przez podmioty powiązane",
    "Interpretacja indywidualna Dyrektora KIS nr 0111-KDIB1-2.4010.389.2023.1.PC wydana w sprawie możliwości zastosowania zwolnienia z art. 17 ust. 1 pkt 34 ustawy o PIT dla dochodów z odpłatnego zbycia nieruchomości",
    "Uchwała składu siedmiu sędziów NSA sygn. akt II FPS 4/21 rozstrzygająca wątpliwości prawne dotyczące stosowania art. 86 ust. 1 ustawy o VAT w kontekście odliczenia podatku naliczonego od faktur korygujących",
    "Wyrok TSUE w sprawie C-320/17 Marle Participations odnoszący się do interpretacji art. 168 i 178 Dyrektywy VAT w zakresie prawa do odliczenia przy nabyciu udziałów w spółkach zależnych",
    "Postanowienie NSA sygn. akt I FSK 1204/22 w przedmiocie zastosowania art. 14na § 1 Ordynacji podatkowej dotyczącego ochrony zaufania do interpretacji ogólnej wydanej przez Ministra Finansów",
    "Interpretacja indywidualna nr 0114-KDIP1-2.4012.456.2023.2.RK w sprawie zastosowania art. 22 ust. 1 ustawy o CIT dotyczącego momentu powstania przychodu z tytułu otrzymania refundacji kosztów z NFZ",
    "Wyrok WSA w Warszawie sygn. akt III SA/Wa 2134/22 odnośnie prawidłowości zastosowania art. 15e ust. 1 ustawy o CIT w zakresie ograniczeń w zaliczaniu do kosztów podatkowych kosztów usług niematerialnych",
    "Decyzja Dyrektora Krajowej Informacji Skarbowej nr 0112-KDIL2-1.4011.389.2023.1.MK wydana na podstawie art. 119a § 1 Ordynacji podatkowej stwierdzająca nadpłatę podatku VAT za okres rozliczeniowy",
    "Interpretacja ogólna Ministra Finansów nr DD6.8201.3.2023 z dnia 15 czerwca 2023 roku dotycząca stosowania przepisów art. 15 ust. 4d ustawy o CIT w zakresie niedostatecznej kapitalizacji",
    "Wyrok NSA sygn. akt II FSK 2891/20 w sprawie interpretacji art. 70 § 1 Ordynacji podatkowej dotyczącego terminu przedawnienia zobowiązania podatkowego przerwany przez wszczęcie kontroli podatkowej"
]

class PerformanceResult:
    def __init__(self, query_type: str, query: str, latency: float, results_count: int, error: Optional[str] = None):
        self.query_type = query_type
        self.query = query
        self.latency = latency
        self.results_count = results_count
        self.error = error
        self.timestamp = datetime.now(timezone.utc).isoformat()

class WeaviateBenchmarkSuite:
    def __init__(self):
        self.results: List[PerformanceResult] = []
        self.db_manager: Optional[WeaviateLegalDatabase] = None

    async def setup(self) -> None:
        """Setup database connection"""
        self.db_manager = WeaviateLegalDatabase()

    async def teardown(self) -> None:
        """Clean up database connection"""
        if self.db_manager:
            await self.db_manager.close()

    async def measure_query_latency(self, query_func, *args, **kwargs) -> Tuple[float, Optional[Any], Optional[str]]:
        """Measure latency of a query function"""
        start_time = time.perf_counter()
        error_msg = None
        result = None
        
        try:
            result = await query_func(*args, **kwargs)
        except Exception as e:
            error_msg = str(e)
        
        end_time = time.perf_counter()
        latency = end_time - start_time
        
        return latency, result, error_msg

    async def run_vector_search_tests(self) -> None:
        """Run vector search performance tests"""
        console.print("\n[blue]Running Vector Search Tests...[/blue]")
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("Vector search tests", total=len(VECTOR_QUERIES))
            
            for query in VECTOR_QUERIES:
                latency, result, error = await self.measure_query_latency(
                    search_chunks_vector, 
                    query, 
                    max_chunks=10
                )
                
                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("vector", query, latency, results_count, error))
                
                progress.advance(task)

    async def run_hybrid_search_tests(self) -> None:
        """Run hybrid search performance tests"""
        console.print("\n[green]Running Hybrid Search Tests...[/green]")
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("Hybrid search tests", total=len(HYBRID_QUERIES))
            
            for query in HYBRID_QUERIES:
                latency, result, error = await self.measure_query_latency(
                    search_documents,
                    query,
                    max_docs=10
                )
                
                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("hybrid", query, latency, results_count, error))
                
                progress.advance(task)

    async def run_bm25_search_tests(self) -> None:
        """Run BM25 search performance tests"""
        console.print("\n[yellow]Running BM25 Search Tests...[/yellow]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("BM25 search tests", total=len(BM25_QUERIES))

            for query in BM25_QUERIES:
                latency, result, error = await self.measure_query_latency(
                    search_chunks_term,
                    query,
                    max_chunks=10
                )

                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("bm25", query, latency, results_count, error))

                progress.advance(task)

    async def run_vector_long_search_tests(self) -> None:
        """Run long vector search performance tests"""
        console.print("\n[blue]Running Long Vector Search Tests (100-300 chars)...[/blue]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("Long vector search tests", total=len(VECTOR_QUERIES_LONG))

            for query in VECTOR_QUERIES_LONG:
                latency, result, error = await self.measure_query_latency(
                    search_chunks_vector,
                    query,
                    max_chunks=10
                )

                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("vector_long", query, latency, results_count, error))

                progress.advance(task)

    async def run_hybrid_long_search_tests(self) -> None:
        """Run long hybrid search performance tests"""
        console.print("\n[green]Running Long Hybrid Search Tests (100-300 chars)...[/green]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("Long hybrid search tests", total=len(HYBRID_QUERIES_LONG))

            for query in HYBRID_QUERIES_LONG:
                latency, result, error = await self.measure_query_latency(
                    search_documents,
                    query,
                    max_docs=10
                )

                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("hybrid_long", query, latency, results_count, error))

                progress.advance(task)

    async def run_bm25_long_search_tests(self) -> None:
        """Run long BM25 search performance tests"""
        console.print("\n[yellow]Running Long BM25 Search Tests (100-300 chars)...[/yellow]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("Long BM25 search tests", total=len(BM25_QUERIES_LONG))

            for query in BM25_QUERIES_LONG:
                latency, result, error = await self.measure_query_latency(
                    search_chunks_term,
                    query,
                    max_chunks=10
                )

                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("bm25_long", query, latency, results_count, error))

                progress.advance(task)

    def aggregate_results(self) -> Dict[str, Dict[str, float]]:
        """Aggregate performance results by query type"""
        aggregated = {}

        for query_type in ["vector", "hybrid", "bm25", "vector_long", "hybrid_long", "bm25_long"]:
            type_results = [r for r in self.results if r.query_type == query_type and not r.error]
            
            if type_results:
                latencies = [r.latency for r in type_results]
                result_counts = [r.results_count for r in type_results]
                
                aggregated[query_type] = {
                    "count": len(type_results),
                    "avg_latency": mean(latencies),
                    "median_latency": median(latencies),
                    "min_latency": min(latencies),
                    "max_latency": max(latencies),
                    "std_latency": stdev(latencies) if len(latencies) > 1 else 0.0,
                    "avg_results": mean(result_counts),
                    "total_errors": len([r for r in self.results if r.query_type == query_type and r.error])
                }
        
        return aggregated

    def display_results(self, aggregated_results: Dict[str, Dict[str, float]]) -> None:
        """Display results using rich console formatting"""
        
        # Main results table
        table = Table(title="Weaviate Query Performance Results", show_header=True, header_style="bold magenta")
        table.add_column("Query Type", style="cyan", no_wrap=True)
        table.add_column("Count", style="green")
        table.add_column("Avg Latency (ms)", style="yellow")
        table.add_column("Median Latency (ms)", style="yellow")
        table.add_column("Min/Max (ms)", style="blue")
        table.add_column("Std Dev (ms)", style="red")
        table.add_column("Avg Results", style="green")
        table.add_column("Errors", style="red")

        for query_type, stats in aggregated_results.items():
            table.add_row(
                query_type.upper(),
                str(stats["count"]),
                f"{stats['avg_latency']*1000:.2f}",
                f"{stats['median_latency']*1000:.2f}",
                f"{stats['min_latency']*1000:.2f}/{stats['max_latency']*1000:.2f}",
                f"{stats['std_latency']*1000:.2f}",
                f"{stats['avg_results']:.1f}",
                str(stats["total_errors"])
            )

        console.print("\n")
        console.print(table)

        # Performance insights
        if aggregated_results:
            fastest_type = min(aggregated_results.keys(), key=lambda x: aggregated_results[x]["avg_latency"])
            slowest_type = max(aggregated_results.keys(), key=lambda x: aggregated_results[x]["avg_latency"])
            
            insights_text = f"""
[green]Fastest Search Type:[/green] {fastest_type.upper()} ({aggregated_results[fastest_type]['avg_latency']*1000:.2f}ms avg)
[red]Slowest Search Type:[/red] {slowest_type.upper()} ({aggregated_results[slowest_type]['avg_latency']*1000:.2f}ms avg)

[blue]Performance Summary:[/blue]
• Total queries executed: {len(self.results)}
• Total errors: {sum(stats['total_errors'] for stats in aggregated_results.values())}
• Benchmark completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            """
            
            console.print(Panel(insights_text, title="Performance Insights", border_style="green"))

        # Error details if any
        errors = [r for r in self.results if r.error]
        if errors:
            error_table = Table(title="Errors Encountered", show_header=True, header_style="bold red")
            error_table.add_column("Query Type", style="cyan")
            error_table.add_column("Query", style="white")
            error_table.add_column("Error", style="red")
            
            for error_result in errors:
                error_table.add_row(
                    error_result.query_type,
                    error_result.query[:50] + "..." if len(error_result.query) > 50 else error_result.query,
                    error_result.error[:100] + "..." if len(error_result.error) > 100 else error_result.error
                )
            
            console.print("\n")
            console.print(error_table)

    def save_results_to_file(self, aggregated_results: Dict[str, Dict[str, float]]) -> None:
        """Save raw and aggregated results to JSON file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_dir = Path("performance_results")
        results_dir.mkdir(parents=True, exist_ok=True)
        
        # Save raw results
        raw_results_file = results_dir / f"weaviate_performance_raw_{timestamp}.json"
        raw_data = {
            "metadata": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "total_queries": len(self.results),
                "query_types": ["vector", "hybrid", "bm25"],
                "queries_per_type": {
                    "vector": len(VECTOR_QUERIES),
                    "hybrid": len(HYBRID_QUERIES), 
                    "bm25": len(BM25_QUERIES)
                },
                "environment": {
                    "weaviate_url": os.getenv("WV_URL", "unknown"),
                    "weaviate_port": os.getenv("WV_PORT", "unknown")
                }
            },
            "raw_results": [
                {
                    "query_type": r.query_type,
                    "query": r.query,
                    "latency_seconds": r.latency,
                    "latency_ms": r.latency * 1000,
                    "results_count": r.results_count,
                    "error": r.error,
                    "timestamp": r.timestamp
                }
                for r in self.results
            ]
        }
        
        with open(raw_results_file, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, indent=2, ensure_ascii=False)
        
        # Save aggregated results
        agg_results_file = results_dir / f"weaviate_performance_summary_{timestamp}.json"
        agg_data = {
            "metadata": raw_data["metadata"],
            "aggregated_results": {
                query_type: {
                    **stats,
                    "avg_latency_ms": stats["avg_latency"] * 1000,
                    "median_latency_ms": stats["median_latency"] * 1000,
                    "min_latency_ms": stats["min_latency"] * 1000,
                    "max_latency_ms": stats["max_latency"] * 1000,
                    "std_latency_ms": stats["std_latency"] * 1000
                }
                for query_type, stats in aggregated_results.items()
            }
        }
        
        with open(agg_results_file, "w", encoding="utf-8") as f:
            json.dump(agg_data, f, indent=2, ensure_ascii=False)
        
        console.print("\n[green]Results saved to:[/green]")
        console.print(f"Raw data: {raw_results_file}")
        console.print(f"Summary: {agg_results_file}")

    async def run_benchmark(self, include_long: bool = False) -> None:
        """Run all performance benchmarks

        Args:
            include_long: If True, also run long query benchmarks (100-300 chars)
        """
        title = "[bold blue]Weaviate Query Performance Benchmark Suite[/bold blue]\n"
        if include_long:
            title += "Testing Vector, Hybrid, BM25 + Long Query performance"
        else:
            title += "Testing Vector, Hybrid, and BM25 search performance"

        console.print(Panel.fit(title, border_style="blue"))

        # Display environment info
        env_info = f"""
[cyan]Environment Configuration:[/cyan]
• Weaviate URL: {os.getenv('WV_URL', 'Not set')}
• Weaviate Port: {os.getenv('WV_PORT', 'Not set')}
• GRPC Port: {os.getenv('WV_GRPC_PORT', 'Not set')}
• API Key: {'Set' if os.getenv('WV_API_KEY') else 'Not set'}
• Long queries: {'Enabled' if include_long else 'Disabled'}
        """
        console.print(Panel(env_info, title="Configuration", border_style="cyan"))

        await self.setup()

        try:
            await self.run_vector_search_tests()
            await self.run_hybrid_search_tests()
            await self.run_bm25_search_tests()

            if include_long:
                await self.run_vector_long_search_tests()
                await self.run_hybrid_long_search_tests()
                await self.run_bm25_long_search_tests()

            aggregated = self.aggregate_results()
            self.display_results(aggregated)
            self.save_results_to_file(aggregated)

        finally:
            await self.teardown()

def main() -> None:
    """Main entry point"""
    suite = WeaviateBenchmarkSuite()
    asyncio.run(suite.run_benchmark())

if __name__ == "__main__":
    main()