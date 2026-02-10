# Weaviate Performance Benchmark Suite

This module contains performance benchmarking tools for Weaviate query operations in the AI Tax Search system.

## Overview

The benchmark suite measures and compares latency across three types of search:

- **Vector Search**: Semantic similarity using embeddings (`search_chunks_vector`)
- **Hybrid Search**: Combined vector and keyword search (`search_documents`)
- **BM25 Search**: Traditional keyword-based search (`search_chunks_term`)

## Features

- 🔍 **36 Test Queries**: 12 queries for each search type covering Polish tax law
- ⏱️ **Precise Latency Measurement**: Uses `time.perf_counter()` for high-resolution timing
- 📊 **Statistical Analysis**: Mean, median, standard deviation, min/max calculations
- 🎨 **Rich Console Output**: Progress bars, formatted tables, and visual insights
- 💾 **JSON Export**: Raw and aggregated results with timestamps
- 🛡️ **Error Handling**: Graceful handling of failed queries with detailed reporting
- 🔧 **Environment Configuration**: Automatic .env loading for Weaviate connection

## Usage

### Quick Start

```bash
# From backend directory
cd backend
python run_performance_tests.py
```

### Advanced CLI Options

```bash
# Run only vector search benchmarks
python -m ai_tax_search.performance.cli --vector

# Run only hybrid search benchmarks  
python -m ai_tax_search.performance.cli --hybrid

# Run only BM25 search benchmarks
python -m ai_tax_search.performance.cli --bm25

# Limit to 5 queries per type
python -m ai_tax_search.performance.cli --queries 5

# Change max documents returned per query
python -m ai_tax_search.performance.cli --max-docs 20

# Specify custom output directory
python -m ai_tax_search.performance.cli --output-dir ./my_results
```

### Programmatic Usage

```python
from ai_tax_search.performance.weaviate_benchmark import WeaviateBenchmarkSuite

suite = WeaviateBenchmarkSuite()
await suite.run_benchmark()
```

## Requirements

### Environment Variables

Create a `.env` file in the backend directory with:

```env
WV_URL=your_weaviate_url
WV_PORT=your_weaviate_port
WV_GRPC_PORT=your_weaviate_grpc_port
WV_API_KEY=your_weaviate_api_key
```

### Python Dependencies

- `rich>=13.0.0` - Console formatting and progress bars
- `python-dotenv` - Environment variable loading
- `weaviate-client>=4.11.1` - Weaviate database client

## Test Queries

### Vector Search Queries (Semantic)

Polish tax law concepts designed to test semantic understanding:

- "podatek dochodowy od osób fizycznych" (personal income tax)
- "rozliczenie roczne PIT" (annual PIT settlement)
- "ulgi podatkowe dla rodzin" (tax reliefs for families)
- "koszty uzyskania przychodu" (costs of obtaining income)
- etc.

### Hybrid Search Queries (Mixed Semantic + Keyword)

Queries combining legal references with semantic content:

- "Art. 15 ustawy o podatku dochodowym od osób fizycznych"
- "zasady rozliczeń międzynarodowych" (international settlement rules)
- "rozporządzenie Ministra Finansów VAT" (Minister of Finance VAT regulation)
- etc.

### BM25 Search Queries (Exact Keywords)

Precise legal references and form identifiers:

- "PIT-37", "CIT-8", "VAT-7" (tax form codes)
- "Art. 27 ust. 1" (article and paragraph references)
- "Dz.U. 2021 poz. 1540" (legal gazette references)
- "NSA sygn. akt II FSK" (court case references)
- etc.

## Output

### Console Output

Rich-formatted display including:

- Real-time progress bars during execution
- Formatted results table with performance metrics
- Performance insights panel highlighting fastest/slowest search types
- Error details table if any queries fail
- Environment configuration summary

### File Output

Results saved to configurable directory (default: `performance_results/`) with timestamps:

**Raw Results** (`weaviate_performance_raw_YYYYMMDD_HHMMSS.json`):

```json
{
  "metadata": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "total_queries": 36,
    "environment": {...}
  },
  "raw_results": [
    {
      "query_type": "vector",
      "query": "podatek dochodowy od osób fizycznych", 
      "latency_seconds": 0.245,
      "latency_ms": 245.0,
      "results_count": 8,
      "error": null,
      "timestamp": "..."
    }
  ]
}
```

**Summary Results** (`weaviate_performance_summary_YYYYMMDD_HHMMSS.json`):

```json
{
  "aggregated_results": {
    "vector": {
      "count": 12,
      "avg_latency": 0.234,
      "avg_latency_ms": 234.0,
      "median_latency_ms": 228.0,
      "min_latency_ms": 156.0,
      "max_latency_ms": 312.0,
      "std_latency_ms": 45.2,
      "avg_results": 7.3,
      "total_errors": 0
    }
  }
}
```

## Performance Metrics

For each search type, the suite reports:

- **Query Count**: Number of successful queries executed
- **Average Latency**: Mean response time across all queries
- **Median Latency**: 50th percentile response time
- **Min/Max Latency**: Fastest and slowest query response times
- **Standard Deviation**: Variability in response times
- **Average Results**: Mean number of documents returned per query
- **Error Count**: Number of failed queries

## Architecture

### Core Components

- **`WeaviateBenchmarkSuite`**: Main benchmark orchestrator
- **`PerformanceResult`**: Data class for individual query results
- **Query Collections**: Curated test queries for each search type
- **Rich Console Integration**: Formatted output and progress tracking

### Search Functions Tested

- **`search_chunks_vector()`**: Semantic vector search on document chunks
- **`search_documents()`**: Hybrid search on full documents
- **`search_chunks_term()`**: BM25 keyword search on document chunks

### Error Handling

- Captures exceptions without stopping the benchmark
- Records error messages and timestamps
- Displays error summary in console and JSON output
- Continues testing remaining queries after failures

## Integration

This benchmark suite integrates with the existing AI Tax Search infrastructure:

- Uses the same `WeaviateLegalDatabase` connection management
- Leverages existing search functions from `ai_tax_search.retrieval.weaviate_search`
- Follows the same async patterns used throughout the codebase
- Respects environment configuration and connection settings
