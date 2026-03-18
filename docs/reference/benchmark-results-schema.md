# Search Benchmark Results Schema

Reference specification for the JSON output format of `scripts/benchmark_search.py`.

## Results Structure

```json
{
  "timestamp": "2025-01-15T10:30:45.123456",
  "config": {
    "backend_url": "http://localhost:8004",
    "iterations": 3,
    "warmup": 2,
    "total_queries": 16,
    "total_variants": 3
  },
  "targets": {
    "hybrid": 300,
    "keyword": 150,
    "vector": 200
  },
  "results": [...],
  "summary": {...}
}
```

## Fields Reference

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | ISO 8601 timestamp when benchmark completed |
| `config` | object | Benchmark configuration and metadata |
| `targets` | object | Performance targets in milliseconds for each search variant |
| `results` | array | Detailed results for each query/variant combination |
| `summary` | object | Aggregated statistics by search variant |

### Config Object

| Field | Type | Description |
|-------|------|-------------|
| `backend_url` | string | Backend API base URL used for testing |
| `iterations` | integer | Number of iterations run per query |
| `warmup` | integer | Number of warmup queries executed |
| `total_queries` | integer | Total unique queries tested |
| `total_variants` | integer | Number of search variants (hybrid, keyword, vector) |

### Targets Object

Performance targets in milliseconds (P95 latency):

| Field | Type | Description |
|-------|------|-------------|
| `hybrid` | integer | Target for hybrid search (thinking mode, α=0.5) |
| `keyword` | integer | Target for keyword search (rabbit mode, α=0.0) |
| `vector` | integer | Target for vector search (rabbit mode, α=1.0) |

### Results Array

Each result object contains:

```json
{
  "query": "kredyty frankowe",
  "query_category": "financial",
  "query_language": "pl",
  "search_variant": "hybrid",
  "search_mode": "thinking",
  "search_alpha": 0.5,
  "description": "Hybrid search with AI query enhancement",
  "iterations": 3,
  "error_count": 0,
  "avg_results": 10.0,
  "latency_ms": {
    "p50": 120.5,
    "p95": 145.2,
    "p99": 160.1,
    "min": 115.3,
    "max": 160.1,
    "mean": 128.6
  },
  "raw_latencies": [115.3, 125.8, 160.1]
}
```

#### Result Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Search query text |
| `query_category` | string | Query category (financial, criminal, etc.) |
| `query_language` | string | Query language code (pl, en) |
| `search_variant` | string | Search type (hybrid, keyword, vector) |
| `search_mode` | string | API mode (thinking, rabbit) |
| `search_alpha` | float | Hybrid search alpha parameter (0.0-1.0) |
| `description` | string | Human-readable description of search variant |
| `iterations` | integer | Successful iterations (may be less than config if errors) |
| `error_count` | integer | Number of failed requests |
| `avg_results` | float | Average number of documents returned |
| `latency_ms` | object | Latency percentiles and statistics |
| `raw_latencies` | array | All measured latencies in milliseconds |

#### Latency Object

| Field | Type | Description |
|-------|------|-------------|
| `p50` | float | Median latency (50th percentile) |
| `p95` | float | 95th percentile latency |
| `p99` | float | 99th percentile latency |
| `min` | float | Minimum latency observed |
| `max` | float | Maximum latency observed |
| `mean` | float | Mean latency |

### Summary Object

Aggregated statistics by search variant:

```json
{
  "hybrid": {
    "queries": [...],
    "total_iterations": 48,
    "total_errors": 0,
    "all_latencies": [120.5, 125.8, ...],
    "passed": 16,
    "failed": 0,
    "overall_percentiles": {
      "p50": 128.5,
      "p95": 165.2,
      "p99": 180.1,
      "min": 95.3,
      "max": 185.1,
      "mean": 135.6
    },
    "target_ms": 300,
    "passes_target": true
  }
}
```

#### Summary Variant Fields

| Field | Type | Description |
|-------|------|-------------|
| `queries` | array | Array of result objects for this variant |
| `total_iterations` | integer | Total successful iterations across all queries |
| `total_errors` | integer | Total errors across all queries |
| `all_latencies` | array | All latencies for this variant combined |
| `passed` | integer | Number of queries that passed the target |
| `failed` | integer | Number of queries that failed the target |
| `overall_percentiles` | object | Percentiles calculated from all latencies |
| `target_ms` | integer | Performance target for this variant |
| `passes_target` | boolean | Whether overall P95 meets the target |

## Usage Examples

### Loading Results

```python
import json

with open('data/benchmark_results.json', 'r') as f:
    results = json.load(f)

print(f"Benchmark completed at: {results['timestamp']}")
print(f"Total queries tested: {results['config']['total_queries']}")

# Check if benchmark passed
all_passed = all(
    variant_stats['passes_target']
    for variant_stats in results['summary'].values()
)
print(f"Overall result: {'PASS' if all_passed else 'FAIL'}")
```

### Analyzing Latencies

```python
# Get all hybrid search latencies
hybrid_latencies = results['summary']['hybrid']['all_latencies']

# Find slowest queries
slow_queries = [
    result for result in results['results']
    if result['latency_ms']['p95'] > 200  # queries over 200ms P95
]

# Performance by language
pl_queries = [r for r in results['results'] if r['query_language'] == 'pl']
en_queries = [r for r in results['results'] if r['query_language'] == 'en']
```

### Trend Analysis

Compare multiple benchmark runs:

```python
import glob
import json
from datetime import datetime

# Load all benchmark files
benchmark_files = glob.glob('data/benchmark_*.json')
benchmarks = []

for file in benchmark_files:
    with open(file, 'r') as f:
        data = json.load(f)
        benchmarks.append({
            'timestamp': datetime.fromisoformat(data['timestamp']),
            'hybrid_p95': data['summary']['hybrid']['overall_percentiles']['p95'],
            'keyword_p95': data['summary']['keyword']['overall_percentiles']['p95'],
            'vector_p95': data['summary']['vector']['overall_percentiles']['p95'],
        })

# Sort by timestamp and analyze trends
benchmarks.sort(key=lambda x: x['timestamp'])
```

## Validation

The results schema is validated by the benchmark script. Invalid results indicate:

- Missing required fields
- Incorrect data types
- Negative latencies or invalid percentiles
- Inconsistent iteration counts

For schema validation in external tools, check:

1. All required top-level fields present
2. Latency percentiles satisfy: `min ≤ p50 ≤ p95 ≤ p99 ≤ max`
3. Error counts non-negative
4. Target passes/fails consistent with measured P95 vs targets